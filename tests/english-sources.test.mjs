import test from "node:test";
import assert from "node:assert/strict";

import {
  englishDiscoveries,
  englishSourceCatalog,
  englishSourceSnapshot
} from "../src/open-english.js";

test("English source snapshot contains readable text from the three connected public feeds", () => {
  assert.equal(englishSourceCatalog.length, 4);
  assert.equal(englishSourceSnapshot.itemCount, englishDiscoveries.length);
  assert.ok(englishDiscoveries.length >= 12);
  assert.equal(englishSourceSnapshot.fullArticleCount + englishSourceSnapshot.chapterCount, englishDiscoveries.length);
  assert.ok(englishSourceSnapshot.fullArticleCount >= 8);
  assert.ok(englishSourceSnapshot.chapterCount >= 1);
  assert.ok(new Date(englishSourceSnapshot.generatedAt).getTime() > 0);

  const counts = Object.fromEntries(
    ["VOA Learning English", "NASA", "Standard Ebooks"].map((source) => [
      source,
      englishDiscoveries.filter((item) => item.source === source).length
    ])
  );
  assert.ok(counts["VOA Learning English"] >= 4);
  assert.ok(counts.NASA >= 1);
  assert.ok(counts["Standard Ebooks"] >= 1);
});

test("connected English text remains traceable, sanitized, and usable by the reader", () => {
  const allowedHosts = new Set([
    "learningenglish.voanews.com",
    "www.nasa.gov",
    "science.nasa.gov",
    "standardebooks.org"
  ]);
  const categories = new Set(englishDiscoveries.map((item) => item.category));
  assert.deepEqual([...categories].sort(), ["文化", "文學", "科學", "語言"].sort());

  englishDiscoveries.forEach((item) => {
    assert.ok(item.title);
    assert.ok(item.deck);
    assert.ok(item.sourceFeed.startsWith("https://"));
    assert.ok(allowedHosts.has(new URL(item.sourceUrl).hostname), item.sourceUrl);
    assert.equal(item.access, "internal");
    assert.ok(["full", "chapter"].includes(item.contentScope));
    assert.ok(Array.isArray(item.paragraphs));
    assert.ok(item.paragraphs.length >= 3);
    assert.ok(item.paragraphs.join(" ").length >= 350);
    assert.deepEqual(item.phrases, []);
    assert.ok(item.license);
    assert.ok(item.attribution);
    item.paragraphs.forEach((paragraph) => {
      assert.equal(typeof paragraph, "string");
      assert.doesNotMatch(paragraph, /<\/?(?:script|style|iframe|img|video|audio)\b/i);
    });
    if (item.source === "VOA Learning English") {
      assert.doesNotMatch([item.deck, ...item.paragraphs].join(" "), /\b(?:AP|AFP|Reuters|Associated Press|Agence France-Presse)\b/i);
    }
    if (item.source === "Standard Ebooks") assert.equal(item.contentScope, "chapter");
  });
});
