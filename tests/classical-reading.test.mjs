import assert from "node:assert/strict";
import test from "node:test";
import { createClassicalAlignment, createSemanticAlignment, validateClassicalAlignment } from "../src/classical-alignment.js";
const verification = { method: "independent-semantic-audit", verdict: "pass", model: "test", modelRevision: "test",
  promptSha256s: ["a".repeat(64), "b".repeat(64)], completedAt: "2026-10-08T00:00:00Z" };

import {
  alignClassicalReadingUnits,
  classicalReadingModes,
  classicalTranslationReviewMeta
} from "../src/classical-reading.js";

test("equal paragraph counts without a mapping never claim semantic alignment", () => {
  const units = alignClassicalReadingUnits(
    [{ text: "甲" }, { text: "乙" }],
    { paragraphs: ["第一段", "第二段"] }
  );
  assert.equal(units.length, 1);
  assert.equal(units[0].alignment, "whole-work");
  assert.equal(units[0].sourceLines[1].sourceIndex, 1);
  assert.deepEqual(units[0].translations, ["第一段", "第二段"]);
});

test("unequal paragraph counts stay whole instead of being proportionally paired", () => {
  const units = alignClassicalReadingUnits(
    [{ text: "甲" }, { text: "乙" }, { text: "丙" }, { text: "丁" }],
    { paragraphs: ["前半", "後半"] }
  );
  assert.equal(units.length, 1);
  assert.deepEqual(units[0].sourceLines.map((line) => line.text), ["甲", "乙", "丙", "丁"]);
  assert.equal(units[0].alignment, "whole-work");
});

test("explicit mappings support groups while rejecting gaps, repeats, stale sources and swapped order", () => {
  const lines = ["甲", "乙", "丙"].map((text) => ({ text }));
  const paragraphs = ["合譯前兩句", "第三句前半", "第三句後半"];
  const alignment = createSemanticAlignment(lines, paragraphs, [
    { sourceIds: ["s00001", "s00002"], translationIndexes: [0] },
    { sourceIds: ["s00003"], translationIndexes: [1, 2] }
  ], verification);
  const units = alignClassicalReadingUnits(lines, { paragraphs, alignment });
  assert.equal(units.length, 2);
  assert.deepEqual(units[0].sourceLines.map((line) => line.text), ["甲", "乙"]);
  assert.deepEqual(units[1].translations, paragraphs.slice(1));
  assert.ok(units.every((unit) => unit.alignment === "semantic-groups"));
  const stale = structuredClone(alignment); stale.sourceTexts[0] = "改";
  const missing = structuredClone(alignment); missing.groups[0].sourceIds.pop();
  const duplicate = structuredClone(alignment); duplicate.groups[0].sourceIds[1] = "s00001";
  const swapped = structuredClone(alignment); swapped.groups[1].translationIndexes = [2, 2];
  for (const bad of [stale, missing, duplicate, swapped]) {
    assert.equal(validateClassicalAlignment(lines, paragraphs, bad).valid, false);
    assert.equal(alignClassicalReadingUnits(lines, { paragraphs, alignment: bad })[0].alignment, "whole-work");
  }
});

test("legacy per-line mappings need semantic audit and translated text is bound to the mapping", () => {
  const lines = [{text:"甲"},{text:"乙"}], paragraphs = ["第二句的意思", "第一句的意思"];
  assert.equal(alignClassicalReadingUnits(lines, {paragraphs, alignment:createClassicalAlignment(lines)})[0].alignment,"whole-work");
  const alignment = createSemanticAlignment(lines,paragraphs,[
    {sourceIds:["s00001"],translationIndexes:[1]}, {sourceIds:["s00002"],translationIndexes:[0]}
  ],verification);
  const units = alignClassicalReadingUnits(lines,{paragraphs,alignment});
  assert.deepEqual(units.map((unit)=>unit.translations[0]),["第一句的意思","第二句的意思"]);
  assert.equal(alignClassicalReadingUnits(lines,{paragraphs:["被替換的譯文",paragraphs[1]],alignment})[0].alignment,"whole-work");
});

test("meaningless legacy placeholders are shown as repair notices", () => {
  const [unit] = alignClassicalReadingUnits([{ text: "九枝燈" }], { paragraphs: ["專名或提示。"] });
  assert.deepEqual(unit.translations, ["此段今譯待修復。"]);
});

test("a whole-work translation never pretends to be line aligned", () => {
  const [unit] = alignClassicalReadingUnits(
    [{ text: "甲" }, { text: "乙" }],
    { paragraphs: ["整篇今譯"] }
  );
  assert.equal(unit.alignment, "whole-work");
  assert.equal(unit.sourceLines.length, 2);
});

test("source-only reading preserves one addressable unit per original line", () => {
  const units = alignClassicalReadingUnits([{ text: "甲" }, { text: "乙" }], null);
  assert.deepEqual(units.map((unit) => unit.alignment), ["source-only", "source-only"]);
  assert.deepEqual(units.map((unit) => unit.sourceLines[0].sourceIndex), [0, 1]);
  assert.ok(units.every((unit) => unit.translations.length === 0));
  assert.deepEqual(classicalReadingModes.map((mode) => mode.id), ["original", "parallel", "translation"]);
});

test("translation review states remain explicit and legacy labels are migrated safely", () => {
  assert.equal(classicalTranslationReviewMeta(null).id, "missing");
  assert.equal(classicalTranslationReviewMeta({ source: { reviewStatus: "machine-draft" } }).label, "機器初譯");
  assert.equal(classicalTranslationReviewMeta({
    source: { reviewStatus: "pending-review", editorialTriage: "initially-usable" }
  }).label, "初步可用");
  assert.equal(classicalTranslationReviewMeta({ source: { status: "未經 Leafbound 人工校訂" } }).label, "待校對");
  assert.equal(classicalTranslationReviewMeta({ source: { status: "AI 今譯 · 未經人工校訂" } }).label, "機器初譯");
  assert.equal(classicalTranslationReviewMeta({ paragraphs: ["內容"] }, { inline: true }).label, "人工已校");
});
