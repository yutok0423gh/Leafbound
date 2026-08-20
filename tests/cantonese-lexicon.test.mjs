import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCantonesePronunciationLine,
  getCantoneseTermData,
  lookupCantoneseReadings,
  segmentCantonesePronunciation,
  segmentCantoneseText
} from "../src/cantonese-lexicon.js";
import { cantoneseTerms, poems } from "../src/data.js";

const entries = {
  "嗰": ["go2"],
  "嗰陣": ["go2 zan6"],
  "嗰陣時": ["go2 zan6 si4"],
  "收檔": ["sau1 dong3"]
};

test("word-list lookup returns pronunciation candidates", () => {
  assert.deepEqual(lookupCantoneseReadings("收檔", entries), ["sau1 dong3"]);
  assert.deepEqual(lookupCantoneseReadings("沒有", entries), []);
});

test("segmentation uses longest dictionary matches", () => {
  const segments = segmentCantoneseText("嗰陣時收檔。", [], entries, 4);
  assert.deepEqual(
    segments.map(({ text, isWord }) => [text, isWord]),
    [["嗰陣時", true], ["收檔", true], ["。", false]]
  );
});

test("curated transcript phrases take priority over broader dictionary matches", () => {
  const segments = segmentCantoneseText("嗰陣時收檔。", ["嗰陣"], entries, 4);
  assert.equal(segments[0].text, "嗰陣");
  assert.equal(segments[0].isCurated, true);
});

test("curated meanings and public word-list entries remain distinguishable", () => {
  const curated = {
    "收檔": {
      text: "收檔",
      jyutping: "sau1 dong3",
      mandarin: "收攤",
      english: "close up",
      type: "Cantonese word"
    }
  };
  assert.equal(getCantoneseTermData("收檔", curated, entries).dictionaryOnly, false);
  const dynamic = getCantoneseTermData("嗰陣時", curated, entries);
  assert.equal(dynamic.dictionaryOnly, true);
  assert.match(dynamic.sourceUrl, /words\.hk\/zidin/);
});

test("prose pronunciation combines word matches with rare-character fallback readings", () => {
  const wordEntries = { "臨朝": ["lam4 ciu4"] };
  const characterEntries = { "矣": ["ji5"], "焉": ["jin1"] };
  const segments = segmentCantonesePronunciation("臨朝矣焉。", wordEntries, characterEntries, 4);
  assert.deepEqual(
    segments.map(({ text, readings, source }) => [text, readings[0] || "", source]),
    [
      ["臨朝", "lam4 ciu4", "words-hk"],
      ["矣", "ji5", "rime-cantonese"],
      ["焉", "jin1", "rime-cantonese"],
      ["。", "", ""]
    ]
  );

  const fallbackTerm = getCantoneseTermData("矣", {}, wordEntries, characterEntries);
  assert.equal(fallbackTerm.type, "Rime 單字表");
  assert.equal(fallbackTerm.sourceLicense, "CC BY 4.0");
});

test("transcript pronunciation lines keep first candidates and readable Latin words", () => {
  const wordEntries = { "媽咪": ["maa1 mi1"], "返學": ["faan1 hok6"] };
  const characterEntries = { "喇": ["laa3"] };
  assert.equal(
    buildCantonesePronunciationLine("Rani 返學喇！", wordEntries, characterEntries, 4),
    "Rani faan1 hok6 laa3"
  );
});

test("curated transcript pronunciations agree with the pinned words.hk candidates", () => {
  const payload = JSON.parse(readFileSync(new URL("../data/words-hk-wordslist.json", import.meta.url), "utf8"));
  Object.values(cantoneseTerms).forEach((term) => {
    assert.ok(
      payload.entries[term.text]?.includes(term.jyutping),
      `${term.text} pronunciation ${term.jyutping} is not in the pinned words.hk word list`
    );
  });
});

test("local pronunciation data covers every Han character in the ancient prose library", () => {
  const wordPayload = JSON.parse(readFileSync(new URL("../data/words-hk-wordslist.json", import.meta.url), "utf8"));
  const characterPayload = JSON.parse(readFileSync(new URL("../data/rime-cantonese-chars.json", import.meta.url), "utf8"));
  const missing = new Set();

  poems.filter((poem) => poem.kind === "古文").forEach((poem) => {
    poem.lines.forEach((line) => {
      Array.from(line.text).forEach((character) => {
        if (/\p{Script=Han}/u.test(character)
          && !wordPayload.entries[character]?.length
          && !characterPayload.entries[character]?.length) missing.add(character);
      });
    });
  });

  assert.deepEqual([...missing], []);
  assert.equal(characterPayload.meta.sourceRevision, "259f0e48bba840c3a2e0d117539e96937f3d89bc");
  assert.equal(characterPayload.meta.license, "CC BY 4.0");
});
