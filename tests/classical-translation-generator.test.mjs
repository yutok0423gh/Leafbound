import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateTranslationDrafts,
  loadGeneratorConfig,
  parseChatCompletionResponse,
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

function successfulResponse(paragraphs = ["青山仍舊在。", "流水朝東而去。"]) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ paragraphs }) } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("configuration permits unauthenticated localhost but requires HTTPS and credentials remotely", () => {
  const local = loadGeneratorConfig(fixtureEnvironment());
  assert.equal(local.apiKey, "");
  assert.equal(local.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(local.concurrency, 1);

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
});

test("successful generation posts chat completions and checkpoints pipeline-compatible JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-success-"));
  const outputPath = join(root, "drafts.jsonl");
  const config = loadGeneratorConfig(fixtureEnvironment());
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return successfulResponse();
  };

  const result = await generateTranslationDrafts({
    plan: fixturePlan(),
    config,
    outputPath,
    fetchImpl,
    now: () => new Date("2026-08-29T00:00:00.000Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.generatedCount, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(requests[0].init.method, "POST");
  assert.equal("Authorization" in requests[0].init.headers, false);
  const requestBody = JSON.parse(requests[0].init.body);
  assert.equal(requestBody.model, "leafbound-test-model");
  assert.equal(requestBody.messages[0].role, "system");
  assert.match(requestBody.messages[0].content, /香港繁體中文/u);
  assert.match(requestBody.messages[0].content, /不加入英文/u);

  const record = JSON.parse((await readFile(outputPath, "utf8")).trim());
  assert.equal(record.status, "machine_draft");
  assert.equal(record.model, "leafbound-test-model");
  assert.equal(record.modelRevision, "fixture-revision");
  assert.equal(record.promptVersion, "fixture-prompt-v1");
  assert.equal(record.sourceHash, fixtureJob().sourceHash);
  assert.deepEqual(record.warnings, []);
  assert.deepEqual(record.paragraphs, ["青山仍舊在。", "流水朝東而去。"]);
  const validation = validateDraftRecords([record], fixturePlan());
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
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
  assert.deepEqual(paragraphs, ["青山仍舊在。", "流水朝東而去。"]);
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

test("resume skips an exact source/model/revision/prompt checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-generator-resume-"));
  const outputPath = join(root, "drafts.jsonl");
  const config = loadGeneratorConfig(fixtureEnvironment());
  const job = fixtureJob();
  const checkpoint = {
    id: job.id,
    kind: job.kind,
    paragraphs: ["已完成今譯。"],
    status: "machine_draft",
    model: config.model,
    modelRevision: config.modelRevision,
    promptVersion: config.promptVersion,
    sourceHash: job.sourceHash,
    warnings: []
  };
  const original = `${JSON.stringify(checkpoint)}\n`;
  await writeFile(outputPath, original, "utf8");

  const result = await generateTranslationDrafts({
    plan: fixturePlan([job]),
    config,
    outputPath,
    resume: true,
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
