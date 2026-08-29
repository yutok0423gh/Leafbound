import test from "node:test";
import assert from "node:assert/strict";
import {
  poetryFacetDefinitions,
  poetryFacetLabel,
  poetryFacetValues,
  poetryFacetValue,
  poetryMatchesFacet
} from "../src/poetry-taxonomy.js";

const ciWorks = [
  { kind: "詞", form: "詞", poet: "甲", dynasty: "宋", themes: ["四季"] },
  { kind: "詞", form: "浣溪沙", poet: "乙", dynasty: "宋", themes: ["思鄉"] },
  { kind: "詞", form: "浣溪沙", poet: "丙", dynasty: "宋", themes: ["四季"] },
  { kind: "詞", form: "蝶戀花", poet: "甲", dynasty: "宋", themes: ["離別"] }
];

test("poetry facets keep literary kind, poetic form, and ci tune at separate levels", () => {
  assert.deepEqual(poetryFacetDefinitions("全部").map(({ id }) => id), ["dynasty", "poet", "theme"]);
  assert.deepEqual(poetryFacetDefinitions("詩").map(({ id, label }) => [id, label]), [
    ["dynasty", "朝代"],
    ["poet", "作者"],
    ["form", "詩體"],
    ["theme", "主題"]
  ]);
  assert.deepEqual(poetryFacetDefinitions("詞").map(({ id, label }) => [id, label]), [
    ["dynasty", "朝代"],
    ["poet", "作者"],
    ["tune", "詞牌"],
    ["theme", "主題"]
  ]);
  assert.equal(poetryFacetLabel("form", "古文"), "文體");
});

test("generic ci records are not presented as a tune name", () => {
  assert.equal(poetryFacetValue(ciWorks[0], "tune"), null);
  assert.equal(poetryFacetValue({ kind: "曲", form: "元曲" }, "form"), null);
  assert.deepEqual(poetryFacetValues(ciWorks, "tune"), ["全部", "浣溪沙", "蝶戀花"]);
});

test("tune filtering matches only the requested tune", () => {
  assert.equal(poetryMatchesFacet(ciWorks[1], "tune", "浣溪沙"), true);
  assert.equal(poetryMatchesFacet(ciWorks[3], "tune", "浣溪沙"), false);
  assert.equal(poetryMatchesFacet(ciWorks[0], "tune", null), true);
});
