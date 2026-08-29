import { createHash } from "node:crypto";
import {
  existsSync
} from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenCC from "opencc-js";
import { poems } from "../src/data.js";
import { getClassicalTranslation } from "../src/classical-translations.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlanPath = resolve(projectRoot, ".tmp-data", "classical-translations", "plan.jsonl");
const defaultDataRoot = resolve(projectRoot, "data", "classical-translations");

export const CLASSICAL_KINDS = Object.freeze(["詩", "詞", "曲", "古文"]);
export const SOURCE_HASH_VERSION = 1;
export const SHARD_PREFIX_LENGTH = 2;
export const MACHINE_DRAFT_QUALITY = "machine-draft-unreviewed";

const allowedKinds = new Set(CLASSICAL_KINDS);
const englishLabelPattern = /(?:\b(?:translation|english|modern chinese|notes?|analysis|summary)\s*[:：]|英文(?:翻譯|翻译|譯文|译文|釋義|释义)?\s*[:：])/iu;
const refusalPattern = /(?:\b(?:as an ai|i (?:cannot|can't|am unable|won't))\b|(?:抱歉|對不起|对不起|不能|無法|无法).{0,18}(?:翻譯|翻译|提供|完成|協助|协助))/iu;
const ratioLimits = Object.freeze({
  詩: Object.freeze([0.35, 4]),
  詞: Object.freeze([0.35, 4]),
  曲: Object.freeze([0.35, 4]),
  古文: Object.freeze([0.45, 3])
});
const toHongKongTraditional = OpenCC.Converter({ from: "cn", to: "hk" });
const sourceCopyMinimumLength = 16;
const sourceCopyShingleLength = 4;
const sourceCopyShingleThreshold = 0.82;
const clauseBoundaryPattern = /[。！？!?；;]+/gu;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedField(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .trim();
}

function lineText(line) {
  return normalizedField(typeof line === "string" ? line : line?.text);
}

function canonicalSource(poem) {
  return JSON.stringify([
    SOURCE_HASH_VERSION,
    normalizedField(poem.id),
    normalizedField(poem.kind),
    normalizedField(poem.title),
    normalizedField(poem.poet),
    normalizedField(poem.dynasty),
    (poem.lines || []).map(lineText)
  ]);
}

export function sourceHashFor(poem) {
  return sha256(canonicalSource(poem));
}

function compactCharacterCount(value) {
  return compactText(value).length;
}

function compactText(value) {
  return String(value || "").normalize("NFC").replace(/[\p{P}\p{S}\p{Z}\s]/gu, "");
}

function sourceCharacterCount(poem) {
  return compactCharacterCount((poem.lines || []).map(lineText).join(""));
}

function builtInTranslation(poem) {
  return Boolean(poem.translation || getClassicalTranslation(poem));
}

function normalizeKinds(kinds = CLASSICAL_KINDS) {
  const values = Array.isArray(kinds) ? kinds : String(kinds || "").split(",");
  const normalized = [...new Set(values.map((kind) => String(kind).trim()).filter(Boolean))];
  if (!normalized.length) throw new Error("At least one classical kind is required.");
  const unknown = normalized.filter((kind) => !allowedKinds.has(kind));
  if (unknown.length) throw new Error(`Unknown classical kind: ${unknown.join("、")}`);
  return CLASSICAL_KINDS.filter((kind) => normalized.includes(kind));
}

function countByKind(items, kindSelector = (item) => item.kind) {
  return Object.fromEntries(CLASSICAL_KINDS.map((kind) => [
    kind,
    items.filter((item) => kindSelector(item) === kind).length
  ]));
}

