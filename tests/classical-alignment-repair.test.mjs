import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTranslationArtifacts, readBuiltRecords, sourceHashFor, validateDraftRecords } from "../scripts/classical-translation-pipeline.mjs";
import { alignmentResponseSchema, auditAlignment, parseAlignmentResponse, repairAlignment, requestLocalAlignment, sourceFragments } from "../scripts/repair-classical-alignment.mjs";
import { alignClassicalReadingUnits } from "../src/classical-reading.js";

const config = { baseUrl: "http://127.0.0.1:8080/v1", model: "fixture", modelRevision: "fixture-sha", temperature: 0.2, maxTokens: 4096, timeout: 100, retry: 0 };
const catalog = { source: "Test dictionary", version: "test", sourceSha256: "a".repeat(64), upstreamSourceSha256: "", entriesByFirstCharacter: new Map() };
const job = { id: "alignment-fixture", kind: "詩", title: "試詩", poet: "作者", dynasty: "唐", lines: ["春風又綠江南岸", "明月何時照我還"], sourceCharacterCount: 14 };
job.sourceHash = sourceHashFor(job);
const plan = { jobs: [job], kinds: ["詩"], targetCount: 1, builtInCount: 0, missingCount: 1 };
const translated = ["春風吹來，江南岸邊的草木又綠了。", "明月什麼時候才能照着我返回故鄉？"];
const response = (value, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] });

async function repairedFixture() {
  const requests = [];
  const record = await repairAlignment(job, config, catalog, {
    requestImpl: async (request) => {
      requests.push(request);
      const input = JSON.parse(request.messages[1].content);
      const segments = Object.fromEntries(input.targets.map(({ id }, index) => [id, { translation: translated[index], uncertain: false }]));
      return response({ segments, ...(input.draftBySourceId ? { verdict: "revised", issues: ["補回末句"] } : {}) });
    }, now: () => new Date("2026-10-05T01:00:00Z")
  });
  return { record, requests };
}

test("ID response validation rejects missing IDs, unknown IDs, truncation, uncertainty and filler", () => {
  const fragments = sourceFragments(job);
  const good = { segments: Object.fromEntries(fragments.map(({ id }, i) => [id, { translation: translated[i], uncertain: false }])) };
  assert.deepEqual(Object.values(parseAlignmentResponse(response(good), fragments).segments), translated);
  assert.deepEqual(alignmentResponseSchema(fragments).properties.segments.required, fragments.map(({ id }) => id));
  const missing = structuredClone(good); delete missing.segments[fragments[0].id];
  const extra = structuredClone(good); extra.segments.wrong = extra.segments[fragments[0].id];
  const uncertain = structuredClone(good); uncertain.segments[fragments[0].id].uncertain = true;
  const filler = structuredClone(good); filler.segments[fragments[0].id].translation = "表示此句意思。";
  const unfinished = structuredClone(good); unfinished.segments[fragments[0].id].translation = "春風吹來……";
  for (const bad of [missing, extra, uncertain, filler, unfinished]) assert.throws(() => parseAlignmentResponse(response(bad), fragments));
  assert.throws(() => parseAlignmentResponse(response(good, "length"), fragments), /did not finish/);
  const duplicate = response(good);
  duplicate.choices[0].message.content = duplicate.choices[0].message.content.replace('"s00001p1":', '"s00001p1":{"translation":"錯","uncertain":false},"s00001p1":');
  assert.throws(() => parseAlignmentResponse(duplicate, fragments), /duplicate-key/);
  duplicate.choices[0].message.content = duplicate.choices[0].message.content.replace('"s00001p1":', '"\\u007300001p1":');
  assert.throws(() => parseAlignmentResponse(duplicate, fragments), /duplicate-key/);
});

test("long prose fragmentation preserves every character and source identity", () => {
  const text = "一段古文。第二段古文；第三段古文！".repeat(80);
  const fragments = sourceFragments({ lines: [text, "下一句"] });
  assert.ok(fragments.length > 2);
  assert.equal(fragments.filter((part) => part.lineIndex === 0).map((part) => part.text).join(""), text);
  assert.equal(new Set(fragments.map((part) => part.id)).size, fragments.length);
  assert.equal(fragments.at(-1).id, "s00002p1");
});

