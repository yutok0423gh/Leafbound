import test from "node:test";
import assert from "node:assert/strict";

import { articles } from "../src/data.js";
import { englishDiscoveries } from "../src/open-english.js";
import { englishNewsDesks } from "../src/english-news-sources.js";
import {
  englishDictionarySnapshot,
  englishDictionaryState,
  englishItemId,
  findEnglishSentence,
  hasLocalEnglishMeaning,
  loadEnglishDictionary,
  lookupEnglishWord,
  normalizeEnglishWord
} from "../src/english.js";

const quietNoticing = articles.find((article) => article.id === "quiet-noticing");
const wordPattern = /[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;

test("English news directory separates public reading entrances from bundled text", () => {
  assert.equal(englishNewsDesks.length, 7);
  assert.deepEqual(englishNewsDesks.map((source) => source.shortName), [
    "AP",
    "Reuters",
    "Guardian",
    "CNN",
    "RFI",
    "Economist",
    "Open Newswire"
  ]);
  assert.equal(new Set(englishNewsDesks.map((source) => source.id)).size, englishNewsDesks.length);
  assert.ok(englishNewsDesks.every((source) => /^https:\/\//.test(source.homepage)));
  assert.ok(englishNewsDesks.every((source) => source.description.length > 12));
});

test("English lookup normalizes tokens and creates stable saved-item ids", () => {
  assert.equal(normalizeEnglishWord("‘Noticing.’"), "noticing");
  assert.equal(englishItemId(" Make no demand on us "), "english:make-no-demand-on-us");
});

test("sentence lookup keeps the clicked word in its original sentence", () => {
  const paragraph = quietNoticing.paragraphs[0];
  const offset = paragraph.indexOf("imperceptibly");
  const sentence = findEnglishSentence(paragraph, offset);
  assert.match(sentence.text, /familiar tree changing almost imperceptibly/);

  const entry = lookupEnglishWord({
    word: "imperceptibly",
    articleId: quietNoticing.id,
    paragraph,
    paragraphIndex: 0,
    offset
  });
  assert.equal(entry.meaning, "難以察覺地");
  assert.equal(entry.lemma, "imperceptible");
  assert.equal(entry.partOfSpeech, "adverb");
  assert.deepEqual(entry.commonUses.map((item) => item.pattern), [
    "almost imperceptibly",
    "change imperceptibly",
    "move imperceptibly"
  ]);
  assert.match(entry.contextMeaning, /一棵熟悉的樹/);
});

test("headline lookup supplies common collocations instead of relying on source context", () => {
  const paragraph = quietNoticing.paragraphs[0];
  const entry = lookupEnglishWord({
    word: "headline",
    articleId: quietNoticing.id,
    paragraph,
    paragraphIndex: 0,
    offset: paragraph.indexOf("headline")
  });
  assert.equal(entry.meaning, "標題");
  assert.equal(entry.partOfSpeech, "noun");
  assert.equal(entry.pronunciation, "/ˈhedlaɪn/");
  assert.deepEqual(entry.commonUses.map((item) => item.pattern), [
    "headline news",
    "make the headlines",
    "grab the headlines"
  ]);
});

test("gives exposes a concise five-part learning entry", async () => {
  await loadEnglishDictionary();
  const entry = lookupEnglishWord({ word: "gives" });

  assert.equal(entry.lemma, "give");
  assert.equal(entry.partOfSpeech, "verb");
  assert.equal(entry.pronunciation, "/ɡɪvz/");
  assert.equal(entry.meaning, "給；給予；提供；使某人獲得或感受到");
  assert.equal(entry.definition, "to hand something to someone, or to cause someone to have or experience something");
  assert.deepEqual(entry.commonUses.map((item) => item.pattern), [
    "give someone something",
    "give something to someone",
    "give directions / advice"
  ]);
  assert.deepEqual(entry.dictionaryExamples, [
    "Could you give me a few minutes?",
    "This seat gives you a clear view of the city."
  ]);
});

test("open WordNet data resolves inflected article vocabulary locally", async () => {
  await loadEnglishDictionary();
  const paragraph = articles.find((article) => article.id === "phrases-carry").paragraphs[0];
  const entry = lookupEnglishWord({
    word: "encounters",
    articleId: "phrases-carry",
    paragraph,
    paragraphIndex: 0,
    offset: paragraph.indexOf("encounters")
  });

  assert.equal(englishDictionaryState.status, "ready");
  assert.equal(entry.lemma, "encounter");
  assert.match(entry.partOfSpeech, /verb/);
  assert.match(entry.meaning, /遇見|相遇|碰到|遭遇/);
  assert.ok(entry.definition.length > 3);
  assert.deepEqual(entry.commonUses.map((item) => item.pattern), [
    "encounter a problem",
    "encounter difficulties",
    "encounter resistance"
  ]);
  assert.ok(entry.dictionarySenses.length >= 2);
  assert.equal(entry.dictionarySource, "open-wordnet");
});

test("FreeDict legally fills Chinese gaps without a remote lookup", async () => {
  await loadEnglishDictionary();
  const entry = lookupEnglishWord({ word: "abruptly" });
  assert.equal(entry.meaning, "突然");
  assert.equal(entry.dictionarySource, "wordnet-freedict");
  assert.match(entry.pronunciation, /^\//);
  assert.match(entry.definition, /without warning/);
});

test("editorial overrides keep irregular homonyms useful in context", async () => {
  await loadEnglishDictionary();
  const could = lookupEnglishWord({ word: "could" });
  const died = lookupEnglishWord({ word: "died" });

  assert.match(could.meaning, /可以|可能|能夠/);
  assert.doesNotMatch(could.meaning, /罐頭|解僱/);
  assert.deepEqual(could.commonUses.map((item) => item.pattern), [
    "could be possible",
    "could you…?",
    "could have + past participle"
  ]);
  assert.equal(died.meaning, "去世；死亡");
  assert.doesNotMatch(died.meaning, /骰子|模具/);
  assert.equal(died.partOfSpeech, "verb");
});

test("dictionary snapshot stays compact and covers most current article vocabulary", () => {
  assert.equal(englishDictionarySnapshot.articleCount, articles.length + englishDiscoveries.length);
  assert.match(englishDictionarySnapshot.contentDigest, /^[a-f0-9]{64}$/);
  assert.ok(englishDictionarySnapshot.articleWordCount >= 3_500);
  assert.ok(englishDictionarySnapshot.matchedWordCount >= 3_600);
  assert.ok(englishDictionarySnapshot.bilingualWordCount >= 3_350);
  assert.ok(englishDictionarySnapshot.freedictFallbackWordCount >= 750);
  assert.ok(englishDictionarySnapshot.matchedWordCount / englishDictionarySnapshot.articleWordCount > 0.9);
  assert.ok(englishDictionarySnapshot.bilingualWordCount / englishDictionarySnapshot.matchedWordCount > 0.88);
});

test("every word in The quiet work of noticing has a local Chinese gloss", () => {
  const missing = new Set();
  for (const paragraph of quietNoticing.paragraphs) {
    for (const match of paragraph.matchAll(wordPattern)) {
      if (!hasLocalEnglishMeaning(match[0])) missing.add(match[0].toLowerCase());
    }
  }
  assert.deepEqual([...missing], []);
});
