import test from "node:test";
import assert from "node:assert/strict";

import { articles } from "../src/data.js";
import {
  englishItemId,
  findEnglishSentence,
  hasLocalEnglishMeaning,
  lookupEnglishWord,
  normalizeEnglishWord
} from "../src/english.js";

const quietNoticing = articles.find((article) => article.id === "quiet-noticing");
const wordPattern = /[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;

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

test("every word in The quiet work of noticing has a local Chinese gloss", () => {
  const missing = new Set();
  for (const paragraph of quietNoticing.paragraphs) {
    for (const match of paragraph.matchAll(wordPattern)) {
      if (!hasLocalEnglishMeaning(match[0])) missing.add(match[0].toLowerCase());
    }
  }
  assert.deepEqual([...missing], []);
});
