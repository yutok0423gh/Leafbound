import test from "node:test";
import assert from "node:assert/strict";

import { getDailyIndex, getLocalDayKey, getTodayPoem, pickDailyItem, poems, poetryKinds } from "../src/data.js";
import { openPoems } from "../src/open-poems.js";

const fullOpenPoemById = new Map(openPoems.map((poem) => [poem.id, poem]));

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

test("daily shelves do not repeat a presented item before the pool is exhausted", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id }));
  const recentIds = [];
  const selections = [];

  for (let day = 0; day < items.length; day += 1) {
    const selected = pickDailyItem(items, {
      date: new Date(2026, 7, 20 + day),
      preferred: items[0],
      recentIds
    }).item;
    selections.push(selected.id);
    recentIds.unshift(selected.id);
  }

  assert.equal(new Set(selections).size, items.length);
  const nextCycle = pickDailyItem(items, {
    date: new Date(2026, 7, 24),
    preferred: items[0],
    recentIds
  }).item;
  assert.notEqual(nextCycle.id, selections.at(-1));
});

test("each poem has a featured quote composed from its own lines", () => {
  poems.forEach((poem) => {
    const readablePoem = fullOpenPoemById.get(poem.id) || poem;
    assert.ok(poem.featuredQuote, `${poem.title} is missing a featured quote`);
    poem.featuredQuote.split(/[，。！？；]/u).filter(Boolean).forEach((quoteLine) => {
      const excerpt = quoteLine.replace(/…+$/u, "");
      assert.ok(
        readablePoem.lines.some((line) => line.text.includes(excerpt)),
        `${poem.title} quote excerpt is not present in the work: ${excerpt}`
      );
    });
  });
});

test("open poetry entries remain source-only and traceable", () => {
  const imported = poems.filter((poem) => poem.isOpenCorpus);
  assert.equal(poems.length, 17_373);
  assert.equal(imported.length, 17_367);
  assert.equal(new Set(poems.map((poem) => poem.id)).size, poems.length);
  assert.deepEqual(
    Object.fromEntries(["詩", "詞", "曲", "古文"].map((kind) => [kind, poems.filter((poem) => poem.kind === kind).length])),
    { 詩: 3_566, 詞: 2_449, 曲: 10_906, 古文: 452 }
  );
  assert.deepEqual(poetryKinds, ["全部", "詩", "詞", "曲", "古文"]);
  imported.forEach((poem) => {
    assert.ok(["詩", "詞", "曲", "古文"].includes(poem.kind));
    assert.equal(poem.sourceLicense, "MIT");
    assert.match(poem.sourceUrl, /^https:\/\/github\.com\/chinese-poetry\/chinese-poetry\/blob\/[0-9a-f]{40}\//);
    assert.ok(poem.sourceRevision);
    assert.equal(poem.annotation, "");
    assert.equal(poem.translation, "");
    assert.equal(poem.appreciation, "");
    assert.equal(poem.allusion, "");
  });
});

test("expanded classical shelf includes complete canonical open collections", () => {
  const collectionCounts = Object.fromEntries(
    [
      "詩經", "楚辭", "元曲", "曹操詩集", "納蘭性德詞集", "四書", "幽夢影",
      "全唐詩選", "千家詩", "全宋詞選", "幼學瓊林", "聲律啓蒙", "弟子規", "增廣賢文", "文字蒙求"
    ]
      .map((collection) => [collection, poems.filter((poem) => poem.collection === collection).length])
  );
  assert.deepEqual(collectionCounts, {
    詩經: 305,
    楚辭: 65,
    元曲: 10_906,
    曹操詩集: 26,
    納蘭性德詞集: 257,
    四書: 36,
    幽夢影: 19,
    全唐詩選: 2_592,
    千家詩: 212,
    全宋詞選: 1_912,
    幼學瓊林: 33,
    聲律啓蒙: 30,
    弟子規: 8,
    增廣賢文: 63,
    文字蒙求: 41
  });

  const shijing = openPoems.find((poem) => poem.collection === "詩經" && poem.title === "關雎");
  assert.equal(shijing.dynasty, "先秦");
  assert.ok(shijing.lines[0].text.includes("關關雎鳩"));

  const chuci = openPoems.find((poem) => poem.collection === "楚辭" && poem.title === "離騷");
  assert.equal(chuci.form, "楚辭");
  assert.ok(chuci.lines.length > 100);

  const fourBooks = openPoems.find((poem) => poem.collection === "四書" && poem.title === "論語 · 學而篇");
  assert.equal(fourBooks.kind, "古文");
  assert.equal(fourBooks.originalSource, "《論語》");
  assert.ok(fourBooks.lines[0].text.includes("學而時習之"));

  const yuanqu = openPoems.find((poem) => poem.collection === "元曲");
  assert.equal(yuanqu.kind, "曲");
  assert.equal(yuanqu.dynasty, "元");
});

test("Song ci are traditional Chinese and ancient prose preserves its paragraph source", () => {
  const songCi = openPoems.find((poem) => poem.title === "湘春夜月");
  assert.equal(songCi.kind, "詞");
  assert.equal(songCi.poet, "黃孝邁");
  assert.ok(songCi.lines.some((line) => line.text.includes("黃昏")));

  const guwen = openPoems.find((poem) => poem.title === "鄭伯克段於鄢");
  assert.equal(guwen.kind, "古文");
  assert.equal(guwen.poet, "左丘明");
  assert.equal(guwen.dynasty, "先秦");
  assert.equal(guwen.originalSource, "《左傳》");
  assert.ok(guwen.lines.length > 1);
  assert.ok(guwen.lines.every((line) => /[，。！？；]/u.test(line.text)));
});
