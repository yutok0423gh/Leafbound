import test from "node:test";
import assert from "node:assert/strict";
import { contentWeekKey } from "../src/content-schedule.js";
import { articleKeys, canonicalContentUrl, createWeeklyIntake, emptyContentHistory, rememberArticle } from "../scripts/content-history.mjs";

const now = new Date("2026-09-14T01:00:00Z");
const article = (id) => ({ id, title: `Story ${id}`, sourceId: "fixture", sourceUrl: `https://example.org/${id}/`, paragraphs: [`Distinct full article ${id}`] });

test("weekly quotas switch at Monday 09:00 in Shanghai across month and year boundaries", () => {
  assert.equal(contentWeekKey("2026-09-14T00:59:59Z"), "2026-09-07");
  assert.equal(contentWeekKey(now), "2026-09-14");
  assert.equal(contentWeekKey("2026-09-20T23:59:59Z"), "2026-09-14");
  assert.equal(contentWeekKey("2027-01-01T12:00:00Z"), "2026-12-28");
  assert.throws(() => contentWeekKey("not a date"));
});

test("old articles stay excluded after removal, URL tracking changes, renames, and identical text reposts", () => {
  const history = emptyContentHistory();
  rememberArticle(history.languages.english, article("old"));
  const intake = createWeeklyIntake(history, "english", [], now);
  assert.equal(intake.accept({ ...article("old"), paragraphs: ["Updated body"] }), false);
  assert.equal(intake.accept({ ...article("renamed"), sourceUrl: "http://www.example.org/old?utm_source=mail#top" }), false);
  assert.equal(intake.accept({ ...article("reposted"), paragraphs: ["Distinct FULL article old!!!"] }), false);
  assert.equal(intake.accept(article("new")), true);
  assert.equal(intake.accept(article("new")), false);
  assert.equal(canonicalContentUrl("https://example.org/read?b=2&utm_medium=email&a=1"), "https://example.org/read?a=1&b=2");
  assert.notEqual(canonicalContentUrl("https://example.org/read?id=1"), canonicalContentUrl("https://example.org/read?id=2"));
});

test("same-week retries fill shortages but never exceed twenty, and later weeks still exclude prior selections", () => {
  const history = emptyContentHistory();
  let intake = createWeeklyIntake(history, "english", [], now);
  for (let index = 0; index < 8; index += 1) intake.accept(article(String(index)));
  assert.equal(intake.finish().shortfall, 12);
  intake = createWeeklyIntake(history, "english", [], new Date("2026-09-15T03:00:00Z"));
  for (let index = 0; index < 40; index += 1) intake.accept(article(String(index)));
  assert.equal(intake.additions.length, 12);
  assert.equal(intake.finish().addedThisWeek, 20);
  const savedIssue = structuredClone(history.languages.english.weeks["2026-09-14"]);
  intake = createWeeklyIntake(history, "english", [], new Date("2026-09-16T03:00:00Z"));
  assert.equal(intake.remaining, 0);
  assert.equal(intake.accept(article("extra")), false);
  intake.finish();
  assert.deepEqual(history.languages.english.weeks["2026-09-14"], savedIssue);
  intake = createWeeklyIntake(history, "english", [], new Date("2026-09-21T01:00:00Z"));
  assert.equal(intake.remaining, 20);
  assert.equal(intake.accept(article("0")), false);
  assert.equal(intake.accept(article("extra")), true);
  assert.equal(intake.finish().shortfall, 19);
});

test("existing library content is baseline, and language quotas are independent", () => {
  const history = emptyContentHistory();
  const english = createWeeklyIntake(history, "english", [article("manual")], now);
  assert.equal(english.accept(article("manual")), false);
  english.accept(article("en"));
  english.finish();
  const cantonese = createWeeklyIntake(history, "cantonese", [], now);
  assert.equal(cantonese.remaining, 20);
  assert.equal(cantonese.accept({ ...article("yue"), paragraphs: undefined, transcript: [{ text: "我哋一齊睇新文章。" }] }), true);
  assert.equal(cantonese.finish().shortfall, 19);
  assert.ok(articleKeys({ ...article("yue"), textDocumentUrl: "https://docs.google.com/document/d/fixture/edit" }).includes("document:fixture"));
});

test("uncommitted intake does not blacklist articles when its transaction is discarded", () => {
  const savedHistory = emptyContentHistory();
  const failedHistory = structuredClone(savedHistory);
  const failedIntake = createWeeklyIntake(failedHistory, "english", [], now);
  failedIntake.accept(article("retry"));
  failedIntake.finish();
  const retry = createWeeklyIntake(savedHistory, "english", [], now);
  assert.equal(retry.accept(article("retry")), true);
});
