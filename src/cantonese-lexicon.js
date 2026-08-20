const dictionaryUrl = new URL("../data/words-hk-wordslist.json", import.meta.url);
const characterDictionaryUrl = new URL("../data/rime-cantonese-chars.json", import.meta.url);

export const cantoneseLexiconState = {
  status: "idle",
  entries: null,
  characterEntries: null,
  entryCount: 0,
  characterEntryCount: 0,
  maxWordLength: 8,
  source: "粵典 words.hk",
  license: "Public domain",
  characterSource: "Rime Cantonese · jyut6ping3.chars",
  characterLicense: "CC BY 4.0",
  error: ""
};

let loadingPromise = null;

export function lookupCantoneseReadings(
  word,
  entries = cantoneseLexiconState.entries,
  characterEntries = entries === cantoneseLexiconState.entries ? cantoneseLexiconState.characterEntries : null
) {
  if (!word) return [];
  const wordReadings = Array.isArray(entries?.[word]) ? entries[word] : [];
  if (wordReadings.length) return wordReadings;
  return Array.isArray(characterEntries?.[word]) ? characterEntries[word] : [];
}

export function getCantoneseTermData(
  word,
  curatedTerms = {},
  entries = cantoneseLexiconState.entries,
  characterEntries = entries === cantoneseLexiconState.entries ? cantoneseLexiconState.characterEntries : null
) {
  if (curatedTerms[word]) return { ...curatedTerms[word], dictionaryOnly: false };
  const wordReadings = Array.isArray(entries?.[word]) ? entries[word] : [];
  const readings = wordReadings.length ? wordReadings : lookupCantoneseReadings(word, entries, characterEntries);
  if (!readings.length) return null;
  const fromCharacterFallback = !wordReadings.length && Array.isArray(characterEntries?.[word]);
  return {
    text: word,
    jyutping: readings.join(" / "),
    mandarin: fromCharacterFallback
      ? "Rime Cantonese 單字表補充的候選讀音；古典語境及多音字可能有不同讀法。"
      : "粵典公有詞表目前只提供候選讀音；可前往原站查看完整釋義。",
    english: fromCharacterFallback
      ? "Pronunciation candidates from the Rime Cantonese character dictionary."
      : "Pronunciation candidates from the public-domain words.hk word list.",
    type: fromCharacterFallback ? "Rime 單字表" : "粵典詞表",
    dictionaryOnly: true,
    source: fromCharacterFallback ? "Rime Cantonese" : "粵典 words.hk",
    sourceUrl: fromCharacterFallback
      ? "https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/jyut6ping3.chars.dict.yaml"
      : `https://words.hk/zidin/${encodeURIComponent(word)}`,
    sourceLicense: fromCharacterFallback ? "CC BY 4.0" : "Public domain word list",
    sourceLinkLabel: fromCharacterFallback ? "查看單字表來源" : "前往粵典查看完整詞條"
  };
}

export function segmentCantoneseText(text, curatedWords = [], entries = cantoneseLexiconState.entries, maxWordLength = cantoneseLexiconState.maxWordLength) {
  const characters = Array.from(String(text || ""));
  const curated = [...new Set(curatedWords)]
    .map((word) => ({ word, characters: Array.from(word) }))
    .sort((a, b) => b.characters.length - a.characters.length);
  const segments = [];
  let index = 0;

  function appendPlain(value) {
    const previous = segments.at(-1);
    if (previous && !previous.isWord) previous.text += value;
    else segments.push({ text: value, isWord: false, readings: [] });
  }

  while (index < characters.length) {
    let match = "";
    let isCurated = false;
    const curatedMatch = curated.find(({ characters: wordCharacters }) => (
      wordCharacters.length <= characters.length - index
      && wordCharacters.every((character, offset) => characters[index + offset] === character)
    ));

    if (curatedMatch) {
      match = curatedMatch.word;
      isCurated = true;
    } else {
      const available = Math.min(maxWordLength || 8, characters.length - index);
      for (let length = available; length >= 2; length -= 1) {
        const candidate = characters.slice(index, index + length).join("");
        if (entries && entries[candidate]) {
          match = candidate;
          break;
        }
      }
    }

    if (match) {
      segments.push({ text: match, isWord: true, isCurated, readings: lookupCantoneseReadings(match, entries) });
      index += Array.from(match).length;
    } else {
      appendPlain(characters[index]);
      index += 1;
    }
  }

  return segments;
}

