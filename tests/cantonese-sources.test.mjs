import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { episodes } from "../src/data.js";
import { cantoneseSourceSnapshot, openCantoneseEpisodes } from "../src/open-cantonese.js";
import { buildCantonesePronunciationLine } from "../src/cantonese-lexicon.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Cantonese shelves include authentic Hong Kong speech and seven graded levels", () => {
  assert.equal(episodes.length, openCantoneseEpisodes.length + 3);
  assert.equal(cantoneseSourceSnapshot.authenticSampleCount, 5);
  assert.equal(
    cantoneseSourceSnapshot.importedStoryCount,
    Object.values(cantoneseSourceSnapshot.levelCounts).reduce((sum, count) => sum + count, 0)
  );
  assert.ok(cantoneseSourceSnapshot.importedStoryCount >= 140);
  assert.ok(cantoneseSourceSnapshot.catalogCount >= 200);
  assert.match(cantoneseSourceSnapshot.contentDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(cantoneseSourceSnapshot.levelCounts), ["1", "2", "3", "4", "5", "6", "7"]);
  Object.values(cantoneseSourceSnapshot.levelCounts).forEach((count) => assert.ok(count >= 12));
  assert.equal(new Set(episodes.map((episode) => episode.id)).size, episodes.length);
});

test("HKCanCor samples keep local audio, speaker text, and corpus Jyutping", () => {
  const samples = episodes.filter((episode) => episode.sourceId === "hkcancor");
  assert.equal(samples.length, 5);
  samples.forEach((episode) => {
    const audioPath = join(projectRoot, episode.audioFile);
    assert.equal(episode.audioKind, "local");
    assert.equal(episode.sourceLicense, "CC BY 4.0");
    assert.ok(existsSync(audioPath), `${episode.title} is missing local audio`);
    assert.ok(statSync(audioPath).size > 300_000, `${episode.title} audio is unexpectedly small`);
    assert.ok(episode.transcript.length >= 8);
    assert.ok(episode.transcript.every((segment) => segment.jyutping));
    assert.ok(episode.transcript.every((segment) => /^[A-Z]：/u.test(segment.text)));
    assert.equal(episode.transcript.some((segment) => /[\uE000-\uF8FF]/u.test(segment.text)), false);
  });
});

test("Hambaanglaang stories are readable in-app and retain per-work attribution", () => {
  const stories = episodes.filter((episode) => episode.sourceId === "hbl");
  assert.equal(stories.length, cantoneseSourceSnapshot.importedStoryCount);
  stories.forEach((episode) => {
    assert.equal(episode.audioKind, "soundcloud");
    assert.match(episode.audioUrl, /^https:\/\/soundcloud\.com\//);
    assert.match(episode.sourceUrl, /^https:\/\/hambaanglaang\.hk\//);
    assert.match(episode.textDocumentUrl, /^https:\/\/docs\.google\.com\/document\//);
    assert.match(episode.sourceLicense, /^CC BY (?:3\.0|4\.0)$/);
    assert.match(episode.attribution, /CC BY/i);
    assert.ok(episode.transcript.length >= 2);
    assert.ok(episode.transcript.every((segment) => segment.text.length > 0));
  });
});

test("local pronunciation data covers the Han characters in every imported Cantonese story", () => {
  const wordPayload = JSON.parse(readFileSync(new URL("../data/words-hk-wordslist.json", import.meta.url), "utf8"));
  const characterPayload = JSON.parse(readFileSync(new URL("../data/rime-cantonese-chars.json", import.meta.url), "utf8"));
  const missing = new Set();

  episodes.filter((episode) => episode.sourceId === "hbl").forEach((episode) => {
    episode.transcript.forEach((segment) => {
      Array.from(segment.text).forEach((character) => {
        if (/\p{Script=Han}/u.test(character)
          && !wordPayload.entries[character]?.length
          && !characterPayload.entries[character]?.length) missing.add(character);
      });
    });
  });

  assert.deepEqual([...missing], []);
});

test("every Cantonese transcript segment has a usable pronunciation line", () => {
  const wordPayload = JSON.parse(readFileSync(new URL("../data/words-hk-wordslist.json", import.meta.url), "utf8"));
  const characterPayload = JSON.parse(readFileSync(new URL("../data/rime-cantonese-chars.json", import.meta.url), "utf8"));
  const maxWordLength = Math.min(
    16,
    Object.keys(wordPayload.entries).reduce((maximum, word) => Math.max(maximum, Array.from(word).length), 2)
  );

  episodes.forEach((episode) => {
    episode.transcript.forEach((segment, index) => {
      assert.ok(
        segment.jyutping || buildCantonesePronunciationLine(
          segment.text,
          wordPayload.entries,
          characterPayload.entries,
          maxWordLength
        ),
        `${episode.id} segment ${index + 1} has no corpus or generated Jyutping`
      );
    });
  });
});
