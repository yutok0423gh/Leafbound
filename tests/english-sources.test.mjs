import test from "node:test";
import assert from "node:assert/strict";

import {
  englishDiscoveries,
  englishSourceCatalog,
  englishSourceSnapshot
} from "../src/open-english.js";

test("English source snapshot contains readable text from four connected public source families", () => {
  assert.equal(englishSourceCatalog.length, 5);
  assert.equal(englishSourceSnapshot.itemCount, englishDiscoveries.length);
  assert.equal(englishSourceSnapshot.feeds.length, 7);
  assert.ok(englishDiscoveries.length >= 50);
  assert.equal(englishSourceSnapshot.fullArticleCount + englishSourceSnapshot.chapterCount, englishDiscoveries.length);
  assert.ok(englishSourceSnapshot.fullArticleCount >= 40);
  assert.ok(englishSourceSnapshot.chapterCount >= 10);
  assert.ok(new Date(englishSourceSnapshot.generatedAt).getTime() > 0);
  assert.match(englishSourceSnapshot.contentDigest, /^[a-f0-9]{64}$/);

  const counts = Object.fromEntries(
    ["VOA Learning English", "NASA", "Standard Ebooks", "Global Voices"].map((source) => [
      source,
      englishDiscoveries.filter((item) => item.source === source).length
    ])
  );
  assert.ok(counts["VOA Learning English"] >= 20);
  assert.ok(counts.NASA >= 8);
  assert.ok(counts["Standard Ebooks"] >= 10);
  assert.ok(counts["Global Voices"] >= 10);
});

test("connected English text remains traceable, sanitized, and usable by the reader", () => {
  const allowedHosts = new Set([
    "learningenglish.voanews.com",
    "www.nasa.gov",
    "science.nasa.gov",
    "standardebooks.org",
    "globalvoices.org"
  ]);
  const categories = new Set(englishDiscoveries.map((item) => item.category));
  assert.deepEqual([...categories].sort(), ["文化", "文學", "科學", "語言", "生活"].sort());

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
    assert.doesNotMatch(item.paragraphs.join(" "), /\p{Script=Han}/u);
    item.paragraphs.forEach((paragraph) => {
      assert.equal(typeof paragraph, "string");
      assert.doesNotMatch(paragraph, /<\/?(?:script|style|iframe|img|video|audio)\b/i);
    });
    if (item.source === "VOA Learning English") {
      assert.doesNotMatch([item.deck, ...item.paragraphs].join(" "), /\b(?:AP|AFP|Reuters|Associated Press|Agence France-Presse)\b/i);
    }
    if (item.source === "Standard Ebooks") assert.equal(item.contentScope, "chapter");
    if (item.source === "Global Voices") {
      assert.equal(item.contentScope, "full");
      assert.match(item.license, /CC BY 3\.0/);
      assert.match(item.attribution, /^Text: .+ · Originally published by Global Voices · Plain-text adaptation: Leafbound$/);
      assert.doesNotMatch(item.paragraphs.join(" "), /content-sharing agreement|republished from/i);
      assert.doesNotMatch(item.paragraphs.join(" "), /\b(?:Photo|Image|Screenshot)\b.*\b(?:fair use|used with permission|courtesy)\b/i);
    }
  });
});
