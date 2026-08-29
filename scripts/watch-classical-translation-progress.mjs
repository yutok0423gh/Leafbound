import { existsSync } from "node:fs";
import { mkdir, open, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({
  input: resolve(projectRoot, ".tmp-data", "classical-translations", "qwen35-draft-only-5000-2026-08-29.jsonl"),
  output: resolve(projectRoot, "artifacts", "classical-translation-progress.json"),
  target: 5_000,
  interval: 5_000
});

function optionValue(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function optionsFrom(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith("--input=")) options.input = resolve(argument.slice(8));
    else if (argument === "--input") options.input = resolve(optionValue(argv, index++, argument));
    else if (argument.startsWith("--output=")) options.output = resolve(argument.slice(9));
    else if (argument === "--output") options.output = resolve(optionValue(argv, index++, argument));
    else if (argument.startsWith("--target=")) options.target = positiveInteger(argument.slice(9), "--target");
    else if (argument === "--target") options.target = positiveInteger(optionValue(argv, index++, argument), "--target");
    else if (argument.startsWith("--interval=")) options.interval = positiveInteger(argument.slice(11), "--interval");
    else if (argument === "--interval") options.interval = positiveInteger(optionValue(argv, index++, argument), "--interval");
    else throw new Error(`Unknown option: ${argument}`);
  }
  return Object.freeze(options);
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function entries(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hant"));
}

function createAccumulator() {
  return {
    offset: 0,
    pending: "",
    ids: new Set(),
    invalidCount: 0,
    kinds: new Map(),
    statuses: new Map(),
    warnings: new Map(),
    firstGeneratedAt: null,
    latestGeneratedAt: null,
    latestId: "",
    latestKind: ""
  };
}

let accumulator = createAccumulator();

function consumeLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    accumulator.invalidCount += 1;
    return;
  }
  if (!record?.id || !Array.isArray(record.paragraphs) || !record.paragraphs.length) {
    accumulator.invalidCount += 1;
    return;
  }
  if (accumulator.ids.has(record.id)) return;
  accumulator.ids.add(record.id);
  increment(accumulator.kinds, String(record.kind || "未分類"));
  increment(accumulator.statuses, String(record.status || "unknown"));
  for (const warning of record.warnings || []) increment(accumulator.warnings, String(warning));
  const generatedAt = Date.parse(record.generatedAt);
  if (Number.isFinite(generatedAt)) {
    if (accumulator.firstGeneratedAt === null || generatedAt < accumulator.firstGeneratedAt) {
      accumulator.firstGeneratedAt = generatedAt;
    }
    if (accumulator.latestGeneratedAt === null || generatedAt >= accumulator.latestGeneratedAt) {
      accumulator.latestGeneratedAt = generatedAt;
      accumulator.latestId = record.id;
      accumulator.latestKind = record.kind || "";
    }
  }
}

async function ingestNewBytes(inputPath) {
  if (!existsSync(inputPath)) return;
  const fileStat = await stat(inputPath);
  if (fileStat.size < accumulator.offset) accumulator = createAccumulator();
  if (fileStat.size === accumulator.offset) return;
  const byteCount = fileStat.size - accumulator.offset;
  const buffer = Buffer.alloc(byteCount);
  const handle = await open(inputPath, "r");
  try {
    await handle.read(buffer, 0, byteCount, accumulator.offset);
  } finally {
    await handle.close();
  }
  accumulator.offset = fileStat.size;
  const text = accumulator.pending + buffer.toString("utf8");
  const lines = text.split(/\r?\n/u);
  accumulator.pending = lines.pop() || "";
  for (const line of lines) consumeLine(line);
}

function snapshot(options) {
  const now = Date.now();
  const completed = accumulator.ids.size;
  const elapsedMinutes = accumulator.firstGeneratedAt !== null && accumulator.latestGeneratedAt !== null
    ? Math.max(0, (accumulator.latestGeneratedAt - accumulator.firstGeneratedAt) / 60_000)
    : 0;
  const rate = elapsedMinutes > 0 && completed > 1 ? (completed - 1) / elapsedMinutes : 0;
  const remaining = Math.max(0, options.target - completed);
  const latestAgeSeconds = accumulator.latestGeneratedAt === null
    ? null
    : Math.max(0, (now - accumulator.latestGeneratedAt) / 1_000);
  const state = completed >= options.target
    ? "completed"
    : latestAgeSeconds !== null && latestAgeSeconds <= 720
      ? "running"
      : "waiting";
  return {
    schemaVersion: 1,
    state,
    target: options.target,
    completed,
    remaining,
    progressPercent: Number(((completed / options.target) * 100).toFixed(2)),
    recordsPerMinute: Number(rate.toFixed(2)),
    etaMinutes: rate > 0 ? Math.ceil(remaining / rate) : null,
    invalidCount: accumulator.invalidCount,
    kinds: entries(accumulator.kinds),
    statuses: entries(accumulator.statuses),
    warnings: entries(accumulator.warnings),
    latest: {
      id: accumulator.latestId,
      kind: accumulator.latestKind,
      generatedAt: accumulator.latestGeneratedAt === null
        ? null
        : new Date(accumulator.latestGeneratedAt).toISOString(),
      ageSeconds: latestAgeSeconds === null ? null : Math.round(latestAgeSeconds)
    },
    startedAt: accumulator.firstGeneratedAt === null
      ? null
      : new Date(accumulator.firstGeneratedAt).toISOString(),
    updatedAt: new Date(now).toISOString(),
    source: options.input
  };
}

async function update(options) {
  await ingestNewBytes(options.input);
  const progress = snapshot(options);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  return progress;
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  while (!stopped) {
    const progress = await update(options);
    if (progress.state === "completed") break;
    await new Promise((resolveWait) => setTimeout(resolveWait, options.interval));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Progress watcher failed.");
  process.exitCode = 1;
});
