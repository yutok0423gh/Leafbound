import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const defaultAcceptedRoot = join(
  projectRoot,
  ".tmp-data",
  "classical-translations",
  "qwen35-batch-v2",
  "accepted"
);
const defaultDraftRoot = join(projectRoot, "data", "classical-translations", "drafts");
const reviewBatchPath = join(projectRoot, "data", "classical-translations", "review-batch.json");
const REVIEWED_AT = "2026-08-29T14:00:00.000Z";
const QIANBO_ID = "open-caocao-c6f2e325b4f071ea6066";

function reviseKnownTerms(record) {
  if (record.id !== QIANBO_ID) return { record, corrections: [] };
  const replacements = new Map([
    ["十月已是深冬。", "農曆十月，已進入初冬。"],
    ["熊與豹都在洞穴中棲息。", "熊與棕熊都在洞穴中棲息。"],
    ["錢幣與度量衡暫時停置不用，", "錢、鎛等農具暫時停放不用，"]
  ]);
  const corrections = [];
  const paragraphs = record.paragraphs.map((paragraph) => {
    const replacement = replacements.get(paragraph);
    if (!replacement) return paragraph;
    corrections.push({ from: paragraph, to: replacement });
    return replacement;
  });
  if (corrections.length !== replacements.size) {
    throw new Error("The known-term correction source text has drifted; refusing to mark the batch.");
  }
  return { record: { ...record, paragraphs }, corrections };
}

function triageRecord(record) {
  const revised = reviseKnownTerms(record);
  return {
    corrections: revised.corrections,
    record: {
      ...revised.record,
      status: "pending-review",
      editorialTriage: "initially-usable",
      sourceLabel: "Leafbound AI 今譯 · 初步可用",
      review: {
        reviewer: "Leafbound owner",
        reviewedAt: REVIEWED_AT,
        note: revised.corrections.length
          ? "初步抽查通過；已校正孟冬、羆與錢鎛的已知誤譯，仍待逐篇精校。"
          : "初步抽查通過；仍待逐篇精校。"
      }
    }
  };
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(path + ":" + (index + 1) + " is not valid JSON: " + error.message);
    }
  });
}

export async function triageClassicalTranslationBatch({
  inputRoot = existsSync(defaultAcceptedRoot) ? defaultAcceptedRoot : defaultDraftRoot,
  outputRoot = defaultDraftRoot
} = {}) {
  const resolvedInput = resolve(inputRoot);
  const resolvedOutput = resolve(outputRoot);
  const files = (await readdir(resolvedInput))
    .filter((name) => name.endsWith(".jsonl"))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (!files.length) throw new Error("No accepted classical translation JSONL files were found.");

  const seen = new Set();
  const corrections = [];
  const outputs = [];
  await mkdir(resolvedOutput, { recursive: true });
  for (const file of files) {
    const records = await readJsonl(join(resolvedInput, file));
    const reviewed = records.map((record) => {
      if (!record.id || seen.has(record.id)) throw new Error("Missing or duplicate translation id: " + record.id);
      seen.add(record.id);
      const result = triageRecord(record);
      if (result.corrections.length) corrections.push({ id: record.id, changes: result.corrections });
      return result.record;
    });
    const body = reviewed.map((record) => JSON.stringify(record)).join("\n") + "\n";
    await writeFile(join(resolvedOutput, file), body, "utf8");
    outputs.push({ file, count: reviewed.length });
  }

  if (seen.size !== 100) throw new Error("Expected exactly 100 accepted drafts; found " + seen.size + ".");
  const batch = {
    schemaVersion: 1,
    batch: "qwen35-batch-v2",
    decision: "initially-usable",
    formalStatus: "pending-review",
    productionReady: false,
    decidedAt: REVIEWED_AT,
    reviewer: "Leafbound owner",
    recordCount: seen.size,
    note: "初步抽查通过；机器初译仍待逐篇人工精校，结构警告继续保留。",
    corrections
  };
  await writeFile(reviewBatchPath, JSON.stringify(batch, null, 2) + "\n", "utf8");
  return { inputRoot: resolvedInput, outputRoot: resolvedOutput, outputs, batch };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await triageClassicalTranslationBatch(), null, 2));
}
