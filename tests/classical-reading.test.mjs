import assert from "node:assert/strict";
import test from "node:test";

import {
  alignClassicalReadingUnits,
  classicalReadingModes,
  classicalTranslationReviewMeta
} from "../src/classical-reading.js";

test("classical reading units align equal source and translation paragraphs exactly", () => {
  const units = alignClassicalReadingUnits(
    [{ text: "甲" }, { text: "乙" }],
    { paragraphs: ["第一段", "第二段"] }
  );
  assert.deepEqual(units.map((unit) => unit.alignment), ["exact", "exact"]);
  assert.equal(units[1].sourceLines[0].sourceIndex, 1);
  assert.deepEqual(units[1].translations, ["第二段"]);
});

test("mismatched paragraphs stay adjacent but are marked as structural rather than exact", () => {
  const units = alignClassicalReadingUnits(
    [{ text: "甲" }, { text: "乙" }, { text: "丙" }, { text: "丁" }],
    { paragraphs: ["前半", "後半"] }
  );
  assert.equal(units.length, 2);
  assert.deepEqual(units.map((unit) => unit.sourceLines.map((line) => line.text)), [["甲", "乙"], ["丙", "丁"]]);
  assert.ok(units.every((unit) => unit.alignment === "structural"));
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