export function createTranslationPlan({ kinds = CLASSICAL_KINDS } = {}) {
  const selectedKinds = normalizeKinds(kinds);
  const targetWorks = poems.filter((poem) => selectedKinds.includes(poem.kind));
  const jobs = targetWorks
    .filter((poem) => !builtInTranslation(poem))
    .map((poem) => Object.freeze({
      id: poem.id,
      kind: poem.kind,
      title: poem.title,
      poet: poem.poet || "",
      dynasty: poem.dynasty || "",
      sourceHash: sourceHashFor(poem),
      sourceCharacterCount: sourceCharacterCount(poem),
      lines: Object.freeze((poem.lines || []).map(lineText))
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));

  return Object.freeze({
    schemaVersion: 1,
    sourceHashVersion: SOURCE_HASH_VERSION,
    kinds: Object.freeze(selectedKinds),
    targetCount: targetWorks.length,
    builtInCount: targetWorks.length - jobs.length,
    missingCount: jobs.length,
    missingByKind: Object.freeze(countByKind(jobs)),
    sourceCharacterCount: jobs.reduce((sum, job) => sum + job.sourceCharacterCount, 0),
    jobs: Object.freeze(jobs)
  });
}

function jsonLine(job) {
  return JSON.stringify({
    id: job.id,
    kind: job.kind,
    title: job.title,
    poet: job.poet,
    dynasty: job.dynasty,
    sourceHash: job.sourceHash,
    sourceCharacterCount: job.sourceCharacterCount,
    text: job.lines.join("\n")
  });
}

export async function writePlan(plan, outputPath = defaultPlanPath, { dryRun = false } = {}) {
  const body = `${plan.jobs.map(jsonLine).join("\n")}${plan.jobs.length ? "\n" : ""}`;
  if (!dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, body, "utf8");
  }
  return Object.freeze({ path: outputPath, bytes: Buffer.byteLength(body), written: !dryRun });
}

async function filesAtDraftPath(path) {
  if (!existsSync(path)) return [];
  const details = await stat(path);
  if (details.isFile()) return path.endsWith(".jsonl") ? [path] : [];
  if (!details.isDirectory()) return [];
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(path, entry.name))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function resolveDraftFiles(draftsPath = null, dataRoot = defaultDataRoot) {
  if (draftsPath) return filesAtDraftPath(resolve(draftsPath));
  const single = resolve(dataRoot, "drafts.jsonl");
  const directory = resolve(dataRoot, "drafts");
  return [
    ...(existsSync(single) ? [single] : []),
    ...await filesAtDraftPath(directory)
  ];
}

export async function readDraftRecords({ draftsPath = null, dataRoot = defaultDataRoot } = {}) {
  const files = await resolveDraftFiles(draftsPath, dataRoot);
  const records = [];
  const parseErrors = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/gu);
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index].trim();
      if (!raw) continue;
      try {
        records.push({ ...JSON.parse(raw), _location: `${file}:${index + 1}` });
      } catch (error) {
        parseErrors.push({
          code: "invalid-json",
          location: `${file}:${index + 1}`,
          message: error.message
        });
      }
    }
  }
  return Object.freeze({ files: Object.freeze(files), records, parseErrors });
}

function cleanParagraphs(paragraphs) {
  return paragraphs.map((paragraph) => normalizedField(paragraph));
}

function sourceCopyScore(source, output) {
  const sourceText = compactText(source);
  const outputText = compactText(output);
  if (!sourceText || !outputText) return 0;
  if (sourceText === outputText) return 1;
  if (sourceText.length < sourceCopyMinimumLength) return 0;

  const shingleLength = Math.min(sourceCopyShingleLength, sourceText.length);
  const outputShingles = new Set();
  for (let index = 0; index <= outputText.length - shingleLength; index += 1) {
    outputShingles.add(outputText.slice(index, index + shingleLength));
  }
  const sourceShingleCount = sourceText.length - shingleLength + 1;
  let matchedSourceShingles = 0;
  for (let index = 0; index < sourceShingleCount; index += 1) {
    if (outputShingles.has(sourceText.slice(index, index + shingleLength))) matchedSourceShingles += 1;
  }
  return matchedSourceShingles / sourceShingleCount;
}

