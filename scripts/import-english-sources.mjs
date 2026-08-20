import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const outputUrl = new URL("../src/open-english.js", import.meta.url);

const VOA_FEEDS = [
  {
    category: "科學",
    topic: "Science & technology",
    url: "https://learningenglish.voanews.com/api/zmg_pl-vomx-tpeymtm"
  },
  {
    category: "文化",
    topic: "Arts & culture",
    url: "https://learningenglish.voanews.com/api/zpyp_l-vomx-tpe_rym"
  },
  {
    category: "語言",
    topic: "Everyday grammar",
    url: "https://learningenglish.voanews.com/api/zoroqql-vomx-tpeptpqq"
  },
  {
    category: "文學",
    topic: "American stories",
    url: "https://learningenglish.voanews.com/api/zyg__l-vomx-tpetmty"
  }
];

const NASA_FEED = "https://www.nasa.gov/technology/feed/";
const STANDARD_EBOOKS_FEED = "https://standardebooks.org/feeds/atom/new-releases";
const VOA_WIRE_PATTERN = /\b(?:AP|AFP|Reuters|Associated Press|Agence France-Presse)\b/i;

const sourceCatalog = [
  {
    id: "local",
    name: "Leafbound 編輯選文",
    shortName: "Leafbound",
    mark: "拾",
    description: "本地精讀稿，完整支援點詞、語境收藏、筆記與閱讀進度。",
    mode: "站內精讀",
    homepage: "#english"
  },
  {
    id: "voa",
    name: "VOA Learning English",
    shortName: "VOA",
    mark: "V",
    description: "清洗後的 VOA 自製學習文章全文；第三方通訊社材料不匯入。",
    mode: "站內全文",
    homepage: "https://learningenglish.voanews.com/",
    licenseUrl: "https://learningenglish.voanews.com/p/6861.html"
  },
  {
    id: "nasa",
    name: "NASA",
    shortName: "NASA",
    mark: "N",
    description: "NASA 官方科學與工程文章的純文字正文，不複製圖片或標誌。",
    mode: "站內全文",
    homepage: "https://www.nasa.gov/technology/",
    licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/"
  },
  {
    id: "standard-ebooks",
    name: "Standard Ebooks",
    shortName: "Standard",
    mark: "S",
    description: "精校公共領域英文書；站內先讀首章，完整版本仍可查閱出處。",
    mode: "首章長讀",
    homepage: "https://standardebooks.org/",
    licenseUrl: "https://standardebooks.org/help"
  }
];

function decodeXml(value = "") {
  return String(value)
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] || "");
}

function blocks(xml, tagName) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi")), (match) => match[1]);
}

