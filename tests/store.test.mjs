import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETE_PROGRESS_THRESHOLD,
  LEGACY_STORAGE_KEYS,
  PREFERENCES_COOKIE_KEY,
  SEEN_PROGRESS_THRESHOLD,
  STORAGE_KEY,
  contentProgressStatus,
  createDefaultState,
  createStore,
  formatTime,
  getContentProgress,
  loadState,
  progressPercent,
  readPreferencesCookie,
  serializePreferencesCookie,
  setContentProgressInState,
  setContentSeenInState,
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

test("content activity keeps the highest progress and marks fifty percent as seen", () => {
  const original = createDefaultState();
  const halfway = setContentProgressInState(original, "article", "quiet-noticing", 50, "2026-08-21T00:00:00.000Z");
  const movedBack = setContentProgressInState(halfway, "article", "quiet-noticing", 18, "2026-08-21T00:05:00.000Z");

  assert.equal(SEEN_PROGRESS_THRESHOLD, 50);
  assert.equal(COMPLETE_PROGRESS_THRESHOLD, 90);
  assert.equal(getContentProgress(movedBack, "article", "quiet-noticing"), 50);
  assert.equal(movedBack.contentActivity["article:quiet-noticing"].status, "seen");
  assert.equal(movedBack.contentActivity["article:quiet-noticing"].seenAt, "2026-08-21T00:00:00.000Z");
  assert.equal(contentProgressStatus(89.9), "seen");
  assert.equal(contentProgressStatus(90), "completed");
});

test("manual seen state can be added and reset with resume progress", () => {
  const original = createDefaultState();
  const marked = setContentSeenInState(original, "episode", "city-rain", true, "2026-08-21T01:00:00.000Z");
  const reset = setContentSeenInState(marked, "episode", "city-rain", false, "2026-08-21T02:00:00.000Z");

  assert.equal(marked.contentActivity["episode:city-rain"].maxProgress, 50);
  assert.equal(reset.contentActivity["episode:city-rain"], undefined);
  assert.equal(reset.playbackProgress["city-rain"], 0);
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

test("daily shelf selections persist by local date and discard malformed entries", () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      dailySelections: {
        "2026-08-28": { poem: "mountain-autumn", article: "quiet-noticing", episode: "city-rain" },
        "not-a-day": { poem: "spring-dawn" },
        "2026-08-29": "broken"
      }
    })
  });

  const restored = loadState(storage);
  assert.deepEqual(restored.dailySelections, {
    "2026-08-28": { poem: "mountain-autumn", article: "quiet-noticing", episode: "city-rain" }
  });
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

test("reading preferences round-trip through the dedicated cookie", () => {
  const cookie = serializePreferencesCookie({
    englishDark: true,
    classicalFont: "kai",
    playbackSpeed: 1.2
  }, { path: "/Leafbound/", secure: true });

  assert.match(cookie, new RegExp(`^${PREFERENCES_COOKIE_KEY}=`));
  assert.match(cookie, /Path=\/Leafbound\//);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const restored = readPreferencesCookie(cookie);
  assert.equal(restored.englishDark, true);
  assert.equal(restored.classicalFont, "kai");
  assert.equal(restored.playbackSpeed, 1.2);
  assert.equal(restored.showJyutping, true);
});

test("the store restores and updates cookie-backed preferences only", () => {
  let remembered = { englishDark: true, showJyutping: false };
  const writes = [];
  const preferencesCookie = {
    read() {
      return remembered;
    },
    write(preferences) {
      remembered = { ...preferences };
      writes.push(remembered);
      return true;
    }
  };
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      favorites: ["poem:mountain-autumn"],
      preferences: { englishDark: false, showJyutping: true }
    })
  });
  const store = createStore(storage, preferencesCookie);

  assert.equal(store.getState().preferences.englishDark, true);
  assert.equal(store.getState().preferences.showJyutping, false);
  assert.deepEqual(store.getState().favorites, ["poem:mountain-autumn"]);
  store.update((state) => {
    state.preferences.playbackSpeed = 1.5;
    return state;
  });
  assert.equal(writes.at(-1).playbackSpeed, 1.5);
  assert.equal(Object.hasOwn(writes.at(-1), "favorites"), false);
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