function explicitClauseCount(value) {
  return String(value || "")
    .split(clauseBoundaryPattern)
    .map((clause) => compactText(clause))
    .filter((clause) => clause.length >= 2)
    .length;
}

function sourceCoverageUnitCount(job) {
  const explicitClauses = explicitClauseCount(job.lines.join("\n"));
  const proseParagraphs = job.kind === "古文"
    ? job.lines.filter((line) => compactCharacterCount(line) >= 2).length
    : 0;
  return Math.max(explicitClauses, proseParagraphs);
}

function outputCoverageUnitCount(paragraphs) {
  const explicitClauses = paragraphs.reduce((sum, paragraph) => sum + explicitClauseCount(paragraph), 0);
  return Math.max(explicitClauses, paragraphs.filter((paragraph) => compactCharacterCount(paragraph) >= 2).length);
}

function minimumOutputCoverageUnits(sourceUnits) {
  if (sourceUnits < 5) return 1;
  return Math.max(2, Math.ceil(sourceUnits * 0.2));
}

function recordError(record, code, message) {
  return {
    id: typeof record?.id === "string" ? record.id : null,
    location: record?._location || null,
    code,
    message
  };
}

function draftMetadata(record) {
  const metadata = {
    quality: MACHINE_DRAFT_QUALITY,
    status: "machine_draft",
    sourceLabel: normalizedField(record.sourceLabel) || "Leafbound 今譯草稿",
    displayStatus: "機器今譯 · 未經人工校訂",
    model: normalizedField(record.model),
    modelRevision: normalizedField(record.modelRevision),
    promptVersion: normalizedField(record.promptVersion),
    warnings: Object.freeze(record.warnings.map((warning) => normalizedField(warning)))
  };
  for (const field of ["generatedAt"]) {
    const value = normalizedField(record[field]);
    if (value) metadata[field] = value;
  }
  return metadata;
}

