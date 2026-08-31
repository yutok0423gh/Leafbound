import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GENERATION_REVIEW_MODES,
  generateTranslationDrafts,
  glossaryForJob,
  loadClassicalGlossary,
  loadGeneratorConfig,
  parseChatCompletionResponse,
  parseCritiqueCompletionResponse,
  requestTranslation,
  runGeneratorCli
} from "../scripts/generate-classical-translation-drafts.mjs";
import { validateDraftRecords } from "../scripts/classical-translation-pipeline.mjs";

function fixtureJob(id = "fixture-one") {
  return Object.freeze({
    id,
    kind: "曲",
    title: "測試曲",
    poet: "測試作者",
    dynasty: "元",
    sourceHash: id.padEnd(64, "0").slice(0, 64),
    sourceCharacterCount: 12,
    lines: Object.freeze(["青山依舊在。", "流水向東行。"])
  });
}

function fixturePlan(jobs = [fixtureJob()]) {
  return Object.freeze({ missingCount: jobs.length, jobs: Object.freeze(jobs) });
}

function fixtureEnvironment(overrides = {}) {
  return {
    LEAFBOUND_OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
    LEAFBOUND_OPENAI_API_KEY: "",
    LEAFBOUND_OPENAI_MODEL: "leafbound-test-model",
    LEAFBOUND_OPENAI_MODEL_REVISION: "fixture-revision",
    LEAFBOUND_PROMPT_VERSION: "fixture-prompt-v1",
    LEAFBOUND_OPENAI_TIMEOUT: "1000",
    LEAFBOUND_OPENAI_CONCURRENCY: "1",
    LEAFBOUND_OPENAI_RETRY: "2",
    LEAFBOUND_OPENAI_TEMPERATURE: "0.1",
    LEAFBOUND_OPENAI_MAX_TOKENS: "256",
    ...overrides
  };
}

function successfulResponse(paragraphs = ["青山仍旧在。", "流水朝东而去。"]) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ paragraphs }) } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function successfulCritiqueResponse({
  verdict = "pass",
  issues = [],
  paragraphs = ["青山仍旧存在。", "流水朝东流去。"]
} = {}) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ verdict, issues, paragraphs }) } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fixtureGlossaryCatalog() {
  return Object.freeze({
    source: "Fixture Classical Dictionary",
    version: "fixture-2026",
    sourceSha256: "1".repeat(64),
    upstreamSourceSha256: "2".repeat(64),
    entriesByFirstCharacter: new Map([
      ["青", [{ term: "青山", definitions: ["覆有青翠草木的山。"] }]],
      ["流", [{ term: "流水", definitions: ["流動的水。"] }]]
    ])
  });
}

test("configuration permits unauthenticated localhost but requires HTTPS and credentials remotely", () => {
  const local = loadGeneratorConfig(fixtureEnvironment());
  assert.equal(local.apiKey, "");
  assert.equal(local.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(local.concurrency, 1);
  assert.equal(local.disableThinking, false);

  const qwen = loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_DISABLE_THINKING: "true" }));
  assert.equal(qwen.disableThinking, true);
  assert.throws(
    () => loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_DISABLE_THINKING: "sometimes" })),
    /true or false/u
  );

  assert.throws(
    () => loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_BASE_URL: "http://example.com/v1" })),
    /HTTPS/u
  );
  assert.throws(
    () => loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_BASE_URL: "https://example.com/v1" })),
    /API_KEY/u
  );
  assert.throws(
    () => loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_BASE_URL: "https://example.com/v1/", LEAFBOUND_OPENAI_API_KEY: "secret" })),
    /must not end/u
  );
});

test("response parser accepts a complete JSON fence but rejects prose and extra fields", () => {
  assert.deepEqual(parseChatCompletionResponse({
    choices: [{ message: { content: "```json\n{\"paragraphs\":[\"今譯。\"]}\n```" } }]
  }), ["今譯。"]);
  assert.throws(() => parseChatCompletionResponse({
    choices: [{ message: { content: "Here is the JSON: {\"paragraphs\":[\"今譯。\"]}" } }]
  }), /invalid translation JSON/u);
  assert.throws(() => parseChatCompletionResponse({
    choices: [{ message: { content: "{\"paragraphs\":[\"今譯。\"],\"notes\":\"賞析\"}" } }]
  }), /only paragraphs/u);

  assert.deepEqual(parseCritiqueCompletionResponse({
    choices: [{ message: { content: "{\"verdict\":\"revised\",\"issues\":[\"修正詞義\"],\"paragraphs\":[\"修正版。\"]}" } }]
  }), { verdict: "revised", issues: ["修正詞義"], paragraphs: ["修正版。"] });
  assert.throws(() => parseCritiqueCompletionResponse({
    choices: [{ message: { content: "{\"verdict\":\"maybe\",\"issues\":[],\"paragraphs\":[\"今譯。\"]}" } }]
  }), /verdict/u);
});

