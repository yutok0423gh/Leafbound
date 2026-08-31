import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openPoemIndex } from "../src/open-poems-index.js";
import { sourceHashFor } from "./classical-translation-pipeline.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const REVIEW_FILE = join("artifacts", "classical-translation-review.html");
const TEMPLATE_FILE = join(scriptDirectory, "classical-translation-review.template.html");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function lineText(line) {
  return String(Array.isArray(line) ? line[0] : line?.text ?? line ?? "").trim();
}

function derivedIssuesFor(sourceLines, translationParagraphs) {
  const source = sourceLines.join("");
  const translation = translationParagraphs.join("");
  const issues = [];
  if (source.includes("錢鎛") && translation.includes("錢幣")) {
    issues.push({
      code: "known-term-error",
      label: "術語誤譯",
      detail: "「錢鎛」指農具，這份草稿誤解成了錢幣。"
    });
  }
  return issues;
}

function resolvedIssuesFor(sourceLines, translationParagraphs) {
  const source = sourceLines.join("");
  const translation = translationParagraphs.join("");
  if (source.includes("孟冬")
    && source.includes("熊羆")
    && source.includes("錢鎛")
    && translation.includes("初冬")
    && translation.includes("棕熊")
    && translation.includes("農具")
    && !translation.includes("深冬")
    && !translation.includes("熊與豹")
    && !translation.includes("錢幣")) {
    return [{
      code: "known-terms-corrected",
      label: "已修正三處",
      detail: "已把孟冬、羆與錢鎛分別校正為初冬、棕熊與農具。"
    }];
  }
  return [];
}

export async function loadReviewRecords(root = projectRoot) {
  const manifest = await readJson(join(root, "data", "classical-translations", "manifest.json"));
  const poemById = new Map(openPoemIndex.map((poem) => [poem.id, poem]));
  const sourceShardCache = new Map();
  const sourceRecordFor = async (poem) => {
    if (!sourceShardCache.has(poem.contentShard)) {
      const payload = await readJson(join(root, "data", "open-poems", "shards", poem.contentShard + ".json"));
      sourceShardCache.set(
        poem.contentShard,
        new Map((payload.records || []).map((record) => [record[0], record]))
      );
    }
    return sourceShardCache.get(poem.contentShard)?.get(poem.id);
  };

  const shardDirectory = join(root, "data", "classical-translations", "shards");
  const shardFiles = (await readdir(shardDirectory)).filter((name) => name.endsWith(".json")).sort();
  const records = [];
  for (const file of shardFiles) {
    const payload = await readJson(join(shardDirectory, file));
    for (const packed of payload.records || []) {
      const [id, kind, translationParagraphs = [], sourceHash = "", metadata = {}] = packed;
      const poem = poemById.get(id);
      if (!poem) throw new Error("Translation record is missing from the poetry index: " + id);
      const sourceRecord = await sourceRecordFor(poem);
      if (!sourceRecord) throw new Error("Poetry source record is missing: " + id);
      const sourceLines = (sourceRecord[1] || []).map(lineText).filter(Boolean);
      const normalizedTranslations = translationParagraphs.map((paragraph) => String(paragraph || "").trim());
      const expectedSourceHash = sourceHashFor({ ...poem, lines: sourceLines });
      const warnings = Array.isArray(metadata.warnings) ? metadata.warnings.map(String) : [];
      const derivedIssues = derivedIssuesFor(sourceLines, normalizedTranslations);
      const resolvedIssues = resolvedIssuesFor(sourceLines, normalizedTranslations);
      records.push({
        id,
        title: poem.title,
        author: poem.poet,
        dynasty: poem.dynasty,
        kind,
        form: poem.form,
        collection: poem.collection,
        sourceLines,
        translationParagraphs: normalizedTranslations,
        sourceLineCount: sourceLines.length,
        translationParagraphCount: normalizedTranslations.length,
        sourceHash,
        sourceHashMatches: sourceHash === expectedSourceHash,
        status: metadata.status || "machine-draft",
        displayStatus: metadata.displayStatus || "機器草稿",
        editorialTriage: metadata.editorialTriage || "",
        productionReady: metadata.productionReady === true,
        model: metadata.model || "",
        promptVersion: metadata.promptVersion || "",
        generatedAt: metadata.generatedAt || "",
        warnings,
        derivedIssues,
        resolvedIssues,
        priority: warnings.length > 0 || derivedIssues.length > 0
      });
    }
  }

  const reviewRecords = records.filter((record) => record.editorialTriage === "initially-usable");
  return {
    manifest,
    records: reviewRecords.sort((left, right) => {
      if (left.priority !== right.priority) return left.priority ? -1 : 1;
      return left.kind.localeCompare(right.kind, "zh-Hant") || left.title.localeCompare(right.title, "zh-Hant");
    })
  };
}

export function summarizeReviewRecords(records) {
  const byKind = { 詩: 0, 詞: 0, 曲: 0, 古文: 0 };
  const statusCounts = {};
  let structuralWarnings = 0;
  let knownIssues = 0;
  let resolvedIssues = 0;
  let sourceMatches = 0;
  let initiallyUsable = 0;
  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] || 0) + 1;
    statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
    if (record.warnings.length) structuralWarnings += 1;
    knownIssues += record.derivedIssues.length;
    resolvedIssues += record.resolvedIssues.length;
    if (record.sourceHashMatches) sourceMatches += 1;
    if (record.editorialTriage === "initially-usable") initiallyUsable += 1;
  }
  return {
    total: records.length,
    byKind,
    statusCounts,
    structuralWarnings,
    structurallyClear: records.length - structuralWarnings,
    knownIssues,
    resolvedIssues,
    priority: records.filter((record) => record.priority).length,
    sourceMatches,
    initiallyUsable,
    productionReady: records.filter((record) => record.productionReady).length
  };
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export async function createReviewHtml(records, summary) {
  const template = await readFile(TEMPLATE_FILE, "utf8");
  return template
    .replace("__REVIEW_DATA__", safeScriptJson(records))
    .replace("__REVIEW_SUMMARY__", safeScriptJson(summary));
}

export async function writeReviewDashboard(root = projectRoot) {
  const { records } = await loadReviewRecords(root);
  const summary = summarizeReviewRecords(records);
  const outputPath = join(root, REVIEW_FILE);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await createReviewHtml(records, summary), "utf8");
  return { outputPath, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await writeReviewDashboard();
  console.log(JSON.stringify(result, null, 2));
}
