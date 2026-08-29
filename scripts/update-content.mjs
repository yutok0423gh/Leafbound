import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(projectRoot, ".tmp-data", "content-update-report.json");
const allowedTargets = new Set(["all", "english", "cantonese"]);

function requestedTarget(argv) {
  const flagIndex = argv.indexOf("--target");
  const inline = argv.find((argument) => argument.startsWith("--target="));
  return inline?.slice("--target=".length) || (flagIndex >= 0 ? argv[flagIndex + 1] : "all");
}

function generatedFiles(target) {
  const files = [];
  if (target === "all" || target === "english") {
    files.push(
      "src/open-english.js",
      "src/open-english-dictionary.js",
      "src/open-english-dictionary-meta.js"
    );
  }
  if (target === "all" || target === "cantonese") {
    files.push(
      "src/open-cantonese.js",
      "src/cantonese-interviews.js",
      "assets/audio/cantonese/spice-vf19a-family-language.wav",
      ...["m", "d1", "d2", "r1", "r2"].map((id) => `assets/audio/cantonese/hkcancor-${id}.mp3`)
    );
  }
  return files.map((path) => resolve(projectRoot, path));
}

async function hashFile(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function runNode(script, args = []) {
  await run(process.execPath, [resolve(projectRoot, script), ...args]);
}

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, LEAFBOUND_CONTENT_UPDATE: "1" }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function writeReport(report) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const target = requestedTarget(process.argv.slice(2));
if (!allowedTargets.has(target)) {
  throw new Error(`Unknown content target "${target}". Use all, english, or cantonese.`);
}

const files = generatedFiles(target);
const backups = new Map();
const before = new Map();
for (const path of files) {
  backups.set(path, existsSync(path) ? await readFile(path) : null);
  before.set(path, await hashFile(path));
}

const startedAt = new Date().toISOString();
try {
  if (target === "all" || target === "english") {
    await runNode("scripts/import-english-sources.mjs");
    await runNode("scripts/prepare-english-dictionary.mjs");
    await runNode("scripts/import-english-dictionary.mjs");
  }
  if (target === "all" || target === "cantonese") {
    await runNode("scripts/import-cantonese-sources.mjs");
    await runNode("scripts/import-spice-interview-audio.mjs");
  }

  const testFiles = (await readdir(resolve(projectRoot, "tests")))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => resolve(projectRoot, "tests", name));
  await run(process.execPath, ["--test", "--test-isolation=none", ...testFiles]);

  const changedFiles = [];
  for (const path of files) {
    if (before.get(path) !== await hashFile(path)) changedFiles.push(path.slice(projectRoot.length + 1).replaceAll("\\", "/"));
  }
  const report = {
    status: "success",
    target,
    startedAt,
    finishedAt: new Date().toISOString(),
    changedFiles
  };
  await writeReport(report);
  console.log(`LEAFBOUND_CONTENT_REPORT=${JSON.stringify(report)}`);
} catch (error) {
  for (const [path, content] of backups) {
    if (content === null) {
      if (existsSync(path)) await unlink(path);
    } else {
      await writeFile(path, content);
    }
  }
  const report = {
    status: "failed",
    target,
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error.message,
    restoredGeneratedFiles: true
  };
  await writeReport(report);
  console.error(`LEAFBOUND_CONTENT_REPORT=${JSON.stringify(report)}`);
  throw error;
}
