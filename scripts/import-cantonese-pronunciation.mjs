import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_REVISION = "259f0e48bba840c3a2e0d117539e96937f3d89bc";
const SOURCE_FILE = "jyut6ping3.chars.dict.yaml";
const SOURCE_URL = `https://raw.githubusercontent.com/rime/rime-cantonese/${SOURCE_REVISION}/${SOURCE_FILE}`;
const REPOSITORY_URL = "https://github.com/rime/rime-cantonese";
const LICENSE_URL = `https://github.com/rime/rime-cantonese/blob/${SOURCE_REVISION}/LICENSE-CC-BY`;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "data", "rime-cantonese-chars.json");

const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "Leafbound local data importer" }
});
if (!response.ok) throw new Error(`Unable to download Rime Cantonese character data: HTTP ${response.status}`);

const source = await response.text();
const version = source.match(/^version:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim() || "unknown";
const candidates = new Map();
let inDictionary = false;
let sourceOrder = 0;

for (const line of source.split(/\r?\n/)) {
  if (line.trim() === "...") {
    inDictionary = true;
    continue;
  }
  if (!inDictionary || !line || line.startsWith("#")) continue;

  const [character, reading, weight = ""] = line.split("\t");
  if (Array.from(character || "").length !== 1 || !/\p{Script=Han}/u.test(character)) continue;
  if (!/^[a-z]+[1-6]$/.test(reading || "")) continue;

  const item = { reading, weighted: Boolean(weight), order: sourceOrder };
  sourceOrder += 1;
  const existing = candidates.get(character) || [];
  if (!existing.some((candidate) => candidate.reading === reading)) existing.push(item);
  candidates.set(character, existing);
}

const entries = Object.fromEntries(
  [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "zh-Hant"))
    .map(([character, readings]) => [
      character,
      readings
        .sort((left, right) => Number(left.weighted) - Number(right.weighted) || left.order - right.order)
        .map(({ reading }) => reading)
    ])
);

const payload = {
  meta: {
    source: "Rime Cantonese · jyut6ping3.chars",
    repository: REPOSITORY_URL,
    sourceUrl: SOURCE_URL,
    sourceRevision: SOURCE_REVISION,
    sourceVersion: version,
    license: "CC BY 4.0",
    licenseUrl: LICENSE_URL,
    attribution: "Cantonese Computational Linguistics Infrastructure Development Workgroup (CanCLID)",
    entries: Object.keys(entries).length,
    transformation: "Normalized the upstream single-character Rime dictionary to JSON; unweighted readings are listed before weighted alternatives."
  },
  entries
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`Wrote ${payload.meta.entries.toLocaleString("en-US")} character entries to ${outputPath}`);
console.log(`Pinned Rime Cantonese ${version} at ${SOURCE_REVISION}`);