export function validateDraftRecords(records, plan, { initialErrors = [] } = {}) {
  const jobsById = new Map(plan.jobs.map((job) => [job.id, job]));
  const seenIds = new Map();
  const accepted = [];
  const errors = [...initialErrors];

  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(recordError(record, "invalid-schema", "Draft must be a JSON object."));
      continue;
    }
    if (typeof record.id !== "string" || !record.id.trim()) {
      errors.push(recordError(record, "invalid-id", "Draft id must be a non-empty string."));
      continue;
    }
    if (seenIds.has(record.id)) {
      errors.push(recordError(record, "duplicate-id", `Duplicate draft id; first seen at ${seenIds.get(record.id)}.`));
      continue;
    }
    seenIds.set(record.id, record._location || "an earlier record");

    const job = jobsById.get(record.id);
    if (!job) {
      errors.push(recordError(record, "unknown-or-covered-id", "Draft id is not an uncovered work in the selected plan."));
      continue;
    }
    if (record.kind !== job.kind) {
      errors.push(recordError(record, "kind-mismatch", `Expected ${job.kind}, received ${record.kind}.`));
      continue;
    }
    if (typeof record.sourceHash !== "string" || record.sourceHash.toLowerCase() !== job.sourceHash) {
      errors.push(recordError(record, "source-hash-mismatch", "Draft sourceHash does not match the current source text."));
      continue;
    }
    if (!Array.isArray(record.paragraphs) || !record.paragraphs.length || record.paragraphs.some((paragraph) => typeof paragraph !== "string" || !paragraph.trim())) {
      errors.push(recordError(record, "invalid-paragraphs", "paragraphs must be a non-empty array of non-empty strings."));
      continue;
    }
    if (record.status !== "machine_draft") {
      errors.push(recordError(record, "invalid-status", "status must be exactly machine_draft."));
      continue;
    }
    if (["model", "modelRevision", "promptVersion"].some((field) => typeof record[field] !== "string" || !record[field].trim())) {
      errors.push(recordError(record, "invalid-generation-metadata", "model, modelRevision, and promptVersion must be non-empty strings."));
      continue;
    }
    if (!Array.isArray(record.warnings) || record.warnings.some((warning) => typeof warning !== "string" || !warning.trim())) {
      errors.push(recordError(record, "invalid-warnings", "warnings must be an array of non-empty strings; use [] when there are none."));
      continue;
    }
    if (record.sourceLabel !== undefined && (typeof record.sourceLabel !== "string" || !record.sourceLabel.trim() || record.sourceLabel.length > 120)) {
      errors.push(recordError(record, "invalid-source-label", "sourceLabel must be a non-empty string no longer than 120 characters."));
      continue;
    }

    const paragraphs = cleanParagraphs(record.paragraphs);
    const joined = paragraphs.join("\n");
    if (englishLabelPattern.test(joined)) {
      errors.push(recordError(record, "english-label", "Translation contains an English/translation label."));
      continue;
    }
    if (refusalPattern.test(joined)) {
      errors.push(recordError(record, "refusal", "Translation looks like a refusal or assistant response."));
      continue;
    }
    if (toHongKongTraditional(joined) !== joined) {
      errors.push(recordError(record, "non-traditional-output", "Translation must already be written in Hong Kong Traditional Chinese."));
      continue;
    }

    const copyScore = sourceCopyScore(job.lines.join("\n"), joined);
    if (copyScore >= sourceCopyShingleThreshold) {
      errors.push(recordError(
        record,
        "source-copy",
        `Translation copies the normalized source text too closely (${Math.round(copyScore * 100)}% source-shingle coverage).`
      ));
      continue;
    }

    const outputCharacterCount = compactCharacterCount(joined);
    const ratio = outputCharacterCount / Math.max(1, job.sourceCharacterCount);
    const [minimumRatio, maximumRatio] = ratioLimits[job.kind];
    if (ratio < minimumRatio || ratio > maximumRatio) {
      errors.push(recordError(
        record,
        "length-ratio",
        `Translation/source character ratio ${ratio.toFixed(2)} is outside ${minimumRatio.toFixed(2)}–${maximumRatio.toFixed(2)} for ${job.kind}.`
      ));
      continue;
    }

    const sourceCoverageUnits = sourceCoverageUnitCount(job);
    const outputCoverageUnits = outputCoverageUnitCount(paragraphs);
    const minimumCoverageUnits = minimumOutputCoverageUnits(sourceCoverageUnits);
    if (sourceCoverageUnits >= 5 && outputCoverageUnits < minimumCoverageUnits) {
      errors.push(recordError(
        record,
        "clause-coverage",
        `Translation has ${outputCoverageUnits} clause/paragraph unit(s); at least ${minimumCoverageUnits} are required for ${sourceCoverageUnits} source units.`
      ));
      continue;
    }

    accepted.push(Object.freeze({
      id: job.id,
      kind: job.kind,
      sourceHash: job.sourceHash,
      sourceCharacterCount: job.sourceCharacterCount,
      outputCharacterCount,
      paragraphs: Object.freeze(paragraphs),
      metadata: Object.freeze(draftMetadata(record))
    }));
  }

  const translations = new Map();
  const duplicateIds = new Set();
  for (const record of accepted) {
    const signature = normalizedField(record.paragraphs.join(""))
      .replace(/[\p{P}\p{S}\p{Z}\s]/gu, "");
    if (signature.length < 8) continue;
    const previous = translations.get(signature);
    if (previous && previous.sourceHash !== record.sourceHash) {
      errors.push(recordError(record, "duplicate-translation", `Translation duplicates ${previous.id} although the source text differs.`));
      duplicateIds.add(record.id);
      duplicateIds.add(previous.id);
    } else if (!previous) {
      translations.set(signature, record);
    }
  }

  const validRecords = accepted.filter((record) => !duplicateIds.has(record.id));
  return Object.freeze({
    valid: errors.length === 0,
    inputCount: records.length,
    acceptedCount: validRecords.length,
    rejectedCount: records.length - validRecords.length,
    errors: Object.freeze(errors),
    records: Object.freeze(validRecords)
  });
}

