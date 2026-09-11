import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

test("the web manifest provides installable PNG icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);

  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    const bytes = await readFile(new URL(icon.src.replace(/^\.\//, ""), root));
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    const expected = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), expected);
    assert.equal(bytes.readUInt32BE(20), expected);
  }
});

test("the PWA client is registered and its cache excludes media and cross-origin requests", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  const serviceWorker = await readFile(new URL("service-worker.js", root), "utf8");
  assert.match(index, /src="\.\/src\/pwa\.js"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /isMediaRequest\(request, url\)/);
  assert.doesNotMatch(serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] || "", /assets\/audio/);
});

test("weekly content uses the newest online response and keeps that same version offline", async () => {
  const listeners = {};
  const stored = new Map();
  let offline = false;
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  runInNewContext(worker, {
    URL, Response,
    self: {
      registration: { scope: "https://example.org/Leafbound/" },
      location: { origin: "https://example.org" },
      addEventListener: (name, callback) => { listeners[name] = callback; }
    },
    caches: {
      open: async () => ({
        put: async (request, response) => stored.set(request.url, await response.text()),
        match: async (request) => stored.has(request.url) ? new Response(stored.get(request.url)) : undefined
      }),
      match: async () => new Response("old installation snapshot")
    },
    fetch: async () => {
      if (offline) throw new Error("offline");
      const response = new Response("latest weekly content");
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    }
  });
  const request = new Request("https://example.org/Leafbound/src/content-release.js");
  const dispatch = async () => {
    let result;
    listeners.fetch({ request, respondWith: (promise) => { result = promise; } });
    return (await result).text();
  };
  assert.equal(await dispatch(), "latest weekly content");
  offline = true;
  assert.equal(await dispatch(), "latest weekly content");
});