test("MOE glossary supplies contextual constraints for known ambiguous classical terms", async () => {
  const catalog = await loadClassicalGlossary();
  const job = {
    ...fixtureJob("classical-ambiguity"),
    title: "步出夏門行 冬十月",
    lines: ["鷙鳥潛藏", "熊羆窟棲", "錢鎛停置"]
  };
  const glossary = glossaryForJob(job, catalog, { characterFrequency: new Map([["鷙", 1]]) });
  assert.ok(glossary.terms.includes("錢"));
  assert.ok(glossary.terms.includes("鎛"));
  assert.ok(glossary.terms.includes("羆"));
  assert.ok(glossary.terms.includes("鷙"), "rare corpus characters should receive dictionary constraints automatically");
  const definitions = JSON.stringify(glossary.entries);
  assert.match(definitions, /古代的一種農具/u);
  assert.match(definitions, /鋤頭一類的農具/u);
  assert.match(definitions, /一種大熊/u);
});

test("successful generation posts chat completions and checkpoints pipeline-compatible JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-success-"));
  const outputPath = join(root, "drafts.jsonl");
  const config = loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_DISABLE_THINKING: "true" }));
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return requests.length === 1 ? successfulResponse() : successfulCritiqueResponse();
  };

  const result = await generateTranslationDrafts({
    plan: fixturePlan(),
    config,
    outputPath,
    fetchImpl,
    glossaryCatalog: fixtureGlossaryCatalog(),
    now: () => new Date("2026-08-29T00:00:00.000Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.generatedCount, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(requests[0].init.method, "POST");
  assert.equal("Authorization" in requests[0].init.headers, false);
  const requestBody = JSON.parse(requests[0].init.body);
  assert.equal(requestBody.model, "leafbound-test-model");
  assert.equal(requestBody.messages[0].role, "system");
  assert.match(requestBody.messages[0].content, /香港繁體中文/u);
  assert.match(requestBody.messages[0].content, /不加入英文/u);
  assert.match(requestBody.messages[1].content, /Fixture Classical Dictionary/u);
  assert.match(requestBody.messages[1].content, /剛好 2 個 paragraphs/u);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.deepEqual(requestBody.chat_template_kwargs, { enable_thinking: false });
  const critiqueBody = JSON.parse(requests[1].init.body);
  assert.match(critiqueBody.messages[0].content, /品質審校員/u);
  assert.match(critiqueBody.messages[0].content, /農具誤作貨幣/u);
  assert.deepEqual(critiqueBody.response_format, { type: "json_object" });

  const record = JSON.parse((await readFile(outputPath, "utf8")).trim());
  assert.equal(record.status, "pending-review");
  assert.equal(record.model, "leafbound-test-model");
  assert.equal(record.modelRevision, "fixture-revision");
  assert.equal(record.promptVersion, "fixture-prompt-v1");
  assert.equal(record.sourceHash, fixtureJob().sourceHash);
  assert.equal(record.pipelineVersion, 2);
  assert.match(record.promptSha256, /^[0-9a-f]{64}$/u);
  assert.match(record.critiquePromptSha256, /^[0-9a-f]{64}$/u);
  assert.equal(record.critique.verdict, "pass");
  assert.equal(record.critique.promptSha256, record.critiquePromptSha256);
  assert.deepEqual(record.glossary.terms, ["青山", "流水"]);
  assert.deepEqual(record.warnings, []);
  assert.deepEqual(record.paragraphs, ["青山仍舊存在。", "流水朝東流去。"]);
  const validation = validateDraftRecords([record], fixturePlan());
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("draft-only generation checkpoints one-pass machine drafts without claiming critique", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-draft-only-"));
  const outputPath = join(root, "drafts.jsonl");
  const config = loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_DISABLE_THINKING: "true" }));
  let requestCount = 0;
  const generate = (resume = false) => generateTranslationDrafts({
    plan: fixturePlan(),
    config,
    outputPath,
    resume,
    reviewMode: GENERATION_REVIEW_MODES.DRAFT_ONLY,
    glossaryCatalog: fixtureGlossaryCatalog(),
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse();
    },
    now: () => new Date("2026-08-29T01:00:00.000Z")
  });

  const result = await generate();
  assert.equal(result.ok, true);
  assert.equal(result.reviewMode, "draft-only");
  assert.equal(requestCount, 1);
  const record = JSON.parse((await readFile(outputPath, "utf8")).trim());
  assert.equal(record.status, "machine-draft");
  assert.equal(record.pipelineVersion, 3);
  assert.equal(record.generationMode, "draft-only");
  assert.equal(record.critique, undefined);
  assert.equal(record.critiquePromptSha256, undefined);
  assert.deepEqual(record.warnings, ["critique-pending"]);
  const validation = validateDraftRecords([record], fixturePlan());
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.productionReadyCount, 0);

  const resumed = await generate(true);
  assert.equal(resumed.generatedCount, 0);
  assert.equal(resumed.skippedCount, 1);
  assert.equal(requestCount, 1, "an exact draft-only checkpoint must resume without another model call");

  const fastConfig = loadGeneratorConfig(fixtureEnvironment({
    LEAFBOUND_OPENAI_MODEL: "leafbound-fast-model",
    LEAFBOUND_OPENAI_MODEL_REVISION: "fixture-fast-revision"
  }));
  const preserved = await generateTranslationDrafts({
    plan: fixturePlan(),
    config: fastConfig,
    outputPath,
    resume: true,
    preserveExisting: true,
    reviewMode: GENERATION_REVIEW_MODES.DRAFT_ONLY,
    glossaryCatalog: fixtureGlossaryCatalog(),
    fetchImpl: async () => assert.fail("cross-model continuation must preserve a matching source checkpoint")
  });
  assert.equal(preserved.generatedCount, 0);
  assert.equal(preserved.skippedCount, 1);
});