export function shardIdFor(id) {
  return sha256(String(id)).slice(0, SHARD_PREFIX_LENGTH);
}

function compactBuiltRecord(record) {
  return [record.id, record.kind, record.paragraphs, record.sourceHash, record.metadata];
}

function parseBuiltRecord(value, location) {
  if (!Array.isArray(value) || value.length < 5) return { _location: location };
  const [id, kind, paragraphs, sourceHash, metadata = {}] = value;
  return {
    id,
    kind,
    paragraphs,
    sourceHash,
    status: metadata.status,
    sourceLabel: metadata.sourceLabel,
    model: metadata.model,
    modelRevision: metadata.modelRevision,
    promptVersion: metadata.promptVersion,
    warnings: metadata.warnings,
    generatedAt: metadata.generatedAt,
    _location: location
  };
}

export async function readBuiltRecords(dataRoot = defaultDataRoot) {
  const shardsRoot = resolve(dataRoot, "shards");
  if (!existsSync(shardsRoot)) return [];
  const files = (await readdir(shardsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[0-9a-f]{2}\.json$/u.test(entry.name))
    .map((entry) => join(shardsRoot, entry.name))
    .sort((left, right) => left.localeCompare(right, "en"));
  const records = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    const values = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(values)) throw new Error(`Invalid generated shard schema: ${file}`);
    values.forEach((value, index) => records.push(parseBuiltRecord(value, `${file}:record-${index + 1}`)));
  }
  return records;
}

function mergeValidRecords(existing, incoming) {
  const merged = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) merged.set(record.id, record);
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function buildInMemoryArtifacts(records, plan) {
  const buckets = new Map();
  for (const record of records) {
    const shardId = shardIdFor(record.id);
    if (!buckets.has(shardId)) buckets.set(shardId, []);
    buckets.get(shardId).push(record);
  }

  const shardFiles = new Map();
  const shardMetadata = [];
  for (const [shardId, bucket] of [...buckets].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const body = `${JSON.stringify({
      schemaVersion: 1,
      records: bucket.sort((left, right) => left.id.localeCompare(right.id, "en")).map(compactBuiltRecord)
    })}\n`;
    shardFiles.set(`${shardId}.json`, body);
    shardMetadata.push({
      id: shardId,
      count: bucket.length,
      bytes: Buffer.byteLength(body),
      sha256: sha256(body)
    });
  }

  const jobsById = new Map(plan.jobs.map((job) => [job.id, job]));
  const generatedByKind = Object.fromEntries(CLASSICAL_KINDS.map((kind) => [kind, 0]));
  for (const record of records) {
    const kind = jobsById.get(record.id)?.kind;
    if (kind) generatedByKind[kind] += 1;
  }
  const targetTotal = poems.filter((poem) => allowedKinds.has(poem.kind)).length;
  const builtInCount = targetTotal - plan.missingCount;
  const manifest = {
    schemaVersion: 1,
    sourceHash: { algorithm: "sha256", canonicalVersion: SOURCE_HASH_VERSION },
    shardStrategy: { algorithm: "sha256-id-prefix", prefixLength: SHARD_PREFIX_LENGTH },
    quality: {
      id: MACHINE_DRAFT_QUALITY,
      label: "機器今譯 · 未經人工校訂"
    },
    coverage: {
      targetCount: targetTotal,
      builtInCount,
      generatedCount: records.length,
      coveredCount: builtInCount + records.length,
      remainingCount: Math.max(0, plan.missingCount - records.length),
      generatedByKind
    },
    recordsSha256: sha256(records.map((record) => `${record.id}:${record.sourceHash}:${sha256(record.paragraphs.join("\n"))}`).join("\n")),
    shards: shardMetadata
  };
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBody,
    shardFiles,
    totalBytes: Buffer.byteLength(manifestBody) + [...shardFiles.values()].reduce((sum, body) => sum + Buffer.byteLength(body), 0)
  });
}

