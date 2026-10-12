import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { CLOUD_MODEL, CloudAssistStopped, CodexSemanticProvider, cloudModelConcurrency,
  cloudGenerationParameters, cloudRecoveryAt, createCloudStopHandler, repairWithCloudFallback } from "../scripts/codex-semantic-provider.mjs";
import { createLocalWorkLimiter, runSemanticBatch, semanticBatchConcurrency } from "../scripts/semantic-batch-queue.mjs";
import { repairSemanticTranslation } from "../scripts/semantic-classical-translations.mjs";
import { sourceHashFor, validateDraftRecords } from "../scripts/classical-translation-pipeline.mjs";

// Offline App Server protocol fixtures; no login, model calls, or quota usage.
function fixture(hooks = {}, concurrency = 2) {
  const policy = { enabled: true, requestId: "parallel-test", reservePercent: 10, safetyMarginPercent: 2,
    weeklyResetAt: Math.floor(Date.now() / 1000) + 86400, serviceTier: "priority" };
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd(), concurrency });
  const calls = [], turns = new Map();
  let threads = 0, reads = 0;
  const quota = (usedPercent = 40, resetsAt = policy.weeklyResetAt) => ({ limitId: "codex",
    primary: { windowDurationMins: 10080, usedPercent, resetsAt } });
  const reserve = () => provider.receive({ method: "account/rateLimits/updated", params: { rateLimits: quota(88) } });
  const complete = (threadId, text = JSON.stringify({ source: turns.get(threadId).input[0]?.text })) => {
    provider.receive({ method: "turn/completed", params: { threadId, turn: {
      id: `turn-${threadId}`, status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text }],
    } } });
  };
  provider.rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === "account/rateLimits/read") {
      const reading = await hooks.readQuota?.(++reads);
      return { ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: reading || quota() } };
    }
    if (method === "thread/start") {
      const id = `thread-${++threads}`;
      await hooks.startThread?.(id);
      return { thread: { id }, model: CLOUD_MODEL, modelProvider: "openai", serviceTier: "priority" };
    }
    if (method === "turn/start") {
      turns.set(params.threadId, params);
      provider.receive({ method: "turn/started", params: { threadId: params.threadId, turn: { id: `turn-${params.threadId}` } } });
      await hooks.startTurn?.(params, complete);
      return { turn: { id: `turn-${params.threadId}` } };
    }
    if (method === "turn/interrupt") {
      provider.receive({ method: "turn/completed", params: { threadId: params.threadId, turn: { status: "interrupted" } } });
      await hooks.interrupt?.(params);
    }
    if (method === "thread/unsubscribe") await hooks.unsubscribe?.(params);
    return {};
  };
  const request = source => ({ model: CLOUD_MODEL, messages: [{ role: "user", content: source }], response_format: { schema: { type: "object" } } });
  return { provider, policy, calls, turns, quota, reserve, complete, request };
}

test("cloud capacity is bounded independently of local GPU slots", () => {
  assert.equal(cloudModelConcurrency(), 8);
  assert.equal(cloudModelConcurrency("1"), 1);
  for (const count of [2, 3, 4, 5, 6, 7, 8]) assert.equal(cloudModelConcurrency(count), count);
  for (const value of [0, 9, 1.5, "auto", NaN, null]) assert.throws(() => cloudModelConcurrency(value));
});

test("two reserved slots share a quota read and route interleaved replies by thread", async () => {
  const reading = Promise.withResolvers();
  const f = fixture({ readQuota: async count => { if (count === 1) await reading.promise; } });
  const first = f.provider.request(f.request("source-a")), second = f.provider.request(f.request("source-b"));
  assert.equal(f.provider.requests.size, 2);
  await assert.rejects(f.provider.request(f.request("source-c")), /cloud-concurrency-limit/);
  assert.equal(f.calls.length, 1, "both preflight checks join one account read");
  reading.resolve(); await tick();
  assert.equal(f.turns.size, 2);
  f.provider.receive({ method: "item/completed", params: { threadId: "unrelated", item: { type: "agentMessage", text: "wrong" } } });
  f.complete("thread-2");
  assert.equal((await second).choices[0].message.content, '{"source":"source-b"}');
  assert.equal(f.provider.requests.size, 1, "finishing one lane does not clear its sibling");
  f.complete("thread-1");
  assert.equal((await first).choices[0].message.content, '{"source":"source-a"}');
  for (const { method, params } of f.calls) {
    if (method === "thread/start") {
      assert.equal(params.ephemeral, true); assert.equal(params.serviceTier, "priority");
      assert.equal(params.allowProviderModelFallback, false);
    }
    if (method === "turn/start") { assert.equal(params.model, CLOUD_MODEL); assert.equal(params.serviceTierForTurn, "priority"); }
  }
  assert.equal(f.provider.active.size, 0); assert.equal(f.provider.requests.size, 0);
});

