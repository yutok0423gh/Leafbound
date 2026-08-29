import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeFiles = [
  "index.html",
  "src/app.js",
  "src/store.js",
  "src/pwa.js",
  "service-worker.js",
  "src/english.js",
  "src/cantonese-lexicon.js",
  "src/classical-translations.js",
  "src/voice.js"
];

async function readRuntime() {
  const entries = await Promise.all(runtimeFiles.map(async (file) => [file, await readFile(file, "utf8")]));
  return Object.fromEntries(entries);
}

test("runtime has no cloud persistence, analytics, or outbound write primitives", async () => {
  const sources = await readRuntime();
  const combined = Object.values(sources).join("\n");

  for (const forbidden of [
    /\b(?:sendBeacon|XMLHttpRequest|WebSocket|EventSource)\b/,
    /(?:firebaseio\.com|supabase\.co|api\.segment\.io|cdn\.segment\.com|api\.mixpanel\.com|plausible\.io|google-analytics\.com)/i,
    /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,
    /fetch\s*\(\s*["']https?:\/\//i
  ]) assert.doesNotMatch(combined, forbidden);

  assert.match(sources["index.html"], /connect-src 'self'/);
  assert.match(sources["index.html"], /form-action 'none'/);
});

test("personal state uses local browser stores and cookies exist only for one-time deletion", async () => {
  const sources = await readRuntime();
  const store = sources["src/store.js"];
  const app = sources["src/app.js"];

  assert.match(store, /storage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  assert.match(store, /createIndexedDbPersonalState/);
  assert.match(store, /PERSONAL_DATABASE_NAME = "leafbound-personal-v1"/);
  assert.match(store, /backend: "indexeddb"/);
  assert.match(store, /Max-Age=0/);
  assert.doesNotMatch(store, /Max-Age=(?!0)\d+/);
  assert.doesNotMatch(store, /preferencesCookie\?\.write|documentRef\.cookie\s*=\s*serialize/);
  assert.doesNotMatch(app, /document\.cookie|PREFERENCES_COOKIE_KEY/);
});

test("runtime content requests remain GET-only and same-origin", async () => {
  const sources = await readRuntime();
  const requestModules = [
    sources["src/cantonese-lexicon.js"],
    sources["src/classical-translations.js"]
  ].join("\n");

  assert.doesNotMatch(requestModules, /method\s*:/i);
  assert.doesNotMatch(requestModules, /fetch\s*\(\s*["']https?:\/\//i);
  assert.match(sources["src/classical-translations.js"], /url\.origin !== translationManifestUrl\.origin/);
});
