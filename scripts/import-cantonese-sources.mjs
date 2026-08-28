import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import iconv from "iconv-lite";
import {
  readGeneratedExport,
  stableSnapshot,
  writeTextIfChanged
} from "./generated-content-utils.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheRoot = join(projectRoot, ".tmp-data", "cantonese-sources");
const hblPageCache = join(cacheRoot, "hbl-pages");
const hblTextCache = join(cacheRoot, "hbl-text");
const assetRoot = join(projectRoot, "assets", "audio", "cantonese");
const outputUrl = new URL("../src/open-cantonese.js", import.meta.url);

const HBL_CATALOG_URL = "https://hambaanglaang.hk/all-levels/";
const HBL_HOMEPAGE = "https://hambaanglaang.hk/";
// Keep the public shelf broad enough to feel useful while preserving an even
// spread across every Hambaanglaang reading level.
const HBL_STORIES_PER_LEVEL = 24;
const HKCANCOR_HOME = "https://github.com/fcbond/hkcancor";
const HKCANCOR_RAW = "https://raw.githubusercontent.com/fcbond/hkcancor/master";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

const hkcancorSamples = [
  {
    id: "m",
    title: "旅行拍檔與方向感",
    kind: "口述",
    description: "一個人回想旅伴、生活習慣，以及旅行途中看地圖找路的感受。"
  },
  {
    id: "d1",
    title: "點解鍾意法拉利？",
    kind: "自然對話",
    description: "由童年在九龍城看見跑車，談到品牌、設計與個人喜好。"
  },
  {
    id: "d2",
    title: "奶茶、早餐與習慣",
    kind: "自然對話",
    description: "幾位說話者由早餐奶茶，談到時間安排、糖與日常習慣。"
  },
  {
    id: "r1",
    title: "Rock ’n’ roll 與公共活動",
    kind: "電台節錄",
    description: "一段多人電台討論，圍繞樂隊、歌曲選擇與公共活動展開。"
  },
  {
    id: "r2",
    title: "兩個人的戲院包場",
    kind: "電台節錄",
    description: "由一次幾乎包場的觀影經歷，說到戲院帶位與放映趣事。"
  }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slugFromUrl(url) {
  return new URL(url).pathname.split("/").filter(Boolean).at(-1) || sha256(url).slice(0, 12);
}

async function fetchResponse(url, accept = "text/html,application/xhtml+xml,*/*;q=0.8") {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Leafbound personal Cantonese library importer/0.1"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(35_000)
      });
    } catch (error) {
      lastError = error;
    }
    if (response?.ok) return response;
    if (response) {
      const error = new Error(`${url} returned ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 750));
  }
  throw lastError || new Error(`${url} could not be fetched`);
}

async function cachedText(url, path, accept, { refresh = false } = {}) {
  if (!refresh && existsSync(path)) return readFile(path, "utf8");
  const text = await (await fetchResponse(url, accept)).text();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  return text;
}

async function cachedBuffer(url, path) {
  if (existsSync(path)) return readFile(path);
  const buffer = Buffer.from(await (await fetchResponse(url, "application/octet-stream,*/*;q=0.5")).arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  return buffer;
}

function cleanSpace(value = "") {
  return String(value).replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").trim();
}

function parseHblCatalog(html) {
  const $ = load(html);
  let level = 0;
  const stories = [];

  $("h1,h2,h3,h4,figure.wp-caption").each((_, node) => {
    const element = $(node);
    const text = cleanSpace(element.text());
    const levelMatch = text.match(/HBL\s+Level\s*([1-7])/i);
    if (levelMatch) {
      level = Number(levelMatch[1]);
      return;
    }
    if (node.tagName !== "figure" || !level) return;

    const anchor = element.find('a[href^="https://hambaanglaang.hk/"]').first();
    const caption = cleanSpace(element.find("figcaption").text());
    if (!anchor.length || !caption) return;
    const url = anchor.attr("href");
    const code = caption.match(/^(\d+p?)/i)?.[1] || "";
    const title = caption.match(/《([^》]+)》/u)?.[1] || caption.replace(/^\d+p?:?\s*/i, "").split(/[A-Za-z]/)[0].trim();
    const englishTitle = cleanSpace(caption.replace(/^.*?》/u, ""));
    if (!url || !title) return;
    stories.push({ level, code, title, englishTitle, url });
  });

  return stories.filter((story, index) => stories.findIndex((candidate) => candidate.url === story.url) === index);
}

function hblTextExportUrl(url) {
  const match = String(url).match(/https:\/\/docs\.google\.com\/document\/d\/([^/]+)/i);
  return match ? `https://docs.google.com/document/d/${match[1]}/export?format=txt` : "";
}

function parseHblDocument(rawText) {
  const normalized = String(rawText).replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  const divider = normalized.search(/\n_{8,}|\n\s*The CC BY|\n\s*Attribution Text/i);
  const body = divider >= 0 ? normalized.slice(0, divider) : normalized;
  const rights = divider >= 0 ? normalized.slice(divider).replace(/^\s*_+\s*/u, "").trim() : "";
  const license = rights.match(/CC\s+BY\s+(?:3\.0|4\.0)/i)?.[0].replace(/\s+/g, " ").toUpperCase() || "";
  if (!license || !rights) throw new Error("document-level attribution was not found");

  const segments = [];
  let current = null;
  const finishSegment = () => {
    if (!current) return;
    const text = current.lines.map(cleanSpace).filter(Boolean).join(" ");
    if (current.page > 0 && text) segments.push({
      page: current.page,
      label: current.label,
      text
    });
  };

  for (const line of body.split("\n")) {
    const marker = line.match(/^\s*\[(\d+)([a-z]?)\]\s*(.*)$/i);
    if (marker) {
      finishSegment();
      current = {
        page: Number(marker[1]),
        label: `${marker[1]}${marker[2].toLowerCase()}`,
        lines: marker[3] ? [marker[3]] : []
      };
    } else if (current && cleanSpace(line)) {
      current.lines.push(line);
    }
  }
  finishSegment();

  const storyLength = segments.reduce((sum, segment) => sum + Array.from(segment.text).length, 0);
  if (segments.length < 2 || storyLength < 50) throw new Error("complete story text was not found");
  return { segments, rights: cleanSpace(rights), license };
}

function estimateReadingDuration(segments) {
  const characters = segments.reduce((sum, segment) => sum + Array.from(segment.text).length, 0);
  return Math.max(35, Math.round(characters / 3.8));
}

function distributeTimings(segments, duration, { speakerPrefix = false } = {}) {
  const weights = segments.map((segment) => Math.max(1, Array.from(segment.text).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return segments.map((segment, index) => {
    const at = Math.min(duration - 1, Math.round(cursor));
    cursor += duration * (weights[index] / total);
    return {
      at,
      label: segment.label || String(index + 1).padStart(2, "0"),
      text: speakerPrefix && segment.speaker ? `${segment.speaker}：${segment.text}` : segment.text,
      jyutping: segment.jyutping || "",
      terms: []
    };
  });
}

async function importHblStory(candidate) {
  const slug = slugFromUrl(candidate.url);
  const html = await cachedText(candidate.url, join(hblPageCache, `${slug}.html`));
  const $ = load(html);
  const links = $("a[href]").toArray().map((node) => ({
    text: cleanSpace($(node).text()),
    href: $(node).attr("href") || ""
  }));
  const textDocumentUrl = links.find((link) => /下載文本|Download Text File/i.test(link.text) && /docs\.google\.com\/document/i.test(link.href))?.href
    || links.find((link) => /docs\.google\.com\/document/i.test(link.href))?.href
    || "";
  const exportUrl = hblTextExportUrl(textDocumentUrl);
  const audioUrl = links.find((link) => /^https:\/\/soundcloud\.com\/[^/]+\/[^/]+\/?(?:\?.*)?$/i.test(link.href))?.href || "";
  const pdfUrl = links.find((link) => /\/wp-content\/uploads\/.*\.pdf(?:\?|$)/i.test(link.href))?.href || "";
  if (!exportUrl || !audioUrl) throw new Error("public text or authentic audio link was not found");

  const documentId = exportUrl.match(/\/d\/([^/]+)/)?.[1] || sha256(exportUrl).slice(0, 16);
  const text = await cachedText(exportUrl, join(hblTextCache, `${documentId}.txt`), "text/plain,*/*;q=0.5");
  const parsed = parseHblDocument(text);
  const duration = estimateReadingDuration(parsed.segments);
  const publishedAt = $("meta[property='article:published_time']").attr("content")?.slice(0, 10) || "";

  return {
    id: `hbl-${slug}`,
    title: candidate.title,
    englishTitle: candidate.englishTitle,
    source: "冚唪唥粵文讀本",
    sourceId: "hbl",
    collection: "分級故事",
    episode: `Level ${candidate.level}${candidate.code ? ` · ${candidate.code}` : ""}`,
    level: candidate.level,
    publishedAt,
    duration,
    description: [candidate.englishTitle, `粵文分級 ${candidate.level}，站內收錄完整故事文字。`].filter(Boolean).join(" · "),
    transcriptAvailable: true,
    isDemoNarration: false,
    hasAuthenticAudio: true,
    audioKind: "soundcloud",
    audioUrl,
    sourceUrl: candidate.url,
    textDocumentUrl,
    pdfUrl,
    sourceLicense: parsed.license,
    licenseUrl: parsed.license.includes("3.0")
      ? "https://creativecommons.org/licenses/by/3.0/"
      : CC_BY_4_URL,
    attribution: parsed.rights,
    timing: "untimed",
    transcript: distributeTimings(parsed.segments, duration)
  };
}

async function importHblStories() {
  const catalogHtml = await cachedText(
    HBL_CATALOG_URL,
    join(cacheRoot, "hbl-all-levels.html"),
    undefined,
    { refresh: true }
  );
  const catalog = parseHblCatalog(catalogHtml);
  const imported = [];

  for (let level = 1; level <= 7; level += 1) {
    const candidates = catalog.filter((story) => story.level === level);
    let levelCount = 0;
    for (const candidate of candidates) {
      if (levelCount >= HBL_STORIES_PER_LEVEL) break;
      try {
        imported.push(await importHblStory(candidate));
        levelCount += 1;
      } catch (error) {
        console.warn(`Skipped HBL Level ${level} story “${candidate.title}”: ${error.message}`);
      }
    }
  }

  return { catalog, imported };
}

function parseTaggedTranscript(text) {
  const segments = [];
  const sentencePattern = /<sent>[\s\S]*?<sent_head>\s*([\s\S]*?)\s*<\/sent_head>[\s\S]*?<sent_tag>([\s\S]*?)<\/sent_tag>[\s\S]*?<\/sent>/g;
  for (const match of text.matchAll(sentencePattern)) {
    const speaker = cleanSpace(match[1]).replace(/[：:﹕]+$/u, "");
    const tokens = match[2].split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const token = line.match(/^(.*?)\/([^/]*)\/([^/]*)\/$/u);
      return token ? { text: token[1], partOfSpeech: token[2], jyutping: token[3] } : null;
    }).filter(Boolean);
    const sentence = tokens.map((token) => token.text).join("").replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    const jyutping = tokens
      .filter((token) => token.partOfSpeech !== "w" && !/^VQ\d+$/i.test(token.jyutping))
      .map((token) => token.jyutping)
      .filter(Boolean)
      .join(" ");
    segments.push({ speaker, text: sentence, jyutping });
  }
  return segments;
}

function mp3Duration(buffer) {
  const mpeg1Layer3Rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3Rates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  for (let index = 0; index < Math.min(buffer.length - 4, 64_000); index += 1) {
    if (buffer[index] !== 0xff || (buffer[index + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buffer[index + 1] >> 3) & 0x03;
    const layerBits = (buffer[index + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[index + 2] >> 4) & 0x0f;
    if (layerBits !== 1 || !bitrateIndex || bitrateIndex === 15) continue;
    const bitrate = (versionBits === 3 ? mpeg1Layer3Rates : mpeg2Layer3Rates)[bitrateIndex];
    if (bitrate) return Math.max(1, Math.round((buffer.length * 8) / (bitrate * 1000)));
  }
  return 60;
}

async function importHkcancorSample(sample) {
  const transcriptUrl = `${HKCANCOR_RAW}/sample/${sample.id}_v.txt`;
  const audioUrl = `${HKCANCOR_RAW}/sample/${sample.id}.mp3`;
  const transcriptBuffer = await cachedBuffer(transcriptUrl, join(cacheRoot, "hkcancor", `${sample.id}_v.txt`));
  const audioBuffer = await cachedBuffer(audioUrl, join(cacheRoot, "hkcancor", `${sample.id}.mp3`));
  const taggedText = iconv.decode(transcriptBuffer, "big5");
  const segments = parseTaggedTranscript(taggedText);
  if (!segments.length) throw new Error(`HKCanCor ${sample.id} transcript was empty`);
  const duration = mp3Duration(audioBuffer);
  const fileName = `hkcancor-${sample.id}.mp3`;
  await mkdir(assetRoot, { recursive: true });
  await writeFile(join(assetRoot, fileName), audioBuffer);

  return {
    id: `hkcancor-${sample.id}`,
    title: sample.title,
    source: "HKCanCor",
    sourceId: "hkcancor",
    collection: "香港口語",
    episode: `真人錄音 · ${sample.kind}`,
    level: null,
    publishedAt: "",
    recordedPeriod: "1997–1998",
    duration,
    description: sample.description,
    transcriptAvailable: true,
    isDemoNarration: false,
    hasAuthenticAudio: true,
    audioKind: "local",
    audioFile: `assets/audio/cantonese/${fileName}`,
    sourceUrl: `${HKCANCOR_HOME}#downloads-%E4%B8%8B%E8%BC%89`,
    sourceLicense: "CC BY 4.0",
    licenseUrl: CC_BY_4_URL,
      attribution: "Hong Kong Cantonese Corpus (HKCanCor), created by Luke Kang Kwong. Cite K. K. Luke and May L. Y. Wong (2015), The Hong Kong Cantonese Corpus: Design and Uses. Editorial titles and approximate sentence timings added by Leafbound.",
    timing: "estimated",
    transcript: distributeTimings(segments, duration, { speakerPrefix: true })
  };
}

async function importHkcancorSamples() {
  const imported = [];
  for (const sample of hkcancorSamples) imported.push(await importHkcancorSample(sample));
  return imported;
}

function serialize(name, value) {
  return `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)});`;
}

await mkdir(cacheRoot, { recursive: true });
const [{ catalog, imported: hblStories }, hkcancor] = await Promise.all([
  importHblStories(),
  importHkcancorSamples()
]);
const episodes = [...hkcancor, ...hblStories];
const levelCounts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
  const level = index + 1;
  return [level, hblStories.filter((story) => story.level === level).length];
}));

const snapshotPayload = {
  catalogUrl: HBL_CATALOG_URL,
  catalogCount: catalog.length,
  importedStoryCount: hblStories.length,
  authenticSampleCount: hkcancor.length,
  itemCount: episodes.length,
  levelCounts
};

const sourceCatalog = [
  {
    id: "hkcancor",
    shortName: "香港口語",
    mark: "聲",
    mode: "真人原聲",
    description: `${hkcancor.length} 段本機錄音，附說話者、逐句文字與語料原有粵拼。`,
    homepage: HKCANCOR_HOME,
    license: "CC BY 4.0"
  },
  {
    id: "hbl",
    shortName: "分級故事",
    mark: "級",
    mode: "Level 1–7",
    description: `${hblStories.length} 篇完整粵文；真人原聲在頁內透過 SoundCloud 播放。`,
    homepage: HBL_HOMEPAGE,
    license: "逐篇保留 CC BY 署名"
  },
  {
    id: "local",
    shortName: "本地示範",
    mark: "拾",
    mode: "本機練習",
    description: "原有短篇逐字稿；只在裝置有粵語聲線時提供合成朗讀。",
    homepage: "#cantonese",
        license: "Leafbound 本地內容"
  }
];

const previousSnapshot = await readGeneratedExport(outputUrl, "cantoneseSourceSnapshot");
const snapshot = stableSnapshot(previousSnapshot, snapshotPayload, {
  sourceCatalog,
  episodes
});
const output = `// Generated by scripts/import-cantonese-sources.mjs. Do not edit by hand.\n\n${serialize("cantoneseSourceSnapshot", snapshot)}\n\n${serialize("cantoneseSourceCatalog", sourceCatalog)}\n\n${serialize("openCantoneseEpisodes", episodes)}\n`;
const changed = await writeTextIfChanged(outputUrl, output);

console.log(JSON.stringify({
  output: fileURLToPath(outputUrl),
  changed,
  hblCatalog: catalog.length,
  hblImported: hblStories.length,
  levelCounts,
  hkcancorSamples: hkcancor.length,
  total: episodes.length
}, null, 2));