test("a shared reserve stop while both sessions prepare admits no model turns", async () => {
  const prepared = Promise.withResolvers();
  const f = fixture({ startThread: () => prepared.promise });
  const requests = ["a", "b"].map(source => f.provider.request(f.request(source)));
  const rejected = requests.map(promise => assert.rejects(promise, /weekly-reserve-reached/));
  await tick(); f.reserve(); prepared.resolve(); await Promise.all(rejected);
  assert.equal(f.turns.size, 0);
  assert.equal(f.calls.filter(call => call.method === "thread/unsubscribe").length, 2);
  await assert.rejects(f.provider.request(f.request("later")), /weekly-reserve-reached/);
});

test("reserve at the last shared quota check blocks both prepared turns", async () => {
  const f = fixture({ readQuota: count => { if (count === 2) f.reserve(); } });
  await Promise.all(["a", "b"].map(source => assert.rejects(f.provider.request(f.request(source)), /weekly-reserve-reached/)));
  assert.equal(f.turns.size, 0);
  assert.equal(f.provider.stopAfterResult.reason, "weekly-reserve-reached");
});

test("a reserve stop interrupts both lanes once, drains cleanup, and persists one fallback", async () => {
  const cleanup = Promise.withResolvers(), saved = [], local = [];
  const f = fixture({ unsubscribe: () => cleanup.promise });
  const stop = createCloudStopHandler({ provider: f.provider, onStopped: async error => saved.push(error.reason) });
  const results = ["a", "b"].map(id => repairWithCloudFallback({ id }, {
    cloud: f.provider, cloudConfig: { model: CLOUD_MODEL }, onCloudStop: stop,
    getLocalConfig: async () => ({ model: "local" }),
    repair: async (entry, config, _catalog, options) => {
      if (options) return options.requestImpl(f.request(entry.id));
      local.push(entry.id); return { id: entry.id, model: config.model };
    },
  }));
  await tick(); f.reserve(); await tick();
  assert.equal(f.calls.filter(call => call.method === "turn/interrupt").length, 2);
  assert.deepEqual(local, []); assert.deepEqual(saved, []);
  cleanup.resolve();
  assert.deepEqual(await Promise.all(results), [{ id: "a", model: "local" }, { id: "b", model: "local" }]);
  assert.deepEqual(saved, ["weekly-reserve-reached"]);
  assert.equal(f.provider.closed, true);
  assert.equal(f.policy.reservePercent + f.policy.safetyMarginPercent, 12);
  assert.equal(cloudRecoveryAt({ ...f.policy, stopReason: saved[0], stoppedAt: new Date().toISOString() }, f.policy), null);
});

test("turn-start acknowledgements in flight cannot delay interrupting either known turn", async () => {
  const acknowledgement = Promise.withResolvers();
  const f = fixture({ startTurn: () => acknowledgement.promise });
  const requests = ["a", "b"].map(source => f.provider.request(f.request(source)));
  const rejected = requests.map(promise => assert.rejects(promise, /weekly-reserve-reached/));
  await tick(); f.reserve(); await tick();
  assert.equal(f.calls.filter(call => call.method === "turn/interrupt").length, 2);
  acknowledgement.resolve(); await Promise.all(rejected);
  assert.equal(f.calls.filter(call => call.method === "turn/interrupt").length, 2, "no duplicate interrupts on acknowledgement");
});

test("a finished response survives a sibling quota stop but cannot start an independent review", async () => {
  const f = fixture();
  const first = f.provider.request(f.request("a")), second = f.provider.request(f.request("b"));
  const rejected = assert.rejects(second, /weekly-reserve-reached/);
  await tick(); f.complete("thread-1"); f.reserve();
  assert.equal((await first).choices[0].message.content, '{"source":"a"}'); await rejected;
  await assert.rejects(f.provider.request(f.request("review-a")), /weekly-reserve-reached/);
  assert.deepEqual(f.calls.filter(call => call.method === "turn/interrupt").map(call => call.params.threadId), ["thread-2"]);
  assert.equal(f.turns.size, 2);
});

