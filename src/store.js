export const STORAGE_KEY = "leafbound.personal-library.v1";
export const LEGACY_STORAGE_KEYS = ["shiyip.personal-library.v1"];
export const LEGACY_PREFERENCES_COOKIE_KEY = "leafbound_preferences_v1";
export const STATE_VERSION = 2;
export const BACKUP_FORMAT = "leafbound.personal-library";
export const BACKUP_FORMAT_VERSION = 2;
export const PERSONAL_DATABASE_NAME = "leafbound-personal-v1";
export const PERSONAL_DATABASE_VERSION = 1;
export const SEEN_PROGRESS_THRESHOLD = 50;
export const COMPLETE_PROGRESS_THRESHOLD = 90;

const PERSONAL_STORE_NAME = "personal-state";
const PERSONAL_RECORD_KEY = "current";
const PERSONAL_STATE_FIELDS = Object.freeze([
  "favorites",
  "savedItems",
  "notes",
  "readingProgress",
  "playbackProgress",
  "contentActivity",
  "dailySelections",
  "history"
]);

export function createDefaultPreferences() {
  return {
    showJyutping: true,
    classicalFont: "song",
    classicalFontScale: 1,
    classicalLineHeight: 1,
    classicalReadingMode: "parallel",
    classicalJyutpingSize: "medium",
    classicalJyutpingColor: "jade",
    classicalJyutpingOpacity: "standard",
    classicalJyutpingGap: "standard",
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
    version: STATE_VERSION,
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
  const classicalReadingModes = ["original", "parallel", "translation"];
  const classicalJyutpingSizes = ["small", "medium", "large"];
  const classicalJyutpingColors = ["jade", "plum", "ink"];
  const classicalJyutpingOpacities = ["soft", "standard", "strong"];
  const classicalJyutpingGaps = ["tight", "standard", "wide"];
  const transcriptModes = ["full", "reveal", "listen"];
  const playbackSpeeds = [0.75, 0.8, 1, 1.2, 1.5];
  const requestedClassicalLeading = Number(candidate.classicalLineHeight);
  const requestedPlaybackSpeed = Number(candidate.playbackSpeed);

  return {
    showJyutping: typeof candidate.showJyutping === "boolean" ? candidate.showJyutping : base.showJyutping,
    classicalFont: classicalFonts.includes(candidate.classicalFont) ? candidate.classicalFont : base.classicalFont,
    classicalFontScale: Number(clampNumber(candidate.classicalFontScale, base.classicalFontScale, 0.84, 1.32).toFixed(2)),
    classicalLineHeight: classicalLeading.includes(requestedClassicalLeading) ? requestedClassicalLeading : base.classicalLineHeight,
    classicalReadingMode: classicalReadingModes.includes(candidate.classicalReadingMode)
      ? candidate.classicalReadingMode
      : base.classicalReadingMode,
    classicalJyutpingSize: classicalJyutpingSizes.includes(candidate.classicalJyutpingSize)
      ? candidate.classicalJyutpingSize
      : base.classicalJyutpingSize,
    classicalJyutpingColor: classicalJyutpingColors.includes(candidate.classicalJyutpingColor)
      ? candidate.classicalJyutpingColor
      : base.classicalJyutpingColor,
    classicalJyutpingOpacity: classicalJyutpingOpacities.includes(candidate.classicalJyutpingOpacity)
      ? candidate.classicalJyutpingOpacity
      : base.classicalJyutpingOpacity,
    classicalJyutpingGap: classicalJyutpingGaps.includes(candidate.classicalJyutpingGap)
      ? candidate.classicalJyutpingGap
      : base.classicalJyutpingGap,
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

export function readLegacyPreferencesCookie(cookieHeader = "") {
  const prefix = `${LEGACY_PREFERENCES_COOKIE_KEY}=`;
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

export function createLegacyPreferencesCookieMigration(
  documentRef = globalThis.document,
  locationRef = globalThis.location
) {
  if (!documentRef) return null;
  return {
    read() {
      return readLegacyPreferencesCookie(documentRef.cookie);
    },
    clear() {
      try {
        documentRef.cookie = [
          `${LEGACY_PREFERENCES_COOKIE_KEY}=`,
          "Max-Age=0",
          "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
          `Path=${normalizeCookiePath(locationRef?.pathname || "/")}`,
          "SameSite=Lax",
          locationRef?.protocol === "https:" ? "Secure" : ""
        ].filter(Boolean).join("; ");
        return readLegacyPreferencesCookie(documentRef.cookie) === null;
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
    version: STATE_VERSION,
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

export function persistState(storage, state) {
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The app remains usable when storage is unavailable (for example, strict privacy mode).
    }
  }
}

function storageEntry(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function containsPersonalState(candidate) {
  return Boolean(candidate && PERSONAL_STATE_FIELDS.some((field) => Object.hasOwn(candidate, field)));
}

function createPersonalStateRecord(state) {
  const normalized = normalizeState(state);
  return Object.fromEntries([
    ["version", STATE_VERSION],
    ...PERSONAL_STATE_FIELDS.map((field) => [field, clone(normalized[field])]),
    // Preferences stay in localStorage for synchronous first paint, with this
    // local IndexedDB copy only acting as a recovery path when localStorage is
    // blocked or cleared independently.
    ["preferences", clone(normalized.preferences)]
  ]);
}

function createPreferenceEnvelope(state) {
  return {
    version: STATE_VERSION,
    preferences: normalizePreferences(state?.preferences),
    persistence: {
      backend: "indexeddb",
      database: PERSONAL_DATABASE_NAME
    }
  };
}

function persistPreferenceEnvelope(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(createPreferenceEnvelope(state)));
    return true;
  } catch {
    return false;
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyObjectChanges(persisted, baseline, current) {
  const result = { ...(persisted || {}) };
  const baselineObject = baseline && typeof baseline === "object" ? baseline : {};
  const currentObject = current && typeof current === "object" ? current : {};
  for (const key of new Set([...Object.keys(baselineObject), ...Object.keys(currentObject)])) {
    if (valuesEqual(baselineObject[key], currentObject[key])) continue;
    if (Object.hasOwn(currentObject, key)) result[key] = clone(currentObject[key]);
    else delete result[key];
  }
  return result;
}

/** Apply interactions made while IndexedDB was opening without losing older data. */
function mergeHydratedPersonalState(persistedCandidate, baselineCandidate, currentCandidate) {
  const persisted = normalizeState(persistedCandidate);
  const baseline = normalizeState(baselineCandidate);
  const current = normalizeState(currentCandidate);
  const baselineFavorites = new Set(baseline.favorites);
  const currentFavorites = new Set(current.favorites);
  const removedFavorites = new Set([...baselineFavorites].filter((id) => !currentFavorites.has(id)));
  const addedFavorites = [...currentFavorites].filter((id) => !baselineFavorites.has(id));
  const favorites = [
    ...persisted.favorites.filter((id) => !removedFavorites.has(id) && !addedFavorites.includes(id)),
    ...addedFavorites
  ];

  const persistedItems = new Map(persisted.savedItems.map((item) => [item.id, item]));
  const baselineItems = new Map(baseline.savedItems.map((item) => [item.id, item]));
  const currentItems = new Map(current.savedItems.map((item) => [item.id, item]));
  for (const id of new Set([...baselineItems.keys(), ...currentItems.keys()])) {
    if (valuesEqual(baselineItems.get(id), currentItems.get(id))) continue;
    if (currentItems.has(id)) persistedItems.set(id, clone(currentItems.get(id)));
    else persistedItems.delete(id);
  }
  const changedItemIds = new Set(current.savedItems
    .filter((item) => !valuesEqual(baselineItems.get(item.id), item))
    .map((item) => item.id));
  const savedItems = [
    ...current.savedItems.filter((item) => changedItemIds.has(item.id)),
    ...[...persistedItems.values()].filter((item) => !changedItemIds.has(item.id))
  ];

  const history = Object.fromEntries(["poems", "articles", "episodes"].map((kind) => {
    const baselineList = Array.isArray(baseline.history[kind]) ? baseline.history[kind] : [];
    const currentList = Array.isArray(current.history[kind]) ? current.history[kind] : [];
    const persistedList = Array.isArray(persisted.history[kind]) ? persisted.history[kind] : [];
    if (valuesEqual(baselineList, currentList)) return [kind, persistedList];
    const removed = new Set(baselineList.filter((id) => !currentList.includes(id)));
    return [kind, [
      ...currentList,
      ...persistedList.filter((id) => !removed.has(id) && !currentList.includes(id))
    ].slice(0, 24)];
  }));

  return normalizeState({
    ...persisted,
    favorites,
    savedItems,
    notes: applyObjectChanges(persisted.notes, baseline.notes, current.notes),
    readingProgress: applyObjectChanges(persisted.readingProgress, baseline.readingProgress, current.readingProgress),
    playbackProgress: applyObjectChanges(persisted.playbackProgress, baseline.playbackProgress, current.playbackProgress),
    contentActivity: applyObjectChanges(persisted.contentActivity, baseline.contentActivity, current.contentActivity),
    dailySelections: applyObjectChanges(persisted.dailySelections, baseline.dailySelections, current.dailySelections),
    history,
    preferences: current.preferences
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")), { once: true });
  });
}

/**
 * Creates the browser-only persistence adapter used by the synchronous app
 * store. Keeping the adapter injectable makes private-mode failures and data
 * migrations testable without introducing a remote service or dependency.
 */
export function createIndexedDbPersonalState(indexedDb = globalThis.indexedDB) {
  if (!indexedDb || typeof indexedDb.open !== "function") return null;
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDb.open(PERSONAL_DATABASE_NAME, PERSONAL_DATABASE_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PERSONAL_STORE_NAME)) {
          database.createObjectStore(PERSONAL_STORE_NAME);
        }
      }, { once: true });
      request.addEventListener("success", () => {
        const database = request.result;
        database.addEventListener("versionchange", () => database.close());
        resolve(database);
      }, { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("IndexedDB could not be opened")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade was blocked")), { once: true });
    });
    return databasePromise;
  }

  return {
    async read() {
      const database = await openDatabase();
      const transaction = database.transaction(PERSONAL_STORE_NAME, "readonly");
      const request = transaction.objectStore(PERSONAL_STORE_NAME).get(PERSONAL_RECORD_KEY);
      const result = await requestResult(request);
      await transactionDone(transaction);
      return result && typeof result === "object" ? result : null;
    },
    async write(state) {
      const database = await openDatabase();
      const transaction = database.transaction(PERSONAL_STORE_NAME, "readwrite");
      transaction.objectStore(PERSONAL_STORE_NAME).put(createPersonalStateRecord(state), PERSONAL_RECORD_KEY);
      await transactionDone(transaction);
    },
    async clear() {
      const database = await openDatabase();
      const transaction = database.transaction(PERSONAL_STORE_NAME, "readwrite");
      transaction.objectStore(PERSONAL_STORE_NAME).delete(PERSONAL_RECORD_KEY);
      await transactionDone(transaction);
    }
  };
}

export function createBackupPayload(state, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    app: "Leafbound",
    data: normalizeState(state)
  };
}

/** Accepts current backups, the original { app, data } export, and raw v1 state. */
export function parseBackupPayload(payload) {
  let candidate = payload;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      throw new TypeError("備份不是有效的 JSON");
    }
  }
  if (!candidate || typeof candidate !== "object") throw new TypeError("備份內容無效");
  if (candidate.format && candidate.format !== BACKUP_FORMAT) throw new TypeError("這不是 Leafbound 備份");
  if (Number(candidate.formatVersion || 1) > BACKUP_FORMAT_VERSION) {
    throw new RangeError("這份備份來自較新的 Leafbound 版本");
  }
  const data = candidate.data && typeof candidate.data === "object" ? candidate.data : candidate;
  if (!containsPersonalState(data) && !data.preferences) throw new TypeError("備份沒有可匯入的本地資料");
  return normalizeState(data);
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
  legacyPreferencesCookie = createLegacyPreferencesCookieMigration(),
  personalPersistence = createIndexedDbPersonalState()
) {
  let state = loadState(storage);
  const localEntry = storageEntry(storage, STORAGE_KEY);
  const localContainsPersonalState = containsPersonalState(localEntry);
  const localContainsPreferences = Boolean(localEntry?.preferences);
  const rememberedPreferences = legacyPreferencesCookie?.read?.();
  if (rememberedPreferences) {
    state = normalizeState({
      ...state,
      preferences: { ...state.preferences, ...rememberedPreferences }
    });
  }
  const initialState = clone(state);
  // Preferences used to be duplicated into a first-party cookie. Migrate that
  // value once, then remove the cookie so no Leafbound state is sent in HTTP requests.
  legacyPreferencesCookie?.clear?.();
  const subscribers = new Set();
  let revision = 0;
  let replaceAllBeforeReady = false;
  let persistenceMode = personalPersistence ? "initializing" : "localStorage";
  let writeQueue = Promise.resolve();

  function notify() {
    subscribers.forEach((subscriber) => subscriber(state));
  }

  function fallBackToLocalStorage() {
    persistenceMode = "localStorage";
    persistState(storage, state);
  }

  function enqueuePersonalWrite(snapshot = state) {
    if (!personalPersistence || persistenceMode === "localStorage") return Promise.resolve();
    const safeSnapshot = clone(snapshot);
    writeQueue = writeQueue
      .then(() => personalPersistence.write(safeSnapshot))
      .catch(() => {
        fallBackToLocalStorage();
      });
    return writeQueue;
  }

  function persistCurrentState() {
    if (persistenceMode === "indexeddb") {
      // Preferences remain immediately available to the synchronous UI while
      // the larger state is written outside localStorage's small quota.
      persistPreferenceEnvelope(storage, state);
      enqueuePersonalWrite(state);
      return;
    }
    // During first-run migration, keep the complete localStorage record until
    // IndexedDB has safely committed it. Strict privacy modes also stay here.
    persistState(storage, state);
  }

  persistState(storage, state);

  const ready = (async () => {
    if (!personalPersistence) return state;
    try {
      const persistedPersonalState = await personalPersistence.read();
      let hydrated = false;

      if (!localContainsPersonalState && persistedPersonalState) {
        const currentPreferences = (localContainsPreferences || rememberedPreferences)
          ? state.preferences
          : persistedPersonalState.preferences;
        state = replaceAllBeforeReady
          ? normalizeState({ ...state, preferences: currentPreferences })
          : mergeHydratedPersonalState(
            persistedPersonalState,
            initialState,
            { ...state, preferences: currentPreferences }
          );
        hydrated = true;
      }

      let writtenAtRevision = revision;
      await personalPersistence.write(state);
      // An interaction may have changed the in-memory state while IndexedDB
      // was opening. Commit once more before compacting localStorage.
      while (revision !== writtenAtRevision) {
        writtenAtRevision = revision;
        await personalPersistence.write(state);
      }
      persistenceMode = "indexeddb";
      persistPreferenceEnvelope(storage, state);
      if (hydrated) notify();
      return state;
    } catch {
      fallBackToLocalStorage();
      return state;
    }
  })();

  return {
    ready,
    getState() {
      return state;
    },
    getPersistenceMode() {
      return persistenceMode;
    },
    replace(nextState, notify = true) {
      state = normalizeState(nextState);
      revision += 1;
      persistCurrentState();
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
      if (persistenceMode === "initializing") replaceAllBeforeReady = true;
      return this.replace(createDefaultState());
    },
    restore(payload, notify = true) {
      if (persistenceMode === "initializing") replaceAllBeforeReady = true;
      return this.replace(parseBackupPayload(payload), notify);
    },
    createBackup(exportedAt) {
      return createBackupPayload(state, exportedAt);
    },
    async flush() {
      await ready;
      await writeQueue;
      return state;
    }
  };
}

export const appStore = createStore();
