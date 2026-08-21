import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import OpenCC from "opencc-js";

import { articles } from "../src/data.js";
import { englishDiscoveries } from "../src/open-english.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, ".tmp-data", "english-dictionary");
const englishPath = resolve(sourceRoot, "en", "omw-en", "omw-en.xml");
const chinesePath = resolve(sourceRoot, "cmn", "omw-cmn", "omw-cmn.xml");
const freedictPath = resolve(sourceRoot, "freedict", "eng-zho", "eng-zho.tei");
const outputPath = resolve(projectRoot, "src", "open-english-dictionary.js");
const metaOutputPath = resolve(projectRoot, "src", "open-english-dictionary-meta.js");
const toTraditional = OpenCC.Converter({ from: "cn", to: "hk" });
const wordPattern = /[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
const POS_LABELS = Object.freeze({
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
  adj: "adjective",
  adv: "adverb",
  pn: "proper noun"
});
const IRREGULAR_LEMMAS = Object.freeze({
  been: "be",
  best: "good",
  better: "good",
  children: "child",
  could: "can",
  did: "do",
  done: "do",
  feet: "foot",
  gone: "go",
  had: "have",
  men: "man",
  should: "shall",
  teeth: "tooth",
  went: "go",
  were: "be",
  women: "woman",
  worse: "bad",
  worst: "bad",
  would: "will"
});

function decodeXml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWord(value = "") {
  return String(value)
    .trim()
    .replaceAll("’", "'")
    .toLocaleLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidateLemmas(surface) {
  const word = normalizeWord(surface);
  const candidates = [word];
  const add = (...values) => values.forEach((value) => {
    const normalized = normalizeWord(value);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  });

  if (IRREGULAR_LEMMAS[word]) add(IRREGULAR_LEMMAS[word]);

  if (word.endsWith("'s")) add(word.slice(0, -2));
  if (word.endsWith("ies") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ves") && word.length > 4) add(`${word.slice(0, -3)}f`, `${word.slice(0, -3)}fe`);
  if (word.endsWith("es") && word.length > 3) add(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) add(word.slice(0, -1));

  if (word.endsWith("ied") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed") && word.length > 3) {
    const stem = word.slice(0, -2);
    add(stem, word.slice(0, -1), `${stem}e`);
    if (stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }

  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    add(stem, `${stem}e`);
    if (stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }

  if (word.endsWith("ier") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("iest") && word.length > 5) add(`${word.slice(0, -4)}y`);
  if (word.endsWith("er") && word.length > 4) add(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith("est") && word.length > 5) add(word.slice(0, -3), word.slice(0, -2));

  return candidates;
}

function attr(block, name) {
  return decodeXml(block.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] || "");
}

function childTexts(block, name) {
  return Array.from(
    block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")),
    (match) => decodeXml(match[1])
  ).filter(Boolean);
}

async function scanBlocks(path, tagName, visit) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const startPattern = new RegExp(`<${tagName}(?:\\s|>)`);
  const endText = `</${tagName}>`;
  let block = null;

  for await (const line of lines) {
    if (!block && startPattern.test(line)) block = [line];
    else if (block) block.push(line);
    if (block && line.includes(endText)) {
      await visit(block.join("\n"));
      block = null;
    }
  }
}

function collectArticleWords() {
  const allArticles = [...articles, ...englishDiscoveries];
  const words = new Set();
  allArticles.forEach((article) => {
    (article.paragraphs || []).forEach((paragraph) => {
      for (const match of paragraph.matchAll(wordPattern)) words.add(normalizeWord(match[0]));
    });
  });
  return { allArticles, words };
}

async function assertInputs() {
  try {
    await Promise.all([access(englishPath), access(chinesePath), access(freedictPath)]);
  } catch {
    throw new Error([
      "Open Multilingual Wordnet source files are missing.",
      `Expected: ${englishPath}`,
      `Expected: ${chinesePath}`,
      `Expected: ${freedictPath}`,
      "Download omw-en-2.0.tar.xz and omw-cmn-2.0.tar.xz from https://github.com/omwn/omw-data/releases/tag/v2.0 and FreeDict eng-zho 2025.11.23 from https://download.freedict.org/dictionaries/eng-zho/2025.11.23/, then extract them into .tmp-data/english-dictionary first."
    ].join("\n"));
  }
}

await assertInputs();

const { allArticles, words } = collectArticleWords();
const candidatesBySurface = new Map([...words].map((word) => [word, candidateLemmas(word)]));
const candidateKeys = new Set([...candidatesBySurface.values()].flat());
const lexicalRecords = [];

await scanBlocks(englishPath, "LexicalEntry", (block) => {
  const lemmaTag = block.match(/<Lemma\b[^>]*\/>/i)?.[0] || "";
  const lemma = attr(lemmaTag, "writtenForm");
  const lemmaKey = normalizeWord(lemma);
  const partOfSpeech = attr(lemmaTag, "partOfSpeech");
  const forms = Array.from(block.matchAll(/<Form\b[^>]*\/>/gi), (match) => attr(match[0], "writtenForm"));
  const formKeys = forms.map(normalizeWord).filter(Boolean);
  if (!candidateKeys.has(lemmaKey) && !formKeys.some((form) => words.has(form))) return;

  const senses = Array.from(block.matchAll(/<Sense\b[\s\S]*?\bsynset="omw-en-([^"]+)"[\s\S]*?>/gi), (match) => ({
    id: match[1],
    rank: Number(attr(match[0], "n")) || 999
  }));
  if (!senses.length) return;
  lexicalRecords.push({ lemma, lemmaKey, partOfSpeech, forms, formKeys, senses });
});

