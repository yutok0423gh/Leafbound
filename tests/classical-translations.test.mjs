import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  classicalTranslationErrorCodes,
  classicalTranslationSnapshot,
  getClassicalTranslation,
  isClassicalTranslationUnavailableError,
  loadClassicalTranslation
} from "../src/classical-translations.js";
import {
  openClassicalTranslations,
  openClassicalTranslationSnapshot
} from "../src/open-classical-translations.js";
import { openPoems } from "../src/open-poems.js";
import {
  buildTranslationArtifacts,
  createTranslationPlan,
  shardIdFor
} from "../scripts/classical-translation-pipeline.mjs";

test("classical translation snapshot separates editorial and open references", () => {
  assert.equal(classicalTranslationSnapshot.openCount, 122);
  assert.equal(classicalTranslationSnapshot.editorialCount, 56);
  assert.equal(classicalTranslationSnapshot.count, 178);
  assert.deepEqual(classicalTranslationSnapshot.byKind, { 曲: 55, 詞: 122, 古文: 1 });
});

test("the requested Guwen Guanzhi reader has a paragraph-aligned modern translation", () => {
  const translation = getClassicalTranslation("open-guwen-87c7a29cd59b3c40239e");
  assert.ok(translation);
  assert.equal(translation.kind, "古文");
  assert.equal(translation.paragraphs.length, 4);
  assert.match(translation.paragraphs[0], /大軍逼近許都/);
  assert.match(translation.paragraphs[3], /可以說是懂得禮/);
  assert.equal(translation.source.label, "Leafbound 今譯");
});

test("curated Yuan-qu translations remain distinct from imported machine references", () => {
  const translation = getClassicalTranslation("open-yuanqu-d41385a16ad94a6be834");
  assert.ok(translation);
  assert.equal(translation.kind, "曲");
  assert.match(translation.paragraphs[0], /漂泊天涯的旅人/);
  assert.equal(translation.source.status, "現代中文重述 · 編輯稿");
});

test("the first Yuan-qu shelf no longer contains untranslated reading units", () => {
  const firstShelf = openPoems.filter((poem) => poem.kind === "曲").slice(0, 24);
  assert.equal(firstShelf.length, 24);
  for (const poem of firstShelf) {
    const translation = getClassicalTranslation(poem);
    assert.ok(translation, `${poem.id} ${poem.title}`);
    assert.equal(translation.kind, "曲");
    assert.ok(translation.paragraphs.join("").length >= 30, poem.id);
    assert.equal(translation.source.label, "Leafbound 今譯");
  }

  const requested = getClassicalTranslation("open-yuanqu-9493c1fa7adc30eea82a");
  assert.match(requested.paragraphs[0], /哪裏懂得兒女婚聘、締結秦晉之好/);
});

test("every reading unit from Zha Nizi Tiao Fengyue has an editorial translation", () => {
  const completePlay = openPoems.filter((poem) => poem.kind === "曲" && poem.title.startsWith("詐妮子調風月"));
  assert.equal(completePlay.length, 50);
  for (const poem of completePlay) {
    const translation = getClassicalTranslation(poem);
    assert.ok(translation, `${poem.id} ${poem.title}`);
    assert.equal(translation.source.status, "現代中文重述 · 編輯稿");
  }
});

test("open translations only attach to exact existing ci records and retain provenance", () => {
  const poemById = new Map(openPoems.map((poem) => [poem.id, poem]));
  assert.equal(Object.keys(openClassicalTranslations).length, openClassicalTranslationSnapshot.count);
  for (const [id, translation] of Object.entries(openClassicalTranslations)) {
    assert.equal(poemById.get(id)?.kind, "詞", id);
    assert.ok(translation.paragraphs.length > 0, id);
    assert.equal(translation.source.license, "Apache-2.0");
    assert.match(translation.source.status, /未經 Leafbound 人工校訂/);
    assert.doesNotMatch(translation.source.sourceUrl, /gushiwen\.cn/);
  }
});

