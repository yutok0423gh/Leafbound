import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export const CLOUD_MODEL = "gpt-5.6-luna";
export class CloudAssistStopped extends Error {
  constructor(reason) { super(`Cloud model request failed: ${reason}`); this.reason = reason; }
}

// Use the actual seven-day window, which is not always the secondary window.
// Missing, expired, or ambiguous usage data must never authorize more inference.
export function checkWeeklyQuota(response, policy, now = Date.now()) {
  const { reservePercent = 10, safetyMarginPercent = 2, weeklyResetAt } = policy;
  if (!Number.isFinite(reservePercent) || reservePercent < 10
    || !Number.isFinite(safetyMarginPercent) || safetyMarginPercent < 2
    || reservePercent + safetyMarginPercent >= 100) throw new Error("Invalid weekly reserve policy.");
  const bucket = response?.rateLimitsByLimitId?.codex
    || (response?.rateLimits?.limitId === "codex" ? response.rateLimits : null);
  const weekly = [bucket?.primary, bucket?.secondary].filter(window => window?.windowDurationMins === 10080);
  if (!bucket || weekly.length !== 1 || response.ordinaryUsageAllowed !== true
    || bucket.spendControlReached || bucket.rateLimitReachedType) {
    throw new CloudAssistStopped("quota-unavailable");
  }
  const window = weekly[0];
  if (!Number.isFinite(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100
    || !Number.isSafeInteger(window.resetsAt) || window.resetsAt * 1000 <= now) {
    throw new CloudAssistStopped("quota-invalid-or-expired");
  }
  if (!Number.isSafeInteger(weeklyResetAt) || window.resetsAt !== weeklyResetAt) {
    throw new CloudAssistStopped("weekly-window-changed");
  }
  const quota = { remainingPercent: 100 - window.usedPercent, resetsAt: window.resetsAt,
    checkedAt: new Date(now).toISOString(), reservePercent, switchAtPercent: reservePercent + safetyMarginPercent };
  return { ...quota, allowed: quota.remainingPercent > quota.switchAtPercent };
}

export function cloudGenerationParameters() {
  // Codex plan inference does not expose temperature or max_output_tokens.
  return { transport: "codex-chatgpt", reasoningEffort: "medium", serviceTier: "default",
    outputFormat: "json-schema", disableThinking: false };
}

export async function repairWithCloudFallback(entry, { cloud, cloudConfig, getLocalConfig, catalog, repair, onCloudStop }) {
  if (cloud) {
    try { return await repair(entry, cloudConfig, catalog, { requestImpl: request => cloud.request(request) }); }
    catch (error) {
      if (!(error instanceof CloudAssistStopped)) throw error;
      // Discard an unfinished cloud draft and restart this work locally. A
      // single record must never claim one model generated another's text.
      await onCloudStop(error);
    }
  }
  return repair(entry, await getLocalConfig(), catalog);
}

export class CodexSemanticProvider {
  constructor({ binary, cwd, policy, onQuota = async () => {}, spawnImpl = spawn }) {
    this.binary = binary; this.cwd = cwd; this.policy = policy; this.onQuota = onQuota;
    this.spawnImpl = spawnImpl; this.pending = new Map(); this.sequence = 0; this.active = null;
    this.closed = false; this.quotaChecking = null;
  }

  async start() {
    const overrides = {
      "features.apps": false, "features.plugins": false, "features.memories": false,
      "features.multi_agent": false, "features.shell_tool": false, "features.unified_exec": false,
      "features.code_mode_host": false, "features.browser_use": false, "features.computer_use": false,
      "mcp_servers.node_repl.enabled": false, "mcp_servers.cua_repl.enabled": false,
      web_search: "disabled", project_doc_max_bytes: 0, service_tier: "default",
    };
    const args = ["app-server", "--stdio", ...Object.entries(overrides).flatMap(([key, value]) => ["-c", `${key}=${JSON.stringify(value)}`])];
    this.child = this.spawnImpl(this.binary, args, { cwd: this.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    // Do not copy account, credential, or model reasoning logs to public progress.
    this.child.stderr.on("data", () => {});
    this.child.on("error", () => this.fail(new CloudAssistStopped("codex-unavailable")));
    this.child.on("exit", () => this.fail(new CloudAssistStopped("codex-exited")));
    this.child.stdin.on("error", () => this.fail(new CloudAssistStopped("codex-disconnected")));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      this.receive(message);
    });
    await this.rpc("initialize", { clientInfo: { name: "leafbound_translation", title: "Leafbound translation", version: "1.0.0" },
      capabilities: { experimentalApi: true } });
    this.send({ method: "initialized" });
    const account = await this.rpc("account/read", { refreshToken: false });
    if (account.account?.type !== "chatgpt") throw new CloudAssistStopped("chatgpt-plan-required");
    const models = await this.rpc("model/list", { limit: 100 });
    if (!models.data?.some(model => model.model === CLOUD_MODEL)) throw new CloudAssistStopped("requested-model-unavailable");
    await this.checkQuota();
    return this;
  }

  send(message) {
    if (this.closed || !this.child?.stdin.writable) throw new CloudAssistStopped("codex-disconnected");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  rpc(method, params, timeout = 30000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new CloudAssistStopped("codex-request-timeout")); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, ...(params === undefined ? {} : { params }) }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  receive(message) {
    const pending = this.pending.get(message.id);
    if (pending && !message.method) {
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new CloudAssistStopped(`codex-rpc-error-${message.error.code}`));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      // Translation never needs tools, account resets, or permission prompts.
      this.send({ id: message.id, error: { code: -32601, message: "Tools are disabled for translation." } });
      this.active?.reject(new CloudAssistStopped("unexpected-tool-request"));
      return;
    }
    const { method, params = {} } = message;
    if (method === "account/rateLimits/updated" && params.rateLimits?.limitId === "codex") {
      const weekly = [params.rateLimits.primary, params.rateLimits.secondary].find(window => window?.windowDurationMins === 10080);
      if (weekly && (weekly.resetsAt !== this.policy.weeklyResetAt
        || 100 - weekly.usedPercent <= this.policy.reservePercent + this.policy.safetyMarginPercent)) {
        this.active?.reject(new CloudAssistStopped("weekly-reserve-reached"));
      }
    }
    const active = this.active;
    if (!active || params.threadId !== active.threadId) return;
    if (method === "turn/started") active.turnId = params.turn?.id;
    if (method === "item/started" && !["userMessage", "reasoning", "agentMessage"].includes(params.item?.type)) {
      active.reject(new CloudAssistStopped("unexpected-tool-use"));
    }
    if (method === "item/completed" && params.item?.type === "agentMessage" && params.item.phase !== "commentary") {
      active.text = params.item.text;
    }
    if (method === "turn/completed") {
      if (params.turn?.status !== "completed") active.reject(new CloudAssistStopped("cloud-turn-incomplete"));
      else {
        const lastMessage = params.turn.items?.filter(item => item.type === "agentMessage" && item.phase !== "commentary").at(-1);
        const text = lastMessage?.text || active.text;
        if (!text || text.length > 60000) active.reject(new CloudAssistStopped("cloud-output-invalid"));
        else active.resolve(text);
      }
    }
  }

  async checkQuota() {
    if (this.quotaChecking) return this.quotaChecking;
    this.quotaChecking = (async () => {
      const quota = checkWeeklyQuota(await this.rpc("account/rateLimits/read"), this.policy);
      await this.onQuota(quota);
      if (!quota.allowed) throw new CloudAssistStopped("weekly-reserve-reached");
      return quota;
    })();
    try { return await this.quotaChecking; } finally { this.quotaChecking = null; }
  }

  async request(request) {
    if (this.stopAfterResult) throw this.stopAfterResult;
    if (this.active) throw new CloudAssistStopped("parallel-inference-disabled");
    if (request.model !== CLOUD_MODEL) throw new CloudAssistStopped("model-mismatch");
    if (JSON.stringify(request.messages).length > 32000) throw new CloudAssistStopped("cloud-request-too-large");
    await this.checkQuota();
    let threadId, timer, poll;
    try {
      const thread = await this.rpc("thread/start", { model: CLOUD_MODEL, modelProvider: "openai", allowProviderModelFallback: false,
        cwd: this.cwd, ephemeral: true, environments: [], selectedCapabilityRoots: [], dynamicTools: [],
        approvalPolicy: "never", sandbox: "read-only", serviceTier: "default",
        baseInstructions: request.messages.filter(message => message.role === "system").map(message => message.content).join("\n"),
        developerInstructions: "只執行提供的翻譯或語義核對，直接輸出要求的 JSON。不要調用工具、讀取檔案、搜尋網頁或委派任務。",
      });
      threadId = thread.thread?.id;
      if (!threadId || thread.model !== CLOUD_MODEL || thread.modelProvider !== "openai") throw new CloudAssistStopped("model-mismatch");
      let resolveTurn, rejectTurn;
      const result = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
      result.catch(() => {});
      this.active = { threadId, turnId: null, text: "", resolve: resolveTurn, reject: rejectTurn };
      timer = setTimeout(() => rejectTurn(new CloudAssistStopped("cloud-turn-timeout")), 180000);
      poll = setInterval(() => this.checkQuota().catch(rejectTurn), 15000);
      // Recheck after preparing the session; no inference may begin on stale data.
      await this.checkQuota();
      const turn = await this.rpc("turn/start", { threadId, model: CLOUD_MODEL, effort: "medium", serviceTierForTurn: "default",
        environments: [], input: request.messages.filter(message => message.role !== "system").map(message => ({ type: "text", text: message.content })),
        outputSchema: request.response_format.schema });
      this.active.turnId = turn.turn?.id;
      const content = await result;
      // Refresh for the next request; a fully finished result can still be kept.
      try { await this.checkQuota(); } catch (error) { this.stopAfterResult = error; }
      return { choices: [{ finish_reason: "stop", message: { content } }] };
    } catch (error) {
      if (this.active?.turnId) await this.rpc("turn/interrupt", { threadId, turnId: this.active.turnId }, 5000).catch(() => {});
      throw error instanceof CloudAssistStopped ? error : new CloudAssistStopped("cloud-request-error");
    } finally {
      clearTimeout(timer); clearInterval(poll); this.active = null;
      if (threadId) await this.rpc("thread/unsubscribe", { threadId }, 5000).catch(() => {});
    }
  }

  fail(error) {
    this.active?.reject(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  close() {
    this.closed = true; this.fail(new CloudAssistStopped("codex-closed"));
    this.lines?.close(); this.child?.stdin.end(); this.child?.kill();
  }
}
