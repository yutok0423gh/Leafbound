import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenCC from "opencc-js";
import { segmentCantonesePronunciation } from "../src/cantonese-lexicon.js";
import { writeOpenPoetryDelivery } from "./build-open-poetry-delivery.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(projectRoot, ".tmp-data");
const outputDataDir = join(projectRoot, "data");
const sourceDir = join(projectRoot, "src");
const poetryRevision = "b8594f81a89752241442f2ce267d6f66f96704ee";
const poetryRawBase = `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${poetryRevision}`;

function poetrySource(cache, path) {
  return {
    cache,
    path,
    url: `${poetryRawBase}/${path}`
  };
}

const sources = {
  cantonese: {
    cache: "words-hk-wordslist.json",
    url: "https://words.hk/faiman/analysis/wordslist.json"
  },
  poetry: poetrySource("tang-300.json", "%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json"),
  songCi: poetrySource("song-ci-300.json", "%E5%AE%8B%E8%AF%8D/%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json"),
  guwen: poetrySource("guwenguanzhi.json", "%E8%92%99%E5%AD%A6/guwenguanzhi.json"),
  shijing: poetrySource("shijing.json", "%E8%AF%97%E7%BB%8F/shijing.json"),
  chuci: poetrySource("chuci.json", "%E6%A5%9A%E8%BE%9E/chuci.json"),
  yuanqu: poetrySource("yuanqu.json", "%E5%85%83%E6%9B%B2/yuanqu.json"),
  caocao: poetrySource("caocao.json", "%E6%9B%B9%E6%93%8D%E8%AF%97%E9%9B%86/caocao.json"),
  nalan: poetrySource("nalan.json", "%E7%BA%B3%E5%85%B0%E6%80%A7%E5%BE%B7/%E7%BA%B3%E5%85%B0%E6%80%A7%E5%BE%B7%E8%AF%97%E9%9B%86.json"),
  lunyu: poetrySource("lunyu.json", "%E8%AE%BA%E8%AF%AD/lunyu.json"),
  daxue: poetrySource("daxue.json", "%E5%9B%9B%E4%B9%A6%E4%BA%94%E7%BB%8F/daxue.json"),
  zhongyong: poetrySource("zhongyong.json", "%E5%9B%9B%E4%B9%A6%E4%BA%94%E7%BB%8F/zhongyong.json"),
  mengzi: poetrySource("mengzi.json", "%E5%9B%9B%E4%B9%A6%E4%BA%94%E7%BB%8F/mengzi.json"),
  youmengying: poetrySource("youmengying.json", "%E5%B9%BD%E6%A2%A6%E5%BD%B1/youmengying.json"),
  qianjiashi: poetrySource("qianjiashi.json", "%E8%92%99%E5%AD%A6/qianjiashi.json"),
  youxueqionglin: poetrySource("youxueqionglin.json", "%E8%92%99%E5%AD%A6/youxueqionglin.json"),
  shenglvqimeng: poetrySource("shenglvqimeng.json", "%E8%92%99%E5%AD%A6/shenglvqimeng.json"),
  dizigui: poetrySource("dizigui.json", "%E8%92%99%E5%AD%A6/dizigui.json"),
  zengguangxianwen: poetrySource("zengguangxianwen.json", "%E8%92%99%E5%AD%A6/zengguangxianwen.json"),
  wenzimengqiu: poetrySource("wenzimengqiu.json", "%E8%92%99%E5%AD%A6/wenzimengqiu.json")
};

const tangCorpusSources = Array.from({ length: 58 }, (_, index) => {
  const offset = index * 1000;
  return poetrySource(
    `quan-tang-poetry-${offset}.json`,
    `%E5%85%A8%E5%94%90%E8%AF%97/poet.tang.${offset}.json`
  );
});

const songCiCorpusSources = Array.from({ length: 22 }, (_, index) => {
  const offset = index * 1000;
  return poetrySource(
    `quan-song-ci-${offset}.json`,
    `%E5%AE%8B%E8%AF%8D/ci.song.${offset}.json`
  );
});

const selectedTangAuthors = new Set([
  "李白", "杜甫", "王維", "孟浩然", "白居易", "李商隱", "杜牧", "王昌齡",
  "岑參", "高適", "韓愈", "柳宗元", "劉禹錫", "元稹", "賀知章", "張九齡",
  "王之渙", "陳子昂", "韋應物", "溫庭筠"
]);

