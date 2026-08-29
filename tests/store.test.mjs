import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETE_PROGRESS_THRESHOLD,
  LEGACY_STORAGE_KEYS,
  LEGACY_PREFERENCES_COOKIE_KEY,
  SEEN_PROGRESS_THRESHOLD,
  STORAGE_KEY,
  contentProgressStatus,
  createBackupPayload,
  createDefaultState,
  createStore,
  formatTime,
  getContentProgress,
  loadState,
  parseBackupPayload,
  progressPercent,
  readLegacyPreferencesCookie,
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

test("legacy cookie preferences remain readable for one-time local migration", () => {
  const cookie = `${LEGACY_PREFERENCES_COOKIE_KEY}=${encodeURIComponent(JSON.stringify({
    englishDark: true,
    classicalFont: "kai",
    playbackSpeed: 1.2
  }))}`;

  assert.match(cookie, new RegExp(`^${LEGACY_PREFERENCES_COOKIE_KEY}=`));
  const restored = readLegacyPreferencesCookie(cookie);
  assert.equal(restored.englishDark, true);
  assert.equal(restored.classicalFont, "kai");
  assert.equal(restored.playbackSpeed, 1.2);
  assert.equal(restored.showJyutping, true);
});

test("the store migrates legacy cookie preferences once, clears them, and stays local", () => {
  let remembered = { englishDark: true, showJyutping: false };
  let clears = 0;
  const legacyPreferencesCookie = {
    read() {
      return remembered;
    },
    clear() {
      remembered = null;
      clears += 1;
      return true;
    },
    write() {
      throw new Error("the current store must never write a cookie");
    }
  };
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      favorites: ["poem:mountain-autumn"],
      preferences: { englishDark: false, showJyutping: true }
    })
  });
  const store = createStore(storage, legacyPreferencesCookie);

  assert.equal(store.getState().preferences.englishDark, true);
  assert.equal(store.getState().preferences.showJyutping, false);
  assert.deepEqual(store.getState().favorites, ["poem:mountain-autumn"]);
  assert.equal(clears, 1);
  assert.equal(remembered, null);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).preferences.englishDark, true);
  store.update((state) => {
    state.preferences.playbackSpeed = 1.5;
    return state;
  });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).preferences.playbackSpeed, 1.5);
});

test("all personal fields persist together when IndexedDB is unavailable", () => {
  const writes = [];
  const storage = memoryStorage();
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes.push(key);
    originalSetItem(key, value);
  };
  const store = createStore(storage, { read: () => null, clear: () => true });
  store.update((state) => {
    state.favorites = ["poem:mountain-autumn"];
    state.savedItems = [{ id: "english:example", text: "example" }];
    state.notes = { "poem:mountain-autumn": "本機筆記" };
    state.readingProgress = { "quiet-noticing": 72 };
    state.playbackProgress = { "city-rain": 38 };
    state.contentActivity = { "article:quiet-noticing": { maxProgress: 72, status: "seen" } };
    state.dailySelections = { "2026-08-29": { poem: "mountain-autumn" } };
    state.history = { poems: ["mountain-autumn"], articles: [], episodes: [] };
    state.preferences.englishDark = true;
    return state;
  });

  assert.deepEqual([...new Set(writes)], [STORAGE_KEY]);
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  for (const field of [
    "favorites",
    "savedItems",
    "notes",
    "readingProgress",
    "playbackProgress",
    "contentActivity",
    "dailySelections",
    "history",
    "preferences"
  ]) assert.ok(Object.hasOwn(persisted, field), `${field} should remain in localStorage`);
});

test("a complete localStorage state migrates to IndexedDB before localStorage is compacted", async () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      favorites: ["poem:mountain-autumn"],
      notes: { "poem:mountain-autumn": "保留這則筆記" },
      preferences: { englishDark: true }
    })
  });
  let persisted = null;
  const personalPersistence = {
    async read() {
      return null;
    },
    async write(state) {
      persisted = structuredClone(state);
    }
  };
  const store = createStore(storage, { read: () => null, clear: () => true }, personalPersistence);

  await store.ready;
  assert.equal(store.getPersistenceMode(), "indexeddb");
  assert.deepEqual(persisted.favorites, ["poem:mountain-autumn"]);
  assert.equal(persisted.notes["poem:mountain-autumn"], "保留這則筆記");
  const localEnvelope = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(localEnvelope.preferences.englishDark, true);
  assert.equal(localEnvelope.persistence.backend, "indexeddb");
  assert.equal(Object.hasOwn(localEnvelope, "favorites"), false);

  store.update((state) => toggleFavoriteInState(state, "poem:spring-dawn"));
  await store.flush();
  assert.ok(persisted.favorites.includes("poem:spring-dawn"));
});

test("an IndexedDB state hydrates asynchronously while local preferences win", async () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      version: 2,
      preferences: { englishDark: true, playbackSpeed: 1.2 },
      persistence: { backend: "indexeddb" }
    })
  });
  const personalPersistence = {
    async read() {
      return {
        favorites: ["article:quiet-noticing"],
        notes: { "article:quiet-noticing": "IndexedDB note" },
        preferences: { englishDark: false, playbackSpeed: 0.75 }
      };
    },
    async write() {}
  };
  const store = createStore(storage, { read: () => null, clear: () => true }, personalPersistence);
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  await store.ready;
  assert.deepEqual(store.getState().favorites, ["article:quiet-noticing"]);
  assert.equal(store.getState().notes["article:quiet-noticing"], "IndexedDB note");
  assert.equal(store.getState().preferences.englishDark, true);
  assert.equal(store.getState().preferences.playbackSpeed, 1.2);
  assert.equal(notifications, 1);
});

