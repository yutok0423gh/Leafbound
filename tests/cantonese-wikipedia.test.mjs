import test from "node:test";
import assert from "node:assert/strict";
import { createWeeklyIntake, emptyContentHistory } from "../scripts/content-history.mjs";
import { importWikipediaArticles, wikipediaArticle } from "../scripts/cantonese-wikipedia.mjs";

function page(id = 1) {
  return {
    pageid: id, ns: 0, pagelanguage: "yue", title: `測試文章${id}`, length: 3000,
    canonicalurl: `https://zh-yue.wikipedia.org/wiki/Test_${id}`, lastrevid: 100 + id,
    revisions: [{ revid: 100 + id, timestamp: "2026-09-01T00:00:00Z" }],
    extract: `${id}：${"我哋喺屋企睇嘅文章，講咗唔同嘅自然知識。".repeat(9)}\n\n== 背景 ==\n\n${"佢哋一齊去公園，見到好多有趣嘅植物同動物。".repeat(9)}`
  };
}

test("Cantonese encyclopedia articles retain text, attribution, license and revision without claiming a recording", () => {
  const article = wikipediaArticle(page());
  assert.ok(article);
  assert.equal(article.sourceLicense, "CC BY-SA 4.0");
  assert.equal(article.sourceRevisionUrl, "https://zh-yue.wikipedia.org/w/index.php?oldid=101");
  assert.equal(article.audioKind, "speech");
  assert.equal(article.hasAuthenticAudio, false);
  assert.match(article.attribution, /貢獻者.*編輯歷史/u);
  assert.match(article.editorialChanges, /圖片、表格/u);
  assert.equal(article.transcript[1].text, "背景");
  assert.equal(article.transcript[2].text, page().extract.split("\n\n")[2]);
  assert.ok(article.transcript.every((segment, index) => index === 0 || segment.at > article.transcript[index - 1].at));
  for (const invalid of [
    { extract: "一段短文。" }, { pagelanguage: "zh" }, { ns: 1 }, { title: "人物列表" },
    { pageprops: { disambiguation: "" } }, { lastrevid: 102 },
    { canonicalurl: "https://example.org/article" }
  ]) assert.equal(wikipediaArticle({ ...page(), ...invalid }), null);
  assert.equal(wikipediaArticle(page(), (character) => character !== "背"), null);
});

test("encyclopedia fallback skips previously collected revisions, fills only the remaining quota, and stops without further requests", async () => {
  const history = emptyContentHistory();
  const old = wikipediaArticle(page(1));
  const intake = createWeeklyIntake(history, "cantonese", [old], new Date("2026-09-14T01:00:00Z"));
  const requested = [];
  const query = async (parameters) => {
    requested.push(parameters);
    if (parameters.meta) return { query: { general: { lang: "yue" }, rightsinfo: { url: "https://creativecommons.org/licenses/by-sa/4.0/deed.zh-yue" } } };
    if (parameters.generator) return { query: { pages: Array.from({ length: 50 }, (_, index) => page(index + 1)) } };
    return { query: { pages: [page(Number(parameters.pageids))] } };
  };
  await importWikipediaArticles(intake, { query });
  assert.equal(intake.additions.length, 20);
  assert.equal(intake.additions.some((article) => article.id === old.id), false);
  assert.equal(requested.some((parameters) => parameters.pageids === "1"), false);
  assert.equal(requested.filter((parameters) => parameters.pageids).length, 20);
  assert.ok(requested.filter((parameters) => parameters.pageids).every((parameters) => !parameters.exintro && !parameters.exchars && parameters.exlimit === "1"));
  await importWikipediaArticles(intake, { query: async () => assert.fail("A full issue must not fetch more articles") });
  intake.finish();
  const next = createWeeklyIntake(history, "cantonese", [], new Date("2026-09-21T01:00:00Z"));
  assert.equal(next.accept({ ...old, sourceRevision: 900, transcript: [{ text: "更新後嘅同一篇文章。" }] }), false);
});

test("encyclopedia fallback fails closed when the source language or reuse license changes", async () => {
  for (const [lang, url] of [["zh", "https://creativecommons.org/licenses/by-sa/4.0/"], ["yue", "https://example.org/restricted"]]) {
    const intake = createWeeklyIntake(emptyContentHistory(), "cantonese", [], new Date("2026-09-14T01:00:00Z"));
    await assert.rejects(importWikipediaArticles(intake, { query: async () => ({ query: { general: { lang }, rightsinfo: { url } } }) }), /license could not be verified/);
    assert.equal(intake.additions.length, 0);
  }
});
