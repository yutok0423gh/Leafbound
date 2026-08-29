import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { poems } from "../src/data.js";
import { getClassicalTranslation } from "../src/classical-translations.js";
import {
  CLASSICAL_KINDS,
  buildTranslationArtifacts,
  createTranslationPlan,
  readDraftRecords,
  shardIdFor,
  sourceHashFor,
  validateDraftRecords
} from "../scripts/classical-translation-pipeline.mjs";

function draftFor(job, marker = "今") {
  const length = Math.max(1, Math.ceil(job.sourceCharacterCount * 0.8));
  return {
    id: job.id,
    kind: job.kind,
    paragraphs: [marker.repeat(length)],
    status: "machine_draft",
    model: "offline-test-model",
    modelRevision: "fixture-1",
    promptVersion: "test-v1",
    sourceHash: job.sourceHash,
    warnings: []
  };
}

function expandedText(job, phrase) {
  return phrase.repeat(Math.ceil((job.sourceCharacterCount * 0.8) / phrase.length));
}

test("source hashes are stable and change with translation-relevant source fields", () => {
  const poem = poems.find((candidate) => CLASSICAL_KINDS.includes(candidate.kind));
  const copy = structuredClone(poem);
  assert.equal(sourceHashFor(poem), sourceHashFor(copy));

  copy.lines[0].text += "異";
  assert.notEqual(sourceHashFor(poem), sourceHashFor(copy));
});

test("plan derives every uncovered classical work without mutating source data", () => {
  const plan = createTranslationPlan();
  const targetWorks = poems.filter((poem) => CLASSICAL_KINDS.includes(poem.kind));
  const expectedMissing = targetWorks.filter((poem) => !poem.translation && !getClassicalTranslation(poem));

  assert.equal(plan.targetCount, targetWorks.length);
  assert.equal(plan.missingCount, expectedMissing.length);
  assert.equal(plan.builtInCount + plan.missingCount, plan.targetCount);
  assert.deepEqual(
    plan.jobs.map((job) => job.id),
    expectedMissing.map((poem) => poem.id).sort((left, right) => left.localeCompare(right, "en"))
  );
  assert.match(plan.jobs[0].sourceHash, /^[0-9a-f]{64}$/u);
});

test("draft validation enforces schema, hashes, labels, refusals, ratios, script, source copying, and duplicate text", () => {
  const plan = createTranslationPlan({ kinds: ["詞"] });
  const [first, second] = plan.jobs.filter((job) => job.sourceCharacterCount >= 30 && job.sourceCharacterCount <= 100).slice(0, 2);
  const valid = draftFor(first);
  const sourceText = first.lines.join("");
  const mostlyCopiedSource = sourceText.slice(0, Math.ceil(sourceText.length * 0.9));

  assert.equal(validateDraftRecords([valid], plan).valid, true);

  const invalidCases = [
    [{ ...valid, sourceHash: "0".repeat(64) }, "source-hash-mismatch"],
    [{ ...valid, status: "complete" }, "invalid-status"],
    [{ ...valid, modelRevision: "" }, "invalid-generation-metadata"],
    [{ ...valid, warnings: [""] }, "invalid-warnings"],
    [{ ...valid, paragraphs: [`Translation: ${"今".repeat(50)}`] }, "english-label"],
    [{ ...valid, paragraphs: [`抱歉，無法提供翻譯${"今".repeat(50)}`] }, "refusal"],
    [{ ...valid, paragraphs: [expandedText(first, "这是现代汉语译文")] }, "non-traditional-output"],
    [{ ...valid, paragraphs: [sourceText] }, "source-copy"],
    [{ ...valid, paragraphs: [`${mostlyCopiedSource}，今譯補充。`] }, "source-copy"],
    [{ ...valid, paragraphs: ["今"] }, "length-ratio"]
  ];
  for (const [record, expectedCode] of invalidCases) {
    const result = validateDraftRecords([record], plan);
    assert.equal(result.valid, false, expectedCode);
    assert.equal(result.errors[0].code, expectedCode);
  }

  const shared = "現代中文譯意".repeat(8);
  const duplicates = validateDraftRecords([
    { ...draftFor(first), paragraphs: [shared] },
    { ...draftFor(second), paragraphs: [shared] }
  ], plan);
  assert.equal(duplicates.valid, false);
  assert.ok(duplicates.errors.some((error) => error.code === "duplicate-translation"));
});