test("classical translation loader distinguishes unavailable catalogs from retryable shard failures", async (context) => {
  const originalFetch = globalThis.fetch;
  const dataRoot = await mkdtemp(join(tmpdir(), "leafbound-loader-artifacts-"));
  const plan = createTranslationPlan();
  const eligibleJobs = plan.jobs.filter((job) => job.sourceCharacterCount >= 20);
  const successJob = eligibleJobs[0];
  const retryJob = eligibleJobs.find((job) => shardIdFor(job.id) !== shardIdFor(successJob.id));
  assert.ok(successJob && retryJob, "fixture jobs must exercise separate SHA-256 shards");

  const draftFor = (job, marker, sourceLabel) => ({
    id: job.id,
    kind: job.kind,
    paragraphs: [marker.repeat(Math.ceil(job.sourceCharacterCount * 0.8))],
    status: "machine_draft",
    sourceLabel,
    model: "offline-test-model",
    modelRevision: "fixture-1",
    promptVersion: "test-v1",
    sourceHash: job.sourceHash,
    warnings: []
  });

  const built = await buildTranslationArtifacts({
    plan,
    dataRoot,
    draftRecords: [
      draftFor(successJob, "甲", "Test batch A"),
      draftFor(retryJob, "乙", "Test batch B")
    ]
  });
  assert.equal(built.ok, true);
  const manifest = JSON.parse(await readFile(join(dataRoot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.shardStrategy, { algorithm: "sha256-id-prefix", prefixLength: 2 });
  assert.ok(manifest.shards.every((shard) => shard.id && shard.path === undefined));
  const generatedShardIds = new Set(manifest.shards.map((shard) => shard.id));
  let notIncludedId = "loader-not-included-0";
  for (let suffix = 1; generatedShardIds.has(shardIdFor(notIncludedId)); suffix += 1) {
    notIncludedId = `loader-not-included-${suffix}`;
  }

  const calls = [];
  let retryAttempts = 0;
  let manifestResponseMode = "missing";
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.endsWith("/data/classical-translations/manifest.json")) {
      if (manifestResponseMode === "missing") return new Response("not found", { status: 404 });
      if (manifestResponseMode === "html") return new Response("<!doctype html><title>Not found</title>", { status: 200 });
      return new Response(await readFile(join(dataRoot, "manifest.json"), "utf8"), { status: 200 });
    }
    const shardMatch = href.match(/\/data\/classical-translations\/shards\/([0-9a-f]{2})\.json$/u);
    if (shardMatch) {
      if (shardMatch[1] === shardIdFor(retryJob.id)) {
        retryAttempts += 1;
        if (retryAttempts === 1) return new Response("temporary failure", { status: 503 });
      }
      return new Response(await readFile(join(dataRoot, "shards", `${shardMatch[1]}.json`), "utf8"), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const synchronous = await loadClassicalTranslation("open-guwen-87c7a29cd59b3c40239e");
  assert.match(synchronous.paragraphs[0], /大軍逼近許都/);
  assert.equal(calls.length, 0, "synchronous translations must not fetch the manifest");

  await assert.rejects(loadClassicalTranslation("loader-catalog-missing"), (error) => {
    assert.equal(error.code, classicalTranslationErrorCodes.catalogUnavailable);
    assert.equal(isClassicalTranslationUnavailableError(error), true);
    assert.match(error.message, /尚未發布/);
    return true;
  });

  manifestResponseMode = "html";
  await assert.rejects(loadClassicalTranslation("loader-catalog-html"), (error) => {
    assert.equal(error.code, classicalTranslationErrorCodes.catalogUnavailable);
    assert.equal(isClassicalTranslationUnavailableError(error), true);
    assert.match(error.message, /不是有效的 JSON/);
    return true;
  });

  manifestResponseMode = "generated";
  await assert.rejects(loadClassicalTranslation(notIncludedId), (error) => {
    assert.equal(error.code, classicalTranslationErrorCodes.notIncluded);
    assert.equal(isClassicalTranslationUnavailableError(error), true);
    assert.match(error.message, /尚未收錄/);
    return true;
  });

  const loaded = await loadClassicalTranslation(successJob);
  assert.deepEqual(loaded.paragraphs, ["甲".repeat(Math.ceil(successJob.sourceCharacterCount * 0.8))]);
  assert.equal(loaded.kind, successJob.kind);
  assert.equal(loaded.source.label, "Test batch A");
  assert.equal(loaded.source.model, "offline-test-model");
  assert.equal(loaded.source.modelRevision, "fixture-1");
  assert.equal(loaded.source.promptVersion, "test-v1");
  assert.equal(loaded.source.status, "機器草稿");
  assert.equal(loaded.source.reviewStatus, "machine-draft");
  assert.equal(loaded.source.productionReady, false);
  assert.equal(loaded.sourceHash, successJob.sourceHash);
  assert.strictEqual(getClassicalTranslation(successJob.id), loaded);

  const cached = await loadClassicalTranslation(successJob.id);
  assert.strictEqual(cached, loaded);
  assert.equal(calls.filter((href) => href.endsWith(`${shardIdFor(successJob.id)}.json`)).length, 1);
  assert.equal(calls.filter((href) => href.endsWith("manifest.json")).length, 3);

  await assert.rejects(loadClassicalTranslation(retryJob), (error) => {
    assert.equal(isClassicalTranslationUnavailableError(error), false);
    assert.match(error.message, /503/);
    return true;
  });
  const retried = await loadClassicalTranslation(retryJob);
  assert.deepEqual(retried.paragraphs, ["乙".repeat(Math.ceil(retryJob.sourceCharacterCount * 0.8))]);
  assert.equal(retried.kind, retryJob.kind);
  assert.equal(retried.source.label, "Test batch B");
  assert.equal(retried.source.model, "offline-test-model");
  assert.equal(retried.source.status, "機器草稿");
  assert.equal(retried.source.reviewStatus, "machine-draft");
  assert.equal(retried.source.productionReady, false);
  assert.equal(retryAttempts, 2, "failed shard requests must not stay cached");
});
