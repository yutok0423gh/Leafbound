import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const draftRoot = new URL("../data/classical-translations/drafts/", import.meta.url);
const batchUrl = new URL("../data/classical-translations/review-batch.json", import.meta.url);

test("the public draft batch records all 100 owner-approved initial triage decisions", async () => {
  const files = (await readdir(draftRoot)).filter((name) => name.endsWith(".jsonl")).sort();
  assert.deepEqual(files, ["ci.jsonl", "poetry.jsonl", "prose.jsonl", "yuanqu.jsonl"]);

  const records = [];
  for (const file of files) {
    const body = await readFile(new URL(file, draftRoot), "utf8");
    records.push(...body.split(/\r?\n/u).filter(Boolean).map(JSON.parse));
  }
  assert.equal(records.length, 100);
  assert.ok(records.every((record) => record.status === "pending-review"));
  assert.ok(records.every((record) => record.editorialTriage === "initially-usable"));
  assert.ok(records.every((record) => record.review?.reviewer === "Leafbound owner"));

  const corrected = records.find((record) => record.id === "open-caocao-c6f2e325b4f071ea6066");
  assert.match(corrected.paragraphs.join(""), /初冬.*棕熊.*農具/u);
  assert.doesNotMatch(corrected.paragraphs.join(""), /深冬|熊與豹|錢幣/u);
});

test("the review batch audit file preserves the decision boundary and corrections", async () => {
  const batch = JSON.parse(await readFile(batchUrl, "utf8"));
  assert.equal(batch.recordCount, 100);
  assert.equal(batch.decision, "initially-usable");
  assert.equal(batch.formalStatus, "pending-review");
  assert.equal(batch.productionReady, false);
  assert.equal(batch.corrections.length, 1);
  assert.equal(batch.corrections[0].changes.length, 3);
});
