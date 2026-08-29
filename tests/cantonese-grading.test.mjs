import test from "node:test";
import assert from "node:assert/strict";

import {
  cantoneseEpisodeDescription,
  cantoneseEpisodeSourceLabel,
  cantoneseGradingNote,
  cantoneseLearningBands,
  getCantoneseLearningBand
} from "../src/cantonese-grading.js";
import { episodes } from "../src/data.js";

test("Leafbound condenses the source levels into three consistent learning bands", () => {
  assert.deepEqual(cantoneseLearningBands.map((band) => band.label), ["全部", "起步", "日常", "進階"]);
  assert.deepEqual(cantoneseLearningBands.map((band) => band.stepLabel), ["全部故事", "路徑 01", "路徑 02", "路徑 03"]);
  assert.deepEqual(cantoneseLearningBands.slice(1).flatMap((band) => band.levels), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(cantoneseLearningBands.some((band) => band.label === "長篇"), false);
  assert.equal(getCantoneseLearningBand(1).id, "start");
  assert.equal(getCantoneseLearningBand(4).id, "daily");
  assert.equal(getCantoneseLearningBand(7).id, "advance");
  assert.match(cantoneseGradingNote, /詞頻與用法/);
  assert.match(cantoneseGradingNote, /不等同 CEFR/);
});

test("the three learner-facing bands keep the current HBL shelf balanced", () => {
  const stories = episodes.filter((episode) => episode.sourceId === "hbl");
  const counts = Object.fromEntries(cantoneseLearningBands.slice(1).map((band) => [
    band.id,
    stories.filter((story) => band.levels.includes(story.level)).length
  ]));

  assert.deepEqual(counts, { start: 44, daily: 48, advance: 57 });
});

test("source HBL levels remain visible as provenance instead of the primary grade", () => {
  const story = episodes.find((episode) => episode.sourceId === "hbl" && episode.level === 1);
  assert.ok(story);
  assert.match(cantoneseEpisodeSourceLabel(story), /原站 HBL L1/);
  assert.match(cantoneseEpisodeSourceLabel(story), /Leafbound 起步/);
  assert.doesNotMatch(cantoneseEpisodeDescription(story), /粵文分級\s*1/u);
});