test("damaged source glyphs cannot be silently expanded into invented meanings", async () => {
  let called = false;
  await assert.rejects(repairAlignment({ ...job, lines: ["厄●", "温也。"] }, config, catalog, {
    requestImpl: async () => { called = true; }
  }), /missing-glyph/);
  assert.equal(called, false);
});

test("local repair refuses remote endpoints and prevents redirects", async () => {
  let called = false;
  await assert.rejects(requestLocalAlignment({}, { ...config, baseUrl: "https://example.com/v1" }, { fetchImpl: () => { called = true; } }), /local model/);
  assert.equal(called, false);
  await requestLocalAlignment({}, config, { fetchImpl: async (_, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response("{}", { status: 200 });
  } });
});

test("repair metadata survives building and loads into verified source groups, never human-reviewed", async () => {
  const { record, requests } = await repairedFixture();
  assert.equal(requests.length, 2);
  assert.ok(!requests[0].messages[1].content.includes("整篇舊譯"), "old errors must not anchor the independent translation");
  assert.ok(requests[1].messages[1].content.includes("draftBySourceId"));
  assert.equal(record.status, "pending-review");
  assert.equal(record.pipelineVersion, 4);
  assert.equal(validateDraftRecords([record], plan).valid, true);
  const dataRoot = await mkdtemp(join(tmpdir(), "leafbound-alignment-"));
  const built = await buildTranslationArtifacts({ plan, dataRoot, draftRecords: [record] });
  assert.equal(built.ok, true, JSON.stringify(built.validation?.errors));
  assert.equal(built.productionReadyCount, 0);
  const [loaded] = await readBuiltRecords(dataRoot);
  assert.deepEqual(loaded.alignment, record.alignment);
  const units = alignClassicalReadingUnits(job.lines.map((text) => ({ text })), loaded);
  assert.deepEqual(units.map((unit) => unit.translations[0]), translated);
  assert.ok(units.every((unit) => unit.alignment === "model-checked"));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const path = String(url).split("/data/classical-translations/")[1];
      if (!path || !/^(?:manifest\.json|shards\/[0-9a-f]{2}\.json)$/u.test(path)) return new Response("missing", { status: 404 });
      return new Response(await readFile(join(dataRoot, path), "utf8"), { status: 200 });
    };
    const runtime = await import("../src/classical-translations.js?alignment-integration");
    const browserRecord = await runtime.loadClassicalTranslation(job);
    assert.deepEqual(browserRecord.alignment, record.alignment, "the actual browser loader must keep the mapping");
    assert.equal(browserRecord.source.reviewStatus, "pending-review");
    assert.equal(alignClassicalReadingUnits(job.lines.map((text) => ({ text })), browserRecord).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const manifest = JSON.parse(await readFile(join(dataRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.coverage.productionReadyGeneratedCount, 0);
  const broken = structuredClone(record); broken.alignment.groups[1].sourceIds = ["s00001"];
  assert.equal(validateDraftRecords([broken], plan).errors[0].code, "invalid-alignment");
  const noCritique = structuredClone(record); delete noCritique.critique;
  assert.equal(validateDraftRecords([noCritique], plan).valid, false);
  const filler = { ...record, alignment: undefined, pipelineVersion: undefined, generationMode: undefined, paragraphs: ["表示此句意思。", "現在的解釋。"] };
  assert.equal(validateDraftRecords([filler], plan).errors[0].code, "invalid-placeholder");
});

test("audit keeps uncertainty separate from paragraph counts", async () => {
  const { record } = await repairedFixture();
  assert.equal(auditAlignment(plan, [record]).alignedCount, 1);
  const mismatch = { ...record, alignment: undefined, paragraphs: ["整篇譯文"] };
  assert.deepEqual(auditAlignment(plan, [mismatch]).issues[0].reasons, ["paragraph-count-mismatch"]);
  const filler = { ...record, alignment: undefined, paragraphs: ["表示此句意思。", "今譯"] };
  assert.deepEqual(auditAlignment(plan, [filler]).issues[0].reasons, ["invalid-placeholder"]);
});