function categories(block) {
  return Array.from(block.matchAll(/<category\b[^>]*?(?:term="([^"]+)")?[^>]*>([\s\S]*?)<\/category>|<category\b[^>]*term="([^"]+)"[^>]*\/>/gi), (match) => decodeXml(match[1] || match[2] || match[3])).filter(Boolean);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function stableId(prefix, url, index) {
  const slug = String(url)
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-72)
    .replace(/^-+/, "")
    .toLowerCase();
  return `${prefix}-${slug || index + 1}`;
}

function cleanText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\n ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function uniqueParagraphs(values) {
  const seen = new Set();
  return values.filter((value) => {
    const text = cleanText(value);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(cleanText);
}

function readingMinutes(text) {
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 180));
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5") {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Leafbound personal language library source importer/0.2",
      accept
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function htmlParagraphs($, root, { allowShort = false, exclude = [] } = {}) {
  root.find("script, style, noscript, svg, form, button, figure, figcaption, audio, video, iframe").remove();
  const paragraphs = root.find("p").toArray().map((node) => {
    const paragraph = $(node).clone();
    paragraph.find("script, style, sup[role='doc-noteref'], .screen-reader-text, .visually-hidden").remove();
    paragraph.find("a, sup").each((_, reference) => {
      if (String($(reference).attr("epub:type") || "").split(/\s+/).includes("noteref")) $(reference).remove();
    });
    return cleanText(paragraph.text());
  });
  return uniqueParagraphs(paragraphs).filter((text) => {
    if (!allowShort && text.length < 18) return false;
    return !exclude.some((pattern) => pattern.test(text));
  });
}

function safeVoaDeck(value) {
  const text = String(value || "").trim();
  if (!text || VOA_WIRE_PATTERN.test(text)) return "A VOA Learning English text selected for language practice.";
  return text;
}

async function extractVoaBody(sourceUrl) {
  const html = await fetchText(sourceUrl);
  const $ = load(html);
  const root = $("#article-content .wsw").first().length
    ? $("#article-content .wsw").first()
    : $("#article-content").first();
  if (!root.length) throw new Error("VOA article body was not found");

  const paragraphs = htmlParagraphs($, root, {
    allowShort: true,
    exclude: [
      /^EMBED\s+SHARE/i,
      /^No media source currently available/i,
      /^(?:Download|Subscribe|Print|Share)$/i,
      /^\*{3,}$/,
      /^This browser does not support/i
    ]
  });
  const pageSignals = [
    $("meta[name='Author']").attr("content"),
    $("meta[name='author']").attr("content"),
    $(".byline, .author").first().text(),
    ...paragraphs
  ].filter(Boolean).join("\n");
  if (VOA_WIRE_PATTERN.test(pageSignals)) throw new Error("third-party wire attribution detected");
  if (paragraphs.join(" ").length < 450) throw new Error("VOA article body was too short");
  return { paragraphs, contentScope: "full", sectionTitle: "" };
}

async function extractNasaBody(sourceUrl) {
  const html = await fetchText(sourceUrl);
  const $ = load(html);
  const selectors = ["article .entry-content", ".entry-content", "article .wysiwyg_content", "article .content-block", "article"];
  let paragraphs = [];
  for (const selector of selectors) {
    const root = $(selector).first();
    if (!root.length) continue;
    const candidate = htmlParagraphs($, root, {
      exclude: [
        /^\d+\s+MIN READ$/i,
        /^JPEG\s*\(/i,
        /^Stay up-to-date with/i,
        /^Subscribe to/i,
        /(?:©|copyright|all rights reserved|courtesy of)/i
      ]
    });
    if (candidate.join(" ").length > paragraphs.join(" ").length) paragraphs = candidate;
    if (paragraphs.join(" ").length >= 450) break;
  }
  if (paragraphs.join(" ").length < 450) throw new Error("NASA article body was not found or was too short");
  return { paragraphs, contentScope: "full", sectionTitle: "" };
}

async function extractStandardEbookOpening(sourceUrl) {
  const singlePageUrl = `${sourceUrl.replace(/\/$/, "")}/text/single-page`;
  const html = await fetchText(singlePageUrl);
  const $ = load(html);
  let chapter = $("section").filter((_, node) => String($(node).attr("epub:type") || "").split(/\s+/).includes("chapter")).first();
  if (!chapter.length) {
    chapter = $("section").filter((_, node) => String($(node).attr("epub:type") || "").includes("bodymatter")).first();
  }
  if (!chapter.length) throw new Error("Standard Ebooks opening chapter was not found");

  const headings = uniqueParagraphs(chapter.find("header h1, header h2, header h3, header p, hgroup h1, hgroup h2, hgroup h3, hgroup p").toArray().map((node) => $(node).text()))
    .filter((text) => text.length <= 160);
  const headingKeys = new Set(headings.map((text) => text.toLocaleLowerCase()));
  const paragraphs = htmlParagraphs($, chapter, {
    allowShort: true,
    exclude: [/^(?:Table of Contents|Endnotes|Colophon|Imprint|Uncopyright)$/i]
  }).filter((text) => !headingKeys.has(text.toLocaleLowerCase())).slice(0, 100);
  if (paragraphs.join(" ").length < 350) throw new Error("Standard Ebooks opening chapter was too short");
  return {
    paragraphs,
    contentScope: "chapter",
    sectionTitle: headings.join(" · ") || "Opening chapter",
    fullTextUrl: singlePageUrl
  };
}

function withBody(item, body) {
  const joined = body.paragraphs.join(" ");
  return {
    ...item,
    minutes: readingMinutes(joined),
    access: "internal",
    contentScope: body.contentScope,
    sectionTitle: body.sectionTitle,
    fullTextUrl: body.fullTextUrl || item.sourceUrl,
    paragraphs: body.paragraphs,
    phrases: []
  };
}

async function importVoa() {
  const groups = await Promise.all(VOA_FEEDS.map(async (feed) => {
    const xml = await fetchText(feed.url, "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5");
    const candidates = blocks(xml, "item")
      .map((item, index) => {
        const sourceUrl = tag(item, "link") || tag(item, "guid");
        return {
          id: stableId("voa", sourceUrl, index),
          title: tag(item, "title"),
          deck: safeVoaDeck(tag(item, "description")),
          source: "VOA Learning English",
          sourceId: "voa",
          sourceUrl,
          sourceFeed: feed.url,
          category: feed.category,
          topic: feed.topic,
          publishedAt: isoDate(tag(item, "pubDate")),
          license: "VOA-produced Learning English text is public domain with credit; third-party wire material is not imported.",
          attribution: "Text: VOA Learning English",
          contentNote: "官方自製文章全文已轉為純文字，未複製音訊、圖片或第三方通訊社材料。"
        };
      })
      .filter((item) => item.title && item.sourceUrl)
      .slice(0, 12);

    const imported = [];
    for (const candidate of candidates) {
      if (imported.length >= 3) break;
      try {
        imported.push(withBody(candidate, await extractVoaBody(candidate.sourceUrl)));
      } catch (error) {
        console.warn(`Skipped VOA item "${candidate.title}": ${error.message}`);
      }
    }
    return imported;
  }));
  return groups.flat();
}

async function importNasa() {
  const xml = await fetchText(NASA_FEED, "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5");
  const candidates = blocks(xml, "item")
    .map((item, index) => {
      const sourceUrl = tag(item, "link") || tag(item, "guid");
      const deck = tag(item, "description");
      return {
        id: stableId("nasa", sourceUrl, index),
        title: tag(item, "title"),
        deck: deck || "A NASA science and technology article.",
        source: "NASA",
        sourceId: "nasa",
        sourceUrl,
        sourceFeed: NASA_FEED,
        category: "科學",
        topic: categories(item).slice(0, 2).join(" · ") || "Science & technology",
        publishedAt: isoDate(tag(item, "pubDate")),
        license: "NASA material is generally not copyrighted in the United States; marked third-party material is excluded.",
        attribution: "Text: NASA",
        contentNote: "只匯入 NASA 官方頁面的純文字正文；圖片、標誌、下載附件與標示的第三方材料均不在 App 內。"
      };
    })
    .filter((item) => item.title && item.sourceUrl)
    .slice(0, 8);

  const imported = [];
  for (const candidate of candidates) {
    if (imported.length >= 4) break;
    try {
      imported.push(withBody(candidate, await extractNasaBody(candidate.sourceUrl)));
    } catch (error) {
      console.warn(`Skipped NASA item "${candidate.title}": ${error.message}`);
    }
  }
  return imported;
}

async function importStandardEbooks() {
  const xml = await fetchText(STANDARD_EBOOKS_FEED, "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5");
  const candidates = blocks(xml, "entry")
    .map((entry, index) => {
      const sourceUrl = entry.match(/<link\b(?=[^>]*rel="alternate")(?=[^>]*href="([^"]+)")[^>]*\/>/i)?.[1] || tag(entry, "id");
      const author = tag(entry, "name");
      const subject = categories(entry).filter((value) => !/--/.test(value)).slice(-2).join(" · ");
      const deck = tag(entry, "summary");
      return {
        id: stableId("standard", sourceUrl, index),
        title: tag(entry, "title"),
        deck: [author, deck].filter(Boolean).join(" — "),
        source: "Standard Ebooks",
        sourceId: "standard-ebooks",
        sourceUrl,
        sourceFeed: STANDARD_EBOOKS_FEED,
        category: "文學",
        topic: subject || "Public-domain literature",
        publishedAt: isoDate(tag(entry, "published")),
        license: tag(entry, "rights") || "Public domain in the United States; check local laws outside the United States.",
        attribution: `Edition: Standard Ebooks${author ? ` · Author: ${author}` : ""}`,
        contentNote: "站內收錄首章純文字，方便逐詞精讀；完整公共領域版本可由出處連結查閱。"
      };
    })
    .filter((item) => item.title && item.sourceUrl)
    .slice(0, 8);

  const imported = [];
  for (const candidate of candidates) {
    if (imported.length >= 4) break;
    try {
      imported.push(withBody(candidate, await extractStandardEbookOpening(candidate.sourceUrl)));
    } catch (error) {
      console.warn(`Skipped Standard Ebooks item "${candidate.title}": ${error.message}`);
    }
  }
  return imported;
}

function serialize(name, value) {
  return `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)});`;
}

const [voa, nasa, standardEbooks] = await Promise.all([
  importVoa(),
  importNasa(),
  importStandardEbooks()
]);

const discoveries = [...voa, ...nasa, ...standardEbooks];
const generatedAt = new Date().toISOString();
const output = `// Generated by scripts/import-english-sources.mjs. Do not edit by hand.\n\n${serialize("englishSourceSnapshot", {
  generatedAt,
  feeds: [...VOA_FEEDS.map((feed) => feed.url), NASA_FEED, STANDARD_EBOOKS_FEED],
  itemCount: discoveries.length,
  fullArticleCount: discoveries.filter((item) => item.contentScope === "full").length,
  chapterCount: discoveries.filter((item) => item.contentScope === "chapter").length
})}\n\n${serialize("englishSourceCatalog", sourceCatalog)}\n\n${serialize("englishDiscoveries", discoveries)}\n`;

await writeFile(outputUrl, output, "utf8");
console.log(`Wrote ${discoveries.length} readable English items to ${fileURLToPath(outputUrl)}`);
