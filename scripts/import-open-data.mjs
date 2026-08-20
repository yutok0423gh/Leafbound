import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenCC from "opencc-js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(projectRoot, ".tmp-data");
const outputDataDir = join(projectRoot, "data");
const sourceDir = join(projectRoot, "src");
const poetryRevision = "b8594f81a89752241442f2ce267d6f66f96704ee";

const sources = {
  cantonese: {
    cache: "words-hk-wordslist.json",
    url: "https://words.hk/faiman/analysis/wordslist.json"
  },
  poetry: {
    cache: "tang-300.json",
    url: `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${poetryRevision}/%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json`
  },
  songCi: {
    cache: "song-ci-300.json",
    url: `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${poetryRevision}/%E5%AE%8B%E8%AF%8D/%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json`
  },
  guwen: {
    cache: "guwenguanzhi.json",
    url: `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${poetryRevision}/%E8%92%99%E5%AD%A6/guwenguanzhi.json`
  }
};

const toTraditional = OpenCC.Converter({ from: "cn", to: "hk" });

const curatedPoemKeys = new Set([
  "王維::山居秋暝",
  "孟浩然::春曉",
  "李白::靜夜思",
  "柳宗元::江雪"
]);

const curatedCiKeys = new Set([
  "陸游::卜算子::驛外斷橋邊"
]);

const formMap = new Map([
  ["五言律诗", "五言律詩"],
  ["七言律诗", "七言律詩"],
  ["五言绝句", "五言絕句"],
  ["七言绝句", "七言絕句"],
  ["五言古诗", "五言古詩"],
  ["七言古诗", "七言古詩"],
  ["乐府", "樂府"]
]);

const themeMap = new Map(Object.entries({
  "写景": "寫景", "抒情": "抒情", "思乡": "思鄉", "思念": "思念", "友情": "友情",
  "送别": "送別", "女子": "女子", "边塞": "邊塞", "写人": "寫人", "山水": "山水",
  "哲理": "哲理", "战争": "戰爭", "生活": "生活", "怀古": "懷古", "秋天": "秋日",
  "春天": "春日", "宫怨": "宮怨", "孤独": "孤獨", "月亮": "月夜", "冬天": "冬日",
  "闺怨": "閨怨", "爱情": "愛情", "怀人": "懷人", "咏物": "詠物", "咏物诗": "詠物",
  "忧国忧民": "憂國", "田园": "田園", "羁旅": "羈旅", "离别": "離別", "惜别": "惜別",
  "归隐": "歸隱", "爱国": "家國", "雨": "風雨", "雪": "雪景", "鸟": "鳥獸", "花": "花木"
}));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadSource(source) {
  const cachedPath = join(cacheDir, source.cache);
  if (existsSync(cachedPath)) return readFileSync(cachedPath, "utf8");
  const response = await fetch(source.url, { headers: { "User-Agent": "leafbound-open-data-import/1.0" } });
  if (!response.ok) throw new Error(`Unable to download ${source.url}: ${response.status}`);
  const text = await response.text();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachedPath, text, "utf8");
  return text;
}

function uniqueReadings(readings) {
  return [...new Set((Array.isArray(readings) ? readings : []).map((reading) => String(reading).trim()).filter(Boolean))];
}

function traditional(value) {
  return toTraditional(String(value || "")).trim();
}

function stableId(prefix, values) {
  return `${prefix}-${sha256(values.map((value) => String(value || "")).join("\n")).slice(0, 20)}`;
}

function shortQuote(paragraphs) {
  const candidates = paragraphs
    .flatMap((paragraph) => String(paragraph).split(/[。！？；]/u))
    .map((line) => line.trim())
    .filter(Boolean);
  const quote = candidates.find((line) => Array.from(line).length >= 7) || candidates[0] || "古典原文";
  const characters = Array.from(quote);
  return characters.length > 30 ? `${characters.slice(0, 29).join("")}…` : quote;
}

function splitPoemLines(paragraphs) {
  return paragraphs.flatMap((paragraph) => String(paragraph)
    .split(/[，。！？；]/u)
    .map((line) => line.trim())
    .filter(Boolean))
    .map((text) => ({ text, jyutping: "" }));
}

