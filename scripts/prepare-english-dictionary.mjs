import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, ".tmp-data", "english-dictionary");

const archives = [
  {
    name: "OMW English Wordnet 2.0",
    url: "https://github.com/omwn/omw-data/releases/download/v2.0/omw-en-2.0.tar.xz",
    archive: resolve(sourceRoot, "omw-en-2.0.tar.xz"),
    extractTo: resolve(sourceRoot, "en"),
    required: resolve(sourceRoot, "en", "omw-en", "omw-en.xml"),
    algorithm: "sha256",
    checksum: "0e09dfb7f096bc3f10b9de68ffecf13839fa22ae46fd9b227cec890d204ca1dc"
  },
  {
    name: "Chinese Open Wordnet 2.0",
    url: "https://github.com/omwn/omw-data/releases/download/v2.0/omw-cmn-2.0.tar.xz",
    archive: resolve(sourceRoot, "omw-cmn-2.0.tar.xz"),
    extractTo: resolve(sourceRoot, "cmn"),
    required: resolve(sourceRoot, "cmn", "omw-cmn", "omw-cmn.xml"),
    algorithm: "sha256",
    checksum: "7d07af60a6ced0cedc4ca114d0b60a796d3f138df0f3be21f6322e53d004e91c"
  },
  {
    name: "FreeDict eng-zho 2025.11.23",
    url: "https://download.freedict.org/dictionaries/eng-zho/2025.11.23/freedict-eng-zho-2025.11.23.src.tar.xz",
    archive: resolve(sourceRoot, "freedict-eng-zho-2025.11.23.src.tar.xz"),
    extractTo: resolve(sourceRoot, "freedict"),
    required: resolve(sourceRoot, "freedict", "eng-zho", "eng-zho.tei"),
    algorithm: "sha512",
    checksum: "25aed0f1d7de68919aa9da1ba92d67f566ae4ea81660f42071c81fc21e56d4b210d61df379315678648c45ca7e52c4a0ba2eec009fbaab7c72e7472489e1fc4c"
  }
];

async function digestFile(path, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function ensureArchive(source) {
  if (existsSync(source.archive)) {
    const cachedChecksum = await digestFile(source.archive, source.algorithm);
    if (cachedChecksum === source.checksum) return "cached";
  }

  let buffer;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(source.url, {
        headers: { "user-agent": "Leafbound dictionary build/0.1" },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000)
      });
    } catch (error) {
      lastError = error;
    }
    if (response?.ok) {
      buffer = Buffer.from(await response.arrayBuffer());
      break;
    }
    if (response) {
      const error = new Error(`${source.url} returned ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1_000));
  }
  if (!buffer) throw lastError || new Error(`${source.url} could not be downloaded`);
  const checksum = createHash(source.algorithm).update(buffer).digest("hex");
  if (checksum !== source.checksum) {
    throw new Error(`${source.name} checksum mismatch: expected ${source.checksum}, received ${checksum}`);
  }
  await mkdir(dirname(source.archive), { recursive: true });
  await writeFile(source.archive, buffer);
  return "downloaded";
}

const results = [];
for (const source of archives) {
  if (existsSync(source.required)) {
    results.push({ name: source.name, status: "ready" });
    continue;
  }
  const archiveStatus = await ensureArchive(source);
  await mkdir(source.extractTo, { recursive: true });
  await run("tar", ["-xJf", source.archive, "-C", source.extractTo]);
  if (!existsSync(source.required)) throw new Error(`${source.name} did not contain ${source.required}`);
  results.push({ name: source.name, status: archiveStatus === "cached" ? "extracted" : "downloaded and extracted" });
}

console.log(JSON.stringify({ dictionaryInputs: results }, null, 2));