export function segmentCantonesePronunciation(
  text,
  entries = cantoneseLexiconState.entries,
  characterEntries = cantoneseLexiconState.characterEntries,
  maxWordLength = cantoneseLexiconState.maxWordLength
) {
  const characters = Array.from(String(text || ""));
  const segments = [];
  let index = 0;

  function appendPlain(value) {
    const previous = segments.at(-1);
    if (previous && !previous.isWord) previous.text += value;
    else segments.push({ text: value, isWord: false, readings: [], source: "" });
  }

  while (index < characters.length) {
    let match = "";
    const available = Math.min(maxWordLength || 8, characters.length - index);
    for (let length = available; length >= 2; length -= 1) {
      const candidate = characters.slice(index, index + length).join("");
      if (Array.isArray(entries?.[candidate]) && entries[candidate].length) {
        match = candidate;
        break;
      }
    }

    if (match) {
      segments.push({
        text: match,
        isWord: true,
        isCurated: false,
        readings: entries[match],
        source: "words-hk"
      });
      index += Array.from(match).length;
      continue;
    }

    const character = characters[index];
    const wordReadings = Array.isArray(entries?.[character]) ? entries[character] : [];
    const fallbackReadings = Array.isArray(characterEntries?.[character]) ? characterEntries[character] : [];
    const readings = wordReadings.length ? wordReadings : fallbackReadings;
    if (readings.length) {
      segments.push({
        text: character,
        isWord: true,
        isCurated: false,
        readings,
        source: wordReadings.length ? "words-hk" : "rime-cantonese"
      });
    } else {
      appendPlain(character);
    }
    index += 1;
  }

  return segments;
}

export function buildCantonesePronunciationLine(
  text,
  entries = cantoneseLexiconState.entries,
  characterEntries = cantoneseLexiconState.characterEntries,
  maxWordLength = cantoneseLexiconState.maxWordLength
) {
  return segmentCantonesePronunciation(text, entries, characterEntries, maxWordLength)
    .flatMap((segment) => {
      if (segment.isWord && segment.readings.length) return segment.readings[0];
      return segment.text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g) || [];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadCantoneseLexicon() {
  if (cantoneseLexiconState.status === "ready") return cantoneseLexiconState;
  if (loadingPromise) return loadingPromise;

  cantoneseLexiconState.status = "loading";
  cantoneseLexiconState.error = "";
  loadingPromise = Promise.all([fetch(dictionaryUrl), fetch(characterDictionaryUrl)])
    .then(async ([wordResponse, characterResponse]) => {
      if (!wordResponse.ok) throw new Error(`words.hk HTTP ${wordResponse.status}`);
      if (!characterResponse.ok) throw new Error(`Rime Cantonese HTTP ${characterResponse.status}`);
      return Promise.all([wordResponse.json(), characterResponse.json()]);
    })
    .then(([payload, characterPayload]) => {
      const entries = payload?.entries && typeof payload.entries === "object" ? payload.entries : {};
      const characterEntries = characterPayload?.entries && typeof characterPayload.entries === "object"
        ? characterPayload.entries
        : {};
      cantoneseLexiconState.entries = entries;
      cantoneseLexiconState.characterEntries = characterEntries;
      cantoneseLexiconState.entryCount = Number(payload?.meta?.entries) || Object.keys(entries).length;
      cantoneseLexiconState.characterEntryCount = Number(characterPayload?.meta?.entries) || Object.keys(characterEntries).length;
      const longestWord = Object.keys(entries).reduce((maximum, word) => Math.max(maximum, Array.from(word).length), 2);
      cantoneseLexiconState.maxWordLength = Math.min(16, longestWord);
      cantoneseLexiconState.source = payload?.meta?.source || cantoneseLexiconState.source;
      cantoneseLexiconState.license = payload?.meta?.license || cantoneseLexiconState.license;
      cantoneseLexiconState.characterSource = characterPayload?.meta?.source || cantoneseLexiconState.characterSource;
      cantoneseLexiconState.characterLicense = characterPayload?.meta?.license || cantoneseLexiconState.characterLicense;
      cantoneseLexiconState.status = "ready";
      return cantoneseLexiconState;
    })
    .catch((error) => {
      cantoneseLexiconState.status = "error";
      cantoneseLexiconState.error = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}
