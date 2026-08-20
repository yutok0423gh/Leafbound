export const STORAGE_KEY = "leafbound.personal-library.v1";
export const LEGACY_STORAGE_KEYS = ["shiyip.personal-library.v1"];

export function createDefaultState() {
  return {
    version: 1,
    favorites: [],
    savedItems: [],
    notes: {},
    readingProgress: {
      "quiet-noticing": 34,
      "phrases-carry": 0,
      "upper-deck": 0
    },
    playbackProgress: {
      "city-rain": 64,
      "tea-afternoon": 0,
      "ferry-wind": 0
    },
    history: {
      poems: ["mountain-autumn"],
      articles: ["quiet-noticing"],
      episodes: ["city-rain"]
    },
    preferences: {
      showJyutping: true,
      classicalFont: "song",
      classicalFontScale: 1,
      classicalLineHeight: 1,
      englishFontScale: 1,
      englishLineHeight: 1.78,
      englishDark: false,
      transcriptMode: "full",
      showTranscriptJyutping: true,
      playbackSpeed: 1
    }
  };
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function normalizeState(candidate) {
  const base = createDefaultState();
  if (!candidate || typeof candidate !== "object") return base;

  return {
    ...base,
    ...candidate,
    favorites: Array.isArray(candidate.favorites) ? [...new Set(candidate.favorites)] : base.favorites,
    savedItems: Array.isArray(candidate.savedItems) ? candidate.savedItems : base.savedItems,
    notes: candidate.notes && typeof candidate.notes === "object" ? candidate.notes : base.notes,
    readingProgress: { ...base.readingProgress, ...(candidate.readingProgress || {}) },
    playbackProgress: { ...base.playbackProgress, ...(candidate.playbackProgress || {}) },
    history: {
      ...base.history,
      ...(candidate.history || {})
    },
    preferences: {
      ...base.preferences,
      ...(candidate.preferences || {})
    }
  };
}

export function loadState(storage) {
  if (!storage) return createDefaultState();
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const state = normalizeState(JSON.parse(raw));
      if (key !== STORAGE_KEY) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          // Migration is best-effort when browser storage is read-only.
        }
      }
      return state;
    } catch {
      // A malformed current entry should not prevent trying an older valid key.
    }
  }
  return createDefaultState();
}

export function persistState(storage, state) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app remains usable when storage is unavailable (for example, strict privacy mode).
  }
}

export function toggleFavoriteInState(state, key) {
  const next = clone(state);
  next.favorites = next.favorites.includes(key)
    ? next.favorites.filter((item) => item !== key)
    : [...next.favorites, key];
  return next;
}

export function upsertSavedItemInState(state, item) {
  const next = clone(state);
  const index = next.savedItems.findIndex((candidate) => candidate.id === item.id);
  const timestamped = {
    ...item,
    updatedAt: new Date().toISOString(),
    createdAt: index >= 0 ? next.savedItems[index].createdAt : new Date().toISOString()
  };
  if (index >= 0) next.savedItems[index] = { ...next.savedItems[index], ...timestamped };
  else next.savedItems.unshift(timestamped);
  return next;
}

export function removeSavedItemInState(state, id) {
  const next = clone(state);
  next.savedItems = next.savedItems.filter((item) => item.id !== id);
  return next;
}

export function setProgressInState(state, kind, id, value) {
  const next = clone(state);
  const field = kind === "playback" ? "playbackProgress" : "readingProgress";
  const upperBound = kind === "playback" ? Number.POSITIVE_INFINITY : 100;
  next[field][id] = Math.max(0, Math.min(upperBound, Number(value) || 0));
  return next;
}

export function touchHistoryInState(state, kind, id) {
  const next = clone(state);
  const list = Array.isArray(next.history[kind]) ? next.history[kind] : [];
  next.history[kind] = [id, ...list.filter((entry) => entry !== id)].slice(0, 24);
  return next;
}

export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function progressPercent(current, total) {
  if (!Number(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(current) / Number(total)) * 100)));
}

export function createStore(storage = globalThis.localStorage) {
  let state = loadState(storage);
  const subscribers = new Set();

  return {
    getState() {
      return state;
    },
    replace(nextState, notify = true) {
      state = normalizeState(nextState);
      persistState(storage, state);
      if (notify) subscribers.forEach((subscriber) => subscriber(state));
      return state;
    },
    update(updater, notify = true) {
      const draft = clone(state);
      const result = updater(draft) || draft;
      return this.replace(result, notify);
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    reset() {
      return this.replace(createDefaultState());
    }
  };
}

export const appStore = createStore();
