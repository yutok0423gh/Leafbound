import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  alignCantonesePronunciation,
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
  const curatedTerm = getCantoneseTermData("收檔", curated, entries);
  assert.equal(curatedTerm.dictionaryOnly, false);
  assert.deepEqual(curatedTerm.definitions, ["收攤"]);
  const dynamic = getCantoneseTermData(
    "嗰陣時",
    curated,
    entries,
    null,
    { "嗰陣時": ["當時。"] }
  );
  assert.equal(dynamic.dictionaryOnly, true);
  assert.deepEqual(dynamic.definitions, ["當時。"]);
  assert.equal(dynamic.readingNote.includes("候選讀音"), true);
  assert.match(dynamic.sourceUrl, /words\.hk\/zidin/);
});

test("the generated MOE subset preserves exact Traditional Chinese definitions", () => {
  const rawPayload = readFileSync(new URL("../data/moe-revised-definitions.json", import.meta.url), "utf8");
  const payload = JSON.parse(rawPayload);
  const usageGuide = readFileSync(new URL("../data/licenses/moe-revised-dictionary-usage.txt", import.meta.url), "utf8");

  assert.equal(payload.meta.source, "中華民國教育部《重編國語辭典修訂本》");
  assert.equal(payload.meta.version, "2015_20260625");
  assert.equal(payload.meta.license, "CC BY-ND 3.0 TW");
  assert.equal(payload.meta.sourceSha256, "df94ae4384ae3f33f573ded5c2f142041ea7530d381a285163593d6252ea4a9a");
  assert.equal(payload.meta.entries, 38_450);
  assert.ok(payload.entries["闌干"][0].includes("竹木或金屬條編成的柵欄"));
  assert.ok(payload.entries["闌干"][0].includes("星光橫斜參差的樣子"));
  assert.equal(rawPayload.includes("Pronunciation candidates"), false);
  assert.ok(usageGuide.includes("創用 CC－姓名標示－禁止改作 臺灣 3.0 版授權條款"));
  assert.ok(usageGuide.includes("版本編號：2015_20260625"));
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

  const fallbackTerm = getCantoneseTermData(
    "矣",
    {},
    wordEntries,
    characterEntries,
    { "矣": ["文言句末助詞。"] }
  );
  assert.equal(fallbackTerm.type, "Rime 單字表");
  assert.equal(fallbackTerm.sourceLicense, "CC BY 4.0");
  assert.deepEqual(fallbackTerm.definitions, ["文言句末助詞。"]);
});

test("transcript pronunciation lines keep first candidates and readable Latin words", () => {
  const wordEntries = { "媽咪": ["maa1 mi1"], "返學": ["faan1 hok6"] };
  const characterEntries = { "喇": ["laa3"] };
  assert.equal(
    buildCantonesePronunciationLine("Rani 返學喇！", wordEntries, characterEntries, 4),
    "Rani faan1 hok6 laa3"
  );
});

test("source Jyutping aligns to words without shifting across punctuation", () => {
  const aligned = alignCantonesePronunciation(
    "H：但係我都知道你鍾意法拉利。",
    "daan6hai6 ngo5 dou1 zi1dou3 nei5 zung1ji3 faat3laai1lei2"
  );
  assert.deepEqual(
    aligned.filter((segment) => segment.syllables.length).map(({ text, syllables }) => [text, syllables]),
    [
      ["但係", ["daan6", "hai6"]],
      ["我", ["ngo5"]],
      ["都", ["dou1"]],
      ["知道", ["zi1", "dou3"]],
      ["你", ["nei5"]],
      ["鍾意", ["zung1", "ji3"]],
      ["法拉利", ["faat3", "laai1", "lei2"]]
    ]
  );
  assert.equal(aligned[0].text, "H：");
  assert.equal(aligned.at(-1).text, "。");

  assert.deepEqual(
    alignCantonesePronunciation(
      "A：基本上哩個旅行呢都幾好喇。",
      "ge3i1bun2soeng6 ni1go3 leoi5hang4 ne1 dou1 gei2 hou2 laa1"
    ),
    []
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

test("local pronunciation data covers every meaningful line in the classical library", () => {
  const wordPayload = JSON.parse(readFileSync(new URL("../data/words-hk-wordslist.json", import.meta.url), "utf8"));
  const characterPayload = JSON.parse(readFileSync(new URL("../data/rime-cantonese-chars.json", import.meta.url), "utf8"));
  const missing = new Set();
  const maxWordLength = Math.min(
    16,
    Object.keys(wordPayload.entries).reduce((maximum, word) => Math.max(maximum, Array.from(word).length), 2)
  );

  poems.forEach((poem) => {
    poem.lines.forEach((line) => {
      segmentCantonesePronunciation(
        line.text,
        wordPayload.entries,
        characterPayload.entries,
        maxWordLength
      ).forEach((segment) => {
        if (segment.isWord) return;
        Array.from(segment.text).forEach((character) => {
          if (/\p{Script=Han}/u.test(character)) missing.add(character);
        });
      });

      if (/[\p{Script=Han}A-Za-z0-9]/u.test(line.text)) {
        assert.ok(
          buildCantonesePronunciationLine(
            line.text,
            wordPayload.entries,
            characterPayload.entries,
            maxWordLength
          ),
          `${poem.id} has a meaningful line without a generated pronunciation: ${line.text}`
        );
      }
    });
  });

  assert.deepEqual([...missing], []);
  assert.deepEqual(lookupCantoneseReadings("荆", wordPayload.entries, characterPayload.entries), ["ging1"]);
  assert.deepEqual(lookupCantoneseReadings("衮", wordPayload.entries, characterPayload.entries), ["gwan2", "kwan2"]);
  assert.deepEqual(lookupCantoneseReadings("万俟", wordPayload.entries, characterPayload.entries), ["mak6 kei4"]);
  assert.equal(characterPayload.meta.sourceRevision, "259f0e48bba840c3a2e0d117539e96937f3d89bc");
  assert.equal(characterPayload.meta.license, "CC BY 4.0");
});
