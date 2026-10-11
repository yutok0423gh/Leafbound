import test from "node:test";
import assert from "node:assert/strict";
import { CLOUD_MODEL, CloudAssistStopped, CodexSemanticProvider, cloudRecoveryAt, repairWithCloudFallback } from "../scripts/codex-semantic-provider.mjs";

// Offline protocol fixtures: these tests never start Codex or consume quota.
function fixture({ onQuota = async () => {}, complete } = {}) {
  const policy = { enabled: true, requestId: "recovery-test", reservePercent: 10, safetyMarginPercent: 2,
    weeklyResetAt: Math.floor(Date.now() / 1000) + 86400, serviceTier: "priority" };
  const calls = [];
  const provider = new CodexSemanticProvider({ policy, cwd: process.cwd(), onQuota: quota => onQuota(provider, quota) });
  const quota = usedPercent => ({ limitId: "codex", primary: { windowDurationMins: 10080, usedPercent, resetsAt: policy.weeklyResetAt } });
  const reserve = () => provider.receive({ method: "account/rateLimits/updated", params: { rateLimits: quota(88) } });
  provider.rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === "account/rateLimits/read") return { ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: quota(40) } };
    if (method === "thread/start") return { thread: { id: "test-thread" }, model: CLOUD_MODEL, modelProvider: "openai", serviceTier: "priority" };
    if (method === "turn/start") {
      queueMicrotask(() => complete ? complete(provider, reserve) : provider.receive({ method: "turn/completed", params: {
        threadId: "test-thread", turn: { id: "test-turn", status: "completed", items: [{ type: "agentMessage", text: '{"ok":true}', phase: "final_answer" }] },
      } }));
      return { turn: { id: "test-turn" } };
    }
    return {};
  };
  const request = { model: CLOUD_MODEL, messages: [], response_format: { schema: { type: "object" } } };
  return { provider, calls, policy, request, reserve };
}

test("a live reserve signal during the final quota check prevents even the first turn", async () => {
  let reads = 0;
  const f = fixture({ onQuota: async () => { if (++reads === 2) f.reserve(); } });
  await assert.rejects(f.provider.request(f.request), error => error.reason === "weekly-reserve-reached");
  assert.equal(f.calls.filter(c => c.method === "turn/start").length, 0);
  const callsAfterStop = f.calls.length;
  await assert.rejects(f.provider.request(f.request), /weekly-reserve-reached/);
  assert.equal(f.calls.length, callsAfterStop, "a later healthy read must not clear the stop");
});

test("a reserve signal received while idle is retained for the next request", async () => {
  const f = fixture();
  f.reserve();
  await assert.rejects(f.provider.request(f.request), /weekly-reserve-reached/);
  assert.equal(f.calls.length, 0);
});

test("in-flight reserve stop interrupts the turn and restarts the entire entry locally", async () => {
  const f = fixture({ complete: (_provider, reserve) => reserve() });
  let stopped;
  const result = await repairWithCloudFallback({ id: "poem" }, { cloud: f.provider, cloudConfig: { model: CLOUD_MODEL },
    getLocalConfig: async () => ({ model: "local" }),
    onCloudStop: async error => { stopped = error; },
    repair: async (_entry, config, _catalog, options) => options ? options.requestImpl(f.request) : { model: config.model },
  });
  assert.equal(stopped.reason, "weekly-reserve-reached");
  assert.equal(result.model, "local");
  assert.equal(f.calls.filter(c => c.method === "turn/start").length, 1);
  assert.equal(f.calls.filter(c => c.method === "turn/interrupt").length, 1);
  await assert.rejects(f.provider.request(f.request), /weekly-reserve-reached/);
});

test("a completed result can be kept but a reserve signal during its final refresh remains terminal", async () => {
  let reads = 0;
  const f = fixture({ onQuota: async () => { if (++reads === 3) f.reserve(); } });
  assert.equal((await f.provider.request(f.request)).choices[0].message.content, '{"ok":true}');
  assert.equal(f.provider.stopAfterResult?.reason, "weekly-reserve-reached");
  await assert.rejects(f.provider.request(f.request), /weekly-reserve-reached/);
  assert.equal(f.calls.filter(c => c.method === "turn/start").length, 1);
});

const streamFailure = { message: "private diagnostic must not be published", codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } } };
const failed = (provider, error = streamFailure, status = "failed") => provider.receive({ method: "turn/completed", params: {
  threadId: "test-thread", turn: { id: "test-turn", status, error, items: [] },
} });

