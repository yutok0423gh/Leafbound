import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { localModelCapacity, runSemanticBatch, semanticBatchConcurrency } from "../scripts/semantic-batch-queue.mjs";

const gate = () => Promise.withResolvers();

test("two local slots retain 16K context per work; unsupported capacities fail closed", () => {
  for (const count of [1, 2]) {
    const capacity = localModelCapacity(count);
    assert.equal(capacity.contextSize / capacity.parallel, 16384);
  }
  assert.equal(localModelCapacity().parallel, 2);
  for (const value of [0, 3, 8, 1.5, "auto", NaN, null]) assert.throws(() => localModelCapacity(value));
});

test("local inference overlaps, out-of-order results stay paired, and checkpoint writes serialize", async () => {
  const requests = [gate(), gate(), gate()], writer = gate();
  const started = [], saved = [];
  let activeWrites = 0, maxWrites = 0;
  const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const run = runSemanticBatch(entries, {
    concurrency: 2,
    work: async entry => { started.push(entry.id); return requests[entries.indexOf(entry)].promise; },
    settle: async (entry, result) => {
      maxWrites = Math.max(maxWrites, ++activeWrites);
      if (entry.id === "b") await writer.promise;
      saved.push([entry.id, result.value]);
      activeWrites--;
    },
  });
  await tick();
  assert.deepEqual(started, ["a", "b"]);
  requests[1].resolve("translation-b");
  await tick();
  requests[0].resolve("translation-a");
  await tick();
  assert.deepEqual(saved, [], "no write overtakes the blocked writer");
  writer.resolve();
  await tick();
  requests[2].resolve("translation-c");
  assert.equal(await run, 3);
  assert.equal(maxWrites, 1);
  assert.deepEqual(saved, [["b", "translation-b"], ["a", "translation-a"], ["c", "translation-c"]]);
  assert.deepEqual(started, ["a", "b", "c"], "each source is claimed exactly once");
});

test("STOP drains both active works to checkpoints and admits no more", async () => {
  const requests = [gate(), gate()], started = [], saved = [];
  let stopped = false, finished = false;
  const run = runSemanticBatch([0, 1, 2, 3], {
    concurrency: 2, shouldStop: () => stopped,
    work: async id => { started.push(id); return requests[id].promise; },
    settle: async (id, result) => { saved.push([id, result.value]); stopped = true; },
  }).then(count => { finished = true; return count; });
  await tick();
  requests[0].resolve("first");
  await tick();
  assert.equal(finished, false, "publication or shutdown must wait for the other work");
  requests[1].resolve("second");
  assert.equal(await run, 2);
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(saved, [[0, "first"], [1, "second"]]);
});

test("a runtime failure stops admission but preserves another lane's accepted work", async () => {
  const requests = [gate(), gate()], saved = [], started = [];
  const fatal = new Error("Local model request failed");
  const run = runSemanticBatch([0, 1, 2], {
    concurrency: 2,
    work: async id => { started.push(id); return requests[id].promise; },
    settle: async (id, outcome) => {
      if (outcome.status === "rejected") throw outcome.reason;
      saved.push([id, outcome.value]);
    },
  });
  const rejected = assert.rejects(run, error => error === fatal);
  await tick();
  requests[0].reject(fatal);
  await tick();
  requests[1].resolve("accepted");
  await rejected;
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(saved, [[1, "accepted"]]);
});

test("a failed checkpoint write is fatal and all active writes finish before exit", async () => {
  const requests = [gate(), gate()], writes = [];
  const diskError = new Error("disk full");
  const run = runSemanticBatch([0, 1, 2], {
    concurrency: 2,
    work: id => requests[id].promise,
    settle: async id => { writes.push(id); if (id === 0) throw diskError; },
  });
  const rejected = assert.rejects(run, error => error === diskError);
  await tick();
  requests[0].resolve();
  await tick();
  requests[1].resolve();
  await rejected;
  assert.deepEqual(writes, [0, 1]);
});

test("semantic rejection is persisted without preventing other works from completing", async () => {
  const outcomes = [];
  const count = await runSemanticBatch([0, 1, 2], {
    concurrency: 2,
    work: async id => { if (id === 1) throw new Error("semantic-content-rejected"); return id; },
    settle: async (id, outcome) => outcomes.push([id, outcome.status]),
  });
  assert.equal(count, 3);
  assert.deepEqual(outcomes.sort((a, b) => a[0] - b[0]), [[0, "fulfilled"], [1, "rejected"], [2, "fulfilled"]]);
});

test("cloud stays single-flight even with local parallelism; a reserve stop admits no next turn", async () => {
  let turns = 0, stopped = false;
  const cloud = { request: async () => { turns++; stopped = true; throw new Error("weekly-reserve-reached"); } };
  const count = await runSemanticBatch([0, 1, 2], {
    concurrency: semanticBatchConcurrency(cloud, 2),
    shouldStop: () => stopped,
    work: () => cloud.request(),
    settle: async (_id, outcome) => assert.equal(outcome.reason.message, "weekly-reserve-reached"),
  });
  assert.equal(count, 1);
  assert.equal(turns, 1);
  assert.equal(semanticBatchConcurrency(null, 2), 2);
});

test("batch boundary waits for all accepted checkpoints before the next batch starts", async () => {
  let accepted = 0;
  const entries = [0, 1, 2, 3, 4, 5], saved = [];
  const next = await runSemanticBatch(entries, {
    concurrency: 2, shouldStop: () => accepted >= 2,
    work: async id => { await tick(); return id; },
    settle: async (id, outcome) => { await tick(); saved.push(outcome.value); accepted++; },
  });
  assert.ok(next >= 2 && next <= 3, "only the one already-active lane may exceed a batch threshold");
  assert.equal(saved.length, next);
  assert.deepEqual(saved.sort((a, b) => a - b), entries.slice(0, next));
  const resumed = [];
  await runSemanticBatch(entries.slice(next), {
    concurrency: 2, work: async id => id,
    settle: async (_id, outcome) => resumed.push(outcome.value),
  });
  assert.deepEqual([...saved, ...resumed].sort((a, b) => a - b), entries);
});

test("an existing stop starts no work", async () => {
  assert.equal(await runSemanticBatch([0, 1], {
    concurrency: 2, shouldStop: () => true,
    work: () => assert.fail("inference must not start"),
    settle: () => assert.fail("nothing to checkpoint"),
  }), 0);
});