test("429 and 5xx responses retry with backoff while other 4xx responses fail immediately", async () => {
  const config = loadGeneratorConfig(fixtureEnvironment({ LEAFBOUND_OPENAI_RETRY: "3" }));
  const statuses = [429, 503, 200];
  const delays = [];
  let attempts = 0;
  const paragraphs = await requestTranslation(fixtureJob(), config, {
    fetchImpl: async () => {
      const status = statuses[attempts];
      attempts += 1;
      return status === 200 ? successfulResponse() : new Response("", { status });
    },
    sleepImpl: async (delay) => delays.push(delay)
  });
  assert.deepEqual(paragraphs, ["青山仍旧在。", "流水朝东而去。"]);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1000, 2000]);

  let rejectedAttempts = 0;
  await assert.rejects(
    requestTranslation(fixtureJob(), config, {
      fetchImpl: async () => {
        rejectedAttempts += 1;
        return new Response("do not log this body", { status: 400 });
      },
      sleepImpl: async () => assert.fail("400 must not retry")
    }),
    /HTTP 400/u
  );
  assert.equal(rejectedAttempts, 1);
});

test("resume skips only an exact second-pass source/model/prompt/glossary checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-resume-"));
  const outputPath = join(root, "drafts.jsonl");
  const config = loadGeneratorConfig(fixtureEnvironment());
  const job = fixtureJob();
  let callCount = 0;
  await generateTranslationDrafts({
    plan: fixturePlan([job]),
    config,
    outputPath,
    glossaryCatalog: fixtureGlossaryCatalog(),
    fetchImpl: async () => {
      callCount += 1;
      return callCount === 1 ? successfulResponse() : successfulCritiqueResponse();
    }
  });
  const original = await readFile(outputPath, "utf8");

  const result = await generateTranslationDrafts({
    plan: fixturePlan([job]),
    config,
    outputPath,
    resume: true,
    glossaryCatalog: fixtureGlossaryCatalog(),
    fetchImpl: async () => assert.fail("exact checkpoint must not call fetch")
  });
  assert.equal(result.generatedCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(await readFile(outputPath, "utf8"), original);
});

test("dry-run makes no request or file and CLI logs never reveal the API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-dry-"));
  const outputPath = join(root, "not-created.jsonl");
  const secret = "leafbound-super-secret-token";
  const messages = [];
  const result = await runGeneratorCli({
    argv: ["--dry-run", "--limit", "1", "--output", outputPath, "--kinds", "曲"],
    environment: fixtureEnvironment({ LEAFBOUND_OPENAI_API_KEY: secret }),
    planFactory: () => fixturePlan(),
    glossaryLoader: async () => fixtureGlossaryCatalog(),
    fetchImpl: async () => assert.fail("dry-run must not call fetch"),
    logger: { log: (message) => messages.push(message) }
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.selectedCount, 1);
  assert.equal(existsSync(outputPath), false);
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], new RegExp(secret, "u"));
  assert.doesNotMatch(messages[0], /Authorization|Bearer/iu);
});
