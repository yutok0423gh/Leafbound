export const STORAGE_KEY = "leafbound.personal-library.v1";
export const LEGACY_STORAGE_KEYS = ["shiyip.personal-library.v1"];
export const PREFERENCES_COOKIE_KEY = "leafbound_preferences_v1";
export const PREFERENCES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SEEN_PROGRESS_THRESHOLD = 50;
export const COMPLETE_PROGRESS_THRESHOLD = 90;

export function createDefaultPreferences() {
  return {
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
  };
}

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
    contentActivity: {},
    dailySelections: {},
    history: {
      poems: ["mountain-autumn"],
      articles: ["quiet-noticing"],
      episodes: ["city-rain"]
    },
    preferences: createDefaultPreferences()
  };
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

export function normalizePreferences(candidate) {
  const base = createDefaultPreferences();
  if (!candidate || typeof candidate !== "object") return base;
  const classicalFonts = ["song", "kai", "sans"];
  const classicalLeading = [0.94, 1, 1.16];
  const transcriptModes = ["full", "reveal", "listen"];
  const playbackSpeeds = [0.75, 0.8, 1, 1.2, 1.5];
  const requestedClassicalLeading = Number(candidate.classicalLineHeight);
  const requestedPlaybackSpeed = Number(candidate.playbackSpeed);

  return {
    showJyutping: typeof candidate.showJyutping === "boolean" ? candidate.showJyutping : base.showJyutping,
    classicalFont: classicalFonts.includes(candidate.classicalFont) ? candidate.classicalFont : base.classicalFont,
    classicalFontScale: Number(clampNumber(candidate.classicalFontScale, base.classicalFontScale, 0.84, 1.32).toFixed(2)),
    classicalLineHeight: classicalLeading.includes(requestedClassicalLeading) ? requestedClassicalLeading : base.classicalLineHeight,
    englishFontScale: Number(clampNumber(candidate.englishFontScale, base.englishFontScale, 0.84, 1.32).toFixed(2)),
    englishLineHeight: Number(clampNumber(candidate.englishLineHeight, base.englishLineHeight, 1.44, 2.14).toFixed(2)),
    englishDark: typeof candidate.englishDark === "boolean" ? candidate.englishDark : base.englishDark,
    transcriptMode: transcriptModes.includes(candidate.transcriptMode) ? candidate.transcriptMode : base.transcriptMode,
    showTranscriptJyutping: typeof candidate.showTranscriptJyutping === "boolean"
      ? candidate.showTranscriptJyutping
      : base.showTranscriptJyutping,
    playbackSpeed: playbackSpeeds.includes(requestedPlaybackSpeed) ? requestedPlaybackSpeed : base.playbackSpeed
  };
}

export function readPreferencesCookie(cookieHeader = "") {
  const prefix = `${PREFERENCES_COOKIE_KEY}=`;
  const entry = String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return null;
  try {
    return normalizePreferences(JSON.parse(decodeURIComponent(entry.slice(prefix.length))));
  } catch {
    return null;
  }
}

function normalizeCookiePath(pathname = "/") {
  const safePath = String(pathname).replace(/[;,\s]/g, "");
  if (!safePath.startsWith("/")) return "/";
  if (safePath.endsWith("/")) return safePath;
  const lastSlash = safePath.lastIndexOf("/");
  return lastSlash >= 0 ? safePath.slice(0, lastSlash + 1) : "/";
}