function findForm(tags) {
  for (const tag of tags) {
    if (formMap.has(tag)) return formMap.get(tag);
  }
  return "古詩";
}

function findThemes(tags) {
  const themes = [];
  for (const tag of tags) {
    const theme = themeMap.get(tag);
    if (theme && !themes.includes(theme)) themes.push(theme);
    if (themes.length === 2) break;
  }
  return themes.length ? themes : ["古典"];
}

function normalizeTangPoem(poem) {
  const tags = Array.isArray(poem.tags) ? poem.tags : [];
  const lines = splitPoemLines(poem.paragraphs || []);
  const featuredQuote = String(poem.paragraphs?.[0] || lines[0]?.text || poem.title).replace(/[。！？；]$/u, "");
  return {
    id: `open-tang-${poem.id}`,
    title: poem.title,
    poet: poem.author,
    dynasty: "唐",
    kind: "詩",
    form: findForm(tags),
    themes: findThemes(tags),
    featuredQuote,
    source: "chinese-poetry · 唐詩三百首",
    sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/${poetryRevision}/%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json`,
    sourceLicense: "MIT",
    sourceRevision: poetryRevision.slice(0, 12),
    collection: "唐詩三百首",
    jyutpingStatus: "未校對；可點詞查看粵典候選讀音",
    lines,
    annotation: "",
    translation: "",
    appreciation: "",
    allusion: "",
    isOpenCorpus: true
  };
}

function normalizeSongCi(ci) {
  const author = traditional(ci.author);
  const title = traditional(ci.rhythmic);
  const paragraphs = (ci.paragraphs || []).map(traditional).filter(Boolean);
  const lines = splitPoemLines(paragraphs);
  return {
    id: stableId("open-song-ci", [author, title, ...paragraphs]),
    title,
    poet: author || "佚名",
    dynasty: "宋",
    kind: "詞",
    form: "詞",
    themes: ["宋詞"],
    featuredQuote: shortQuote(paragraphs),
    source: "chinese-poetry · 宋詞三百首",
    sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/${poetryRevision}/%E5%AE%8B%E8%AF%8D/%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json`,
    sourceLicense: "MIT",
    sourceRevision: poetryRevision.slice(0, 12),
    collection: "宋詞三百首",
    jyutpingStatus: "未校對；可點詞查看粵典候選讀音",
    lines,
    annotation: "",
    translation: "",
    appreciation: "",
    allusion: "",
    isOpenCorpus: true
  };
}

function parseGuwenAuthor(value) {
  const normalized = traditional(value).replace(/\s+/g, " ").trim();
  const separator = normalized.search(/[：:]/u);
  if (separator < 0) return { dynasty: "古代", poet: normalized || "佚名" };
  return {
    dynasty: normalized.slice(0, separator).trim() || "古代",
    poet: normalized.slice(separator + 1).trim() || "佚名"
  };
}

