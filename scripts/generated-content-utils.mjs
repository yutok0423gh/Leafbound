import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export function contentDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function readGeneratedExport(moduleUrl, exportName) {
  try {
    const url = moduleUrl instanceof URL ? moduleUrl : new URL(moduleUrl, import.meta.url);
    const module = await import(`${url.href}?leafbound=${Date.now()}`);
    return module[exportName] || null;
  } catch {
    return null;
  }
}

export function stableSnapshot(previousSnapshot, payload, content) {
  const digest = contentDigest(content);
  const generatedAt = previousSnapshot?.contentDigest === digest && previousSnapshot?.generatedAt
    ? previousSnapshot.generatedAt
    : new Date().toISOString();
  return {
    generatedAt,
    contentDigest: digest,
    ...payload
  };
}

export async function writeTextIfChanged(path, content) {
  let previous = "";
  try {
    previous = await readFile(path, "utf8");
  } catch {
    // A missing generated file is expected on the first import.
  }
  if (previous === content) return false;
  await writeFile(path, content, "utf8");
  return true;
}