for (const upgradeToQuota of [false, true]) test(`shared shutdown preserves the strongest reason (quota upgrade ${upgradeToQuota})`, async () => {
  const interrupt = Promise.withResolvers(), persisted = [];
  const f = fixture({ interrupt: () => interrupt.promise });
  const stop = createCloudStopHandler({ provider: f.provider, onStopped: async error => persisted.push(error.reason) });
  const pending = ["a", "b"].map(source => f.provider.request(f.request(source)).catch(stop));
  await tick();
  f.provider.halt(new CloudAssistStopped("cloud-stream-disconnected"));
  const stopped = stop(f.provider.stopAfterResult);
  await tick(); assert.deepEqual(persisted, [], "persist only after every interruption finishes");
  if (upgradeToQuota) f.reserve();
  interrupt.resolve(); await Promise.all([...pending, stopped]);
  const expected = upgradeToQuota ? "weekly-reserve-reached" : "cloud-stream-disconnected";
  assert.deepEqual(persisted, [expected]); assert.equal(f.provider.stopAfterResult.reason, expected);
  const retry = cloudRecoveryAt({ ...f.policy, stopReason: expected, stoppedAt: new Date().toISOString() }, f.policy);
  assert.equal(retry === null, upgradeToQuota, "shutdown acknowledgements must not change recovery eligibility");
});

test("parallel preflight checks cannot renew the authorized quota window", async () => {
  const f = fixture({ readQuota: () => f.quota(20, f.policy.weeklyResetAt + 604800) });
  const original = f.policy.weeklyResetAt;
  await Promise.all(["a", "b"].map(source => assert.rejects(f.provider.request(f.request(source)), /weekly-window-changed/)));
  assert.equal(f.calls.length, 2, "one shared check and its one confirmation read");
  assert.equal(f.turns.size, 0); assert.equal(f.policy.weeklyResetAt, original);
});

for (const concurrency of [2, 8]) test(`${concurrency} semantic repairs keep independent reviews, source binding and serialized checkpoints`, async () => {
  const inputs = [], saved = [];
  let live = 0, peak = 0, writes = 0, peakWrites = 0;
  const f = fixture({ startTurn: async (params, complete) => {
    const input = JSON.parse(params.input[0].text); inputs.push(input);
    peak = Math.max(peak, ++live); await tick();
    const value = input.groups
      ? { checks: { g1: { sourceMeaning: "友人備食邀客", translationMeaning: "友人備食邀客", accurate: true,
        complete: true, noAddedMeaning: true, uncertain: false, issues: [] } } }
      : { groups: [{ sourceIds: input.sources.map(s => s.id), sourceQuotes: input.sources.map(s => s.text),
        paragraphs: ["老朋友準備了雞肉和黃米飯，邀請我到他的農家做客。"], meaning: "友人備食邀客", uncertain: false }] };
    live--; complete(params.threadId, JSON.stringify(value));
  } }, concurrency);
  const ids = Array.from({ length: concurrency }, (_, index) => `poem-${index}`);
  const entries = ids.map(id => {
    const job = { id, kind: "詩", title: id, poet: "作者", lines: ["故人具雞黍", "邀我至田家"], sourceCharacterCount: 10 };
    job.sourceHash = sourceHashFor(job);
    return { job, paragraphs: ["舊稿"], preserveText: false, editorial: false, inputHash: `hash-${id}` };
  });
  const config = { model: CLOUD_MODEL, modelRevision: "codex:gpt-5.6-luna:unversioned-alias", temperature: 0,
    maxTokens: 6144, generationParameters: cloudGenerationParameters("priority") };
  const catalog = { source: "Test dictionary", version: "1", sourceSha256: "a".repeat(64), entriesByFirstCharacter: new Map() };
  await runSemanticBatch(entries, {
    concurrency: semanticBatchConcurrency(f.provider, 4),
    work: entry => repairSemanticTranslation(entry, config, catalog, { requestImpl: request => f.provider.request(request) }),
    settle: async (entry, outcome) => {
      assert.equal(outcome.status, "fulfilled");
      peakWrites = Math.max(peakWrites, ++writes); await tick();
      const result = outcome.value;
      assert.equal(result.id, entry.job.id); assert.equal(result.inputHash, entry.inputHash);
      assert.equal(validateDraftRecords([result.record], { jobs: [entry.job] }).valid, true);
      assert.equal(result.record.generationParameters.serviceTier, "priority");
      saved.push(result.id); writes--;
    },
  });
  assert.deepEqual(saved.sort(), ids); assert.equal(peak, concurrency); assert.equal(peakWrites, 1);
  assert.equal(f.turns.size, concurrency * 2, "each generation and independent review has its own thread");
  const reviews = inputs.filter(input => input.groups); assert.equal(reviews.length, concurrency);
  for (const review of reviews) assert.equal(JSON.stringify(review).includes('"meaning"'), false);
  for (const generation of inputs.filter(input => !input.groups)) assert.equal(generation.translations, undefined);
});