test("source-copy detection does not reject a short source merely for sharing a few characters", () => {
  const plan = createTranslationPlan({ kinds: ["曲"] });
  const job = plan.jobs.find((candidate) => candidate.sourceCharacterCount >= 4 && candidate.sourceCharacterCount <= 6);
  assert.ok(job, "expected a short uncovered 曲 fixture");

  const result = validateDraftRecords([
    { ...draftFor(job), paragraphs: ["這件事一直記在心內"] }
  ], plan);
  assert.equal(result.valid, true);
});

test("clause coverage rejects an obviously incomplete single-unit draft for multi-unit prose", () => {
  const plan = createTranslationPlan({ kinds: ["古文"] });
  const job = plan.jobs.find((candidate) => {
    const terminalMarks = candidate.lines.join("").match(/[。！？；]/gu)?.length || 0;
    return terminalMarks >= 5 && terminalMarks <= 8;
  });
  assert.ok(job, "expected an uncovered multi-unit 古文 fixture");

  const translation = expandedText(job, "今譯內容充分交代");
  const rejected = validateDraftRecords([
    { ...draftFor(job), paragraphs: [translation] }
  ], plan);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.errors[0].code, "clause-coverage");

  const splitAt = Math.ceil(translation.length / 2);
  const reasonablyMerged = validateDraftRecords([
    { ...draftFor(job), paragraphs: [translation.slice(0, splitAt), translation.slice(splitAt)] }
  ], plan);
  assert.equal(reasonablyMerged.valid, true);
});

test("draft reader accepts both drafts.jsonl and sorted drafts directory files", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-classical-drafts-"));
  await mkdir(join(root, "drafts"), { recursive: true });
  await writeFile(join(root, "drafts.jsonl"), `${JSON.stringify({ id: "single" })}\n`, "utf8");
  await writeFile(join(root, "drafts", "b.jsonl"), `${JSON.stringify({ id: "b" })}\n`, "utf8");
  await writeFile(join(root, "drafts", "a.jsonl"), `\n${JSON.stringify({ id: "a" })}\n`, "utf8");

  const result = await readDraftRecords({ dataRoot: root });
  assert.deepEqual(result.records.map((record) => record.id), ["single", "a", "b"]);
  assert.equal(result.parseErrors.length, 0);
});

test("build is deterministic, dry-run is write-free, and later builds preserve prior shards", async () => {
  const root = await mkdtemp(join(tmpdir(), "leafbound-classical-build-"));
  const plan = createTranslationPlan();
  const [first, second] = plan.jobs.filter((job) => job.sourceCharacterCount >= 20).slice(0, 2);
  const firstDraft = draftFor(first, "甲");

  const preview = await buildTranslationArtifacts({ plan, draftRecords: [firstDraft], dataRoot: root, dryRun: true });
  assert.equal(preview.ok, true);
  assert.equal(preview.recordCount, 1);
  assert.equal(existsSync(join(root, "manifest.json")), false);

  const built = await buildTranslationArtifacts({ plan, draftRecords: [firstDraft], dataRoot: root });
  assert.equal(built.ok, true);
  assert.equal(built.recordCount, 1);
  const firstManifest = await readFile(join(root, "manifest.json"), "utf8");
  assert.equal(existsSync(join(root, "shards", `${shardIdFor(first.id)}.json`)), true);

  const repeated = await buildTranslationArtifacts({ plan, draftRecords: [], dataRoot: root });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.recordCount, 1);
  assert.equal(await readFile(join(root, "manifest.json"), "utf8"), firstManifest);

  const extended = await buildTranslationArtifacts({ plan, draftRecords: [draftFor(second, "乙")], dataRoot: root });
  assert.equal(extended.ok, true);
  assert.equal(extended.recordCount, 2);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.coverage.generatedCount, 2);
  assert.equal(manifest.coverage.remainingCount, plan.missingCount - 2);
  assert.equal(manifest.shards.reduce((sum, shard) => sum + shard.count, 0), 2);
});

test("pipeline implementation has no network client or credential contract", async () => {
  const source = await readFile(new URL("../scripts/classical-translation-pipeline.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /(?:API[_-]?KEY|Authorization\s*:|Bearer\s+)/iu);
});