export function serializePreferencesCookie(preferences, options = {}) {
  const path = normalizeCookiePath(options.path || "/");
  const maxAge = Math.max(0, Math.floor(Number(options.maxAge) || PREFERENCES_COOKIE_MAX_AGE));
  const value = encodeURIComponent(JSON.stringify(normalizePreferences(preferences)));
  return [
    `${PREFERENCES_COOKIE_KEY}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    "SameSite=Lax",
    options.secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

export function createBrowserPreferencesCookie(
  documentRef = globalThis.document,
  locationRef = globalThis.location
) {
  if (!documentRef) return null;
  return {
    read() {
      return readPreferencesCookie(documentRef.cookie);
    },
    write(preferences) {
      try {
        documentRef.cookie = serializePreferencesCookie(preferences, {
          path: locationRef?.pathname || "/",
          secure: locationRef?.protocol === "https:"
        });
        return readPreferencesCookie(documentRef.cookie) !== null;
      } catch {
        return false;
      }
    }
  };
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
    contentActivity: normalizeContentActivity(candidate.contentActivity),
    dailySelections: normalizeDailySelections(candidate.dailySelections),
    history: {
      ...base.history,
      ...(candidate.history || {})
    },
    preferences: normalizePreferences(candidate.preferences)
  };
}

function normalizeDailySelections(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  return Object.fromEntries(Object.entries(candidate).flatMap(([dayKey, selection]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !selection || typeof selection !== "object") return [];
    const normalized = Object.fromEntries(["poem", "article", "episode"].flatMap((field) => {
      const id = String(selection[field] || "").trim();
      return id ? [[field, id]] : [];
    }));
    return Object.keys(normalized).length ? [[dayKey, normalized]] : [];
  }));
}

function normalizeContentActivity(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  return Object.fromEntries(Object.entries(candidate).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return [];
    const maxProgress = clampNumber(value.maxProgress, 0, 0, 100);
    const status = contentProgressStatus(maxProgress);
    return [[key, {
      maxProgress,
      status,
      ...(status === "seen" || status === "completed" ? { seenAt: String(value.seenAt || value.updatedAt || "") } : {}),
      ...(status === "completed" ? { completedAt: String(value.completedAt || value.updatedAt || "") } : {}),
      updatedAt: String(value.updatedAt || "")
    }]];
  }));
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

export function persistState(storage, state, preferencesCookie = null) {
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The app remains usable when storage is unavailable (for example, strict privacy mode).
    }
  }
  preferencesCookie?.write?.(state.preferences);
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

export function contentActivityKey(kind, id) {
  return `${String(kind || "content")}:${String(id || "")}`;
}

export function contentProgressStatus(value) {
  const progress = clampNumber(value, 0, 0, 100);
  if (progress >= COMPLETE_PROGRESS_THRESHOLD) return "completed";
  if (progress >= SEEN_PROGRESS_THRESHOLD) return "seen";
  if (progress > 0) return "in-progress";
  return "unread";
}

export function getContentProgress(state, kind, id, fallback = 0) {
  const key = contentActivityKey(kind, id);
  const recorded = Number(state?.contentActivity?.[key]?.maxProgress) || 0;
  return clampNumber(Math.max(recorded, Number(fallback) || 0), 0, 0, 100);
}

export function setContentProgressInState(state, kind, id, value, timestamp = new Date().toISOString()) {
  const next = clone(state);
  const key = contentActivityKey(kind, id);
  const previous = next.contentActivity?.[key] || {};
  const maxProgress = clampNumber(Math.max(Number(previous.maxProgress) || 0, Number(value) || 0), 0, 0, 100);
  const previousStatus = contentProgressStatus(previous.maxProgress);
  const status = contentProgressStatus(maxProgress);
  next.contentActivity = next.contentActivity && typeof next.contentActivity === "object" ? next.contentActivity : {};
  next.contentActivity[key] = {
    maxProgress,
    status,
    ...(status === "seen" || status === "completed"
      ? { seenAt: previous.seenAt || (previousStatus === "seen" || previousStatus === "completed" ? previous.updatedAt : timestamp) }
      : {}),
    ...(status === "completed" ? { completedAt: previous.completedAt || timestamp } : {}),
    updatedAt: timestamp
  };
  return next;
}

export function setContentSeenInState(state, kind, id, seen = true, timestamp = new Date().toISOString()) {
  if (seen) return setContentProgressInState(state, kind, id, SEEN_PROGRESS_THRESHOLD, timestamp);
  const next = clone(state);
  const key = contentActivityKey(kind, id);
  if (next.contentActivity && typeof next.contentActivity === "object") delete next.contentActivity[key];
  if (kind === "article") next.readingProgress[id] = 0;
  if (kind === "episode") next.playbackProgress[id] = 0;
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

export function createStore(
  storage = globalThis.localStorage,
  preferencesCookie = createBrowserPreferencesCookie()
) {
  let state = loadState(storage);
  const rememberedPreferences = preferencesCookie?.read?.();
  if (rememberedPreferences) {
    state = normalizeState({
      ...state,
      preferences: { ...state.preferences, ...rememberedPreferences }
    });
  }
  persistState(storage, state, preferencesCookie);
  const subscribers = new Set();

  return {
    getState() {
      return state;
    },
    replace(nextState, notify = true) {
      state = normalizeState(nextState);
      persistState(storage, state, preferencesCookie);
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
