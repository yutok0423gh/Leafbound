import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contentWeekKey, weeklyContentTarget } from "../src/content-schedule.js";
import { writeTextIfChanged } from "./generated-content-utils.mjs";

export const historyUrl = new URL("../data/content-history.json", import.meta.url);
const releaseUrl = new URL("../src/content-release.js", import.meta.url);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const normalizedText = (text) => String(text || "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");

export function canonicalContentUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported content source URL");
  url.protocol = "https:";
  url.hostname = url.hostname.replace(/^www\./, "");
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

export function articleKeys(article) {
  const keys = [];
  if (article.id) keys.push(`id:${article.id}`);
  if (article.sourceUrl) keys.push(`url:${canonicalContentUrl(article.sourceUrl)}`);
  const documentId = article.textDocumentUrl?.match(/\/document\/d\/([^/]+)/)?.[1];
  if (documentId) keys.push(`document:${documentId}`);
  if (article.title && (article.sourceId || article.source)) {
    keys.push(`title:${hash(`${article.sourceId || article.source}:${normalizedText(article.title)}`)}`);
  }
  const body = normalizedText((article.paragraphs || article.transcript?.map((segment) => segment.text) || []).join(" "));
  if (body) keys.push(`body:${hash(body)}`);
  return [...new Set(keys)];
}

export function emptyContentHistory() {
  return { schemaVersion: 1, seededThroughCommit: "", languages: {
    english: { records: [], weeks: {} },
    cantonese: { records: [], weeks: {} }
  } };
}

export function rememberArticle(shelf, article, week = null) {
  const keys = articleKeys(article);
  const existing = shelf.records.find((record) => record.keys.some((key) => keys.includes(key)));
  if (existing) {
    existing.keys = [...new Set([...existing.keys, ...keys])].sort();
    return false;
  }
  shelf.records.push({ id: article.id, sourceUrl: article.sourceUrl || "", firstSeenWeek: week, keys: keys.sort() });
  return true;
}

export async function loadContentHistory() {
  // Missing or corrupt history must never turn an old article into a new one.
  const history = JSON.parse(await readFile(historyUrl, "utf8"));
  if (history.schemaVersion !== 1 || !history.seededThroughCommit) throw new Error("Content history has not been seeded from Git");
  for (const language of ["english", "cantonese"]) {
    const shelf = history.languages?.[language];
    if (!Array.isArray(shelf?.records) || !shelf.records.length || !shelf.weeks || typeof shelf.weeks !== "object") {
      throw new Error(`Invalid ${language} content history`);
    }
    if (shelf.records.some((record) => !record.id || !Array.isArray(record.keys) || !record.keys.length)) {
      throw new Error(`Invalid ${language} content identity`);
    }
    for (const issue of Object.values(shelf.weeks)) {
      if (!Array.isArray(issue.articleIds) || new Set(issue.articleIds).size !== issue.articleIds.length || issue.articleIds.length > weeklyContentTarget) {
        throw new Error(`Invalid ${language} weekly quota`);
      }
    }
  }
  return history;
}

export function createWeeklyIntake(history, language, previousArticles, now = new Date(process.env.LEAFBOUND_PUBLICATION_TIME || Date.now())) {
  const shelf = history.languages[language];
  // Include manually added content as already collected, never as weekly additions.
  previousArticles.forEach((article) => rememberArticle(shelf, article));
  const week = contentWeekKey(now);
  const issue = shelf.weeks[week] || { articleIds: [], checkedAt: null, sourceErrors: [] };
  const seen = new Set(shelf.records.flatMap((record) => record.keys));
  const additions = [];
  const sourceErrors = [];
  const intake = {
    week,
    additions,
    get remaining() { return Math.max(0, weeklyContentTarget - issue.articleIds.length - additions.length); },
    hasSeen(article) { return articleKeys(article).some((key) => seen.has(key)); },
    accept(article) {
      if (!intake.remaining || intake.hasSeen(article)) return false;
      if (!article.id || !article.sourceUrl || !article.title || !articleKeys(article).some((key) => key.startsWith("body:"))) {
        throw new Error("An imported article needs an identity, source, title, and full text");
      }
      additions.push({ ...article, firstCollectedWeek: week });
      articleKeys(article).forEach((key) => seen.add(key));
      return true;
    },
    sourceFailed(source, error) {
      sourceErrors.push({ source, message: String(error.message || error) });
    },
    finish() {
      additions.forEach((article) => rememberArticle(shelf, article, week));
      const completed = issue.articleIds.length === weeklyContentTarget && !additions.length ? issue : {
        articleIds: [...issue.articleIds, ...additions.map((article) => article.id)],
        checkedAt: new Date(now).toISOString(),
        sourceErrors
      };
      shelf.weeks[week] = completed;
      return { week, target: weeklyContentTarget, addedThisRun: additions.length,
        addedThisWeek: completed.articleIds.length, shortfall: weeklyContentTarget - completed.articleIds.length, sourceErrors };
    }
  };
  return intake;
}

export function contentRelease(history, now = new Date(process.env.LEAFBOUND_PUBLICATION_TIME || Date.now())) {
  const week = contentWeekKey(now);
  const release = { schemaVersion: 1, week, timeZone: "Asia/Shanghai", schedule: "Monday 09:00", targetPerLanguage: weeklyContentTarget };
  for (const language of ["english", "cantonese"]) {
    const issue = history.languages[language].weeks[week];
    release[language] = { articleIds: issue?.articleIds || [], checkedAt: issue?.checkedAt || null,
      count: issue?.articleIds.length || 0, shortfall: weeklyContentTarget - (issue?.articleIds.length || 0),
      sourceErrorCount: issue?.sourceErrors.length || 0 };
  }
  return release;
}

export async function saveContentHistory(history, now = new Date(process.env.LEAFBOUND_PUBLICATION_TIME || Date.now())) {
  await writeTextIfChanged(historyUrl, `${JSON.stringify(history, null, 2)}\n`);
  await writeTextIfChanged(releaseUrl, `// Generated by the weekly content update.\nexport const weeklyContentRelease = Object.freeze(${JSON.stringify(contentRelease(history, now), null, 2)});\n`);
}