const selectedSongCiAuthors = new Set([
  "蘇軾", "辛棄疾", "李清照", "柳永", "周邦彥", "晏殊", "晏幾道", "秦觀",
  "姜夔", "賀鑄", "陸游", "歐陽修", "張先", "吳文英", "黃庭堅", "蔣捷"
]);

const TANG_WORKS_PER_AUTHOR = 160;
const SONG_CI_WORKS_PER_AUTHOR = 140;

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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "leafbound-open-data-import/1.1" },
        signal: AbortSignal.timeout(45_000)
      });
      if (response.ok) {
        const text = await response.text();
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cachedPath, text, "utf8");
        return text;
      }
      lastError = new Error(`Unable to download ${source.url}: ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 750));
  }
  throw lastError || new Error(`Unable to download ${source.url}`);
}

async function loadSourceBatch(batch, concurrency = 6) {
  const results = new Array(batch.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
    while (cursor < batch.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await loadSource(batch[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function uniqueReadings(readings) {
  return [...new Set((Array.isArray(readings) ? readings : []).map((reading) => String(reading).trim()).filter(Boolean))];
}

function traditional(value) {
  return toTraditional(String(value || ""))
    // Expand the CJK iteration mark so every displayed character can receive
    // its own pronunciation in the reader.
    .replace(/(.)々/gu, "$1$1")
    // Two obvious source typos in the Yuan-qu corpus occur in the fixed
    // phrases 俺女 and 俺哥哥. Keep this correction deliberately narrow.
    .replace(/埯(?=女|哥哥)/gu, "俺")
    .replace(/\s+/gu, " ")
    .replace(/\s*([，。！？；、：])\s*/gu, "$1")
    .trim();
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

function cleanParagraphs(values) {
  return (Array.isArray(values) ? values : [])
    .map(traditional)
    .filter(Boolean);
}

function openCorpusFields(sourceKey, collection, label = collection) {
  return {
    source: `chinese-poetry · ${label}`,
    sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/${poetryRevision}/${sources[sourceKey].path}`,
    sourceLicense: "MIT",
    sourceRevision: poetryRevision.slice(0, 12),
    collection,
    jyutpingStatus: "未校對；可點詞查看粵典候選讀音",
    annotation: "",
    translation: "",
    appreciation: "",
    allusion: "",
    isOpenCorpus: true
  };
}

function uniqueWorks(works) {
  const seen = new Set();
  return works.filter((work) => {
    if (!work?.id || seen.has(work.id)) return false;
    seen.add(work.id);
    return true;
  });
}

function uniqueWorksByText(works) {
  const seenIds = new Set();
  const seenTexts = new Set();
  return works.filter((work) => {
    const textKey = [
      work.kind,
      traditional(work.poet),
      traditional(work.title),
      work.lines.map((line) => traditional(line.text)).join("")
    ].join("::");
    if (!work?.id || seenIds.has(work.id) || seenTexts.has(textKey)) return false;
    seenIds.add(work.id);
    seenTexts.add(textKey);
    return true;
  });
}