const recordsByKey = new Map();
lexicalRecords.forEach((record) => {
  unique([record.lemmaKey, ...record.formKeys]).forEach((key) => {
    const current = recordsByKey.get(key) || [];
    current.push(record);
    recordsByKey.set(key, current);
  });
});

const selections = new Map();
const selectedSynsets = new Set();
candidatesBySurface.forEach((candidates, surface) => {
  const matchedKey = candidates.find((candidate) => recordsByKey.has(candidate));
  if (!matchedKey) return;
  const exactRecords = recordsByKey.get(matchedKey) || [];
  const lemma = exactRecords.find((record) => record.lemmaKey === matchedKey)?.lemma || exactRecords[0]?.lemma || matchedKey;
  const senses = exactRecords
    .flatMap((record) => record.senses.map((sense) => ({ ...sense, partOfSpeech: record.partOfSpeech })))
    .filter((sense, index, list) => list.findIndex((candidate) => candidate.id === sense.id) === index);
  senses.forEach((sense) => selectedSynsets.add(sense.id));
  selections.set(surface, { lemma, senses });
});

const synsets = new Map();
await scanBlocks(englishPath, "Synset", (block) => {
  const openTag = block.match(/<Synset\b[^>]*>/i)?.[0] || "";
  const fullId = attr(openTag, "id");
  const id = fullId.replace(/^omw-en-/, "");
  if (!selectedSynsets.has(id)) return;
  synsets.set(id, {
    definition: childTexts(block, "Definition")[0] || "",
    examples: childTexts(block, "Example")
  });
});

const chineseBySynset = new Map();
await scanBlocks(chinesePath, "LexicalEntry", (block) => {
  const lemmaTag = block.match(/<Lemma\b[^>]*\/>/i)?.[0] || "";
  const writtenForm = toTraditional(attr(lemmaTag, "writtenForm"));
  if (!writtenForm) return;
  const senses = Array.from(block.matchAll(/<Sense\b[\s\S]*?\bsynset="omw-cmn-([^"]+)"[\s\S]*?\/>/gi), (match) => match[1]);
  senses.forEach((id) => {
    if (!selectedSynsets.has(id)) return;
    const current = chineseBySynset.get(id) || [];
    if (!current.includes(writtenForm)) current.push(writtenForm);
    chineseBySynset.set(id, current);
  });
});

