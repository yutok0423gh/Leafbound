import test from "node:test";
import assert from "node:assert/strict";
import { CLOUD_MODEL, CloudAssistStopped, CodexSemanticProvider, checkWeeklyQuota, cloudGenerationParameters, repairWithCloudFallback } from "../scripts/codex-semantic-provider.mjs";
import { repairSemanticTranslation } from "../scripts/semantic-classical-translations.mjs";
import { sourceHashFor, validateDraftRecords } from "../scripts/classical-translation-pipeline.mjs";

const now = Date.parse("2026-10-10T12:00:00Z"), reset = Math.floor(now / 1000) + 86400;
const policy = { reservePercent: 10, safetyMarginPercent: 2, weeklyResetAt: reset };
const response = (usedPercent = 25, secondary = false) => ({ ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: {
  limitId: "codex", primary: secondary ? { windowDurationMins: 300, usedPercent: 5, resetsAt: reset } : { windowDurationMins: 10080, usedPercent, resetsAt: reset },
  secondary: secondary ? { windowDurationMins: 10080, usedPercent, resetsAt: reset } : null,
} } });

test("weekly reserve uses the seven-day bucket in either position, including zero remaining", () => {
  assert.equal(checkWeeklyQuota(response(), policy, now).remainingPercent, 75);
  assert.equal(checkWeeklyQuota(response(89, true), policy, now).allowed, false);
  assert.equal(checkWeeklyQuota(response(88), policy, now).allowed, false);
  assert.equal(checkWeeklyQuota(response(87), policy, now).allowed, true);
  assert.equal(checkWeeklyQuota(response(100), policy, now).remainingPercent, 0);
});

test("unknown, expired, reset, blocked, or ambiguous quota cannot authorize inference", () => {
  const examples = [{}, { ...response(), ordinaryUsageAllowed: false }, response(NaN), response(101)];
  const unknown = response(); unknown.rateLimitsByLimitId.codex.primary.windowDurationMins = 300; examples.push(unknown);
  const duplicate = response(25, true); duplicate.rateLimitsByLimitId.codex.primary.windowDurationMins = 10080; examples.push(duplicate);
  const expired = response(); expired.rateLimitsByLimitId.codex.primary.resetsAt = now / 1000; examples.push(expired);
  const nextWeek = response(); nextWeek.rateLimitsByLimitId.codex.primary.resetsAt += 604800; examples.push(nextWeek);
  const blocked = response(); blocked.rateLimitsByLimitId.codex.rateLimitReachedType = "weekly"; examples.push(blocked);
  for (const example of examples) assert.throws(() => checkWeeklyQuota(example, policy, now), CloudAssistStopped);
  assert.throws(() => checkWeeklyQuota(response(), { ...policy, reservePercent: 0 }, now), /Invalid/);
});

test("quota stop before inference does not start a model turn", async () => {
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd() });
  let rpcCalls = 0;
  provider.rpc = async () => { rpcCalls++; throw new Error("must not start a turn"); };
  provider.checkQuota = async () => { throw new CloudAssistStopped("weekly-reserve-reached"); };
  await assert.rejects(provider.request({ model: CLOUD_MODEL, messages: [] }), /weekly-reserve/);
  assert.equal(rpcCalls, 0);
});

test("model substitution is rejected before a turn and ephemeral session is released", async () => {
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd() });
  provider.checkQuota = async () => {};
  const calls = [];
  provider.rpc = async method => {
    calls.push(method);
    return { thread: { id: "fixture-thread" }, model: "gpt-other", modelProvider: "openai" };
  };
  await assert.rejects(provider.request({ model: CLOUD_MODEL, messages: [] }), /model-mismatch/);
  assert.deepEqual(calls, ["thread/start", "thread/unsubscribe"]);
});

test("completed JSON response uses the requested model and standard speed without sampling claims", async () => {
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd() });
  provider.checkQuota = async () => {};
  let turnParams;
  provider.rpc = async (method, params) => {
    if (method === "thread/start") {
      assert.equal(params.ephemeral, true); assert.equal(params.allowProviderModelFallback, false);
      assert.deepEqual(params.environments, []);
      return { thread: { id: "fixture-thread" }, model: CLOUD_MODEL, modelProvider: "openai" };
    }
    if (method === "turn/start") {
      turnParams = params;
      queueMicrotask(() => provider.receive({ method: "turn/completed", params: { threadId: "fixture-thread", turn: {
        status: "completed", items: [{ type: "agentMessage", text: '{"ok":true}', phase: "final_answer" }],
      } } }));
      return { turn: { id: "fixture-turn" } };
    }
    return {};
  };
  const output = await provider.request({ model: CLOUD_MODEL, messages: [{ role: "system", content: "Translate." }, { role: "user", content: "原文" }], response_format: { schema: { type: "object" } } });
  assert.equal(output.choices[0].message.content, '{"ok":true}');
  assert.equal(turnParams.model, CLOUD_MODEL); assert.equal(turnParams.serviceTierForTurn, "default");
  assert.equal(turnParams.effort, "medium"); assert.equal(turnParams.max_output_tokens, undefined);
});