async function replaceGeneratedArtifacts(dataRoot, artifacts) {
  await mkdir(dataRoot, { recursive: true });
  const token = `${process.pid}-${Date.now()}`;
  const stagingRoot = resolve(dataRoot, `.build-${token}`);
  const stagingShards = resolve(stagingRoot, "shards");
  const backupRoot = resolve(dataRoot, `.backup-${token}`);
  const targetShards = resolve(dataRoot, "shards");
  const targetManifest = resolve(dataRoot, "manifest.json");
  const backupShards = resolve(backupRoot, "shards");
  const backupManifest = resolve(backupRoot, "manifest.json");
  let shardsInstalled = false;
  let manifestInstalled = false;

  await mkdir(stagingShards, { recursive: true });
  for (const [name, body] of artifacts.shardFiles) await writeFile(resolve(stagingShards, name), body, "utf8");
  await writeFile(resolve(stagingRoot, "manifest.json"), artifacts.manifestBody, "utf8");
  await mkdir(backupRoot, { recursive: true });

  try {
    if (existsSync(targetShards)) await rename(targetShards, backupShards);
    if (existsSync(targetManifest)) await rename(targetManifest, backupManifest);
    await rename(stagingShards, targetShards);
    shardsInstalled = true;
    await rename(resolve(stagingRoot, "manifest.json"), targetManifest);
    manifestInstalled = true;
    await rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (manifestInstalled && existsSync(targetManifest)) await rm(targetManifest, { force: true });
    if (shardsInstalled && existsSync(targetShards)) await rm(targetShards, { recursive: true, force: true });
    if (existsSync(backupShards)) await rename(backupShards, targetShards);
    if (existsSync(backupManifest)) await rename(backupManifest, targetManifest);
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(backupRoot, { recursive: true, force: true });
  }
}

export async function buildTranslationArtifacts({
  plan = createTranslationPlan(),
  draftRecords = [],
  draftErrors = [],
  dataRoot = defaultDataRoot,
  dryRun = false,
  requireComplete = false
} = {}) {
  const existingRaw = await readBuiltRecords(dataRoot);
  const existingValidation = validateDraftRecords(existingRaw, plan);
  if (!existingValidation.valid) {
    return Object.freeze({ ok: false, stage: "existing", validation: existingValidation });
  }
  const incomingValidation = validateDraftRecords(draftRecords, plan, { initialErrors: draftErrors });
  if (!incomingValidation.valid) {
    return Object.freeze({ ok: false, stage: "drafts", validation: incomingValidation });
  }

  const merged = mergeValidRecords(existingValidation.records, incomingValidation.records);
  const combinedValidation = validateDraftRecords(merged.map((record) => ({
    id: record.id,
    kind: record.kind,
    sourceHash: record.sourceHash,
    paragraphs: record.paragraphs,
    status: record.metadata.status,
    sourceLabel: record.metadata.sourceLabel,
    model: record.metadata.model,
    modelRevision: record.metadata.modelRevision,
    promptVersion: record.metadata.promptVersion,
    warnings: record.metadata.warnings,
    generatedAt: record.metadata.generatedAt
  })), plan);
  if (!combinedValidation.valid) {
    return Object.freeze({ ok: false, stage: "combined", validation: combinedValidation });
  }
  if (requireComplete && combinedValidation.records.length !== plan.missingCount) {
    return Object.freeze({
      ok: false,
      stage: "coverage",
      validation: combinedValidation,
      message: `Complete coverage requires ${plan.missingCount} records; received ${combinedValidation.records.length}.`
    });
  }

  const artifacts = buildInMemoryArtifacts(combinedValidation.records, plan);
  if (!dryRun) await replaceGeneratedArtifacts(resolve(dataRoot), artifacts);
  return Object.freeze({
    ok: true,
    dryRun,
    existingCount: existingValidation.acceptedCount,
    incomingCount: incomingValidation.acceptedCount,
    recordCount: combinedValidation.acceptedCount,
    remainingCount: artifacts.manifest.coverage.remainingCount,
    totalBytes: artifacts.totalBytes,
    manifest: artifacts.manifest
  });
}