function serializeOpenPoemsModule(works) {
  const sourceIndexes = new Map();
  const sourceMetadata = [];
  const records = works.map((work) => {
    const metadata = {
      source: work.source,
      sourceUrl: work.sourceUrl,
      sourceLicense: work.sourceLicense,
      sourceRevision: work.sourceRevision,
      collection: work.collection,
      jyutpingStatus: work.jyutpingStatus,
      annotation: work.annotation,
      translation: work.translation,
      appreciation: work.appreciation,
      allusion: work.allusion,
      isOpenCorpus: work.isOpenCorpus
    };
    const metadataKey = JSON.stringify(metadata);
    if (!sourceIndexes.has(metadataKey)) {
      sourceIndexes.set(metadataKey, sourceMetadata.length);
      sourceMetadata.push(metadata);
    }
    const compactLines = work.lines.map((line) => line.jyutping ? [line.text, line.jyutping] : line.text);
    return [
      sourceIndexes.get(metadataKey),
      work.id,
      work.title,
      work.poet,
      work.dynasty,
      work.kind,
      work.form,
      work.themes,
      work.featuredQuote,
      work.originalSource || "",
      compactLines
    ];
  });

  return `// Generated by scripts/import-open-data.mjs. Do not edit by hand. Compact records protect mobile delivery.\nconst sourceMetadata=${JSON.stringify(sourceMetadata)};\nconst records=${JSON.stringify(records)};\nexport const openPoems=Object.freeze(records.map(([sourceIndex,id,title,poet,dynasty,kind,form,themes,featuredQuote,originalSource,lines])=>({ ...sourceMetadata[sourceIndex],id,title,poet,dynasty,kind,form,themes,featuredQuote,...(originalSource?{originalSource}:{}),lines:lines.map((line)=>typeof line==="string"?{text:line,jyutping:""}:{text:line[0],jyutping:line[1]}) })));\n`;
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

function corpusFieldsForSource(source, collection, label = collection) {
  return {
    source: `chinese-poetry · ${label}`,
    sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/${poetryRevision}/${source.path}`,
    sourceLicense: "MIT",
    sourceRevision: poetryRevision.slice(0, 12),
    collection,
    jyutpingStatus: "未校對；可點詞查看粵典候選讀音",
    annotation: "",
    translation: "",
    appreciation: "",
    allusion: "",
    isOpenCorpus: true
  };
}

function inferVerseForm(paragraphs) {
  const lines = splitPoemLines(paragraphs);
  const lengths = lines.map((line) => Array.from(line.text.replace(/\s/gu, "")).length);
  if (lines.length === 4 && lengths.every((length) => length === 5)) return "五言絕句";
  if (lines.length === 4 && lengths.every((length) => length === 7)) return "七言絕句";
  if (lines.length === 8 && lengths.every((length) => length === 5)) return "五言律詩";
  if (lines.length === 8 && lengths.every((length) => length === 7)) return "七言律詩";
  return "古體詩";
}

function normalizeExpandedTangPoem(poem) {
  const author = traditional(poem.author);
  const title = traditional(poem.title);
  const paragraphs = cleanParagraphs(poem.paragraphs);
  return {
    id: poem.id ? `open-tang-${poem.id}` : stableId("open-quan-tang", [author, title, ...paragraphs]),
    title,
    poet: author,
    dynasty: "唐",
    kind: "詩",
    form: inferVerseForm(paragraphs),
    themes: ["全唐詩", author],
    featuredQuote: shortQuote(paragraphs),
    lines: splitPoemLines(paragraphs),
    ...corpusFieldsForSource(poem.__source, "全唐詩選", "全唐詩選")
  };
}

function normalizeExpandedSongCi(ci) {
  const author = traditional(ci.author);
  const title = traditional(ci.rhythmic);
  const paragraphs = cleanParagraphs(ci.paragraphs);
  return {
    id: stableId("open-song-ci", [author, title, ...paragraphs]),
    title,
    poet: author || "佚名",
    dynasty: "宋",
    kind: "詞",
    form: title || "詞",
    themes: ["全宋詞", author].filter(Boolean),
    featuredQuote: shortQuote(paragraphs),
    lines: splitPoemLines(paragraphs),
    ...corpusFieldsForSource(ci.__source, "全宋詞選", "全宋詞選")
  };
}

function selectWorksByAuthor(partitions, authorSet, perAuthorLimit) {
  const counts = new Map();
  const selected = [];
  partitions.forEach(({ source, works }) => {
    works.forEach((work) => {
      const author = traditional(work.author);
      if (!authorSet.has(author) || !Array.isArray(work.paragraphs) || !work.paragraphs.length) return;
      const count = counts.get(author) || 0;
      if (count >= perAuthorLimit) return;
      counts.set(author, count + 1);
      selected.push({ ...work, __source: source });
    });
  });
  return selected;
}

function parseAnthologyAuthor(value) {
  const normalized = traditional(value);
  const match = normalized.match(/^（([^）]+)）(.+)$/u);
  return {
    dynasty: match?.[1]?.replace(/代$/u, "") || "古代",
    poet: match?.[2] || normalized || "佚名"
  };
}

function normalizeQianjiashi(raw) {
  return (raw.content || []).flatMap((section) => (section.content || []).map((work) => {
    const title = traditional(work.chapter);
    const paragraphs = cleanParagraphs(work.paragraphs);
    const { dynasty, poet } = parseAnthologyAuthor(work.author);
    return {
      id: stableId("open-qianjiashi", [poet, title, ...paragraphs]),
      title,
      poet,
      dynasty,
      kind: "詩",
      form: traditional(section.type) || inferVerseForm(paragraphs),
      themes: ["千家詩", traditional(section.type)].filter(Boolean),
      featuredQuote: shortQuote(paragraphs),
      lines: splitPoemLines(paragraphs),
      ...openCorpusFields("qianjiashi", "千家詩")
    };
  })).filter((work) => work.title && work.lines.length);
}

function makePrimerWork({ book, chapter, paragraphs, author, dynasty, form = "蒙學", sourceKey, range = "" }) {
  const clean = cleanParagraphs(paragraphs);
  const title = [book, chapter, range].filter(Boolean).join(" · ");
  return {
    id: stableId(`open-${sourceKey}`, [title, ...clean]),
    title,
    poet: traditional(author) || "佚名",
    dynasty,
    kind: "古文",
    form,
    themes: ["蒙學", book],
    featuredQuote: shortQuote(clean),
    originalSource: `《${book}》`,
    lines: clean.map((text) => ({ text, jyutping: "" })),
    ...openCorpusFields(sourceKey, book)
  };
}

function normalizeNestedPrimer(raw, options) {
  return (raw.content || []).flatMap((volume) => (volume.content || [])
    .filter((chapter) => chapter?.chapter && Array.isArray(chapter.paragraphs) && chapter.paragraphs.length)
    .map((chapter) => makePrimerWork({
      ...options,
      chapter: `${traditional(volume.title)} · ${traditional(chapter.chapter)}`,
      paragraphs: chapter.paragraphs,
      author: raw.author
    })));
}

function normalizeFlatPrimer(raw, options) {
  return (raw.content || [])
    .filter((chapter) => chapter?.chapter && Array.isArray(chapter.paragraphs) && chapter.paragraphs.length)
    .map((chapter) => makePrimerWork({
      ...options,
      chapter: traditional(chapter.chapter),
      paragraphs: chapter.paragraphs,
      author: raw.author
    }));
}

function normalizeChunkedPrimer(raw, options, chunkSize) {
  return (raw.content || []).flatMap((chapter) => {
    const paragraphs = cleanParagraphs(chapter.paragraphs);
    const chunks = [];
    for (let offset = 0; offset < paragraphs.length; offset += chunkSize) {
      const slice = paragraphs.slice(offset, offset + chunkSize);
      if (slice.join("").length < 40) continue;
      const first = offset + 1;
      const last = offset + slice.length;
      chunks.push(makePrimerWork({
        ...options,
        chapter: traditional(chapter.chapter || chapter.title),
        paragraphs: slice,
        author: raw.author,
        range: `第 ${first}–${last} 則`
      }));
    }
    return chunks;
  });
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

function normalizeShijingWork(work) {
  const title = traditional(work.title);
  const chapter = traditional(work.chapter);
  const section = traditional(work.section);
  const paragraphs = cleanParagraphs(work.content);
  return {
    id: stableId("open-shijing", [chapter, section, title, ...paragraphs]),
    title,
    poet: "《詩經》",
    dynasty: "先秦",
    kind: "詩",
    form: "詩經",
    themes: [chapter, section].filter(Boolean),
    featuredQuote: shortQuote(paragraphs),
    originalSource: `《詩經》${chapter ? ` · ${chapter}` : ""}${section ? ` · ${section}` : ""}`,
    lines: splitPoemLines(paragraphs),
    ...openCorpusFields("shijing", "詩經")
  };
}

function normalizeChuciWork(work) {
  const title = traditional(work.title);
  const section = traditional(work.section);
  const paragraphs = cleanParagraphs(work.content);
  return {
    id: stableId("open-chuci", [section, title, traditional(work.author), ...paragraphs]),
    title,
    poet: traditional(work.author) || "佚名",
    dynasty: "先秦",
    kind: "詩",
    form: "楚辭",
    themes: [...new Set(["楚辭", section].filter(Boolean))],
    featuredQuote: shortQuote(paragraphs),
    originalSource: `《楚辭》${section && section !== title ? ` · ${section}` : ""}`,
    lines: paragraphs.map((text) => ({ text, jyutping: "" })),
    ...openCorpusFields("chuci", "楚辭")
  };
}

function normalizeYuanquWork(work) {
  const title = traditional(work.title);
  const poet = traditional(work.author) || "佚名";
  const paragraphs = cleanParagraphs(work.paragraphs);
  return {
    id: stableId("open-yuanqu", [poet, title, ...paragraphs]),
    title,
    poet,
    dynasty: "元",
    kind: "曲",
    form: "元曲",
    themes: ["元曲"],
    featuredQuote: shortQuote(paragraphs),
    lines: splitPoemLines(paragraphs),
    ...openCorpusFields("yuanqu", "元曲")
  };
}

function normalizeCaoCaoWork(work) {
  const title = traditional(work.title);
  const paragraphs = cleanParagraphs(work.paragraphs);
  return {
    id: stableId("open-caocao", [title, ...paragraphs]),
    title,
    poet: "曹操",
    dynasty: "漢魏",
    kind: "詩",
    form: "古體詩",
    themes: ["建安", "漢魏"],
    featuredQuote: shortQuote(paragraphs),
    lines: splitPoemLines(paragraphs),
    ...openCorpusFields("caocao", "曹操詩集")
  };
}

function normalizeNalanWork(work) {
  const title = traditional(work.title);
  const poet = traditional(work.author) || "納蘭性德";
  const paragraphs = cleanParagraphs(work.para);
  return {
    id: stableId("open-nalan", [poet, title, ...paragraphs]),
    title,
    poet,
    dynasty: "清",
    kind: "詞",
    form: title.split(/[·・]/u)[0] || "詞",
    themes: ["清詞", "納蘭詞"],
    featuredQuote: shortQuote(paragraphs),
    lines: splitPoemLines(paragraphs),
    ...openCorpusFields("nalan", "納蘭性德詞集")
  };
}

function normalizeClassicChapter(work, { sourceKey, book, author }) {
  const chapter = traditional(work.chapter) || book;
  const paragraphs = cleanParagraphs(work.paragraphs);
  const title = chapter === book ? book : `${book} · ${chapter}`;
  return {
    id: stableId(`open-${sourceKey}`, [book, chapter, ...paragraphs]),
    title,
    poet: author,
    dynasty: "先秦",
    kind: "古文",
    form: "經典",
    themes: ["四書", book],
    featuredQuote: shortQuote(paragraphs),
    originalSource: `《${book}》`,
    lines: paragraphs.map((text) => ({ text, jyutping: "" })),
    ...openCorpusFields(sourceKey, "四書", book)
  };
}

function normalizeYoumengying(entries, groupSize = 12) {
  const works = [];
  for (let offset = 0; offset < entries.length; offset += groupSize) {
    const slice = entries.slice(offset, offset + groupSize);
    const paragraphs = cleanParagraphs(slice.map((entry) => entry?.content));
    if (!paragraphs.length) continue;
    const first = offset + 1;
    const last = offset + paragraphs.length;
    const range = `${String(first).padStart(3, "0")}–${String(last).padStart(3, "0")}`;
    works.push({
      id: stableId("open-youmengying", [first, last, ...paragraphs]),
      title: `幽夢影 · 第 ${range} 則`,
      poet: "張潮",
      dynasty: "清",
      kind: "古文",
      form: "清代小品",
      themes: ["幽夢影", "小品"],
      featuredQuote: shortQuote(paragraphs),
      originalSource: `《幽夢影》第 ${first}–${last} 則`,
      lines: paragraphs.map((text) => ({ text, jyutping: "" })),
      ...openCorpusFields("youmengying", "幽夢影")
    });
  }
  return works;
}

const cantoneseSourceText = await loadSource(sources.cantonese);
const poetrySourceText = await loadSource(sources.poetry);
const songCiSourceText = await loadSource(sources.songCi);
const guwenSourceText = await loadSource(sources.guwen);
const shijingSourceText = await loadSource(sources.shijing);
const chuciSourceText = await loadSource(sources.chuci);
const yuanquSourceText = await loadSource(sources.yuanqu);
const caocaoSourceText = await loadSource(sources.caocao);
const nalanSourceText = await loadSource(sources.nalan);
const lunyuSourceText = await loadSource(sources.lunyu);
const daxueSourceText = await loadSource(sources.daxue);
const zhongyongSourceText = await loadSource(sources.zhongyong);
const mengziSourceText = await loadSource(sources.mengzi);
const youmengyingSourceText = await loadSource(sources.youmengying);
const expansionSources = [
  ...tangCorpusSources,
  ...songCiCorpusSources,
  sources.qianjiashi,
  sources.youxueqionglin,
  sources.shenglvqimeng,
  sources.dizigui,
  sources.zengguangxianwen,
  sources.wenzimengqiu
];
const expansionSourceTexts = await loadSourceBatch(expansionSources);
const expansionTextByCache = new Map(expansionSources.map((source, index) => [source.cache, expansionSourceTexts[index]]));
const expansionText = (source) => expansionTextByCache.get(source.cache);
const rawCantonese = JSON.parse(cantoneseSourceText);
const rawPoems = JSON.parse(poetrySourceText);
const rawSongCi = JSON.parse(songCiSourceText);
const rawGuwen = JSON.parse(guwenSourceText);
const rawShijing = JSON.parse(shijingSourceText);
const rawChuci = JSON.parse(chuciSourceText);
const rawYuanqu = JSON.parse(yuanquSourceText);
const rawCaoCao = JSON.parse(caocaoSourceText);
const rawNalan = JSON.parse(nalanSourceText);
const rawLunyu = JSON.parse(lunyuSourceText);
const rawDaxue = JSON.parse(daxueSourceText);
const rawZhongyong = JSON.parse(zhongyongSourceText);
const rawMengzi = JSON.parse(mengziSourceText);
const rawYoumengying = JSON.parse(youmengyingSourceText);
const rawTangPartitions = tangCorpusSources.map((source) => ({
  source,
  works: JSON.parse(expansionText(source))
}));
const rawSongCiPartitions = songCiCorpusSources.map((source) => ({
  source,
  works: JSON.parse(expansionText(source))
}));
const rawQianjiashi = JSON.parse(expansionText(sources.qianjiashi));
const rawYouxueqionglin = JSON.parse(expansionText(sources.youxueqionglin));
const rawShenglvqimeng = JSON.parse(expansionText(sources.shenglvqimeng));
const rawDizigui = JSON.parse(expansionText(sources.dizigui));
const rawZengguangxianwen = JSON.parse(expansionText(sources.zengguangxianwen));
const rawWenzimengqiu = JSON.parse(expansionText(sources.wenzimengqiu));

const cantoneseEntries = Object.fromEntries(Object.keys(rawCantonese)
  .sort((a, b) => a.localeCompare(b, "zh-Hant"))
  .map((word) => [word, uniqueReadings(rawCantonese[word])])
  .filter(([, readings]) => readings.length));
const rimeCharacterEntries = JSON.parse(
  readFileSync(join(outputDataDir, "rime-cantonese-chars.json"), "utf8")
).entries;
const pronunciationMaxWordLength = Math.min(
  16,
  Object.keys(cantoneseEntries).reduce(
    (maximum, word) => Math.max(maximum, Array.from(word).length),
    2
  )
);

function workHasCompletePronunciation(work) {
  return work.lines.every((line) => segmentCantonesePronunciation(
    line.text,
    cantoneseEntries,
    rimeCharacterEntries,
    pronunciationMaxWordLength
  ).every((segment) => (
    segment.isWord
    || !Array.from(segment.text).some((character) => /\p{Script=Han}/u.test(character))
  )));
}

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

const openQianjiashi = uniqueWorksByText(normalizeQianjiashi(rawQianjiashi))
  .filter((poem) => !curatedPoemKeys.has(`${poem.poet}::${poem.title}`));

const openExpandedTang = selectWorksByAuthor(
  rawTangPartitions,
  selectedTangAuthors,
  TANG_WORKS_PER_AUTHOR
)
  .filter((poem) => !curatedPoemKeys.has(`${traditional(poem.author)}::${traditional(poem.title)}`))
  .map(normalizeExpandedTangPoem)
  .filter(workHasCompletePronunciation);

const openExpandedSongCi = selectWorksByAuthor(
  rawSongCiPartitions,
  selectedSongCiAuthors,
  SONG_CI_WORKS_PER_AUTHOR
)
  .filter((ci) => {
    const firstLine = traditional(ci.paragraphs[0]).split(/[，。！？；]/u)[0];
    return !curatedCiKeys.has(`${traditional(ci.author)}::${traditional(ci.rhythmic)}::${firstLine}`);
  })
  .map(normalizeExpandedSongCi);

const openGuwen = (rawGuwen.content || []).flatMap((volume) => (volume.content || [])
  .filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
  .map((work) => normalizeGuwenWork(work, volume.title)));

const openShijing = uniqueWorks(rawShijing
  .filter((work) => work?.title && Array.isArray(work.content) && work.content.length)
  .map(normalizeShijingWork));

const openChuci = uniqueWorks(rawChuci
  .filter((work) => work?.title && Array.isArray(work.content) && work.content.length)
  .map(normalizeChuciWork));

const openYuanqu = uniqueWorks(rawYuanqu
  .filter((work) => work?.title && Array.isArray(work.paragraphs) && work.paragraphs.length)
  .map(normalizeYuanquWork));

const openCaoCao = uniqueWorks(rawCaoCao
  .filter((work) => work?.title && Array.isArray(work.paragraphs) && work.paragraphs.length)
  .map(normalizeCaoCaoWork));

const openNalan = uniqueWorks(rawNalan
  .filter((work) => work?.title && Array.isArray(work.para) && work.para.length)
  .map(normalizeNalanWork));

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

const openFourBooks = uniqueWorks([
  ...asArray(rawLunyu).filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
    .map((work) => normalizeClassicChapter(work, { sourceKey: "lunyu", book: "論語", author: "孔子及弟子" })),
  ...asArray(rawDaxue).filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
    .map((work) => normalizeClassicChapter(work, { sourceKey: "daxue", book: "大學", author: "曾子及門人" })),
  ...asArray(rawZhongyong).filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
    .map((work) => normalizeClassicChapter(work, { sourceKey: "zhongyong", book: "中庸", author: "子思及門人" })),
  ...asArray(rawMengzi).filter((work) => work?.chapter && Array.isArray(work.paragraphs) && work.paragraphs.length)
    .map((work) => normalizeClassicChapter(work, { sourceKey: "mengzi", book: "孟子", author: "孟子及弟子" }))
]);

const openYoumengying = uniqueWorks(normalizeYoumengying(
  rawYoumengying.filter((entry) => entry?.content)
));

const openPrimerWorks = uniqueWorksByText([
  ...normalizeNestedPrimer(rawYouxueqionglin, {
    book: "幼學瓊林",
    dynasty: "明",
    form: "蒙學類書",
    sourceKey: "youxueqionglin"
  }),
  ...normalizeNestedPrimer(rawShenglvqimeng, {
    book: "聲律啓蒙",
    dynasty: "清",
    form: "聲律蒙學",
    sourceKey: "shenglvqimeng"
  }),
  ...normalizeFlatPrimer(rawDizigui, {
    book: "弟子規",
    dynasty: "清",
    form: "蒙學韻文",
    sourceKey: "dizigui"
  }),
  ...normalizeChunkedPrimer(rawZengguangxianwen, {
    book: "增廣賢文",
    dynasty: "明清",
    form: "格言",
    sourceKey: "zengguangxianwen"
  }, 12),
  ...normalizeChunkedPrimer(rawWenzimengqiu, {
    book: "文字蒙求",
    dynasty: "清",
    form: "文字學蒙書",
    sourceKey: "wenzimengqiu"
  }, 18).filter(workHasCompletePronunciation)
]);

const openPoems = uniqueWorksByText([
  ...openTangPoems,
  ...openQianjiashi,
  ...openExpandedTang,
  ...openSongCi,
  ...openExpandedSongCi,
  ...openGuwen,
  ...openShijing,
  ...openChuci,
  ...openYuanqu,
  ...openCaoCao,
  ...openNalan,
  ...openFourBooks,
  ...openYoumengying,
  ...openPrimerWorks
]);
const importedCollectionCount = (collection) => openPoems.filter((work) => work.collection === collection).length;
const tangCorpusDigest = sha256(tangCorpusSources.map((source) => expansionText(source)).join("\n"));
const songCiCorpusDigest = sha256(songCiCorpusSources.map((source) => expansionText(source)).join("\n"));

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
    normalization: [
      "OpenCC cn → hk for simplified source files",
      "Expanded CJK iteration marks for per-character pronunciation",
      "Corrected two contextual Yuan-qu typos: 埯女/埯哥哥 → 俺女/俺哥哥"
    ],
    collections: {
      tangPoetry: {
        title: "唐詩三百首",
        imported: openTangPoems.length,
        sourceUrl: sources.poetry.url,
        sourceSha256: sha256(poetrySourceText)
      },
      qianjiashi: {
        title: "千家詩",
        imported: importedCollectionCount("千家詩"),
        sourceUrl: sources.qianjiashi.url,
        sourceSha256: sha256(expansionText(sources.qianjiashi)),
        conversion: "OpenCC cn → hk where needed"
      },
      selectedTangPoetry: {
        title: "全唐詩選",
        imported: importedCollectionCount("全唐詩選"),
        sourceFiles: tangCorpusSources.length,
        selectedAuthors: [...selectedTangAuthors],
        maximumPerAuthor: TANG_WORKS_PER_AUTHOR,
        sourceSha256: tangCorpusDigest,
        conversion: "OpenCC cn → hk where needed"
      },
      songCi: {
        title: "宋詞三百首",
        imported: openSongCi.length,
        sourceUrl: sources.songCi.url,
        sourceSha256: sha256(songCiSourceText),
        conversion: "OpenCC cn → hk"
      },
      selectedSongCi: {
        title: "全宋詞選",
        imported: importedCollectionCount("全宋詞選"),
        sourceFiles: songCiCorpusSources.length,
        selectedAuthors: [...selectedSongCiAuthors],
        maximumPerAuthor: SONG_CI_WORKS_PER_AUTHOR,
        sourceSha256: songCiCorpusDigest,
        conversion: "OpenCC cn → hk"
      },
      guwen: {
        title: "古文觀止",
        imported: openGuwen.length,
        sourceUrl: sources.guwen.url,
        sourceSha256: sha256(guwenSourceText)
      },
      shijing: {
        title: "詩經",
        imported: openShijing.length,
        sourceUrl: sources.shijing.url,
        sourceSha256: sha256(shijingSourceText),
        conversion: "OpenCC cn → hk"
      },
      chuci: {
        title: "楚辭",
        imported: openChuci.length,
        sourceUrl: sources.chuci.url,
        sourceSha256: sha256(chuciSourceText),
        conversion: "OpenCC cn → hk"
      },
      yuanqu: {
        title: "元曲",
        imported: openYuanqu.length,
        sourceUrl: sources.yuanqu.url,
        sourceSha256: sha256(yuanquSourceText),
        conversion: "OpenCC cn → hk"
      },
      caocao: {
        title: "曹操詩集",
        imported: openCaoCao.length,
        sourceUrl: sources.caocao.url,
        sourceSha256: sha256(caocaoSourceText),
        conversion: "OpenCC cn → hk"
      },
      nalan: {
        title: "納蘭性德詞集",
        imported: openNalan.length,
        sourceUrl: sources.nalan.url,
        sourceSha256: sha256(nalanSourceText),
        conversion: "OpenCC cn → hk"
      },
      fourBooks: {
        title: "四書",
        imported: openFourBooks.length,
        files: {
          lunyu: { sourceUrl: sources.lunyu.url, sourceSha256: sha256(lunyuSourceText) },
          daxue: { sourceUrl: sources.daxue.url, sourceSha256: sha256(daxueSourceText) },
          zhongyong: { sourceUrl: sources.zhongyong.url, sourceSha256: sha256(zhongyongSourceText) },
          mengzi: { sourceUrl: sources.mengzi.url, sourceSha256: sha256(mengziSourceText) }
        },
        conversion: "OpenCC cn → hk where needed"
      },
      youmengying: {
        title: "幽夢影",
        imported: openYoumengying.length,
        sourceEntries: rawYoumengying.length,
        grouping: "12 aphorisms per local reading unit",
        sourceUrl: sources.youmengying.url,
        sourceSha256: sha256(youmengyingSourceText),
        conversion: "OpenCC cn → hk"
      },
      primers: {
        title: "蒙學原典",
        imported: openPrimerWorks.length,
        collections: Object.fromEntries([
          "幼學瓊林",
          "聲律啓蒙",
          "弟子規",
          "增廣賢文",
          "文字蒙求"
        ].map((collection) => [collection, importedCollectionCount(collection)])),
        files: Object.fromEntries([
          ["youxueqionglin", sources.youxueqionglin],
          ["shenglvqimeng", sources.shenglvqimeng],
          ["dizigui", sources.dizigui],
          ["zengguangxianwen", sources.zengguangxianwen],
          ["wenzimengqiu", sources.wenzimengqiu]
        ].map(([key, source]) => [key, {
          sourceUrl: source.url,
          sourceSha256: sha256(expansionText(source))
        }])),
        conversion: "OpenCC cn → hk where needed"
      }
    }
  }
};

mkdirSync(outputDataDir, { recursive: true });
writeFileSync(join(outputDataDir, "words-hk-wordslist.json"), JSON.stringify(cantonesePayload), "utf8");
writeFileSync(join(outputDataDir, "open-data-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(join(sourceDir, "open-poems.js"), serializeOpenPoemsModule(openPoems), "utf8");
writeOpenPoetryDelivery(openPoems, projectRoot);

console.log(JSON.stringify({
  cantoneseEntries: Object.keys(cantoneseEntries).length,
  openWorks: openPoems.length,
  collections: {
    tangPoetry: openTangPoems.length,
    qianjiashi: importedCollectionCount("千家詩"),
    selectedTangPoetry: importedCollectionCount("全唐詩選"),
    songCi: openSongCi.length,
    selectedSongCi: importedCollectionCount("全宋詞選"),
    guwen: openGuwen.length,
    shijing: openShijing.length,
    chuci: openChuci.length,
    yuanqu: openYuanqu.length,
    caocao: openCaoCao.length,
    nalan: openNalan.length,
    fourBooks: openFourBooks.length,
    youmengying: openYoumengying.length,
    primers: openPrimerWorks.length
  },
  manifest
}, null, 2));
