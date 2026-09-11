const API = "https://zh-yue.wikipedia.org/w/api.php";
const SOURCE = "https://zh-yue.wikipedia.org/";
const LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";
const USER_AGENT = "Leafbound/0.1 (https://github.com/yutok0423gh/Leafbound; Cantonese reading library)";

async function queryApi(parameters) {
  const url = new URL(API);
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", maxlag: "5", ...parameters });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(25_000)
      });
      if (!response.ok) throw new Error(`Cantonese Wikipedia returned ${response.status}`);
      const result = await response.json();
      if (result.error || result.warnings) throw new Error(`Cantonese Wikipedia API: ${JSON.stringify(result.error || result.warnings)}`);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function wikipediaIdentity(page) {
  return { id: `yue-wikipedia-${page.pageid}`, sourceId: "yue-wikipedia", title: page.title, sourceUrl: page.canonicalurl || page.fullurl };
}

export function wikipediaArticle(page, hasPronunciation = () => true) {
  if (page.ns !== 0 || page.pagelanguage !== "yue" || page.missing || page.redirect ||
      Object.hasOwn(page.pageprops || {}, "disambiguation") || !Number.isInteger(page.pageid) ||
      !page.extract || /列表|^\d+年$/u.test(page.title)) return null;
  const identity = wikipediaIdentity(page);
  if (!identity.sourceUrl?.startsWith(`${SOURCE}wiki/`)) return null;
  const revision = page.revisions?.[0];
  if (!Number.isInteger(revision?.revid) || revision.revid !== page.lastrevid || !revision.timestamp) return null;
  // TextExtracts is requested without an intro, character, or sentence limit.
  // Keep the full returned text, including headings; never pad or truncate a stub.
  const lines = page.extract.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const paragraphs = lines.filter((line) => !/^=+\s.*?\s=+$/u.test(line));
  const text = paragraphs.join(" ");
  const han = [...text].filter((character) => /\p{Script=Han}/u.test(character));
  if (paragraphs.filter((line) => line.length >= 60).length < 2 || han.length < 300 || text.length > 16_000 ||
      (text.match(/[嘅喺咗冇啲嚟唔佢哋]/gu) || []).length < 3 ||
      [...lines.join("")].some((character) => /\p{Script=Han}/u.test(character) && !hasPronunciation(character))) return null;
  const segments = lines.map((line) => line.replace(/^=+\s*(.*?)\s*=+$/u, "$1"));
  let elapsed = 0;
  const transcript = segments.map((line) => {
    const segment = { at: elapsed, text: line };
    elapsed += Math.max(2, Math.ceil([...line].length / 4));
    return segment;
  });
  return {
    ...identity,
    source: "粵語維基百科",
    collection: "粵文百科",
    episode: "百科文章 · 本機合成朗讀",
    level: null,
    publishedAt: "",
    duration: elapsed,
    description: "粵語維基百科原文嘅純文字版本；裝置支援粵語聲線時可合成朗讀。",
    transcriptAvailable: true,
    isDemoNarration: true,
    hasAuthenticAudio: false,
    audioKind: "speech",
    sourceLicense: "CC BY-SA 4.0",
    licenseUrl: LICENSE,
    sourceRevision: revision.revid,
    sourceRevisionAt: revision.timestamp,
    sourceRevisionUrl: `${SOURCE}w/index.php?oldid=${revision.revid}`,
    attribution: `《${page.title}》由粵語維基百科貢獻者共同編寫；完整作者名單見原文頁面嘅編輯歷史。CC BY-SA 4.0。`,
    editorialChanges: "Leafbound 以官方 TextExtracts 提供嘅純文字整理分段及估算朗讀時間；圖片、表格及部分註釋由來源介面略去。整理後文字同樣依 CC BY-SA 4.0 提供。",
    timing: "estimated",
    transcript
  };
}

export async function importWikipediaArticles(intake, { hasPronunciation, query = queryApi, maxBatches = 12 } = {}) {
  if (!intake.remaining) return;
  const site = await query({ meta: "siteinfo", siprop: "general|rightsinfo" });
  if (site.query?.general?.lang !== "yue" || !site.query?.rightsinfo?.url?.startsWith(LICENSE)) {
    throw new Error("Cantonese Wikipedia language or reuse license could not be verified");
  }
  const attempted = new Set();
  let checked = 0;
  for (let batch = 0; batch < maxBatches && intake.remaining && checked < 120; batch += 1) {
    const listing = await query({ generator: "random", grnnamespace: "0", grnlimit: "50", prop: "info|pageprops", inprop: "url", ppprop: "disambiguation" });
    if (!Array.isArray(listing.query?.pages)) throw new Error("Cantonese Wikipedia returned no article listing");
    for (const page of listing.query.pages) {
      if (!intake.remaining || checked >= 120) break;
      if (attempted.has(page.pageid) || page.length < 2000 || page.length > 60_000 ||
          page.pagelanguage !== "yue" || Object.hasOwn(page.pageprops || {}, "disambiguation") ||
          intake.hasSeen(wikipediaIdentity(page))) continue;
      attempted.add(page.pageid);
      checked += 1;
      const result = await query({ pageids: String(page.pageid), prop: "extracts|info|revisions|pageprops", inprop: "url", explaintext: "1", exlimit: "1", rvprop: "ids|timestamp", ppprop: "disambiguation" });
      const article = wikipediaArticle(result.query?.pages?.[0] || {}, hasPronunciation);
      if (article && intake.accept(article)) console.log(`New Cantonese encyclopedia article: ${article.title}`);
    }
  }
}