function parseOptions(argv) {
  const options = { dryRun: false, requireComplete: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--require-complete") options.requireComplete = true;
    else if (argument.startsWith("--kinds=")) options.kinds = argument.slice(8).split(",");
    else if (argument === "--kinds") options.kinds = String(argv[++index] || "").split(",");
    else if (argument.startsWith("--output=")) options.output = resolve(argument.slice(9));
    else if (argument === "--output") options.output = resolve(argv[++index]);
    else if (argument.startsWith("--drafts=")) options.draftsPath = resolve(argument.slice(9));
    else if (argument === "--drafts") options.draftsPath = resolve(argv[++index]);
    else if (argument.startsWith("--data-root=")) options.dataRoot = resolve(argument.slice(12));
    else if (argument === "--data-root") options.dataRoot = resolve(argv[++index]);
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printReport(report) {
  const printable = report.validation?.errors?.length > 50
    ? { ...report, validation: { ...report.validation, records: undefined, errors: report.validation.errors.slice(0, 50), omittedErrorCount: report.validation.errors.length - 50 } }
    : report;
  console.log(JSON.stringify(printable, (key, value) => key === "records" ? undefined : value, 2));
}

async function runCli() {
  const [mode, ...argv] = process.argv.slice(2);
  if (!mode || !["plan", "verify", "build"].includes(mode)) {
    throw new Error("Usage: classical-translation-pipeline.mjs <plan|verify|build> [--dry-run] [--kinds 詩,詞,曲,古文]");
  }
  const options = parseOptions(argv);
  const selectedPlan = createTranslationPlan({ kinds: options.kinds || CLASSICAL_KINDS });

  if (mode === "plan") {
    const output = await writePlan(selectedPlan, options.output || defaultPlanPath, { dryRun: options.dryRun });
    printReport({ mode, dryRun: options.dryRun, ...selectedPlan, jobs: undefined, output });
    return;
  }

  const dataRoot = options.dataRoot || defaultDataRoot;
  const drafts = await readDraftRecords({ draftsPath: options.draftsPath, dataRoot });
  if (!drafts.files.length) {
    printReport({ mode, ok: false, error: "No JSONL draft files found.", expected: options.draftsPath || [resolve(dataRoot, "drafts.jsonl"), resolve(dataRoot, "drafts", "*.jsonl")] });
    process.exitCode = 1;
    return;
  }

  if (mode === "verify") {
    const validation = validateDraftRecords(drafts.records, selectedPlan, { initialErrors: drafts.parseErrors });
    printReport({
      mode,
      ok: validation.valid && (!options.requireComplete || validation.acceptedCount === selectedPlan.missingCount),
      files: drafts.files,
      planMissingCount: selectedPlan.missingCount,
      remainingCount: Math.max(0, selectedPlan.missingCount - validation.acceptedCount),
      validation
    });
    if (!validation.valid || (options.requireComplete && validation.acceptedCount !== selectedPlan.missingCount)) process.exitCode = 1;
    return;
  }

  const fullPlan = createTranslationPlan();
  const result = await buildTranslationArtifacts({
    plan: fullPlan,
    draftRecords: drafts.records,
    draftErrors: drafts.parseErrors,
    dataRoot,
    dryRun: options.dryRun,
    requireComplete: options.requireComplete
  });
  printReport({ mode, files: drafts.files, ...result });
  if (!result.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
