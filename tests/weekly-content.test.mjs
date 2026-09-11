import test from "node:test";
import assert from "node:assert/strict";
import { loadContentHistory, articleKeys } from "../scripts/content-history.mjs";
import { englishDiscoveries } from "../src/open-english.js";
import { openCantoneseEpisodes } from "../src/open-cantonese.js";
import { weeklyContentRelease } from "../src/content-release.js";

test("published weekly articles match the permanent history and existing library", async () => {
  const history = await loadContentHistory();
  for (const [language, pool] of [["english", englishDiscoveries], ["cantonese", openCantoneseEpisodes]]) {
    const shelf = history.languages[language];
    const release = weeklyContentRelease[language];
    assert.equal(release.count, release.articleIds.length);
    assert.equal(release.shortfall, 20 - release.count);
    assert.ok(release.count <= 20);
    assert.equal(new Set(release.articleIds).size, release.count);
    for (const id of release.articleIds) {
      const item = pool.find((candidate) => candidate.id === id);
      assert.ok(item, `${language} weekly article ${id} is not readable`);
      assert.equal(item.firstCollectedWeek, weeklyContentRelease.week);
      const keys = articleKeys(item);
      const records = shelf.records.filter((record) => record.keys.some((key) => keys.includes(key)));
      assert.ok(records.length > 0, `${id} is absent from the history`);
      assert.ok(records.every((record) => record.firstSeenWeek === weeklyContentRelease.week), `${id} was already collected before this week`);
      assert.ok(shelf.weeks[weeklyContentRelease.week].articleIds.includes(id));
    }
    const weeklyIds = Object.values(shelf.weeks).flatMap((issue) => issue.articleIds);
    assert.equal(new Set(weeklyIds).size, weeklyIds.length, `${language} repeats an article across weeks`);
  }
});