test("interactions during IndexedDB hydration merge without overwriting older personal data", async () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      version: 2,
      preferences: { englishDark: true },
      persistence: { backend: "indexeddb" }
    })
  });
  let releaseRead;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  let persistedAfterHydration;
  const personalPersistence = {
    async read() {
      await readGate;
      return {
        favorites: ["poem:older"],
        savedItems: [{ id: "english:older", text: "older" }],
        notes: { "poem:older": "older note" }
      };
    },
    async write(state) {
      persistedAfterHydration = structuredClone(state);
    }
  };
  const store = createStore(storage, { read: () => null, clear: () => true }, personalPersistence);
  store.update((state) => {
    const withFavorite = toggleFavoriteInState(state, "poem:new");
    withFavorite.notes["poem:new"] = "new note";
    return upsertSavedItemInState(withFavorite, { id: "english:new", text: "new" });
  });
  releaseRead();
  await store.ready;

  assert.deepEqual(new Set(store.getState().favorites), new Set(["poem:older", "poem:new"]));
  assert.equal(store.getState().notes["poem:older"], "older note");
  assert.equal(store.getState().notes["poem:new"], "new note");
  assert.deepEqual(
    new Set(store.getState().savedItems.map((item) => item.id)),
    new Set(["english:older", "english:new"])
  );
  assert.deepEqual(persistedAfterHydration.favorites, store.getState().favorites);
});

test("IndexedDB failures retain the complete localStorage fallback", async () => {
  const storage = memoryStorage();
  const personalPersistence = {
    async read() {
      throw new Error("private mode denied IndexedDB");
    },
    async write() {
      throw new Error("unreachable");
    }
  };
  const store = createStore(storage, { read: () => null, clear: () => true }, personalPersistence);
  store.update((state) => toggleFavoriteInState(state, "poem:spring-dawn"));
  await store.ready;

  assert.equal(store.getPersistenceMode(), "localStorage");
  assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).favorites.includes("poem:spring-dawn"));
});

test("versioned backups restore current, original, and raw local formats", () => {
  const original = toggleFavoriteInState(createDefaultState(), "poem:spring-dawn");
  const current = createBackupPayload(original, "2026-08-29T00:00:00.000Z");
  assert.equal(current.formatVersion, 2);
  assert.equal(current.data.version, 2);
  assert.deepEqual(parseBackupPayload(JSON.stringify(current)).favorites, ["poem:spring-dawn"]);
  assert.deepEqual(parseBackupPayload({ app: "Leafbound", data: original }).favorites, ["poem:spring-dawn"]);
  assert.deepEqual(parseBackupPayload(original).favorites, ["poem:spring-dawn"]);
  assert.throws(
    () => parseBackupPayload({ ...current, formatVersion: 999 }),
    /較新的 Leafbound/
  );
});

test("classical typography preferences migrate and persist", () => {
  const legacyStorage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ preferences: { showJyutping: false } })
  });
  const migrated = loadState(legacyStorage);
  assert.equal(migrated.preferences.classicalFont, "song");
  assert.equal(migrated.preferences.classicalFontScale, 1);
  assert.equal(migrated.preferences.classicalLineHeight, 1);
  assert.equal(migrated.preferences.classicalReadingMode, "parallel");
  assert.equal(migrated.preferences.classicalJyutpingSize, "medium");
  assert.equal(migrated.preferences.classicalJyutpingColor, "jade");
  assert.equal(migrated.preferences.classicalJyutpingOpacity, "standard");
  assert.equal(migrated.preferences.classicalJyutpingGap, "standard");

  const store = createStore(memoryStorage());
  store.update((state) => {
    state.preferences.classicalFont = "kai";
    state.preferences.classicalFontScale = 1.16;
    state.preferences.classicalLineHeight = 1.16;
    state.preferences.classicalReadingMode = "translation";
    state.preferences.classicalJyutpingSize = "large";
    state.preferences.classicalJyutpingColor = "plum";
    state.preferences.classicalJyutpingOpacity = "strong";
    state.preferences.classicalJyutpingGap = "wide";
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
  assert.deepEqual(
    {
      mode: store.getState().preferences.classicalReadingMode,
      size: store.getState().preferences.classicalJyutpingSize,
      color: store.getState().preferences.classicalJyutpingColor,
      opacity: store.getState().preferences.classicalJyutpingOpacity,
      gap: store.getState().preferences.classicalJyutpingGap
    },
    { mode: "translation", size: "large", color: "plum", opacity: "strong", gap: "wide" }
  );
});

test("time and percentage helpers handle boundaries", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(125.8), "02:05");
  assert.equal(progressPercent(30, 120), 25);
  assert.equal(progressPercent(900, 120), 100);
  assert.equal(progressPercent(3, 0), 0);
});