const freedictByKey = new Map();
await scanBlocks(freedictPath, "entry", (block) => {
  const orth = childTexts(block, "orth")[0] || "";
  const key = normalizeWord(orth);
  if (!candidateKeys.has(key)) return;

  const translations = Array.from(
    block.matchAll(/<cit\b(?=[^>]*\btype="trans")[^>]*>([\s\S]*?)<\/cit>/gi),
    (match) => childTexts(match[1], "quote")[0] || ""
  )
    .map((translation) => toTraditional(translation))
    .filter((translation) => /\p{Script=Han}/u.test(translation) && translation.length <= 32);
  if (!translations.length) return;

  const pronunciation = childTexts(block, "pron")[0] || "";
  const partOfSpeech = POS_LABELS[childTexts(block, "pos")[0] || ""] || childTexts(block, "pos")[0] || "";
  const current = freedictByKey.get(key) || { lemma: orth, translations: [], pronunciations: [], partsOfSpeech: [] };
  current.translations = unique([...current.translations, ...translations]).slice(0, 10);
  current.pronunciations = unique([...current.pronunciations, pronunciation]).slice(0, 2);
  current.partsOfSpeech = unique([...current.partsOfSpeech, partOfSpeech]);
  freedictByKey.set(key, current);
});

const outputEntries = {};
let senseCount = 0;
let bilingualWords = 0;
let exampleWords = 0;
let chineseWordnetWords = 0;
let freedictFallbackWords = 0;

if (process.env.LEAFBOUND_DICTIONARY_DEBUG === "1") {
  for (const word of ["died", "women", "could", "fluent"]) {
    console.log("DEBUG", word, {
      candidates: candidatesBySurface.get(word),
      recordKeys: (candidatesBySurface.get(word) || []).filter((candidate) => recordsByKey.has(candidate)),
      selection: selections.get(word),
      freedictKeys: (candidatesBySurface.get(word) || []).filter((candidate) => freedictByKey.has(candidate))
    });
  }
}

[...words].sort().forEach((surface) => {
  const selection = selections.get(surface);
  const freedictKey = candidatesBySurface.get(surface)?.find((candidate) => freedictByKey.has(candidate));
  const freedictEntry = freedictKey ? freedictByKey.get(freedictKey) : null;
  const lemma = selection?.lemma || freedictEntry?.lemma || surface;
  const candidates = (selection?.senses || [])
    .map((sense) => {
      const source = synsets.get(sense.id) || {};
      const meanings = (chineseBySynset.get(sense.id) || []).filter((value) => value.length <= 24).slice(0, 5);
      return {
        id: sense.id,
        partOfSpeech: POS_LABELS[sense.partOfSpeech] || sense.partOfSpeech,
        meaning: meanings.join("、"),
        definition: source.definition || "",
        examples: source.examples || [],
        rank: sense.rank,
        hasChinese: meanings.length > 0
      };
    })
    .filter((sense) => sense.meaning || sense.definition)
    .sort((left, right) => Number(right.hasChinese) - Number(left.hasChinese) || left.rank - right.rank)
    .filter((sense, index, list) => list.findIndex((candidate) => candidate.definition === sense.definition && candidate.partOfSpeech === sense.partOfSpeech) === index)
    .map(({ rank, ...sense }) => ({ ...sense, rank }));

  if (!candidates.length && !freedictEntry) return;
  const wordnetMeanings = unique(candidates.flatMap((sense) => sense.meaning.split("、")).filter(Boolean)).slice(0, 8);
  const freedictMeanings = unique(freedictEntry?.translations || []).slice(0, 8);
  const chineseMeanings = wordnetMeanings.length ? wordnetMeanings : freedictMeanings;
  const exactExamples = unique(candidates.flatMap((sense) => sense.examples).filter((example) => {
    const normalizedExample = ` ${normalizeWord(example).replace(/[^a-z']+/g, " ")} `;
    return normalizedExample.includes(` ${normalizeWord(lemma)} `);
  })).slice(0, 2);
  const partOfSpeech = unique([
    ...candidates.map((sense) => sense.partOfSpeech),
    ...(candidates.length ? [] : freedictEntry?.partsOfSpeech || [])
  ]).join(" / ");
  const bilingualSenses = candidates.filter((sense) => sense.hasChinese);
  const compactSenses = (bilingualSenses.length ? bilingualSenses : candidates)
    .slice(0, 3)
    .map((sense) => {
      const directExample = sense.examples.find((example) => {
        const normalizedExample = ` ${normalizeWord(example).replace(/[^a-z']+/g, " ")} `;
        return normalizedExample.includes(` ${normalizeWord(lemma)} `);
      });
      return {
        partOfSpeech: sense.partOfSpeech,
        meaning: sense.meaning,
        definition: sense.definition,
        example: directExample || ""
      };
    });

  const outputEntry = {
    lemma: normalizeWord(lemma),
    meaning: chineseMeanings.join("；"),
    partOfSpeech,
    definition: candidates[0]?.definition || "",
    examples: exactExamples,
    senses: compactSenses
  };
  if (freedictEntry?.pronunciations[0]) outputEntry.pronunciation = freedictEntry.pronunciations[0];
  if (!wordnetMeanings.length && freedictMeanings.length) outputEntry.translationSource = "freedict";
  outputEntries[surface] = outputEntry;
  senseCount += compactSenses.length;
  if (chineseMeanings.length) bilingualWords += 1;
  if (wordnetMeanings.length) chineseWordnetWords += 1;
  if (!wordnetMeanings.length && freedictMeanings.length) freedictFallbackWords += 1;
  if (exactExamples.length) exampleWords += 1;
});