test("eight simultaneous admissions share quota checks and never admit a ninth request", async () => {
  const reading = Promise.withResolvers();
  const f = fixture({ readQuota: async count => { if (count === 1) await reading.promise; } }, 8);
  const requests = Array.from({ length: 8 }, (_, id) => f.provider.request(f.request(`source-${id}`)));
  assert.equal(f.provider.requests.size, 8);
  await assert.rejects(f.provider.request(f.request("ninth")), /cloud-concurrency-limit/);
  assert.equal(f.calls.length, 1);
  reading.resolve(); await tick(); assert.equal(f.turns.size, 8);
  for (const id of [5, 2, 7, 0, 6, 3, 1, 4]) {
    f.complete(`thread-${id + 1}`);
    assert.equal((await requests[id]).choices[0].message.content, JSON.stringify({ source: `source-${id}` }));
  }
  assert.equal(f.provider.requests.size, 0);
});

test("reserve stops four active turns and prevents the other four preparing turns", async () => {
  const prepared = Promise.withResolvers();
  const f = fixture({ startThread: id => Number(id.split("-")[1]) > 4 ? prepared.promise : undefined }, 8);
  const requests = Array.from({ length: 8 }, (_, id) => f.provider.request(f.request(String(id))));
  const rejected = requests.map(promise => assert.rejects(promise, /weekly-reserve-reached/));
  await tick(); assert.equal(f.turns.size, 4); f.reserve();
  prepared.resolve(); await Promise.all(rejected);
  assert.equal(f.turns.size, 4);
  assert.equal(f.calls.filter(call => call.method === "turn/interrupt").length, 4);
  assert.equal(f.calls.filter(call => call.method === "thread/unsubscribe").length, 8);
  await assert.rejects(f.provider.request(f.request("after-stop")), /weekly-reserve-reached/);
});

test("eight unfinished cloud works restart wholly locally with only four GPU jobs and one stop write", async () => {
  const f = fixture({}, 8), runLocal = createLocalWorkLimiter(4);
  const release = Array.from({ length: 8 }, () => Promise.withResolvers());
  const cloudDrafts = new Set(), localStarted = [], savedStops = [];
  let active = 0, peak = 0;
  const stop = createCloudStopHandler({ provider: f.provider, onStopped: async error => savedStops.push(error.reason) });
  const results = Array.from({ length: 8 }, (_, id) => repairWithCloudFallback({ id }, {
    cloud: f.provider, cloudConfig: { model: CLOUD_MODEL }, onCloudStop: stop, runLocal,
    getLocalConfig: async () => ({ model: "local" }),
    repair: async (entry, config, _catalog, options) => {
      if (options) {
        await options.requestImpl(f.request(`draft-${entry.id}`)); cloudDrafts.add(entry.id);
        return options.requestImpl(f.request(`review-${entry.id}`));
      }
      assert.equal(f.provider.closed, true); assert.deepEqual(savedStops, ["weekly-reserve-reached"]);
      localStarted.push(entry.id); peak = Math.max(peak, ++active);
      await release[entry.id].promise; active--;
      return { id: entry.id, model: config.model, text: `local-whole-work-${entry.id}` };
    },
  }));
  await tick();
  for (const threadId of [...f.turns.keys()]) f.complete(threadId);
  await tick(); assert.equal(cloudDrafts.size, 8); assert.equal(f.turns.size, 16);
  f.reserve(); await tick();
  assert.equal(f.calls.filter(call => call.method === "turn/interrupt").length, 8);
  assert.equal(localStarted.length, 4); assert.equal(peak, 4);
  for (const id of [...localStarted]) release[id].resolve();
  await tick(); assert.equal(localStarted.length, 8); assert.equal(peak, 4);
  for (const gate of release) gate.resolve();
  assert.deepEqual(await Promise.all(results), Array.from({ length: 8 }, (_, id) => ({ id, model: "local", text: `local-whole-work-${id}` })));
  assert.deepEqual(savedStops, ["weekly-reserve-reached"]);
  assert.equal(f.turns.size, 16, "no cloud request may start after the shared stop");
});