test("mid-work quota stop discards the partial cloud work and restarts the same entry locally", async () => {
  const entry = { job: { id: "fixture" } }, used = [];
  let stopped = 0, localLoaded = 0;
  const result = await repairWithCloudFallback(entry, {
    cloud: { request: async () => { throw new CloudAssistStopped("weekly-reserve-reached"); } },
    cloudConfig: { model: CLOUD_MODEL }, catalog: {},
    onCloudStop: async () => { stopped++; }, getLocalConfig: async () => { localLoaded++; return { model: "local" }; },
    repair: async (sameEntry, config, catalog, options) => {
      assert.equal(sameEntry, entry); used.push(config.model);
      if (options) return options.requestImpl({});
      return { model: config.model };
    },
  });
  assert.deepEqual(used, [CLOUD_MODEL, "local"]); assert.equal(result.model, "local");
  assert.equal(stopped, 1); assert.equal(localLoaded, 1);
});

test("live quota notification stops an in-flight request at the reserve boundary", () => {
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd() });
  let error;
  provider.active = { threadId: "fixture-thread", reject: value => { error = value; } };
  provider.receive({ method: "account/rateLimits/updated", params: { rateLimits: {
    limitId: "codex", primary: { windowDurationMins: 10080, usedPercent: 88, resetsAt: reset },
  } } });
  assert.ok(error instanceof CloudAssistStopped); assert.equal(error.reason, "weekly-reserve-reached");
});

test("semantic rejection remains a rejection instead of being disguised as a transport failure", async () => {
  await assert.rejects(repairWithCloudFallback({}, { cloud: {}, repair: async () => { throw new Error("semantic-content-rejected"); },
    getLocalConfig: async () => { throw new Error("must not silently approve"); } }), /semantic-content-rejected/);
});

test("cloud translation retains independent review and truthful generation provenance", async () => {
  const job = { id: "cloud-fixture", kind: "詩", title: "試詩", poet: "作者", lines: ["故人具雞黍", "邀我至田家"], sourceCharacterCount: 10 };
  job.sourceHash = sourceHashFor(job);
  const config = { model: CLOUD_MODEL, modelRevision: "codex:gpt-5.6-luna:unversioned-alias", temperature: 0, maxTokens: 6144, generationParameters: cloudGenerationParameters() };
  const catalog = { source: "Test dictionary", version: "1", sourceSha256: "a".repeat(64), entriesByFirstCharacter: new Map() };
  const inputs = [];
  const result = await repairSemanticTranslation({ job, paragraphs: ["舊稿"], preserveText: false, editorial: false, inputHash: "fixture" }, config, catalog, {
    requestImpl: async request => {
      const input = JSON.parse(request.messages[1].content); inputs.push(input);
      const value = input.groups ? { checks: { g1: { sourceMeaning: "友人備食邀客", translationMeaning: "友人備食邀客", accurate: true, complete: true, noAddedMeaning: true, uncertain: false, issues: [] } } }
        : { groups: [{ sourceIds: input.sources.map(s => s.id), sourceQuotes: input.sources.map(s => s.text), paragraphs: ["老朋友準備了雞肉和黃米飯，邀請我到他的農家做客。"], meaning: "友人備食邀客", uncertain: false }] };
      return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] };
    },
  });
  assert.equal(inputs.length, 2); assert.equal(inputs[0].translations, undefined);
  assert.equal(JSON.stringify(inputs[1]).includes('"meaning"'), false);
  assert.equal(result.record.generationParameters.maxTokens, undefined);
  assert.equal(validateDraftRecords([result.record], { jobs: [job] }).valid, true);
  const dishonest = structuredClone(result.record); dishonest.generationParameters.maxTokens = 6144;
  assert.equal(validateDraftRecords([dishonest], { jobs: [job] }).valid, false);
});
