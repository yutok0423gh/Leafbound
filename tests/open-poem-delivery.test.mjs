import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getHydratedOpenPoem, loadOpenPoemContent } from "../src/open-poem-loader.js";
import { openPoemIndex } from "../src/open-poems-index.js";

test("the classical shelf ships a lightweight index with content shard pointers", () => {
  assert.equal(openPoemIndex.length, 17_367);
  assert.ok(openPoemIndex.every((poem) => /^[0-9a-f]{2}$/u.test(poem.contentShard)));
  assert.ok(openPoemIndex.every((poem) => poem.contentLoaded === false));
  assert.ok(openPoemIndex.every((poem) => poem.lineCount > 0));
  assert.ok(openPoemIndex.every((poem) => poem.lines.length <= 8), "the index must retain only a short quote preview");
});

test("a reader hydrates one full work from its local same-origin shard", async () => {
  const poem = openPoemIndex.find((candidate) => candidate.collection === "楚辭" && candidate.title === "離騷");
  assert.ok(poem);
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (input) => {
    fetchCount += 1;
    const path = fileURLToPath(new URL(String(input)));
    const body = await readFile(path);
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const hydrated = await loadOpenPoemContent(poem);
    const cached = await loadOpenPoemContent(poem);
    assert.equal(hydrated.contentLoaded, true);
    assert.equal(hydrated.lines.length, poem.lineCount);
    assert.ok(hydrated.lines.length > 100);
    assert.equal(hydrated.id, poem.id);
    assert.strictEqual(cached, hydrated, "opening the same work again should reuse its hydrated local record");
    assert.equal(fetchCount, 1, "opening the same work again must not fetch its shard twice");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one shard request hydrates multiple works and each hydrated poem is cached", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      schemaVersion: 1,
      shard: "fe",
      records: [
        ["cache-poem-a", [["甲句", "gaap3 geoi3"]], "甲注", "甲譯", "甲賞", "甲典"],
        ["cache-poem-b", ["乙句"], "乙注", "乙譯", "乙賞", "乙典"]
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const poemA = { id: "cache-poem-a", title: "甲", contentShard: "fe", contentLoaded: false };
  const poemB = { id: "cache-poem-b", title: "乙", contentShard: "fe", contentLoaded: false };

  try {
    const [firstA, concurrentA] = await Promise.all([
      loadOpenPoemContent(poemA),
      loadOpenPoemContent(poemA)
    ]);
    const secondA = await loadOpenPoemContent(poemA);
    const hydratedB = await loadOpenPoemContent(poemB);

    assert.equal(fetchCount, 1, "the shared shard and repeated poem must not be fetched again");
    assert.strictEqual(firstA, concurrentA);
    assert.strictEqual(firstA, secondA);
    assert.strictEqual(getHydratedOpenPoem(poemA.id), firstA);
    assert.equal(hydratedB.lines[0].text, "乙句");
    assert.equal(hydratedB.lines[0].jyutping, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an invalid shard schema is rejected instead of entering either cache", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      schemaVersion: 99,
      shard: "fd",
      records: []
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const poem = { id: "invalid-schema-poem", contentShard: "fd", contentLoaded: false };

  try {
    await assert.rejects(loadOpenPoemContent(poem), /古典正文分片格式無效/);
    await assert.rejects(loadOpenPoemContent(poem), /古典正文分片格式無效/);
    assert.equal(fetchCount, 2, "an invalid payload must be evicted so it can be repaired and retried");
    assert.equal(getHydratedOpenPoem(poem.id), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed shard fetch is evicted and the next request can succeed", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) return new Response("temporary failure", { status: 503 });
    return new Response(JSON.stringify({
      schemaVersion: 1,
      shard: "fc",
      records: [
        ["retry-poem", [["重試成功", "cung4 si3 sing4 gung1"]], "", "重試後今譯", "", ""]
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const poem = { id: "retry-poem", title: "重試", contentShard: "fc", contentLoaded: false };

  try {
    await assert.rejects(loadOpenPoemContent(poem), /古典正文載入失敗（503）/);
    const hydrated = await loadOpenPoemContent(poem);
    assert.equal(fetchCount, 2);
    assert.equal(hydrated.translation, "重試後今譯");
    assert.strictEqual(await loadOpenPoemContent(poem), hydrated);
    assert.equal(fetchCount, 2, "the successful retry should then be cached");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
