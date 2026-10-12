import { cloudModelConcurrency } from "./codex-semantic-provider.mjs";

// Share one model across bounded inference slots. Keep the original context
// budget for EACH work; increasing -np alone would divide that budget.
export function localModelCapacity(value = 4) {
  const parallel = Number(value);
  if (!Number.isSafeInteger(parallel) || parallel < 1 || parallel > 4) throw new Error("--local-concurrency must be an integer from 1 to 4.");
  return { parallel, contextSize: 16384 * parallel };
}

export function semanticBatchConcurrency(cloud, localConcurrency) {
  const { parallel } = localModelCapacity(localConcurrency);
  // Cloud lanes share one provider and its quota latch. Starting/recovering
  // that provider remains a barrier between fully drained batches.
  return cloud ? cloudModelConcurrency(cloud.concurrency ?? 1) : parallel;
}

// Inference overlaps; checkpoint/journal mutations never overlap. A stop or
// fatal persistence/runtime error stops admission, then drains all work that
// has already started so that its accepted result can still be checkpointed.
export async function runSemanticBatch(entries, {
  concurrency, work, settle, start = async () => {}, shouldStop = () => false,
}) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error("Invalid semantic batch concurrency.");
  }
  let next = 0, failure = null, writes = Promise.resolve();
  async function lane(slot) {
    try {
      while (!failure && !shouldStop() && next < entries.length) {
        const entry = entries[next++];
        await start(entry, slot);
        let outcome;
        try { outcome = { status: "fulfilled", value: await work(entry, slot) }; }
        catch (reason) { outcome = { status: "rejected", reason }; }
        const write = writes.then(() => settle(entry, outcome, slot));
        // Keep the writer available for other already-running entries after
        // one fails. Report the first error only after those writes finish.
        writes = write.catch(error => { failure ??= error; });
        await writes;
      }
    } catch (error) { failure ??= error; }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, slot) => lane(slot)));
  if (failure) throw failure;
  return next;
}