function normalizeGuwenWork(work, volumeTitle) {
  const title = traditional(work.chapter);
  const paragraphs = (work.paragraphs || []).map(traditional).filter(Boolean);
  const { dynasty, poet } = parseGuwenAuthor(work.author);
  const originalSource = traditional(work.source);
  const volumeTheme = traditional(volumeTitle).split("・").at(-1) || "古文";
  return {
    id: stableId("open-guwen", [title, poet, ...paragraphs]),
    title,
    poet,
    dynasty,
    kind: "古文",
    form: "古文",
    themes: [volumeTheme],
    featuredQuote: shortQuote(paragraphs),
    source: "chinese-poetry · 古文觀止",
    sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/${poetryRevision}/%E8%92%99%E5%AD%A6/guwenguanzhi.json`,
    sourceLicense: "MIT",
    sourceRevision: poetryRevision.slice(0, 12),
    collection: "古文觀止",
    originalSource,
    jyutpingStatus: "未校對；可點詞查看粵典候選讀音",
    lines: paragraphs.map((text) => ({ text, jyutping: "" })),
    annotation: "",
    translation: "",
    appreciation: "",
    allusion: "",
    isOpenCorpus: true
  };
}

const cantoneseSourceText = await loadSource(sources.cantonese);
const poetrySourceText = await loadSource(sources.poetry);
const songCiSourceText = await loadSource(sources.songCi);
const guwenSourceText = await loadSource(sources.guwen);
const rawCantonese = JSON.parse(cantoneseSourceText);
const rawPoems = JSON.parse(poetrySourceText);
const rawSongCi = JSON.parse(songCiSourceText);
const rawGuwen = JSON.parse(guwenSourceText);

const cantoneseEntries = Object.fromEntries(Object.keys(rawCantonese)
  .sort((a, b) => a.localeCompare(b, "zh-Hant"))
  .map((word) => [word, uniqueReadings(rawCantonese[word])])
  .filter(([, readings]) => readings.length));

const openTangPoems = rawPoems
  .filter((poem) => poem?.title && poem?.author && Array.isArray(poem.paragraphs) && poem.paragraphs.length)
  .filter((poem) => !curatedPoemKeys.has(`${poem.author}::${poem.title}`))
  .map(normalizeTangPoem);

const openSongCi = rawSongCi
  .filter((ci) => ci?.author && ci?.rhythmic && Array.isArray(ci.paragraphs) && ci.paragraphs.length)
  .filter((ci) => {
    const firstLine = traditional(ci.paragraphs[0]).split(/[，。！？；]/u)[0];
    return !curatedCiKeys.has(`${traditional(ci.author)}::${traditional(ci.rhythmic)}::${firstLine}`);
  })
  .map(normalizeSongCi);

const openGuwen = (rawGuwen.content || []).flatMap((volume) => (volume.content || [])
  .filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
  .map((work) => normalizeGuwenWork(work, volume.title)));

const openPoems = [...openTangPoems, ...openSongCi, ...openGuwen];

const importedAt = new Date().toISOString();
const cantonesePayload = {
  meta: {
    source: "粵典 words.hk word list",
    sourceUrl: sources.cantonese.url,
    license: "Public domain",
    licenseUrl: "https://words.hk/faiman/analysis/",
    importedAt,
    entries: Object.keys(cantoneseEntries).length,
    sourceSha256: sha256(cantoneseSourceText)
  },
  entries: cantoneseEntries
};

const manifest = {
  generatedAt: importedAt,
  cantonese: cantonesePayload.meta,
  poetry: {
    source: "chinese-poetry / 古典文庫",
    sourceUrl: "https://github.com/chinese-poetry/chinese-poetry",
    license: "MIT",
    licenseUrl: "https://github.com/chinese-poetry/chinese-poetry/blob/master/LICENSE",
    revision: poetryRevision,
    imported: openPoems.length,
    collections: {
      tangPoetry: {
        title: "唐詩三百首",
        imported: openTangPoems.length,
        sourceUrl: sources.poetry.url,
        sourceSha256: sha256(poetrySourceText)
      },
      songCi: {
        title: "宋詞三百首",
        imported: openSongCi.length,
        sourceUrl: sources.songCi.url,
        sourceSha256: sha256(songCiSourceText),
        conversion: "OpenCC cn → hk"
      },
      guwen: {
        title: "古文觀止",
        imported: openGuwen.length,
        sourceUrl: sources.guwen.url,
        sourceSha256: sha256(guwenSourceText)
      }
    }
  }
};

mkdirSync(outputDataDir, { recursive: true });
writeFileSync(join(outputDataDir, "words-hk-wordslist.json"), JSON.stringify(cantonesePayload), "utf8");
writeFileSync(join(outputDataDir, "open-data-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(join(sourceDir, "open-poems.js"), `// Generated by scripts/import-open-data.mjs. Do not edit by hand.\nexport const openPoems = Object.freeze(${JSON.stringify(openPoems, null, 2)});\n`, "utf8");

console.log(JSON.stringify({
  cantoneseEntries: Object.keys(cantoneseEntries).length,
  openWorks: openPoems.length,
  collections: {
    tangPoetry: openTangPoems.length,
    songCi: openSongCi.length,
    guwen: openGuwen.length
  },
  manifest
}, null, 2));
