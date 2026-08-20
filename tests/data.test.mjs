import test from "node:test";
import assert from "node:assert/strict";

import { getDailyIndex, getLocalDayKey, getTodayPoem, poems } from "../src/data.js";

test("daily selections follow the local calendar and rotate after midnight", () => {
  const morning = new Date(2026, 7, 20, 0, 5);
  const evening = new Date(2026, 7, 20, 23, 55);
  const nextDay = new Date(2026, 7, 21, 0, 5);

  assert.equal(getLocalDayKey(morning), "2026-08-20");
  assert.equal(getLocalDayKey(morning), getLocalDayKey(evening));
  assert.notEqual(getLocalDayKey(evening), getLocalDayKey(nextDay));
  assert.equal(getTodayPoem(morning).id, getTodayPoem(evening).id);
  assert.notEqual(getTodayPoem(evening).id, getTodayPoem(nextDay).id);
  assert.notEqual(getDailyIndex(19, evening, 11), getDailyIndex(19, nextDay, 11));
  assert.notEqual(getDailyIndex(3, evening, 2), getDailyIndex(3, nextDay, 2));
  assert.equal(getDailyIndex(0, morning), -1);
});

test("each poem has a featured quote composed from its own lines", () => {
  poems.forEach((poem) => {
    assert.ok(poem.featuredQuote, `${poem.title} is missing a featured quote`);
    poem.featuredQuote.split(/[，。！？；]/u).filter(Boolean).forEach((quoteLine) => {
      const excerpt = quoteLine.replace(/…+$/u, "");
      assert.ok(
        poem.lines.some((line) => line.text.includes(excerpt)),
        `${poem.title} quote excerpt is not present in the work: ${excerpt}`
      );
    });
  });
});

test("open poetry entries remain source-only and traceable", () => {
  const imported = poems.filter((poem) => poem.isOpenCorpus);
  assert.equal(poems.length, 869);
  assert.equal(imported.length, 863);
  assert.equal(new Set(poems.map((poem) => poem.id)).size, poems.length);
  assert.deepEqual(
    Object.fromEntries(["詩", "詞", "古文"].map((kind) => [kind, poems.filter((poem) => poem.kind === kind).length])),
    { 詩: 367, 詞: 280, 古文: 222 }
  );
  imported.forEach((poem) => {
    assert.ok(["詩", "詞", "古文"].includes(poem.kind));
    assert.equal(poem.sourceLicense, "MIT");
    assert.match(poem.sourceUrl, /^https:\/\/github\.com\/chinese-poetry\/chinese-poetry\/blob\/[0-9a-f]{40}\//);
    assert.ok(poem.sourceRevision);
    assert.equal(poem.annotation, "");
    assert.equal(poem.translation, "");
    assert.equal(poem.appreciation, "");
    assert.equal(poem.allusion, "");
  });
});

test("Song ci are traditional Chinese and ancient prose preserves its paragraph source", () => {
  const songCi = poems.find((poem) => poem.title === "湘春夜月");
  assert.equal(songCi.kind, "詞");
  assert.equal(songCi.poet, "黃孝邁");
  assert.ok(songCi.lines.some((line) => line.text.includes("黃昏")));

  const guwen = poems.find((poem) => poem.title === "鄭伯克段於鄢");
  assert.equal(guwen.kind, "古文");
  assert.equal(guwen.poet, "左丘明");
  assert.equal(guwen.dynasty, "先秦");
  assert.equal(guwen.originalSource, "《左傳》");
  assert.ok(guwen.lines.length > 1);
  assert.ok(guwen.lines.every((line) => /[，。！？；]/u.test(line.text)));
});
