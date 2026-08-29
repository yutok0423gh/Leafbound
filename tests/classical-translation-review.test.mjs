import test from "node:test";
import assert from "node:assert/strict";
import {
  createReviewHtml,
  loadReviewRecords,
  summarizeReviewRecords
} from "../scripts/build-classical-translation-review.mjs";

test("the review desk exposes the exact 100-record initially-usable batch", async () => {
  const { records } = await loadReviewRecords();
  const summary = summarizeReviewRecords(records);

  assert.equal(summary.total, 100);
  assert.deepEqual(summary.byKind, { 詩: 25, 詞: 25, 曲: 25, 古文: 25 });
  assert.deepEqual(summary.statusCounts, { "pending-review": 100 });
  assert.equal(summary.initiallyUsable, 100);
  assert.equal(summary.productionReady, 0);
  assert.equal(summary.structuralWarnings, 44);
  assert.equal(summary.structurallyClear, 56);
  assert.equal(summary.sourceMatches, 100);
  assert.equal(summary.knownIssues, 0);
  assert.equal(summary.resolvedIssues, 1);
  assert.equal(summary.priority, 44);
});

test("the known Mengdong, pi, and qianbo mistranslations are corrected before triage", async () => {
  const { records } = await loadReviewRecords();
  const qianbo = records.find((record) => record.id === "open-caocao-c6f2e325b4f071ea6066");

  assert.ok(qianbo);
  assert.equal(qianbo.warnings.length, 0);
  assert.equal(qianbo.editorialTriage, "initially-usable");
  assert.equal(qianbo.derivedIssues.length, 0);
  assert.equal(qianbo.resolvedIssues[0]?.code, "known-terms-corrected");
  assert.match(qianbo.sourceLines.join(""), /孟冬.*熊羆.*錢鎛/u);
  assert.match(qianbo.translationParagraphs.join(""), /初冬.*棕熊.*農具/u);
  assert.match(qianbo.sourceLines.join(""), /錢鎛停置/);
  assert.doesNotMatch(qianbo.translationParagraphs.join(""), /深冬|熊與豹|錢幣/u);
});

test("the generated review page is standalone, local-only, and links back to exact readers", async () => {
  const { records } = await loadReviewRecords();
  const summary = summarizeReviewRecords(records);
  const html = await createReviewHtml(records, summary);

  assert.match(html, /Leafbound · 古典今譯校樣台/);
  assert.match(html, /leafbound\.classical-translation-review\.v1/);
  assert.match(html, /open-caocao-c6f2e325b4f071ea6066/);
  assert.match(html, /\.\.\/#poetry\//);
  assert.doesNotMatch(html, /<script[^>]+src=/u);
  assert.doesNotMatch(html, /<link[^>]+https?:/u);
  assert.doesNotMatch(html, /fetch\s*\(/u);
});
