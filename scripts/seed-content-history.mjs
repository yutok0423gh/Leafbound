import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { articles, episodes } from "../src/data.js";
import { englishDiscoveries } from "../src/open-english.js";
import { emptyContentHistory, historyUrl, rememberArticle, saveContentHistory } from "./content-history.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
if (existsSync(historyUrl)) throw new Error("Content history already exists; refusing to reset collected-article identities");
if (git("rev-parse", "--is-shallow-repository") !== "false") throw new Error("Fetch the full Git history before seeding");
const history = emptyContentHistory();
history.seededThroughCommit = git("rev-parse", "HEAD");
function generatedRecords(text, exportName) {
  const prefix = `export const ${exportName} = Object.freeze(`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`Cannot locate historical ${exportName}`);
  const jsonStart = start + prefix.length;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = jsonStart; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(jsonStart, index + 1));
    }
  }
  throw new Error(`Incomplete historical ${exportName}`);
}
const sources = [
  ["english", "src/open-english.js", "englishDiscoveries"],
  ["cantonese", "src/open-cantonese.js", "openCantoneseEpisodes"],
  ["cantonese", "src/cantonese-interviews.js", "cantoneseInterviewEpisodes"]
];
for (const [language, path, exportName] of sources) {
  const commits = git("rev-list", "--reverse", "HEAD", "--", path).split(/\s+/).filter(Boolean);
  const blobs = new Set();
  for (const commit of commits) {
    const blob = git("rev-parse", `${commit}:${path}`);
    if (blobs.has(blob)) continue;
    blobs.add(blob);
    const text = git("show", `${commit}:${path}`);
    const records = generatedRecords(text, exportName);
    records.forEach((article) => rememberArticle(history.languages[language], article));
  }
  console.log(`${language}: scanned ${blobs.size} historical ${path} versions`);
}
[...articles, ...englishDiscoveries].forEach((article) => rememberArticle(history.languages.english, article));
episodes.forEach((article) => rememberArticle(history.languages.cantonese, article));
await saveContentHistory(history);
console.log(JSON.stringify(Object.fromEntries(Object.entries(history.languages).map(([language, shelf]) => [language, shelf.records.length]))));
