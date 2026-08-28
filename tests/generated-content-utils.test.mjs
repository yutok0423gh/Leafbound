import test from "node:test";
import assert from "node:assert/strict";

import { contentDigest, stableSnapshot } from "../scripts/generated-content-utils.mjs";

test("generated content digests are deterministic and sensitive to content", () => {
  const first = contentDigest({ entries: [{ id: "one", text: "一頁" }] });
  const second = contentDigest({ entries: [{ id: "one", text: "一頁" }] });
  const changed = contentDigest({ entries: [{ id: "one", text: "兩頁" }] });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("stable snapshots preserve their timestamp only when content is unchanged", () => {
  const content = { entries: ["one"] };
  const original = stableSnapshot(null, { itemCount: 1 }, content);
  const repeated = stableSnapshot(original, { itemCount: 1 }, content);
  const changed = stableSnapshot(original, { itemCount: 2 }, { entries: ["one", "two"] });

  assert.equal(repeated.generatedAt, original.generatedAt);
  assert.equal(repeated.contentDigest, original.contentDigest);
  assert.notEqual(changed.contentDigest, original.contentDigest);
});