const snapshot = {
  generatedAt: new Date().toISOString(),
  sourceVersion: "Open Multilingual Wordnet 2.0 + FreeDict eng-zho 2025.11.23",
  englishLexicon: "OMW English Wordnet based on WordNet 3.0",
  chineseLexicon: "Chinese Open Wordnet 2.0",
  chineseFallbackLexicon: "FreeDict English-Chinese 2025.11.23",
  articleCount: allArticles.length,
  articleWordCount: words.size,
  matchedWordCount: Object.keys(outputEntries).length,
  bilingualWordCount: bilingualWords,
  chineseWordnetWordCount: chineseWordnetWords,
  freedictFallbackWordCount: freedictFallbackWords,
  exampleWordCount: exampleWords,
  senseCount,
  transformation: "Article vocabulary subset; English definitions and examples aligned to Chinese Open Wordnet lemmas by WordNet 3.0 synset identifier; missing Chinese meanings supplemented by FreeDict eng-zho; Simplified Chinese converted to Hong Kong Traditional Chinese with OpenCC."
};

const moduleSource = `// Generated by scripts/import-english-dictionary.mjs. Do not edit by hand.\n// Derived from Princeton WordNet 3.0, Chinese Open Wordnet 2.0, and FreeDict eng-zho 2025.11.23.\n// The FreeDict-derived translation subset remains available under CC BY-SA 3.0; see THIRD_PARTY_NOTICES.md and data/licenses/.\n\nexport const openEnglishDictionary = Object.freeze(${JSON.stringify(outputEntries)});\n`;
const metaSource = `// Generated by scripts/import-english-dictionary.mjs. Do not edit by hand.\n\nexport const englishDictionarySnapshot = Object.freeze(${JSON.stringify(snapshot, null, 2)});\n`;

await mkdir(dirname(outputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, moduleSource, "utf8"),
  writeFile(metaOutputPath, metaSource, "utf8")
]);

console.log(`Wrote ${Object.keys(outputEntries).length.toLocaleString("en-US")} article-word entries to ${outputPath}`);
console.log(`${bilingualWords.toLocaleString("en-US")} entries have Chinese meanings (${freedictFallbackWords.toLocaleString("en-US")} supplied by FreeDict fallback); ${exampleWords.toLocaleString("en-US")} include a direct WordNet example.`);
