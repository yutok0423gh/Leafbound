import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

