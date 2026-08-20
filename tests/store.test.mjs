import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  createDefaultState,
  createStore,
  formatTime,
  loadState,
  progressPercent,
  setProgressInState,
  toggleFavoriteInState,
  upsertSavedItemInState
} from "../src/store.js";

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test("favorites toggle without mutating the original state", () => {
  const original = createDefaultState();
  const added = toggleFavoriteInState(original, "poem:mountain-autumn");
  assert.deepEqual(original.favorites, []);
  assert.deepEqual(added.favorites, ["poem:mountain-autumn"]);

  const removed = toggleFavoriteInState(added, "poem:mountain-autumn");
  assert.deepEqual(removed.favorites, []);
});

test("saved library items are upserted by id", () => {
  const original = createDefaultState();
  const first = upsertSavedItemInState(original, {
    id: "english:in-contrast-to",
    text: "in contrast to",
    language: "English",
    meaning: "與……形成對比"
  });
  const second = upsertSavedItemInState(first, {
    id: "english:in-contrast-to",
    text: "in contrast to",
    language: "English",
    meaning: "與……相較"
  });

  assert.equal(second.savedItems.length, 1);
  assert.equal(second.savedItems[0].meaning, "與……相較");
  assert.equal(second.savedItems[0].createdAt, first.savedItems[0].createdAt);
});

test("reading progress is clamped while playback progress may exceed 100 seconds", () => {
  const original = createDefaultState();
  const reading = setProgressInState(original, "reading", "quiet-noticing", 140);
  const playback = setProgressInState(reading, "playback", "city-rain", 140);

  assert.equal(reading.readingProgress["quiet-noticing"], 100);
  assert.equal(playback.playbackProgress["city-rain"], 140);
});

test("state persists and malformed storage falls back safely", () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.update((state) => toggleFavoriteInState(state, "article:quiet-noticing"));
  assert.match(storage.getItem(STORAGE_KEY), /article:quiet-noticing/);

  const restored = loadState(storage);
  assert.ok(restored.favorites.includes("article:quiet-noticing"));

  const broken = memoryStorage({ [STORAGE_KEY]: "not-json" });
  assert.deepEqual(loadState(broken).favorites, []);
});

test("legacy Shiyip storage migrates to Leafbound without losing data", () => {
  const legacyKey = LEGACY_STORAGE_KEYS[0];
  const storage = memoryStorage({
    [legacyKey]: JSON.stringify({
      favorites: ["poem:mountain-autumn"],
      notes: { "poem:mountain-autumn": "保留這則舊筆記" }
    })
  });

  const migrated = loadState(storage);
  assert.deepEqual(migrated.favorites, ["poem:mountain-autumn"]);
  assert.equal(migrated.notes["poem:mountain-autumn"], "保留這則舊筆記");
  assert.match(storage.getItem(STORAGE_KEY), /poem:mountain-autumn/);
  assert.ok(storage.getItem(legacyKey));
});

test("classical typography preferences migrate and persist", () => {
  const legacyStorage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ preferences: { showJyutping: false } })
  });
  const migrated = loadState(legacyStorage);
  assert.equal(migrated.preferences.classicalFont, "song");
  assert.equal(migrated.preferences.classicalFontScale, 1);
  assert.equal(migrated.preferences.classicalLineHeight, 1);

  const store = createStore(memoryStorage());
  store.update((state) => {
    state.preferences.classicalFont = "kai";
    state.preferences.classicalFontScale = 1.16;
    state.preferences.classicalLineHeight = 1.16;
    return state;
  });
  assert.deepEqual(
    {
      font: store.getState().preferences.classicalFont,
      scale: store.getState().preferences.classicalFontScale,
      leading: store.getState().preferences.classicalLineHeight
    },
    { font: "kai", scale: 1.16, leading: 1.16 }
  );
});

test("time and percentage helpers handle boundaries", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(125.8), "02:05");
  assert.equal(progressPercent(30, 120), 25);
  assert.equal(progressPercent(900, 120), 100);
  assert.equal(progressPercent(3, 0), 0);
});