test("reserve stop wins over a simultaneous recoverable disconnect", async () => {
  const f = fixture({ complete: (provider, reserve) => { failed(provider); reserve(); } });
  await assert.rejects(f.provider.request(f.request), /weekly-reserve-reached/);
  assert.equal(cloudRecoveryAt({ requestId: f.policy.requestId, weeklyResetAt: f.policy.weeklyResetAt,
    stoppedAt: new Date().toISOString(), stopReason: f.provider.stopAfterResult.reason }, f.policy), null);
});

for (const codexErrorInfo of [
  { responseStreamDisconnected: { httpStatusCode: 502 } }, { responseStreamDisconnected: { httpStatusCode: null } },
  { responseStreamConnectionFailed: { httpStatusCode: null } }, { httpConnectionFailed: { httpStatusCode: 503 } },
  { httpConnectionFailed: { httpStatusCode: 408 } }, { responseTooManyFailedAttempts: { httpStatusCode: 504 } },
  "serverOverloaded", "internalServerError",
]) test(`known temporary turn failure schedules guarded recovery: ${JSON.stringify(codexErrorInfo)}`, async () => {
  const f = fixture({ complete: provider => failed(provider, { ...streamFailure, codexErrorInfo }) });
  let stopped;
  await assert.rejects(f.provider.request(f.request), error => { stopped = error; return error instanceof CloudAssistStopped; });
  const finished = { requestId: f.policy.requestId, weeklyResetAt: f.policy.weeklyResetAt, stoppedAt: new Date().toISOString(), stopReason: stopped.reason };
  assert.ok(cloudRecoveryAt(finished, f.policy) > Date.now());
  assert.equal(cloudRecoveryAt(finished, { ...f.policy, weeklyResetAt: f.policy.weeklyResetAt + 604800 }), null);
  assert.equal(cloudRecoveryAt(finished, f.policy, f.policy.weeklyResetAt * 1000), null);
  assert.equal(JSON.stringify(stopped.details).includes("private diagnostic"), false);
});

for (const codexErrorInfo of ["usageLimitExceeded", "rateLimitExceeded", "sessionBudgetExceeded", "unauthorized", "badRequest", "other", null,
  { httpConnectionFailed: { httpStatusCode: 401 } }, { responseStreamDisconnected: { httpStatusCode: 403 } },
  { httpConnectionFailed: { httpStatusCode: 429 } }, { httpConnectionFailed: { httpStatusCode: 400 } },
  { responseTooManyFailedAttempts: { httpStatusCode: null } }, { unknownError: { httpStatusCode: 503 } }, { httpConnectionFailed: null },
]) test(`quota, auth and unclassified failures stay terminal: ${JSON.stringify(codexErrorInfo)}`, async () => {
  const f = fixture({ complete: provider => failed(provider, { ...streamFailure, codexErrorInfo }) });
  let stopped;
  await assert.rejects(f.provider.request(f.request), error => { stopped = error; return error instanceof CloudAssistStopped; });
  assert.equal(cloudRecoveryAt({ requestId: f.policy.requestId, weeklyResetAt: f.policy.weeklyResetAt,
    stoppedAt: new Date().toISOString(), stopReason: stopped.reason }, f.policy), null);
});

test("a failed turn can use its final error notification when completion omits error details", async () => {
  const f = fixture({ complete: provider => {
    provider.receive({ method: "error", params: { threadId: "test-thread", turnId: "test-turn", willRetry: false, error: streamFailure } });
    failed(provider, null);
  } });
  await assert.rejects(f.provider.request(f.request), error => error.reason === "cloud-stream-disconnected");
});

test("an error the app server successfully retries does not stop a completed turn", async () => {
  const f = fixture({ complete: provider => {
    provider.receive({ method: "error", params: { threadId: "test-thread", turnId: "test-turn", willRetry: true, error: streamFailure } });
    provider.receive({ method: "turn/completed", params: { threadId: "test-thread", turn: { status: "completed",
      items: [{ type: "agentMessage", phase: "final_answer", text: '{"ok":true}' }],
    } } });
  } });
  assert.equal((await f.provider.request(f.request)).choices[0].message.content, '{"ok":true}');
  assert.equal(f.provider.stopAfterResult, undefined);
});

test("an interrupted turn is not treated as a recoverable failed turn", async () => {
  const f = fixture({ complete: provider => failed(provider, streamFailure, "interrupted") });
  await assert.rejects(f.provider.request(f.request), error => error.reason === "cloud-turn-incomplete");
});
