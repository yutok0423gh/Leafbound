import {
  articles,
  cantoneseTerms,
  episodes,
  findEpisode,
  findPoem,
  getDailyIndex,
  getLocalDayKey,
  getTodayPoem,
  navItems,
  loadPoem,
  pickDailyItem,
  poems,
  poetryKinds
} from "./data.js";
import {
  alignClassicalReadingUnits,
  classicalReadingModes,
  classicalTranslationReviewMeta
} from "./classical-reading.js";
import { icon } from "./icons.js";
import {
  englishDictionarySnapshot,
  englishDictionaryState,
  englishItemId,
  getEnglishContext,
  loadEnglishDictionary,
  lookupEnglishWord
} from "./english.js";
import { cantoneseSourceCatalog as openCantoneseSourceCatalog, cantoneseSourceSnapshot } from "./open-cantonese.js";
import { cantoneseInterviewSource } from "./cantonese-interviews.js";
import { englishDiscoveries, englishSourceCatalog, englishSourceSnapshot } from "./open-english.js";
import { englishNewsDesks } from "./english-news-sources.js";
import {
  classicalTranslationSnapshot,
  getClassicalTranslation,
  isClassicalTranslationUnavailableError,
  loadClassicalTranslation
} from "./classical-translations.js";
import {
  alignCantonesePronunciation,
  buildCantonesePronunciationLine,
  cantoneseLexiconState,
  getCantoneseTermData,
  loadCantoneseDefinitions,
  loadCantoneseLexicon,
  segmentCantonesePronunciation,
  segmentCantoneseText
} from "./cantonese-lexicon.js";
import {
  cantoneseEpisodeDescription,
  cantoneseEpisodeSourceLabel,
  cantoneseGradingNote,
  cantoneseLearningBands,
  getCantoneseLearningBand
} from "./cantonese-grading.js";
import { findCantoneseVoice } from "./voice.js";
import {
  poetryFacetDefinitions,
  poetryFacetLabel,
  poetryFacetValues,
  poetryFacetValue,
  poetryMatchesFacet
} from "./poetry-taxonomy.js";
import {
  COMPLETE_PROGRESS_THRESHOLD,
  SEEN_PROGRESS_THRESHOLD,
  STORAGE_KEY,
  appStore,
  contentActivityKey,
  contentProgressStatus,
  createDefaultPreferences,
  formatTime,
  getContentProgress,
  progressPercent,
  removeSavedItemInState,
  setContentProgressInState,
  setContentSeenInState,
  setProgressInState,
  toggleFavoriteInState,
  touchHistoryInState,
  upsertSavedItemInState
} from "./store.js";

const cantoneseSourceCatalog = Object.freeze([
  openCantoneseSourceCatalog[0],
  cantoneseInterviewSource,
  ...openCantoneseSourceCatalog.slice(1)
]);
const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
const dailyEnglishArticles = [...articles, ...englishDiscoveries]
  .filter((article) => Array.isArray(article.paragraphs) && article.paragraphs.length);
const dailyPoems = uniqueDailyPoems(poems);
const DAILY_SELECTION_RETENTION = 800;
const inlineClassicalTranslationByKind = poems.reduce((counts, poem) => {
  if (String(poem.translation || "").trim()) counts[poem.kind] = (counts[poem.kind] || 0) + 1;
  return counts;
}, {});
const inlineClassicalTranslationCount = Object.values(inlineClassicalTranslationByKind)
  .reduce((total, count) => total + count, 0);
const completeClassicalTranslationByKind = Object.keys({
  ...classicalTranslationSnapshot.byKind,
  ...inlineClassicalTranslationByKind
}).reduce((counts, kind) => {
  counts[kind] = (classicalTranslationSnapshot.byKind[kind] || 0) + (inlineClassicalTranslationByKind[kind] || 0);
  return counts;
}, {});
const completeClassicalTranslationCount = classicalTranslationSnapshot.count + inlineClassicalTranslationCount;
const classicalTranslationLoadStates = new Map();
const poemContentLoadStates = new Map();
const COLLECTION_BATCH_SIZE = 24;
const COLLECTION_SESSION_KEY = "leafbound.collection-view.v1";

function collectionSessionDefaults() {
  return {
    cantonese: { sourceFilter: "全部", level: "全部", limit: COLLECTION_BATCH_SIZE, scrollY: 0 },
    english: { sourceFilter: "全部", category: "全部", limit: COLLECTION_BATCH_SIZE, scrollY: 0 }
  };
}

function normalizedCollectionLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < COLLECTION_BATCH_SIZE) return COLLECTION_BATCH_SIZE;
  return Math.min(2400, Math.ceil(numeric / COLLECTION_BATCH_SIZE) * COLLECTION_BATCH_SIZE);
}

function readCollectionSession() {
  const defaults = collectionSessionDefaults();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(COLLECTION_SESSION_KEY) || "null");
    if (!parsed || parsed.version !== 1 || typeof parsed.routes !== "object") return defaults;
    const cantonese = parsed.routes.cantonese || {};
    const english = parsed.routes.english || {};
    return {
      cantonese: {
        sourceFilter: typeof cantonese.sourceFilter === "string" ? cantonese.sourceFilter : defaults.cantonese.sourceFilter,
        level: typeof cantonese.level === "string" ? cantonese.level : defaults.cantonese.level,
        limit: normalizedCollectionLimit(cantonese.limit),
        scrollY: Math.max(0, Number(cantonese.scrollY) || 0)
      },
      english: {
        sourceFilter: typeof english.sourceFilter === "string" ? english.sourceFilter : defaults.english.sourceFilter,
        category: typeof english.category === "string" ? english.category : defaults.english.category,
        limit: normalizedCollectionLimit(english.limit),
        scrollY: Math.max(0, Number(english.scrollY) || 0)
      }
    };
  } catch {
    return defaults;
  }
}

const collectionSession = readCollectionSession();

function uniqueDailyPoems(items) {
  const signatures = new Set();
  return items.filter((poem) => {
    if (poem.kind !== "詩" || !Array.isArray(poem.lines) || poem.lines.filter((line) => line?.text?.trim()).length < 2) {
      return false;
    }
    const body = poem.lines.map((line) => line.text).join("").replace(/[\p{P}\p{S}\s]/gu, "");
    const signature = body || `${poem.poet}|${poem.title}`;
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

function buildDailyPoemFeature(poem) {
  const fallbackLines = (poem?.lines || []).filter((line) => line?.text?.trim()).slice(0, 2);
  const quote = String(poem?.featuredQuote || "").trim()
    || fallbackLines.map((line) => line.text.trim()).join("，");
  const segments = quote.split(/[，。！？；]+/u).map((segment) => segment.trim()).filter(Boolean);
  const pronunciationLines = (segments.length ? segments : fallbackLines.map((line) => line.text.trim())).map((text) => {
    const normalizedText = text.replace(/[\p{P}\p{S}\s]/gu, "");
    return (poem?.lines || []).find((line) => (
      String(line?.text || "").replace(/[\p{P}\p{S}\s]/gu, "") === normalizedText
    )) || { text, jyutping: "" };
  });

  return { quote, pronunciationLines };
}

function renderDailyPoemFeature(poemFeature) {
  const chunks = poemFeature.quote.match(/[^，。！？；]+[，。！？；]*/gu) || [poemFeature.quote];
  return chunks.map((chunk, index) => {
    const text = chunk.replace(/[，。！？；]+$/u, "");
    const punctuation = chunk.slice(text.length);
    const sourceLine = poemFeature.pronunciationLines[index] || { text, jyutping: "" };
    const pronunciation = classicalLinePronunciation(sourceLine);
    const annotated = pronunciation.value
      ? renderClassicalAnnotatedText(
        text,
        pronunciation.kind === "curated" ? pronunciation.value : "",
        false,
        "daily-quote-jyutping-token"
      )
      : escapeHtml(text);
    return `${annotated}${escapeHtml(punctuation)}`;
  }).join("");
}

function findEnglishArticle(id, fallback = true) {
  const match = articles.find((article) => article.id === id)
    || englishDiscoveries.find((article) => article.id === id);
  return match || (fallback ? articles[0] : null);
}

const ui = {
  poetryKind: "全部",
  poetryFacet: "dynasty",
  poetryFilters: {
    dynasty: null,
    poet: null,
    form: null,
    tune: null,
    theme: null
  },
  poetryQuery: "",
  poetryLimit: 24,
  libraryFilter: "all",
  libraryPanel: null,
  sourceFilter: collectionSession.cantonese.sourceFilter,
  cantoneseLevel: collectionSession.cantonese.level,
  cantoneseLimit: collectionSession.cantonese.limit,
  englishSourceFilter: collectionSession.english.sourceFilter,
  englishCategory: collectionSession.english.category,
  englishLimit: collectionSession.english.limit,
  searchOpen: false,
  searchQuery: "",
  selectedTerm: null,
  selectedEnglishItem: null,
  selectedText: null,
  immersivePoemId: null,
  classicalTypographyOpen: false,
  classicalFocusIndex: null,
  poemThreadOpen: false,
  cantoneseVoiceGuideOpen: false,
  notePanel: null,
  revealedSegments: new Set(),
  focusTarget: null
};

const poetryKindDetails = {
  全部: { eyebrow: "總覽", description: "跨體裁漫遊" },
  詩: { eyebrow: "Poetry", description: "古詩與近體詩" },
  詞: { eyebrow: "Ci", description: "長短句與詞牌" },
  曲: { eyebrow: "Qu", description: "散曲與套數" },
  古文: { eyebrow: "Prose", description: "歷代古典文章" }
};

const classicalFontOptions = [
  { id: "song", label: "宋體" },
  { id: "kai", label: "楷體" },
  { id: "sans", label: "黑體" }
];

const classicalLeadingOptions = [
  { value: 0.94, label: "緊湊" },
  { value: 1, label: "適中" },
  { value: 1.16, label: "寬鬆" }
];

const classicalJyutpingOptions = Object.freeze({
  size: Object.freeze([
    Object.freeze({ value: "small", label: "小" }),
    Object.freeze({ value: "medium", label: "中" }),
    Object.freeze({ value: "large", label: "大" })
  ]),
  color: Object.freeze([
    Object.freeze({ value: "jade", label: "玉" }),
    Object.freeze({ value: "plum", label: "朱" }),
    Object.freeze({ value: "ink", label: "墨" })
  ]),
  opacity: Object.freeze([
    Object.freeze({ value: "soft", label: "淡" }),
    Object.freeze({ value: "standard", label: "適中" }),
    Object.freeze({ value: "strong", label: "清晰" })
  ]),
  gap: Object.freeze([
    Object.freeze({ value: "tight", label: "緊" }),
    Object.freeze({ value: "standard", label: "適中" }),
    Object.freeze({ value: "wide", label: "寬" })
  ])
});

const englishLeadingOptions = [
  { value: 1.58, label: "緊湊" },
  { value: 1.78, label: "適中" },
  { value: 2, label: "寬鬆" }
];

const playbackSpeedOptions = [0.75, 0.8, 1, 1.2, 1.5];

const englishShellNavLabels = Object.freeze({
  today: "Today",
  poetry: "Classics",
  language: "Language",
  library: "Library"
});

const routePages = new Set(["today", "poetry", "language", "cantonese", "english", "library"]);

const englishCategoryLabels = Object.freeze({
  全部: "All",
  語言: "Language",
  文化: "Culture",
  科學: "Science",
  文學: "Literature",
  生活: "Everyday life"
});

if (!["全部", ...cantoneseSourceCatalog.map((source) => source.id)].includes(ui.sourceFilter)) {
  ui.sourceFilter = "全部";
}
if (!cantoneseLearningBands.some((group) => group.id === ui.cantoneseLevel)) {
  ui.cantoneseLevel = "全部";
}
if (!["全部", ...englishSourceCatalog.map((source) => source.id)].includes(ui.englishSourceFilter)) {
  ui.englishSourceFilter = "全部";
}
if (!Object.hasOwn(englishCategoryLabels, ui.englishCategory)) {
  ui.englishCategory = "全部";
}

const englishSourceUiCopy = Object.freeze({
  local: {
    mark: "L",
    mode: "Close reading",
    description: "Leafbound essays with word lookup, contextual saves, notes, and reading progress."
  },
  voa: {
    mark: "V",
    mode: "Full text",
    description: "Clean text from VOA-produced learning articles; third-party wire copy is excluded."
  },
  nasa: {
    mark: "N",
    mode: "Full text",
    description: "Plain text from official NASA science and engineering articles; images and marks are excluded."
  },
  "standard-ebooks": {
    mark: "S",
    mode: "Opening chapter",
    description: "Carefully proofread public-domain books; read the opening chapter here, then follow the source for the complete edition."
  },
  "global-voices": {
    mark: "G",
    mode: "CC BY full text",
    description: "Original reporting and essays from local perspectives worldwide, with author credit and third-party media removed."
  }
});

const englishNewsUiCopy = Object.freeze({
  ap: { mode: "Publisher site", description: "Read current reporting at AP News; republication requires an AP licence." },
  reuters: { mode: "Publisher site", description: "A gateway to world, business, and market reporting; Leafbound does not copy Reuters articles." },
  guardian: { mode: "Publisher · API", description: "Public articles remain on The Guardian; in-app reuse requires an Open Platform key and timely updates." },
  cnn: { mode: "Publisher site", description: "World news and features remain on CNN, which supplies both headlines and article text." },
  rfi: { mode: "Publisher site", description: "Read coverage of France, Africa, and world affairs directly at RFI." },
  economist: { mode: "Selected free reads", description: "Some articles are public; availability and subscription limits are set by The Economist." },
  "global-voices": { mode: "Open licence", description: "Local perspectives from around the world; much original work is available under CC BY." },
  "open-newswire": { mode: "Open index", description: "Browse reusable reporting by licence, beginning with openly available English coverage." }
});

function getEnglishSourceUi(source) {
  return englishSourceUiCopy[source.id] || {
    mark: String(source.shortName || source.name || "EN").slice(0, 1).toUpperCase(),
    mode: "English reading",
    description: "Browse the English texts currently available from this source."
  };
}

function getEnglishNewsUi(source) {
  return englishNewsUiCopy[source.id] || {
    mode: "Publisher site",
    description: "Read publicly available English articles at the publisher's website."
  };
}

function getEnglishArticleSourceUi(article) {
  const isChapter = article.contentScope === "chapter";
  const descriptions = {
    voa: "Only VOA-produced learning text is included; audio, images, and third-party wire material are excluded.",
    nasa: "Only plain text from the official NASA page is included; images, marks, downloads, and third-party material are excluded.",
    "standard-ebooks": "The opening chapter is included as plain text; the complete public-domain edition remains available from the source.",
    "global-voices": "Only an English plain-text adaptation of original Global Voices text is included under CC BY 3.0; partner republications, media, captions, long quotations, and parenthetical non-English spellings are excluded."
  };
  return {
    label: isChapter ? "Opening chapter" : "Official text",
    description: descriptions[article.sourceId] || "This clean-text reading is included with a link back to its original source.",
    linkLabel: isChapter ? "View complete edition and source" : "View original page and source"
  };
}

function getEnglishArticleSourceName(article) {
  return article.sourceId === "local" ? "Leafbound Essays" : article.source;
}

function getClassicalTypography(preferences = {}) {
  const requestedFont = String(preferences.classicalFont || "");
  const font = classicalFontOptions.some((option) => option.id === requestedFont) ? requestedFont : "song";
  const requestedScale = Number(preferences.classicalFontScale);
  const scale = Number(Math.max(0.84, Math.min(1.32, Number.isFinite(requestedScale) ? requestedScale : 1)).toFixed(2));
  const requestedLeading = Number(preferences.classicalLineHeight);
  const leading = classicalLeadingOptions.some((option) => option.value === requestedLeading) ? requestedLeading : 1;
  const optionValue = (group, candidate, fallback) => classicalJyutpingOptions[group]
    .some((option) => option.value === candidate) ? candidate : fallback;
  return {
    font,
    scale,
    leading,
    readingMode: classicalReadingModes.some((option) => option.id === preferences.classicalReadingMode)
      ? preferences.classicalReadingMode
      : "parallel",
    jyutpingSize: optionValue("size", preferences.classicalJyutpingSize, "medium"),
    jyutpingColor: optionValue("color", preferences.classicalJyutpingColor, "jade"),
    jyutpingOpacity: optionValue("opacity", preferences.classicalJyutpingOpacity, "standard"),
    jyutpingGap: optionValue("gap", preferences.classicalJyutpingGap, "standard")
  };
}

const player = {
  episodeId: null,
  currentTime: 0,
  isPlaying: false,
  timer: null,
  audio: null,
  audioEpisodeId: null,
  mediaDuration: 0,
  lastPersistSecond: -1,
  spokenSegment: -1,
  abStart: null,
  abEnd: null
};

const cantoneseSpeech = {
  status: "checking",
  voice: null
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemProgress(state, kind, item) {
  let fallback = 0;
  if (kind === "article") fallback = state.readingProgress[item.id] || 0;
  if (kind === "episode") fallback = progressPercent(state.playbackProgress[item.id] || 0, item.duration);
  return getContentProgress(state, kind, item.id, fallback);
}

function contentStatusMeta(progress, language = "zh-Hant") {
  const value = Math.round(Math.max(0, Math.min(100, Number(progress) || 0)));
  const status = contentProgressStatus(value);
  if (language === "en") {
    if (status === "completed") return { status, label: "Completed", detail: `${value}% complete`, seen: true };
    if (status === "seen") return { status, label: "Read", detail: `${value}% read`, seen: true };
    if (status === "in-progress") return { status, label: "Reading", detail: `${value}% read`, seen: false };
    return { status, label: "Unread", detail: "Unread", seen: false };
  }
  if (status === "completed") return { status, label: "已完成", detail: `已完成 ${value}%`, seen: true };
  if (status === "seen") return { status, label: "已閱", detail: `已閱 ${value}%`, seen: true };
  if (status === "in-progress") return { status, label: "進行中", detail: `進行中 ${value}%`, seen: false };
  return { status, label: "未讀", detail: "未讀", seen: false };
}

function renderReadingStateButton(kind, id, progress, title, language = "zh-Hant") {
  const meta = contentStatusMeta(progress, language);
  const key = contentActivityKey(kind, id);
  const action = language === "en"
    ? meta.seen ? "Mark as unread" : "Mark as read"
    : meta.seen ? "標為未讀" : "標為已閱";
  return `
    <button class="reading-state-toggle is-${meta.status}" type="button" data-toggle-content-seen="${escapeHtml(key)}"
      data-content-status-key="${escapeHtml(key)}" data-content-title="${escapeHtml(title)}" aria-pressed="${meta.seen}"
      aria-label="${action}：${escapeHtml(title)}" title="${action}">
      <span class="reading-state-seal" aria-hidden="true">${language === "en" ? "✓" : "閱"}</span>
      <small data-content-status-copy>${meta.label}</small>
    </button>`;
}

function renderListReadingMark(progress, language = "zh-Hant") {
  const meta = contentStatusMeta(progress, language);
  if (!meta.seen) return "";
  return `<span class="content-read-mark is-${meta.status}" title="${meta.detail}"><i aria-hidden="true">${language === "en" ? "✓" : "閱"}</i><span>${meta.detail}</span></span>`;
}

function selectDailyItem(items, kind, state, now, offset, preferred = null, recentIds = []) {
  return pickDailyItem(items, {
    date: now,
    offset,
    preferred,
    recentIds,
    isSeen: (item) => itemProgress(state, kind, item) >= SEEN_PROGRESS_THRESHOLD,
    seenAt: (item) => Date.parse(state.contentActivity?.[contentActivityKey(kind, item.id)]?.seenAt || "")
  });
}

function recentDailySelectionIds(state, field, dayKey) {
  return Object.entries(state.dailySelections || {})
    .filter(([storedDay, selection]) => storedDay < dayKey && selection?.[field])
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([, selection]) => selection[field]);
}

function recordedDailySelection(items, kind, state, id) {
  const item = id && items.find((candidate) => candidate.id === id);
  if (!item) return null;
  const progress = itemProgress(state, kind, item);
  const hasUnreadAlternative = progress >= SEEN_PROGRESS_THRESHOLD
    && items.some((candidate) => candidate.id !== item.id && itemProgress(state, kind, candidate) < SEEN_PROGRESS_THRESHOLD);
  if (hasUnreadAlternative) return null;
  return {
    item,
    reread: progress >= SEEN_PROGRESS_THRESHOLD
  };
}

function rememberDailySelection(state, dayKey, selection) {
  const entries = Object.entries({ ...(state.dailySelections || {}), [dayKey]: selection })
    .filter(([storedDay]) => /^\d{4}-\d{2}-\d{2}$/.test(storedDay))
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, DAILY_SELECTION_RETENTION);
  return { ...state, dailySelections: Object.fromEntries(entries) };
}

function safeExternalHref(value = "") {
  const href = String(value);
  return /^https:\/\/[^\s]+$/i.test(href) ? escapeHtml(href) : "#";
}

function parseRoute() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = routePages.has(parts[0]) ? parts[0] : "today";
  return { page, id: parts[1] || null };
}

function isCollectionListRoute(route) {
  return !route?.id && ["cantonese", "english"].includes(route?.page);
}

function writeCollectionSession() {
  try {
    window.sessionStorage.setItem(COLLECTION_SESSION_KEY, JSON.stringify({
      version: 1,
      routes: collectionSession
    }));
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts; the view still works in memory.
  }
}

function persistCollectionRoute(route, scrollY = window.scrollY) {
  if (!isCollectionListRoute(route)) return;
  if (route.page === "cantonese") {
    collectionSession.cantonese = {
      sourceFilter: ui.sourceFilter,
      level: ui.cantoneseLevel,
      limit: normalizedCollectionLimit(ui.cantoneseLimit),
      scrollY: Math.max(0, Number(scrollY) || 0)
    };
  } else {
    collectionSession.english = {
      sourceFilter: ui.englishSourceFilter,
      category: ui.englishCategory,
      limit: normalizedCollectionLimit(ui.englishLimit),
      scrollY: Math.max(0, Number(scrollY) || 0)
    };
  }
  writeCollectionSession();
}

let lastRenderedRoute = parseRoute();
let collectionScrollRestorePage = isCollectionListRoute(lastRenderedRoute) ? lastRenderedRoute.page : null;
let collectionScrollPersistTimer = null;

function routeTo(page, id = null) {
  persistCollectionRoute(parseRoute());
  const nextHash = `#${page}${id ? `/${id}` : ""}`;
  if (window.location.hash === nextHash) {
    recordRouteVisit({ page, id });
    render();
  } else {
    window.location.hash = nextHash;
  }
}

function recordRouteVisit(route) {
  if (!route.id) return;
  appStore.update((state) => {
    if (route.page === "poetry") return touchHistoryInState(state, "poems", route.id);
    if (route.page === "english") return touchHistoryInState(state, "articles", route.id);
    if (route.page === "cantonese") return touchHistoryInState(state, "episodes", route.id);
    return state;
  }, false);
}

let activeDailyKey = getLocalDayKey();
let dailyRefreshTimer = null;
let poetryProgressCleanup = null;

function syncContentStatusDom(kind, id, progress) {
  const key = contentActivityKey(kind, id);
  const meta = contentStatusMeta(progress);
  document.querySelectorAll(`[data-content-status-key="${CSS.escape(key)}"]`).forEach((button) => {
    button.classList.remove("is-unread", "is-in-progress", "is-seen", "is-completed");
    button.classList.add(`is-${meta.status}`);
    button.setAttribute("aria-pressed", String(meta.seen));
    const title = button.dataset.contentTitle || "這項內容";
    const action = meta.seen ? "標為未讀" : "標為已閱";
    button.setAttribute("aria-label", `${action}：${title}`);
    button.title = action;
    const copy = button.querySelector("[data-content-status-copy]");
    if (copy) copy.textContent = meta.label;
  });
}

function setupPoetryProgressTracking() {
  poetryProgressCleanup?.();
  poetryProgressCleanup = null;
  const reader = document.querySelector("[data-poetry-progress]");
  if (!reader) return;
  const poemId = reader.dataset.poetryProgress;
  let frame = null;
  const update = () => {
    frame = null;
    const absoluteTop = window.scrollY + reader.getBoundingClientRect().top;
    const travel = reader.offsetHeight - window.innerHeight;
    const progress = travel <= 0
      ? 100
      : Math.max(0, Math.min(100, ((window.scrollY - absoluteTop) / travel) * 100));
    const nextState = appStore.update((state) => setContentProgressInState(state, "poem", poemId, progress), false);
    syncContentStatusDom("poem", poemId, getContentProgress(nextState, "poem", poemId));
  };
  const queueUpdate = () => {
    if (frame != null) return;
    frame = window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queueUpdate, { passive: true });
  window.addEventListener("resize", queueUpdate);
  poetryProgressCleanup = () => {
    window.removeEventListener("scroll", queueUpdate);
    window.removeEventListener("resize", queueUpdate);
    if (frame != null) window.cancelAnimationFrame(frame);
  };
}

function refreshDailyContentIfNeeded(now = new Date()) {
  const nextKey = getLocalDayKey(now);
  if (nextKey === activeDailyKey) return false;
  activeDailyKey = nextKey;
  if (parseRoute().page === "today") {
    render();
    announce("今日內容已更新");
  }
  return true;
}

function scheduleDailyRefresh(now = new Date()) {
  window.clearTimeout(dailyRefreshTimer);
  const nextLocalDay = new Date(now);
  nextLocalDay.setHours(24, 0, 0, 80);
  const delay = Math.max(1_000, nextLocalDay.getTime() - now.getTime());
  dailyRefreshTimer = window.setTimeout(() => {
    refreshDailyContentIfNeeded();
    scheduleDailyRefresh();
  }, delay);
}

function announce(message) {
  liveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
}

function cantoneseVoiceMessage() {
  if (cantoneseSpeech.status === "available") {
    return {
      title: "已偵測到粵語聲線",
      detail: `可使用「${cantoneseSpeech.voice.name}」合成朗讀；它仍不是節目原聲。`
    };
  }
  if (cantoneseSpeech.status === "checking") {
    return {
      title: "正在檢查本機聲線",
      detail: "檢查完成前不會播放，以免誤用普通話聲線。"
    };
  }
  if (cantoneseSpeech.status === "unsupported") {
    return {
      title: "這個瀏覽器不支援本機朗讀",
      detail: "目前條目只提供粵語逐字稿，不會使用其他語言代替。"
    };
  }
  return {
    title: "未偵測到粵語聲線",
    detail: "可改用 Microsoft Edge 的線上粵語自然聲線，或安裝 Windows 離線聲線；普通話不會代替播放。"
  };
}

function renderCantoneseVoiceTools() {
  if (cantoneseSpeech.status === "checking") return "";
  if (cantoneseSpeech.status === "available") {
    return `<button class="voice-refresh-button" type="button" data-refresh-cantonese-voice>重新偵測聲線</button>`;
  }
  if (cantoneseSpeech.status === "unsupported") {
    return `<p class="voice-support-fallback">請改用支援 Web Speech API 的新版 Edge 或 Chrome；逐字稿仍可正常使用。</p>`;
  }

  return `
    <div class="voice-support-tools">
      <div class="voice-status-actions">
        <a class="voice-edge-link" href="${escapeHtml(`microsoft-edge:${window.location.href}`)}">用 Microsoft Edge 開啟</a>
        <a class="voice-settings-link" href="ms-settings:regionlanguage">開啟 Windows 語言設定</a>
        <button class="voice-refresh-button" type="button" data-refresh-cantonese-voice>重新偵測</button>
      </div>
      <details class="voice-install-guide" ${ui.cantoneseVoiceGuideOpen ? "open" : ""}>
        <summary data-toggle-cantonese-voice-guide>兩種啟用方法</summary>
        <ol>
          <li>推薦：用 Microsoft Edge 開啟本頁，使用 HiuGaai、HiuMaan 或 WanLung 線上自然聲線。</li>
          <li>離線：在 Windows 加入「中文（繁體，香港特別行政區）」，並安裝「文字轉語音」。</li>
          <li>重新開啟瀏覽器，再按「重新偵測」。</li>
        </ol>
        <p>成功後應偵測到 Tracy 或 Danny；Huihui 是普通話，不會被使用。</p>
      </details>
    </div>`;
}

function renderCantoneseVoiceNotice() {
  const message = cantoneseVoiceMessage();
  return `
    <div class="voice-status-note is-${cantoneseSpeech.status}" data-cantonese-voice-status="${cantoneseSpeech.status}">
      <span class="voice-status-mark" aria-hidden="true">${cantoneseSpeech.status === "available" ? "粵" : "止"}</span>
      <div class="voice-status-copy">
        <p><strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.detail)}</span></p>
        ${renderCantoneseVoiceTools()}
      </div>
    </div>`;
}

function refreshCantoneseVoice(finalize = false, shouldRender = true) {
  let nextStatus = "unsupported";
  let nextVoice = null;

  if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
    const voices = window.speechSynthesis.getVoices();
    nextVoice = findCantoneseVoice(voices);
    nextStatus = nextVoice ? "available" : voices.length || finalize ? "unavailable" : "checking";
  }

  const changed = cantoneseSpeech.status !== nextStatus || cantoneseSpeech.voice?.name !== nextVoice?.name;
  cantoneseSpeech.status = nextStatus;
  cantoneseSpeech.voice = nextVoice;

  const currentEpisode = player.episodeId ? findEpisode(player.episodeId) : null;
  if (changed && player.isPlaying && currentEpisode?.audioKind !== "local" && nextStatus !== "available") stopPlayback(false);
  if (changed && shouldRender && parseRoute().page === "cantonese") render();
  return nextVoice;
}

function initializeCantoneseSpeech() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    cantoneseSpeech.status = "unsupported";
    return;
  }
  refreshCantoneseVoice(false, false);
  window.speechSynthesis.addEventListener?.("voiceschanged", () => refreshCantoneseVoice(false, true));
  window.setTimeout(() => refreshCantoneseVoice(true, true), 1200);
}

function pageLabel(route) {
  if (route.page === "poetry" && route.id) return findPoem(route.id).title;
  if (route.page === "cantonese" && route.id) return "正在收聽";
  if (route.page === "english" && route.id) return "Article Reader";
  if (route.page === "cantonese") return "粵語";
  if (route.page === "english") return "English";
  return navItems.find((item) => item.id === route.page)?.label || "今日";
}

function favoriteButton(key, label, language = "zh-Hant") {
  const active = appStore.getState().favorites.includes(key);
  const action = language === "en"
    ? active ? `Remove ${label} from favourites` : `Add ${label} to favourites`
    : active ? `取消收藏${label}` : `收藏${label}`;
  return `
    <button class="icon-button ${active ? "is-active" : ""}" type="button"
      data-toggle-favorite="${escapeHtml(key)}"
      aria-label="${escapeHtml(action)}"
      aria-pressed="${active}">
      ${icon(active ? "heartFill" : "heart")}
    </button>`;
}

function progressLine(value, label = "進度") {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `
    <div class="progress-line" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(safe)}">
      <span style="width: ${safe}%"></span>
    </div>`;
}

function renderShell(route) {
  const isEnglish = route.page === "english";
  const activeNavId = ["language", "cantonese", "english"].includes(route.page) ? "language" : route.page;
  return `
    <div class="app-shell" data-page="${route.page}" lang="${isEnglish ? "en" : "zh-Hant"}">
      <header class="topbar">
        <button class="wordmark" type="button" data-route="today" aria-label="${isEnglish ? "Go to Today" : "回到今日"}">
          <span class="wordmark-seal" aria-hidden="true">${isEnglish ? "L" : "拾"}</span>
          <span class="wordmark-copy"><strong>Leafbound</strong><small>${isEnglish ? "Personal Language Library" : "拾頁 · 私人語言書房"}</small></span>
        </button>
        <div class="topbar-context" aria-hidden="true">
          <span>${escapeHtml(pageLabel(route))}</span>
        </div>
        <button class="search-trigger" type="button" data-open-search aria-label="${isEnglish ? "Search English reading" : "搜尋所有內容"}">
          ${icon("search")}
          <span>${isEnglish ? "Search" : "搜尋"}</span>
          <kbd>/</kbd>
        </button>
      </header>

      <main id="main-content" class="main-content" tabindex="-1">
        ${renderRoute(route)}
      </main>

      <nav class="bottom-nav" aria-label="${isEnglish ? "Primary navigation" : "主要導航"}">
        ${navItems.map((item) => `
          <button class="nav-item ${activeNavId === item.id ? "is-active" : ""}" type="button"
            data-route="${item.id}" aria-current="${activeNavId === item.id ? "page" : "false"}">
            <span class="nav-icon">${icon(item.icon)}</span>
            <span>${isEnglish ? englishShellNavLabels[item.id] : item.label}</span>
          </button>`).join("")}
      </nav>
    </div>
    ${renderOverlays(route)}`;
}

function renderRoute(route) {
  if (route.page === "poetry") return route.id ? renderPoemReader(route.id) : renderPoetryIndex();
  if (route.page === "language") return renderLanguageHub();
  if (route.page === "cantonese") return route.id ? renderEpisodePlayer(route.id) : renderCantoneseFeed();
  if (route.page === "english") return route.id ? renderArticleReader(route.id) : renderEnglishIndex();
  if (route.page === "library") return renderLibrary();
  return renderToday();
}

function renderLanguageHub() {
  return `
    <section class="language-hub page-enter" aria-labelledby="language-hub-title">
      <header class="language-hub-hero">
        <p class="eyebrow">Language Library</p>
        <h1 id="language-hub-title">語言，在聲音與文字之間。</h1>
        <p>從粵語的聲音進入日常，也從 English 的文章進入世界。兩座書架，共用同一份收藏與學習進度。</p>
      </header>

      <div class="language-portals" aria-label="選擇語言書架">
        <button class="language-portal language-portal-cantonese" type="button" data-route="cantonese" aria-label="進入粵語">
          <span class="language-portal-mark" aria-hidden="true">粵</span>
          <span class="language-portal-copy">
            <span class="language-portal-eyebrow">Listen · Jyutping</span>
            <strong class="language-portal-title">粵語</strong>
            <span class="language-portal-description">香港口語、分級故事與逐字粵拼。先聽見語氣，再跟上每一個字。</span>
          </span>
          <span class="language-portal-footer">
            <span><b>${episodes.length}</b> 篇可讀逐字稿</span>
            <span class="language-portal-action">進入粵語 ${icon("arrow")}</span>
          </span>
        </button>

        <div class="language-hinge" aria-hidden="true">
          <span>聲</span>
          <i></i>
          <span>Aa</span>
        </div>

        <button class="language-portal language-portal-english" type="button" data-route="english" aria-label="Open English" lang="en">
          <span class="language-portal-mark" aria-hidden="true">Aa</span>
          <span class="language-portal-copy">
            <span class="language-portal-eyebrow">Read · Look up</span>
            <strong class="language-portal-title">English</strong>
            <span class="language-portal-description">Full-text reading, contextual definitions, usage notes, and vocabulary you can keep.</span>
          </span>
          <span class="language-portal-footer">
            <span><b>${dailyEnglishArticles.length}</b> full-text reads</span>
            <span class="language-portal-action">Open English ${icon("arrow")}</span>
          </span>
        </button>
      </div>
    </section>`;
}

function renderToday() {
  let state = appStore.getState();
  const now = new Date();
  const dailyKey = getLocalDayKey(now);
  const preferredPoem = getTodayPoem(now);
  const preferredArticle = dailyEnglishArticles[getDailyIndex(dailyEnglishArticles.length, now, 11)] || articles[0];
  const preferredEpisode = episodes[getDailyIndex(episodes.length, now, 2)] || episodes[0];
  const recorded = state.dailySelections?.[dailyKey] || {};
  const poemSelection = recordedDailySelection(dailyPoems, "poem", state, recorded.poem)
    || selectDailyItem(dailyPoems, "poem", state, now, 0, preferredPoem, recentDailySelectionIds(state, "poem", dailyKey));
  const articleSelection = recordedDailySelection(dailyEnglishArticles, "article", state, recorded.article)
    || selectDailyItem(dailyEnglishArticles, "article", state, now, 11, preferredArticle, recentDailySelectionIds(state, "article", dailyKey));
  const episodeSelection = recordedDailySelection(episodes, "episode", state, recorded.episode)
    || selectDailyItem(episodes, "episode", state, now, 2, preferredEpisode, recentDailySelectionIds(state, "episode", dailyKey));
  const poem = poemSelection.item;
  const article = articleSelection.item;
  const episode = episodeSelection.item;
  const poemFeature = buildDailyPoemFeature(poem);
  const todaySelection = { poem: poem.id, article: article.id, episode: episode.id };
  if (["poem", "article", "episode"].some((field) => recorded[field] !== todaySelection[field])) {
    state = appStore.update((current) => rememberDailySelection(current, dailyKey, todaySelection), false);
  }
  const articleProgress = itemProgress(state, "article", article);
  const episodeTime = Math.min(episode.duration, state.playbackProgress[episode.id] || 0);
  const episodeProgress = itemProgress(state, "episode", episode);
  const remaining = Math.max(1, Math.ceil(article.minutes * (1 - articleProgress / 100)));
  const articleStarted = articleProgress > 0 && articleProgress < COMPLETE_PROGRESS_THRESHOLD;
  const articleCompleted = articleProgress >= COMPLETE_PROGRESS_THRESHOLD;
  const articleKicker = articleSelection.reread
    ? `Today's reread · ${article.minutes} MIN`
    : articleStarted
    ? `Continue reading · 還有 ${remaining} 分鐘`
    : articleCompleted
      ? `Today's reread · ${article.minutes} MIN`
      : `Today's reading · ${article.minutes} MIN`;
  const articleAction = articleSelection.reread ? "重新閱讀" : articleStarted ? "繼續閱讀" : articleCompleted ? "重新閱讀" : "開始閱讀";
  const episodeStarted = episodeTime > 0 && episodeTime < episode.duration;
  const episodeCompleted = episodeProgress >= COMPLETE_PROGRESS_THRESHOLD;
  const episodeKicker = `${episodeSelection.reread ? "今日重聽" : episodeStarted ? "今日續聽" : episodeCompleted ? "今日重聽" : "今日選聽"} · ${episode.source}`;
  const episodeAction = episodeSelection.reread ? "重新收聽" : episodeStarted ? "繼續收聽" : episodeCompleted ? "重新收聽" : "開始收聽";
  const date = new Intl.DateTimeFormat("zh-Hant", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(now);

  return `
    <section class="today-view page-enter" data-daily-key="${dailyKey}">
      <div class="today-heading">
        <p class="eyebrow">${escapeHtml(date)}</p>
        <h1>今天，從一頁開始。</h1>
        <p>不追趕進度，只回到值得細讀的一段文字、一個聲音。</p>
      </div>

      <div class="today-layout">
        <article class="daily-poem reading-sheet" data-daily-poem="${escapeHtml(poem.id)}">
          <div class="reading-thread" aria-hidden="true"><span></span></div>
          <div class="sheet-meta">
            <span>${poemSelection.reread ? "今日重讀" : "今日一詩"}</span>
            <span>${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.form)}</span>
          </div>
          <div class="poem-preview">
            <p class="poem-author">${escapeHtml(poem.poet)}</p>
            <h2 class="poem-featured-quote" data-daily-poem-quote aria-label="${escapeHtml(poemFeature.quote)}">${renderDailyPoemFeature(poemFeature)}</h2>
            <p class="poem-work-title" data-daily-poem-title>《${escapeHtml(poem.title)}》</p>
          </div>
          <div class="sheet-actions">
            <button class="text-link" type="button" data-route="poetry" data-route-id="${poem.id}">
              閱讀全文 ${icon("arrow")}
            </button>
            ${favoriteButton(`poem:${poem.id}`, poem.title)}
          </div>
        </article>

        <div class="continue-shelf">
          <div class="shelf-heading">
            <p class="eyebrow">今日選讀 · 選聽</p>
            <p>每天按本地日期更換；同一書架輪完前不重複，進度仍只留在這部裝置。</p>
          </div>

          <article class="continue-item" data-daily-article="${escapeHtml(article.id)}">
            <div class="continue-index" aria-hidden="true">EN</div>
            <div class="continue-copy">
              <p class="item-kicker">${escapeHtml(articleKicker)}</p>
              <h3>${escapeHtml(article.title)}</h3>
              <p>${escapeHtml(article.deck)}</p>
              ${progressLine(articleProgress, `${article.title} 閱讀進度`)}
              <button class="text-link" type="button" data-route="english" data-route-id="${article.id}">
                ${articleAction} ${icon("arrow")}
              </button>
            </div>
          </article>

          <article class="continue-item" data-daily-episode="${escapeHtml(episode.id)}">
            <div class="continue-index sound-index" aria-hidden="true">粵</div>
            <div class="continue-copy">
              <p class="item-kicker">${escapeHtml(episodeKicker)}</p>
              <h3>${escapeHtml(episode.title)}</h3>
              <p>${formatTime(episodeTime)} / ${formatTime(episode.duration)}</p>
              ${progressLine(episodeProgress, `${episode.title} 播放進度`)}
              <button class="text-link" type="button" data-route="cantonese" data-route-id="${episode.id}">
                ${episodeAction} ${icon("arrow")}
              </button>
            </div>
          </article>
        </div>
      </div>

      <footer class="today-footnote">
        <span>今日不必完成很多。</span>
        <span>留下想再回來的一頁，就夠了。</span>
      </footer>
    </section>`;
}

function poetryKindWorks(kind = ui.poetryKind) {
  return kind === "全部" ? poems : poems.filter((poem) => poem.kind === kind);
}

function poetryWorkUnit(kind = ui.poetryKind) {
  return ["詩", "詞", "曲"].includes(kind) ? "首" : "篇";
}

function filteredPoems() {
  const query = ui.poetryQuery.trim().toLocaleLowerCase();
  return poems.filter((poem) => {
    const matchesKind = ui.poetryKind === "全部" || poem.kind === ui.poetryKind;
    const matchesFacets = Object.entries(ui.poetryFilters).every(([facet, value]) => {
      return poetryMatchesFacet(poem, facet, value);
    });
    const searchable = [poem.kind, poem.title, poem.poet, poem.dynasty, poem.form, poem.originalSource, ...poem.themes, ...poem.lines.map((line) => line.text)].join(" ").toLocaleLowerCase();
    return matchesKind && matchesFacets && (!query || searchable.includes(query));
  });
}

function visiblePoetryFacetValues() {
  const candidates = poetryKindWorks();
  return poetryFacetValues(candidates, ui.poetryFacet, ui.poetryFilters[ui.poetryFacet]);
}

function activePoetryFilters() {
  return Object.entries(ui.poetryFilters).filter(([, value]) => Boolean(value));
}

function clearPoetryFilters() {
  Object.keys(ui.poetryFilters).forEach((facet) => {
    ui.poetryFilters[facet] = null;
  });
}

function renderActivePoetryFilters() {
  const active = activePoetryFilters();
  if (!active.length) return "";
  return `
    <div class="active-poetry-filters" aria-label="已選古典文庫條件">
      <span class="filter-thread-label">文庫篩選</span>
      <div class="active-filter-list">
        ${active.map(([facet, value]) => `
          <button type="button" data-remove-poetry-filter="${facet}" aria-label="移除${poetryFacetLabel(facet, ui.poetryKind)}條件${escapeHtml(value)}">
            <small>${poetryFacetLabel(facet, ui.poetryKind)}</small>${escapeHtml(value)} <span aria-hidden="true">×</span>
          </button>`).join("")}
      </div>
      <button class="clear-filter-link" type="button" data-clear-poetry>清除全部</button>
    </div>`;
}

function renderPoetryIndex() {
  const state = appStore.getState();
  const results = filteredPoems();
  const visibleResults = results.slice(0, ui.poetryLimit);
  const active = activePoetryFilters();
  const resultUnit = poetryWorkUnit();
  const facetDefinitions = poetryFacetDefinitions(ui.poetryKind);
  const activeFacetLabel = poetryFacetLabel(ui.poetryFacet, ui.poetryKind);

  return `
    <section class="collection-view page-enter">
      <header class="section-hero poetry-hero">
        <div>
          <p class="eyebrow">古典文庫</p>
          <h1>詩、詞、曲與古文，<br>在同一座書房。</h1>
        </div>
      </header>

      <nav class="literature-kinds" aria-label="古典文庫分類">
        ${poetryKinds.map((kind) => {
          const detail = poetryKindDetails[kind];
          const count = poetryKindWorks(kind).length;
          return `
            <button type="button" class="literature-kind ${ui.poetryKind === kind ? "is-active" : ""}"
              data-poetry-kind="${kind}" aria-pressed="${ui.poetryKind === kind}">
              <span class="literature-kind-copy"><small>${detail.eyebrow}</small><strong>${kind}</strong><em>${detail.description}</em></span>
              <span class="literature-kind-count">${count}<small>${poetryWorkUnit(kind)}</small></span>
            </button>`;
        }).join("")}
      </nav>

      <div class="filter-studio" aria-label="古典文庫篩選">
        <label class="inline-search">
          ${icon("search")}
          <span class="sr-only">搜尋篇名、作者或原文</span>
          <input type="search" value="${escapeHtml(ui.poetryQuery)}" data-poetry-search placeholder="搜尋篇名、作者或一句原文" autocomplete="off" />
        </label>
        <div class="facet-tabs" role="tablist" aria-label="分類方式">
          ${facetDefinitions.map(({ id, label }) => `
            <button type="button" role="tab" class="facet-tab ${ui.poetryFacet === id ? "is-active" : ""}"
              data-poetry-facet="${id}" aria-selected="${ui.poetryFacet === id}">按${label}</button>`).join("")}
        </div>
        <div class="filter-chips" aria-label="${activeFacetLabel}選項">
          ${visiblePoetryFacetValues().map((value) => `
            <button type="button" class="filter-chip ${(value === "全部" ? !ui.poetryFilters[ui.poetryFacet] : ui.poetryFilters[ui.poetryFacet] === value) ? "is-active" : ""}"
              data-poetry-filter="${escapeHtml(value)}" aria-pressed="${value === "全部" ? !ui.poetryFilters[ui.poetryFacet] : ui.poetryFilters[ui.poetryFacet] === value}">${escapeHtml(value)}</button>`).join("")}
        </div>
      </div>

      ${renderActivePoetryFilters()}

      <div class="result-heading">
        <span>${results.length} ${resultUnit}</span>
        <span>${active.length ? active.map(([, value]) => escapeHtml(value)).join(" · ") : ui.poetryKind === "全部" ? "全部古典內容" : `全部${ui.poetryKind}`}</span>
      </div>

      <div class="poem-list">
        ${results.length ? visibleResults.map((poem, index) => {
          const progress = itemProgress(state, "poem", poem);
          const status = contentStatusMeta(progress);
          return `
          <article class="poem-row is-${status.status}">
            <button class="poem-row-main" type="button" data-route="poetry" data-route-id="${poem.id}">
              <span class="poem-number">${String(index + 1).padStart(2, "0")}</span>
              <span class="poem-row-title">
                <strong class="poem-row-quote">${escapeHtml(poem.featuredQuote)}</strong>
                <small class="poem-row-work-title">《${escapeHtml(poem.title)}》</small>
                <span class="poem-row-foot"><em class="poem-row-meta">${escapeHtml(poem.poet)} · ${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.form)}</em>${renderListReadingMark(progress)}</span>
              </span>
              <span class="row-arrow">${icon("arrow")}</span>
            </button>
            ${favoriteButton(`poem:${poem.id}`, poem.title)}
          </article>`;
        }).join("") : `
          <div class="empty-state">
            <span class="empty-glyph">未</span>
            <h2>沒有找到相符的內容</h2>
            <p>換一個分類，或試試作者、篇名和原文中的字。</p>
            <button class="secondary-button" type="button" data-clear-poetry>清除篩選</button>
          </div>`}
      </div>
      ${visibleResults.length < results.length ? `
        <div class="poetry-load-more">
          <span>已顯示 ${visibleResults.length} / ${results.length}</span>
          <button class="secondary-button" type="button" data-load-more-poetry>再展開 ${Math.min(24, results.length - visibleResults.length)} ${resultUnit}</button>
        </div>` : ""}
    </section>`;
}

function poetryLineId(poemId, lineIndex) {
  return `poetry:${poemId}:${lineIndex}`;
}

function relatedPoemsFor(poem) {
  const authorReason = poem.kind === "詞" ? "同一詞人" : poem.kind === "詩" ? "同一詩人" : "同一作者";
  const classificationFacet = poem.kind === "詞" ? "tune" : "form";
  const classificationValue = poetryFacetValue(poem, classificationFacet);
  const classificationLabel = poetryFacetLabel(classificationFacet, poem.kind);
  return poems
    .filter((candidate) => candidate.id !== poem.id && candidate.kind === poem.kind)
    .map((candidate) => {
      const sharedThemes = candidate.themes.filter((theme) => poem.themes.includes(theme));
      const sameClassification = Boolean(classificationValue)
        && poetryFacetValue(candidate, classificationFacet) === classificationValue;
      const score = (candidate.poet === poem.poet ? 4 : 0)
        + sharedThemes.length * 2
        + (sameClassification ? 1 : 0)
        + (candidate.dynasty === poem.dynasty ? 1 : 0);
      const reason = candidate.poet === poem.poet
        ? authorReason
        : sharedThemes.length
          ? `同寫${sharedThemes[0]}`
          : sameClassification
            ? `同${classificationLabel} · ${classificationValue}`
            : candidate.dynasty === poem.dynasty
              ? `同屬${poem.dynasty}`
              : "延伸閱讀";
      return { poem: candidate, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.poem.title.localeCompare(b.poem.title, "zh-Hant"))
    .slice(0, 3);
}

function poetryRelationButton(facet, value, label = value, kind = "") {
  return `<button type="button" data-poetry-link-facet="${facet}" data-poetry-link-value="${escapeHtml(value)}"${kind ? ` data-poetry-link-kind="${escapeHtml(kind)}"` : ""}>${escapeHtml(label)}</button>`;
}

function poemThreadCopy(poem) {
  if (poem.kind === "古文") return { label: "文脈", work: "這篇文章" };
  if (poem.kind === "詞") return { label: "詞脈", work: "這首詞" };
  if (poem.kind === "曲") return { label: "曲脈", work: "這首曲" };
  return { label: "詩脈", work: "這首詩" };
}

function renderPoemThread(poem) {
  if (!ui.poemThreadOpen) return "";
  const related = relatedPoemsFor(poem);
  const thread = poemThreadCopy(poem);
  const classificationFacet = poem.kind === "詞" ? "tune" : "form";
  const classificationValue = poetryFacetValue(poem, classificationFacet);
  const classificationLabel = poetryFacetLabel(classificationFacet, poem.kind);
  return `
    <section class="poem-thread-panel" id="poem-thread-panel" aria-label="${thread.label}" tabindex="-1">
      <div class="aside-title"><span>${thread.label}</span><button class="thread-close" type="button" data-toggle-poem-thread>收起</button></div>
      <p class="thread-intro">沿著作者、時代與題材，找到${thread.work}在書房裡的位置。</p>
      <dl class="poem-relations">
        <div><dt>作者</dt><dd>${poetryRelationButton("poet", poem.poet, poem.poet, poem.kind)}</dd></div>
        <div><dt>時代</dt><dd>${poetryRelationButton("dynasty", poem.dynasty, poem.dynasty, poem.kind)}</dd></div>
        ${classificationValue ? `<div><dt>${classificationLabel}</dt><dd>${poetryRelationButton(classificationFacet, classificationValue, classificationValue, poem.kind)}</dd></div>` : ""}
        <div><dt>題材</dt><dd>${poem.themes.map((theme) => poetryRelationButton("theme", theme, theme, poem.kind)).join("")}</dd></div>
      </dl>
      <div class="related-reading">
        <p>接著讀</p>
        ${related.map(({ poem: candidate, reason }) => `
          <button type="button" data-route="poetry" data-route-id="${candidate.id}">
            <span><small>${escapeHtml(reason)}</small><strong>${escapeHtml(candidate.title)}</strong></span>
            <em>${escapeHtml(candidate.poet)}</em>
          </button>`).join("")}
      </div>
      <p class="thread-source"><span>文本來源</span>${escapeHtml(poem.source)}</p>
    </section>`;
}

function renderPoemLineText(line) {
  if (cantoneseLexiconState.status !== "ready") return escapeHtml(line.text);
  return segmentCantoneseText(line.text).map((part) => {
    if (!part.isWord) return escapeHtml(part.text);
    const pronunciation = part.readings.length ? `，候選讀音 ${part.readings.join("、")}` : "";
    return `<button class="poem-term-button" type="button" data-dictionary-term="${escapeHtml(part.text)}" title="查看${escapeHtml(part.text)}${escapeHtml(pronunciation)}">${escapeHtml(part.text)}</button>`;
  }).join("");
}

function jyutpingSyllables(reading) {
  return String(reading || "").match(/[A-Za-z'’-]+?[0-6]/gu) || [];
}

function characterJyutping(character) {
  if (!/^\p{Script=Han}$/u.test(character) || cantoneseLexiconState.status !== "ready") return "";
  const match = segmentCantonesePronunciation(character)
    .find((part) => part.isWord && part.readings.length);
  return jyutpingSyllables(match?.readings?.[0] || "")[0] || "";
}

function renderClassicalRubyBases(bases, sourceSyllables, tokenClass, kind) {
  const syllables = bases.length === sourceSyllables.length
    ? sourceSyllables
    : bases.map((base) => characterJyutping(base));

  return bases.map((base, index) => {
    if (!/^\p{Script=Han}$/u.test(base)) return escapeHtml(base);
    const syllable = syllables[index] || characterJyutping(base);
    if (!syllable) return escapeHtml(base);
    return `<ruby class="classical-jyutping-token ${tokenClass}" data-classical-ruby="${kind}"><span>${escapeHtml(base)}</span><rt lang="yue-Latn" aria-hidden="true">${escapeHtml(syllable)}</rt></ruby>`;
  }).join("");
}

function wrapClassicalPronunciationTerm(text, ruby, reading, interactive) {
  if (!interactive || cantoneseLexiconState.status !== "ready" || !/\p{Script=Han}/u.test(text)) return ruby;
  const candidates = reading ? `，讀音 ${reading}` : "";
  return `<button class="poem-term-button classical-pronunciation-term" type="button" data-dictionary-term="${escapeHtml(text)}" title="查看${escapeHtml(text)}${escapeHtml(candidates)}">${ruby}</button>`;
}

function renderClassicalAnnotatedText(text, curatedReading = "", interactive = true, tokenClass = "verse-jyutping-token") {
  const aligned = curatedReading ? alignCantonesePronunciation(text, curatedReading) : [];
  if (aligned.length) {
    return aligned.map((part) => {
      if (!part.syllables.length) return escapeHtml(part.text);
      const ruby = renderClassicalRubyBases(part.bases, part.syllables, tokenClass, "curated");
      return wrapClassicalPronunciationTerm(part.text, ruby, part.reading, interactive);
    }).join("");
  }

  return segmentCantonesePronunciation(text).map((part) => {
    if (!part.isWord || !part.readings.length) return escapeHtml(part.text);
    const primaryReading = part.readings[0];
    const bases = Array.from(part.text);
    const ruby = renderClassicalRubyBases(
      bases,
      jyutpingSyllables(primaryReading),
      tokenClass,
      "auto"
    );
    return wrapClassicalPronunciationTerm(part.text, ruby, primaryReading, interactive);
  }).join("");
}

function renderProseText(text, showJyutping, interactive = true) {
  if (!showJyutping || cantoneseLexiconState.status !== "ready") {
    return interactive ? renderPoemLineText({ text }) : escapeHtml(text);
  }
  return renderClassicalAnnotatedText(text, "", interactive, "prose-jyutping-token");
}

function requestPoemContent(poem, retry = false) {
  if (!poem?.contentShard || poem.contentLoaded) return null;
  const current = poemContentLoadStates.get(poem.id);
  if (!retry && (current?.status === "loading" || current?.status === "ready" || current?.status === "error")) {
    return current.promise || null;
  }
  const pending = loadPoem(poem.id)
    .then((hydrated) => {
      poemContentLoadStates.set(poem.id, { status: "ready", promise: null });
      const route = parseRoute();
      if (route.page === "poetry" && route.id === poem.id) render();
      return hydrated;
    })
    .catch((error) => {
      poemContentLoadStates.set(poem.id, { status: "error", error, promise: null });
      const route = parseRoute();
      if (route.page === "poetry" && route.id === poem.id) render();
      return null;
    });
  poemContentLoadStates.set(poem.id, { status: "loading", promise: pending });
  return pending;
}

function requestClassicalTranslation(poem, retry = false) {
  if (!poem || poem.translation || getClassicalTranslation(poem)) return null;
  const current = classicalTranslationLoadStates.get(poem.id);
  if (!retry && (current?.status === "loading" || current?.status === "ready" || current?.status === "error" || current?.status === "unavailable")) {
    return current.promise || null;
  }

  const pending = loadClassicalTranslation(poem)
    .then(() => {
      classicalTranslationLoadStates.set(poem.id, { status: "ready", promise: null });
      const route = parseRoute();
      if (route.page === "poetry" && route.id === poem.id) render();
      return getClassicalTranslation(poem);
    })
    .catch((error) => {
      classicalTranslationLoadStates.set(poem.id, {
        status: isClassicalTranslationUnavailableError(error) ? "unavailable" : "error",
        errorCode: error?.code || null,
        promise: null
      });
      const route = parseRoute();
      if (route.page === "poetry" && route.id === poem.id) render();
      return null;
    });
  classicalTranslationLoadStates.set(poem.id, { status: "loading", promise: pending });
  return pending;
}

function classicalTranslationFor(poem) {
  if (String(poem?.translation || "").trim()) {
    return {
      paragraphs: [String(poem.translation).trim()],
      source: {
        label: "Leafbound 今譯",
        status: "人工已校",
        reviewStatus: "reviewed",
        productionReady: true
      }
    };
  }
  return getClassicalTranslation(poem);
}

function effectiveClassicalReadingMode(requested, translation) {
  const review = classicalTranslationReviewMeta(translation, { inline: Boolean(translation && !translation.source) });
  if (!translation || review.id === "rejected") return "original";
  return classicalReadingModes.some((option) => option.id === requested) ? requested : "parallel";
}

function renderClassicalReadingControls(poem, translation, requestedMode) {
  const loadState = classicalTranslationLoadStates.get(poem.id)?.status;
  const review = classicalTranslationReviewMeta(translation, { inline: Boolean(poem.translation) });
  const mode = effectiveClassicalReadingMode(requestedMode, translation);
  const available = Boolean(translation) && review.id !== "rejected";
  const warnings = Array.isArray(translation?.source?.warnings) ? translation.source.warnings : [];
  const reviewCopy = review.id === "reviewed"
    ? "已完成內容校對"
    : review.id === "machine-draft"
      ? "只作理解參考，尚未人工校對"
      : review.id === "rejected"
        ? "此稿已退回，不會作為今譯展示"
        : available
          ? review.label === "初步可用"
            ? "已完成初篩，仍待逐篇內容精校"
            : "等待內容校對"
          : loadState === "loading"
            ? "正在載入本地今譯"
            : loadState === "error"
              ? "今譯載入失敗"
              : "這篇尚未收錄今譯";

  return `
    <section class="classical-reading-controls" aria-label="閱讀模式">
      <div class="classical-reading-tabs" role="tablist" aria-label="切換原文與今譯">
        ${classicalReadingModes.map((option) => {
          const disabled = option.id !== "original" && !available;
          return `<button type="button" role="tab" data-classical-reading-mode="${option.id}"
            class="${mode === option.id ? "is-active" : ""}" aria-selected="${mode === option.id}"
            ${disabled ? "disabled" : ""}>${option.label}</button>`;
        }).join("")}
      </div>
      <div class="translation-review is-${review.tone}" data-translation-review-status="${review.id}">
        <span aria-hidden="true">${review.id === "reviewed" ? "校" : review.id === "machine-draft" ? "機" : review.id === "rejected" ? "退" : "譯"}</span>
        <p><strong>${escapeHtml(review.label)}</strong><small>${escapeHtml(reviewCopy)}${warnings.length ? ` · ${warnings.length} 項結構警告` : ""}</small></p>
        ${loadState === "error" ? `<button type="button" data-retry-classical-translation="${escapeHtml(poem.id)}">重試</button>` : ""}
      </div>
    </section>`;
}

function renderPoemDetails(poem) {
  const details = [
    { label: "注釋", content: poem.annotation, open: true },
    { label: "賞析", content: poem.appreciation, open: false },
    { label: "典故", content: poem.allusion, open: false }
  ].filter(({ content }) => Boolean(content));

  if (!details.length) return "";

  return details.map(({ label, content, open }) => {
    const paragraphs = [content];
    return `
    <details class="reader-detail" ${open ? "open" : ""}>
      <summary><span>${label}</span>${icon("chevron")}</summary>
      <div class="reader-detail-body">
        ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </div>
    </details>`;
  }).join("");
}

function renderPoemSourceCard(poem) {
  if (!poem.isOpenCorpus) return "";
  return `
    <section class="poem-source-card">
      <p class="eyebrow">Open corpus</p>
      <strong>${escapeHtml(poem.collection || poem.source)}</strong>
      <span>${escapeHtml(poem.source)} · ${escapeHtml(poem.sourceLicense || "")}</span>
      ${poem.originalSource ? `<span>原典 · ${escapeHtml(poem.originalSource)}</span>` : ""}
      ${poem.sourceRevision ? `<small>固定版本 ${escapeHtml(poem.sourceRevision)}</small>` : ""}
      ${poem.sourceUrl ? `<a href="${safeExternalHref(poem.sourceUrl)}" target="_blank" rel="noreferrer">查看原始資料</a>` : ""}
    </section>`;
}

function classicalLinePronunciation(line) {
  const curated = String(line?.jyutping || "").trim();
  if (curated) return { value: curated, kind: "curated" };
  if (cantoneseLexiconState.status !== "ready") return { value: "", kind: "pending" };
  return {
    value: buildCantonesePronunciationLine(line?.text || ""),
    kind: "auto"
  };
}

function renderClassicalPronunciationNote(poem) {
  const pronounceableLines = poem.lines.filter((line) => /[\p{Script=Han}A-Za-z0-9]/u.test(line.text));
  const curatedCount = pronounceableLines.filter((line) => Boolean(String(line.jyutping || "").trim())).length;
  const allCurated = pronounceableLines.length > 0 && curatedCount === pronounceableLines.length;
  const ready = cantoneseLexiconState.status === "ready";
  const generatedCount = ready
    ? pronounceableLines.filter((line) => !line.jyutping && classicalLinePronunciation(line).value).length
    : 0;
  const coveredCount = curatedCount + generatedCount;

  let mark = "音";
  let heading = "正在準備全文粵拼";
  let copy = "完成後會逐字標在原文上方；已有人工作校的讀音會優先保留。";
  let action = "";

  if (allCurated) {
    mark = "校";
    heading = `人工校訂 · ${curatedCount} 行`;
    copy = `此作使用逐行保存的${poem.jyutpingStatus || "校訂讀音"}，並逐字標在原文上方；古典語境仍可能存在不同讀法。`;
  } else if (ready) {
    heading = `全文粵拼 · ${coveredCount} 行`;
    copy = curatedCount
      ? "人工校訂優先，其餘讀音逐字標在原文上方；多音字可點詞查看其他讀法。"
      : "每個漢字上方均顯示本機詞表的首個候選；多音字及古典語境可能有不同讀法。";
  } else if (cantoneseLexiconState.status === "error") {
    mark = "再";
    heading = curatedCount ? `已顯示 ${curatedCount} 行校訂粵拼` : "自動粵拼未能載入";
    copy = "正文仍可閱讀；重新載入後會繼續補齊未校訂的行。";
    action = `<button type="button" data-retry-cantonese-lexicon>重新載入</button>`;
  }

  return `
    <aside class="pronunciation-note is-${cantoneseLexiconState.status}" data-lexicon-status="${cantoneseLexiconState.status}">
      <span class="pronunciation-mark" aria-hidden="true">${mark}</span>
      <div><strong>${escapeHtml(heading)}</strong><p>${escapeHtml(copy)}</p></div>
      ${action}
    </aside>`;
}

function renderPoemSourceLines(poem, lines, savedLineIds, showJyutping, parallel = false) {
  if (poem.kind === "古文") {
    const jyutpingVisible = showJyutping && cantoneseLexiconState.status === "ready";
    return `
      <div class="prose-work ${parallel ? "is-parallel" : ""} ${jyutpingVisible ? "is-showing-jyutping" : ""}" lang="zh-Hant">
        ${lines.map((line) => {
          const lineIndex = Number.isInteger(line.sourceIndex) ? line.sourceIndex : poem.lines.indexOf(line);
          const lineId = poetryLineId(poem.id, lineIndex);
          const saved = savedLineIds.has(lineId);
          return `
            <div class="prose-paragraph ${saved ? "is-saved" : ""} ${jyutpingVisible ? "has-jyutping" : ""}">
              <p>${renderProseText(line.text, jyutpingVisible)}</p>
              <button class="prose-save" type="button" data-save-poetry-line="${poem.id}:${lineIndex}"
                aria-label="${saved ? "取消收藏" : "收藏"}第 ${lineIndex + 1} 段" aria-pressed="${saved}">
                ${icon("bookmark")}
              </button>
            </div>`;
        }).join("")}
      </div>`;
  }

  const lineKind = poem.kind === "詞" ? "詞句" : poem.kind === "曲" ? "曲句" : "詩句";
  return `
    <div class="full-poem ${parallel ? "is-parallel" : ""}" lang="zh-Hant">
      ${lines.map((line) => {
        const lineIndex = Number.isInteger(line.sourceIndex) ? line.sourceIndex : poem.lines.indexOf(line);
        const lineId = poetryLineId(poem.id, lineIndex);
        const saved = savedLineIds.has(lineId);
        const pronunciation = showJyutping ? classicalLinePronunciation(line) : { value: "", kind: "pending" };
        const lineText = pronunciation.value
          ? renderClassicalAnnotatedText(
            line.text,
            pronunciation.kind === "curated" ? pronunciation.value : "",
            true,
            "verse-jyutping-token"
          )
          : renderPoemLineText(line);
        return `
          <div class="verse-line ${saved ? "is-saved" : ""} ${pronunciation.value ? `has-jyutping is-${pronunciation.kind}` : ""}">
            <div class="verse-line-main">
              <p${pronunciation.value ? ` data-verse-jyutping="${pronunciation.kind}"` : ""}>${lineText}</p>
              <button class="verse-save" type="button" data-save-poetry-line="${poem.id}:${lineIndex}"
                aria-label="${saved ? `取消收藏${lineKind}` : `收藏${lineKind}`} ${escapeHtml(line.text)}" aria-pressed="${saved}">
                ${icon("bookmark")}
              </button>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderPoemBody(poem, savedLineIds, showJyutping, mode = "original", translation = null) {
  if (mode === "translation") {
    const paragraphs = translation?.paragraphs || [];
    return `
      <div class="classical-translation-only" lang="zh-Hant">
        ${paragraphs.map((paragraph, index) => `<p><span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>${escapeHtml(paragraph)}</p>`).join("")}
      </div>`;
  }

  if (mode !== "parallel" || !translation) {
    const sourceLines = poem.lines.map((line, sourceIndex) => ({ ...line, sourceIndex }));
    return renderPoemSourceLines(poem, sourceLines, savedLineIds, showJyutping);
  }

  const units = alignClassicalReadingUnits(poem.lines, translation);
  const focusActive = Number.isInteger(ui.classicalFocusIndex);
  return `
    <div class="classical-reading-flow ${poem.kind === "古文" ? "is-prose" : "is-verse"}" data-classical-alignment-count="${units.length}">
      ${units.map((unit, unitIndex) => {
        const isFocused = ui.classicalFocusIndex === unitIndex;
        const alignmentNote = unit.alignment === "structural"
          ? "原文與今譯段數不同，按篇章順序相鄰展示，不作逐句對應。"
          : unit.alignment === "whole-work"
            ? "此今譯按全篇相鄰展示，並非逐句對譯。"
            : "";
        return `
          <section class="classical-reading-unit ${isFocused ? "is-focused" : ""} ${focusActive && !isFocused ? "is-muted" : ""}"
            data-classical-reading-unit="${unitIndex}" data-classical-alignment="${unit.alignment}" tabindex="0"
            aria-label="第 ${unitIndex + 1} 組原文與今譯${isFocused ? "，已聚焦" : ""}">
            <span class="classical-reading-thread" aria-hidden="true"><i></i></span>
            <div class="classical-reading-source">
              ${renderPoemSourceLines(poem, unit.sourceLines, savedLineIds, showJyutping, true)}
            </div>
            <div class="classical-reading-translation" lang="zh-Hant">
              <small>今譯</small>
              ${unit.translations.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
              ${alignmentNote ? `<p class="classical-reading-alignment-note">${escapeHtml(alignmentNote)}</p>` : ""}
            </div>
          </section>`;
      }).join("")}
    </div>`;
}

function renderPoemContentState(poem) {
  const state = poemContentLoadStates.get(poem.id);
  if (state?.status === "error") {
    return `
      <section class="poem-content-state is-error" role="alert">
        <span aria-hidden="true">再</span>
        <div><strong>正文未能載入</strong><p>分片仍保存在本站；可重新讀取，不會影響收藏或進度。</p></div>
        <button type="button" data-retry-poem-content="${escapeHtml(poem.id)}">重新載入</button>
      </section>`;
  }
  return `
    <section class="poem-content-state is-loading" aria-live="polite" aria-busy="true">
      <span aria-hidden="true">讀</span>
      <div><strong>正在展開正文</strong><p>只載入這一篇的原文、粵拼與今譯資料。</p></div>
    </section>`;
}

function renderClassicalTypographyPanel(typography) {
  return `
    <section class="classical-typography-panel" id="classical-typography-panel" aria-labelledby="classical-typography-title">
      <header class="classical-typography-heading">
        <span class="classical-typography-glyph" aria-hidden="true">字</span>
        <div>
          <strong id="classical-typography-title">閱讀排版</strong>
          <small>設定會保存在這部裝置</small>
        </div>
        <button class="classical-reset" type="button" data-classical-typography-reset>還原預設</button>
      </header>
      <div class="classical-typography-grid">
        <fieldset class="classical-type-group">
          <legend>字體</legend>
          <div class="classical-segmented" role="group" aria-label="選擇正文字體">
            ${classicalFontOptions.map((option) => `
              <button class="${typography.font === option.id ? "is-active" : ""}" type="button" data-classical-font="${option.id}"
                aria-pressed="${typography.font === option.id}">${option.label}</button>`).join("")}
          </div>
        </fieldset>
        <fieldset class="classical-type-group">
          <legend>字號</legend>
          <div class="classical-segmented size-segmented" role="group" aria-label="調整正文字號">
            <button type="button" data-classical-size="-0.08" aria-label="縮小正文字號">A−</button>
            <button class="classical-size-readout ${typography.scale === 1 ? "is-active" : ""}" type="button" data-classical-size-reset
              aria-label="目前字號 ${Math.round(typography.scale * 100)}%，按下還原為 100%">${Math.round(typography.scale * 100)}%</button>
            <button type="button" data-classical-size="0.08" aria-label="放大正文字號">A+</button>
          </div>
        </fieldset>
        <fieldset class="classical-type-group">
          <legend>行距</legend>
          <div class="classical-segmented" role="group" aria-label="選擇正文行距">
            ${classicalLeadingOptions.map((option) => `
              <button class="${typography.leading === option.value ? "is-active" : ""}" type="button" data-classical-leading="${option.value}"
                aria-pressed="${typography.leading === option.value}">${option.label}</button>`).join("")}
          </div>
        </fieldset>
      </div>
      <div class="classical-jyutping-heading">
        <span aria-hidden="true">音</span>
        <p><strong>粵拼顯示</strong><small>只調整字上方的讀音，不改變原文字級</small></p>
      </div>
      <div class="classical-jyutping-grid">
        ${[
          { id: "size", label: "字號", value: typography.jyutpingSize },
          { id: "color", label: "顏色", value: typography.jyutpingColor },
          { id: "opacity", label: "濃淡", value: typography.jyutpingOpacity },
          { id: "gap", label: "上下距", value: typography.jyutpingGap }
        ].map((group) => `
          <fieldset class="classical-type-group">
            <legend>${group.label}</legend>
            <div class="classical-segmented" role="group" aria-label="調整粵拼${group.label}">
              ${classicalJyutpingOptions[group.id].map((option) => `
                <button class="${group.value === option.value ? "is-active" : ""}" type="button"
                  data-classical-jyutping-setting="${group.id}" data-classical-jyutping-value="${option.value}"
                  aria-pressed="${group.value === option.value}">${option.label}</button>`).join("")}
            </div>
          </fieldset>`).join("")}
      </div>
    </section>`;
}

function renderPoemReader(id) {
  const poem = findPoem(id);
  const state = appStore.getState();
  const contentReady = !poem.contentShard || poem.contentLoaded;
  const showJyutping = state.preferences.showJyutping;
  const hasCuratedJyutping = contentReady && poem.lines.some((line) => Boolean(String(line.jyutping || "").trim()));
  const savedLineIds = new Set(state.savedItems.map((item) => item.id));
  const noteKey = `poem:${poem.id}`;
  const note = state.notes[noteKey]?.content || "";
  const noteOpen = ui.notePanel === noteKey;
  const isProse = poem.kind === "古文";
  const lexiconReady = cantoneseLexiconState.status === "ready";
  const canShowJyutping = hasCuratedJyutping || lexiconReady;
  const jyutpingVisible = showJyutping && canShowJyutping;
  const typography = getClassicalTypography(state.preferences);
  const translation = contentReady ? classicalTranslationFor(poem) : null;
  const readingMode = effectiveClassicalReadingMode(typography.readingMode, translation);
  const thread = poemThreadCopy(poem);
  const progress = itemProgress(state, "poem", poem);

  return `
    <article class="poem-reader page-enter ${isProse ? "is-prose" : ""} classical-font-${typography.font}
      jyutping-size-${typography.jyutpingSize} jyutping-color-${typography.jyutpingColor}
      jyutping-opacity-${typography.jyutpingOpacity} jyutping-gap-${typography.jyutpingGap}"
      style="--classical-scale:${typography.scale}; --classical-leading:${typography.leading}" data-poetry-progress="${escapeHtml(poem.id)}">
      <header class="reader-toolbar">
        <button class="back-button" type="button" data-route="poetry">${icon("back")} 詩詞</button>
        <div class="reader-actions">
          <button class="quiet-button typography-toggle ${ui.classicalTypographyOpen ? "is-active" : ""}" type="button"
            data-toggle-classical-typography aria-expanded="${ui.classicalTypographyOpen}" aria-controls="classical-typography-panel"
            aria-label="${ui.classicalTypographyOpen ? "關閉閱讀排版" : "打開閱讀排版"}">
            <span class="typography-mark" aria-hidden="true">Aa</span><span class="typography-label">排版</span>
          </button>
          <button class="quiet-button jyutping-toggle ${jyutpingVisible ? "is-active" : ""}" type="button"
            data-toggle-jyutping data-jyutping-state="${cantoneseLexiconState.status}" aria-pressed="${jyutpingVisible}"
            aria-label="${jyutpingVisible ? "隱藏粵拼" : "顯示粵拼"}" ${canShowJyutping ? "" : "disabled"}>粵拼</button>
          ${renderReadingStateButton("poem", poem.id, progress, poem.title)}
          <button class="icon-button" type="button" data-toggle-note="${noteKey}" aria-label="${noteOpen ? "關閉筆記" : "打開筆記"}">${icon("note")}</button>
          ${favoriteButton(`poem:${poem.id}`, poem.title)}
          <button class="icon-button" type="button" data-immersive="${poem.id}" aria-label="進入沉浸閱讀" ${contentReady ? "" : "disabled"}>${icon("expand")}</button>
        </div>
      </header>

      ${ui.classicalTypographyOpen ? renderClassicalTypographyPanel(typography) : ""}

      <div class="poem-reader-layout ${isProse ? "is-prose" : ""}">
        <aside class="poem-marginalia">
          <button class="poem-thread-trigger ${ui.poemThreadOpen ? "is-active" : ""}" type="button" data-toggle-poem-thread
            aria-expanded="${ui.poemThreadOpen}" aria-controls="poem-thread-panel">
            <span>${thread.label}</span><i aria-hidden="true"></i><small>${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.form)}</small>
          </button>
        </aside>

        <div class="poem-reading-column ${isProse ? "is-prose" : ""}">
          <header class="poem-title-block ${isProse ? "is-prose" : ""}">
            <p>${poetryRelationButton("poet", poem.poet, poem.poet, poem.kind)} <span aria-hidden="true">·</span> ${poetryRelationButton("dynasty", poem.dynasty, poem.dynasty, poem.kind)}</p>
            <h1>${escapeHtml(poem.title)}</h1>
            <div class="poem-title-relations">${poem.themes.map((theme) => poetryRelationButton("theme", theme, theme, poem.kind)).join("")}</div>
            <button class="poem-thread-mobile ${ui.poemThreadOpen ? "is-active" : ""}" type="button" data-toggle-poem-thread
              aria-expanded="${ui.poemThreadOpen}" aria-controls="poem-thread-panel">${thread.label} · ${escapeHtml(poem.poet)} · ${escapeHtml(poem.form)}</button>
          </header>

          ${contentReady ? renderClassicalReadingControls(poem, translation, typography.readingMode) : ""}
          ${contentReady
            ? renderPoemBody(poem, savedLineIds, jyutpingVisible, readingMode, translation)
            : renderPoemContentState(poem)}

          ${contentReady && readingMode !== "translation" ? renderClassicalPronunciationNote(poem) : ""}
        </div>

        <aside class="poem-aside">
          ${renderPoemThread(poem)}
          ${renderPoemSourceCard(poem)}
          ${noteOpen ? `
            <section class="note-editor">
              <div class="aside-title"><span>我的筆記</span><small>只儲存在本機</small></div>
              <textarea data-note-input="${noteKey}" placeholder="記下你想再回來的感受……">${escapeHtml(note)}</textarea>
              <button class="primary-button compact" type="button" data-save-note="${noteKey}">保存筆記</button>
            </section>` : ""}
          ${contentReady ? renderPoemDetails(poem) : ""}
        </aside>
      </div>
    </article>`;
}

function renderCantoneseFeed() {
  const state = appStore.getState();
  const levelCounts = cantoneseSourceSnapshot.levelCounts || {};
  const levelGroups = cantoneseLearningBands;
  const selectedLevelGroup = levelGroups.find((group) => group.id === ui.cantoneseLevel) || levelGroups[0];
  const visible = episodes.filter((episode) => {
    const sourceMatches = ui.sourceFilter === "全部" || episode.sourceId === ui.sourceFilter;
    const levelMatches = !selectedLevelGroup.levels || selectedLevelGroup.levels.includes(episode.level);
    return sourceMatches && levelMatches;
  });
  const renderedEpisodes = visible.slice(0, ui.cantoneseLimit);
  const activeSource = cantoneseSourceCatalog.find((source) => source.id === ui.sourceFilter);
  const sourceLabel = activeSource?.shortName || "全部內容";

  return `
    <section class="collection-view page-enter cantonese-view">
      <header class="section-hero listening-hero">
        <div>
          <p class="eyebrow">Cantonese Listening</p>
          <h1>先聽見語氣，<br>再追上每個字。</h1>
        </div>
        <p>香港口語原聲、1997–1998 雙人訪談式對話、研究訪談口述與七級粵文故事，全部可以在 Leafbound 閱讀文字。只有受訪者對齊稿的資料會明確標記，不冒充雙方文稿。</p>
      </header>

      <section class="cantonese-source-shelf" aria-labelledby="cantonese-shelf-title">
        <header>
          <div><p class="eyebrow">Listening shelves</p><h2 id="cantonese-shelf-title">揀一種聲音開始。</h2></div>
          <button type="button" class="cantonese-source-reset ${ui.sourceFilter === "全部" ? "is-active" : ""}" data-source-filter="全部">
            ${ui.sourceFilter === "全部" ? "正在顯示全部" : "查看全部"} · ${episodes.length}
          </button>
        </header>
        <div class="cantonese-source-cards">
          ${cantoneseSourceCatalog.map((source) => {
            const count = episodes.filter((episode) => episode.sourceId === source.id).length;
            const detail = source.id === "hbl"
              ? `${count} 篇站內全文 · 原目錄 ${cantoneseSourceSnapshot.catalogCount} 篇`
              : `${count} ${["hkcancor", "spice"].includes(source.id) ? "段" : "篇"}可用內容`;
            return `
              <button type="button" class="cantonese-source-card ${ui.sourceFilter === source.id ? "is-active" : ""}" data-source-filter="${escapeHtml(source.id)}" aria-pressed="${ui.sourceFilter === source.id}">
                <span class="cantonese-source-mark" aria-hidden="true">${escapeHtml(source.mark)}</span>
                <span><small>${escapeHtml(source.id === "hbl" ? "原站 HBL L1–7" : source.mode)}</small><strong>${escapeHtml(source.shortName)}</strong><em>${escapeHtml(detail)}</em></span>
                <b>${count}</b>
              </button>`;
          }).join("")}
        </div>
      </section>

      ${["全部", "hbl"].includes(ui.sourceFilter) ? `
        <div class="cantonese-level-ladder" aria-label="粵文故事學習分組">
          ${levelGroups.map((group) => {
            const count = group.levels
              ? group.levels.reduce((total, level) => total + (levelCounts[level] || 0), 0)
              : cantoneseSourceSnapshot.importedStoryCount;
            const isActive = selectedLevelGroup.id === group.id;
            return `
              <button type="button" class="${isActive ? "is-active" : ""}" data-cantonese-level="${group.id}" aria-pressed="${isActive}"
                aria-label="${group.label}，${group.sourceRange}，${count} 篇">
                <span>${group.stepLabel}</span><strong>${group.label}</strong><small>${count} 篇</small>
              </button>`;
          }).join("")}
        </div>
        <p class="cantonese-level-note"><strong>三段學習路徑</strong><span>${escapeHtml(cantoneseGradingNote)}</span></p>` : ""}

      ${ui.sourceFilter === "local" ? renderCantoneseVoiceNotice() : ""}

      <div class="feed-heading">
        <div><span>${escapeHtml(sourceLabel)}</span><small>顯示 ${renderedEpisodes.length} / ${visible.length} 篇</small></div>
        <p>站內保留正文；原聲、粵拼與授權狀態按每篇內容分別標示。</p>
      </div>

      <div class="episode-list" aria-live="polite">
        ${renderedEpisodes.map((episode, index) => {
          const current = state.playbackProgress[episode.id] || 0;
          const progress = itemProgress(state, "episode", episode);
          const readingStatus = contentStatusMeta(progress);
          const date = episode.publishedAt
            ? new Intl.DateTimeFormat("zh-Hant", { year: "numeric", month: "short", day: "numeric" }).format(new Date(episode.publishedAt))
            : episode.recordedPeriod || "";
          const availability = episode.audioKind === "local"
            ? `真人原聲 ${formatTime(episode.duration)} · ${episode.timing === "aligned" ? "對齊逐字稿" : "全文逐字粵拼"}`
            : episode.audioKind === "soundcloud"
              ? `真人原聲 · ${episode.transcript.length} 段完整粵文`
              : episode.audioKind === "source-reference"
                ? `官方原聲可查 · ${episode.transcript.length} 段對齊文稿`
              : `本機粵語朗讀 · ${formatTime(episode.duration)}`;
          const progressCopy = readingStatus.seen
            ? readingStatus.detail
            : episode.audioKind === "soundcloud"
              ? "站內全文"
              : episode.audioKind === "source-reference"
                ? "站內文稿"
              : current ? `${progressPercent(current, episode.duration)}%` : "未開始";
          const learningBand = getCantoneseLearningBand(episode.level);
          const artMark = episode.sourceId === "hbl"
            ? learningBand?.mark || "讀"
            : episode.sourceId === "hkcancor"
              ? "港"
              : episode.sourceId === "spice"
                ? "訪"
                : "";
          const episodeSourceLabel = cantoneseEpisodeSourceLabel(episode);
          const episodeDescription = cantoneseEpisodeDescription(episode);
          return `
            <article class="episode-row is-${escapeHtml(episode.sourceId)} is-${readingStatus.status}" data-cantonese-row-index="${index}" ${learningBand ? `data-learning-band="${learningBand.id}"` : ""}>
              <button class="episode-main" type="button" data-route="cantonese" data-route-id="${episode.id}">
                <span class="episode-art is-${escapeHtml(episode.sourceId)}" aria-hidden="true">
                  ${artMark ? `<b>${escapeHtml(artMark)}</b>` : ""}<i></i><i></i><i></i><i></i><i></i>
                </span>
                <span class="episode-copy">
                  <small>${escapeHtml(episodeSourceLabel)}</small>
                  <strong>${escapeHtml(episode.title)}</strong>
                  ${renderListReadingMark(progress)}
                  <span>${escapeHtml(episodeDescription)}</span>
                  <span class="episode-meta">${[date, availability].filter(Boolean).map(escapeHtml).join(" · ")}</span>
                </span>
                <span class="episode-progress-copy">${progressCopy}</span>
              </button>
              <div class="episode-side">
                ${favoriteButton(`episode:${episode.id}`, episode.title)}
                <button class="round-play" type="button" data-route="cantonese" data-route-id="${episode.id}" aria-label="開啟${escapeHtml(episode.title)}逐字稿">${icon("arrow")}</button>
              </div>
              ${episode.audioKind === "soundcloud" && !readingStatus.seen ? "" : `<div class="episode-progress-track"><span style="width:${progress}%"></span></div>`}
            </article>`;
        }).join("") || `
          <div class="empty-state cantonese-empty">
            <span class="empty-glyph">聲</span>
            <h2>這個等級暫時沒有內容</h2>
            <p>返回全部等級，或切換另一座聲音書架。</p>
            <button class="secondary-button" type="button" data-source-filter="全部" data-cantonese-level="全部">查看全部粵語內容</button>
          </div>`}
      </div>
      ${renderedEpisodes.length < visible.length ? `
        <div class="collection-load-more" aria-label="粵語內容分頁">
          <p role="status">已顯示 ${renderedEpisodes.length} 篇，尚有 ${visible.length - renderedEpisodes.length} 篇</p>
          <button class="secondary-button" type="button" data-load-more-cantonese
            aria-label="再顯示 ${Math.min(COLLECTION_BATCH_SIZE, visible.length - renderedEpisodes.length)} 篇粵語內容">
            再顯示 ${Math.min(COLLECTION_BATCH_SIZE, visible.length - renderedEpisodes.length)} 篇 ${icon("arrow")}
          </button>
        </div>` : visible.length ? `
        <p class="collection-end-note" role="status">已顯示這個書架的全部 ${visible.length} 篇內容</p>` : ""}
    </section>`;
}

function renderTranscriptPlainText(segment) {
  return segmentCantoneseText(segment.text, segment.terms || []).map((part) => {
    if (!part.isWord) return escapeHtml(part.text);
    const attribute = part.isCurated ? "data-term" : "data-dictionary-term";
    const pronunciation = part.readings.length ? ` title="${escapeHtml(part.readings.join(" / "))}"` : "";
    return `<button class="term-button ${part.isCurated ? "is-curated" : "is-dictionary"}" type="button" ${attribute}="${escapeHtml(part.text)}"${pronunciation}>${escapeHtml(part.text)}</button>`;
  }).join("");
}

function transcriptSpeakerDetails(episode, segment) {
  const prefix = String(segment.text || "").match(/^([^:：\s]{1,12})[:：]\s*([\s\S]*)$/u);
  const speakerId = String(segment.speaker || prefix?.[1] || "").trim();
  const profile = speakerId ? episode.speakers?.[speakerId] : null;
  const text = profile && prefix?.[1] === speakerId ? prefix[2] : segment.text;
  return {
    segment: text === segment.text ? segment : { ...segment, text },
    speakerId,
    profile
  };
}

function renderTranscriptRuby(bases, syllables, kind) {
  return bases.map((base, index) => {
    if (!/^\p{Script=Han}$/u.test(base)) return escapeHtml(base);
    return `<ruby class="transcript-ruby is-${kind}" data-transcript-ruby="${kind}"><span>${escapeHtml(base)}</span><rt lang="yue-Latn" aria-hidden="true">${escapeHtml(syllables[index] || "")}</rt></ruby>`;
  }).join("");
}

function wrapTranscriptTerm(text, content, reading, { isWord = false, isCurated = false } = {}) {
  if (!/\p{Script=Han}/u.test(text)) return content;
  const curated = isCurated || Boolean(cantoneseTerms[text]);
  const available = isWord || curated || (
    cantoneseLexiconState.status === "ready"
    && Boolean(getCantoneseTermData(text, cantoneseTerms))
  );
  if (!available) return content;
  const attribute = curated ? "data-term" : "data-dictionary-term";
  const title = reading ? ` title="查看${escapeHtml(text)}，讀音 ${escapeHtml(reading)}"` : "";
  return `<button class="term-button transcript-ruby-term ${curated ? "is-curated" : "is-dictionary"}" type="button" ${attribute}="${escapeHtml(text)}"${title}>${content}</button>`;
}

function renderAutoTranscriptPart(text, kind = "auto") {
  return segmentCantonesePronunciation(text).map((part) => {
    if (!part.isWord || !part.readings.length) return escapeHtml(part.text);
    const syllables = part.readings[0].trim().split(/\s+/u);
    const bases = Array.from(part.text);
    if (bases.length !== syllables.length) {
      return `<ruby class="transcript-ruby is-${kind}" data-transcript-ruby="${kind}"><span>${escapeHtml(part.text)}</span><rt lang="yue-Latn" aria-hidden="true">${escapeHtml(part.readings[0])}</rt></ruby>`;
    }
    return renderTranscriptRuby(bases, syllables, kind);
  }).join("");
}

function renderAutoTranscriptText(segment) {
  return segmentCantoneseText(segment.text, segment.terms || []).map((part) => {
    const curatedReading = part.isCurated ? cantoneseTerms[part.text]?.jyutping || "" : "";
    const curatedBases = Array.from(part.text);
    const curatedSyllables = curatedReading ? curatedReading.trim().split(/\s+/u) : [];
    const content = curatedReading && curatedBases.length === curatedSyllables.length
      ? renderTranscriptRuby(curatedBases, curatedSyllables, "corpus")
      : renderAutoTranscriptPart(part.text);
    if (!part.isWord) return content;
    const reading = curatedReading || part.readings[0] || "";
    return wrapTranscriptTerm(part.text, content, reading, part);
  }).join("");
}

function renderCorpusTranscriptText(segment) {
  const aligned = alignCantonesePronunciation(segment.text, segment.jyutping);
  if (!aligned.length) return "";
  return aligned.map((part) => {
    if (!part.syllables.length) return escapeHtml(part.text);
    const content = renderTranscriptRuby(part.bases, part.syllables, "corpus");
    return wrapTranscriptTerm(part.text, content, part.reading);
  }).join("");
}

function renderTranscriptReading(segment, showJyutping) {
  if (!showJyutping) return { html: renderTranscriptPlainText(segment), kind: "" };
  const corpus = String(segment.jyutping || "").trim() ? renderCorpusTranscriptText(segment) : "";
  if (corpus) return { html: corpus, kind: "corpus" };
  if (cantoneseLexiconState.status === "ready") {
    return { html: renderAutoTranscriptText(segment), kind: "auto" };
  }
  return { html: renderTranscriptPlainText(segment), kind: "" };
}

function transcriptSegmentHtml(segment, index, mode, episodeId, showJyutping) {
  if (mode === "listen") return "";
  const episode = findEpisode(episodeId);
  const hidden = mode === "reveal" && !ui.revealedSegments.has(`${episodeId}:${index}`);
  const speaker = transcriptSpeakerDetails(episode, segment);
  const reading = renderTranscriptReading(speaker.segment, showJyutping);
  const suppliedJyutping = String(speaker.segment.jyutping || "").trim();
  const generatedJyutping = showJyutping && !suppliedJyutping && cantoneseLexiconState.status === "ready"
    ? buildCantonesePronunciationLine(speaker.segment.text)
    : "";
  const hasJyutping = Boolean(reading.kind && (suppliedJyutping || generatedJyutping || reading.kind === "auto"));
  const speakerSide = ["question", "answer"].includes(speaker.profile?.side) ? speaker.profile.side : "voice";
  const speakerMark = speakerSide === "question" ? "問" : speakerSide === "answer" ? "答" : "聲";

  return `
    <div class="transcript-segment ${hidden ? "is-hidden" : ""} ${hasJyutping ? "has-jyutping" : ""} ${speaker.profile ? `has-speaker is-speaker-${speakerSide}` : ""}" data-segment-index="${index}">
      ${episode.timing === "untimed"
        ? `<span class="segment-time is-label">${escapeHtml(segment.label || String(index + 1).padStart(2, "0"))}</span>`
        : `<button class="segment-time" type="button" data-jump-time="${segment.at}" aria-label="跳到約 ${formatTime(segment.at)}">${formatTime(segment.at)}</button>`}
      ${hidden ? `
        <button class="reveal-line" type="button" data-reveal-segment="${episodeId}:${index}">顯示這一句</button>` : `
         <div class="segment-copy">
           ${speaker.profile ? `<div class="transcript-speaker" data-speaker-role="${escapeHtml(speaker.profile.role)}">
             <span aria-hidden="true">${speakerMark}</span>
             <small>${escapeHtml(speaker.profile.role)}</small>
             <strong>${escapeHtml(speaker.profile.name || speaker.speakerId)}</strong>
           </div>` : ""}
           <p lang="yue-Hant"${hasJyutping ? ` data-segment-jyutping="${reading.kind}"` : ""}>${reading.html}</p>
         </div>`}
    </div>`;
}

function renderEpisodePlayer(id) {
  const episode = findEpisode(id);
  const state = appStore.getState();
  const episodeSourceLabel = cantoneseEpisodeSourceLabel(episode);
  const episodeDescription = cantoneseEpisodeDescription(episode);
  const mode = state.preferences.transcriptMode;
  const showTranscriptJyutping = state.preferences.showTranscriptJyutping !== false;
  const speed = state.preferences.playbackSpeed;
  const corpusJyutpingCount = episode.transcript.filter((segment) => Boolean(String(segment.jyutping || "").trim())).length;
  const needsGeneratedJyutping = corpusJyutpingCount < episode.transcript.length;
  const visibleJyutpingCount = cantoneseLexiconState.status === "ready"
    ? episode.transcript.length
    : corpusJyutpingCount;

  if (player.episodeId !== episode.id) {
    stopPlayback(false);
    releaseNativeRecording();
    player.episodeId = episode.id;
    player.currentTime = state.playbackProgress[episode.id] || 0;
    player.mediaDuration = episode.duration;
    player.lastPersistSecond = -1;
    player.abStart = null;
    player.abEnd = null;
    player.spokenSegment = -1;
    prepareNativeRecording(episode);
  }

  const duration = effectiveEpisodeDuration(episode);
  const current = Math.min(player.currentTime, duration);
  const progress = getContentProgress(state, "episode", episode.id, progressPercent(current, duration));
  const abLabel = player.abStart == null ? "AB" : player.abEnd == null ? `A · ${formatTime(player.abStart)}` : `AB · ${formatTime(player.abStart)}–${formatTime(player.abEnd)}`;
  const speechReady = cantoneseSpeech.status === "available";
  const hasLocalRecording = episode.audioKind === "local" && Boolean(episode.audioFile);
  const hasRemoteRecording = episode.audioKind === "soundcloud" && Boolean(episode.audioUrl);
  const hasSourceRecordingReference = episode.audioKind === "source-reference" && Boolean(episode.sourceUrl);
  const canUseTransport = hasLocalRecording || speechReady;
  const voiceMessage = cantoneseVoiceMessage();
  const playbackLabel = hasLocalRecording ? "真人粵語原聲" : speechReady ? "粵語合成示範" : "僅粵語逐字稿";
  const playbackStatus = hasLocalRecording || hasRemoteRecording ? "recording" : cantoneseSpeech.status;
  const soundcloudEmbed = hasRemoteRecording
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(episode.audioUrl)}&color=%23183f38&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
    : "";
  const transcriptEyebrow = episode.sourceId === "hbl"
    ? `HBL Level ${episode.level}`
    : episode.transcriptScope === "two-party"
      ? "Two-party transcript · 1997–1998"
      : episode.transcriptScope === "participant-only"
        ? "Participant-aligned excerpt · CC BY 4.0"
        : "Transcript";
  const transcriptTitle = episode.sourceId === "hbl"
    ? "故事全文"
    : episode.transcriptScope === "two-party"
      ? "雙方訪談式文稿"
      : episode.transcriptScope === "participant-only"
        ? "受訪者口述節錄"
        : "逐字稿";

  return `
    <section class="episode-player-view page-enter">
      <header class="reader-toolbar">
        <button class="back-button" type="button" data-route="cantonese">${icon("back")} 粵語</button>
        <div class="reader-actions">
          <span class="demo-badge is-${playbackStatus}" data-cantonese-voice-status="${cantoneseSpeech.status}" data-cantonese-audio-kind="${escapeHtml(episode.audioKind || "speech")}">${playbackLabel}</span>
          ${renderReadingStateButton("episode", episode.id, progress, episode.title)}
          ${favoriteButton(`episode:${episode.id}`, episode.title)}
        </div>
      </header>

      <div class="player-layout">
        <aside class="now-playing-card">
          <div class="large-wave" aria-hidden="true">
            ${Array.from({ length: 19 }, (_, index) => `<i style="--h:${24 + ((index * 17) % 58)}%"></i>`).join("")}
          </div>
          <p class="eyebrow">${escapeHtml(episodeSourceLabel)}</p>
          <h1>${escapeHtml(episode.title)}</h1>
          <p>${escapeHtml(episodeDescription)}</p>

          ${hasSourceRecordingReference ? `
            <aside class="source-recording-reference">
              <span aria-hidden="true">引</span>
              <div>
                <strong>官方原聲保留在 SpiCE</strong>
                <p>Leafbound 收錄受訪者對齊文稿，不複製整段研究錄音；來源頁可查看完整資料與 CC BY 4.0 授權。</p>
                <a href="${safeExternalHref(episode.sourceUrl)}" target="_blank" rel="noreferrer">前往官方資料庫 ${icon("external")}</a>
              </div>
            </aside>` : ""}

          ${hasRemoteRecording ? `
            <div class="soundcloud-player" data-soundcloud-shell>
              <span aria-hidden="true">聲</span>
              <div><strong>真人粵語原聲</strong><small>按下後才連接 SoundCloud；正文閱讀本身不會傳送請求。</small></div>
              <button type="button" data-load-soundcloud="${escapeHtml(soundcloudEmbed)}" data-soundcloud-title="${escapeHtml(episode.title)}">載入原聲</button>
            </div>
        <p class="player-caption">真人原聲由冚唪唥的 SoundCloud 提供，需要連網；完整粵文已保存在 Leafbound，可直接點詞查音。</p>` : canUseTransport ? `
            <div class="audio-progress">
              <input type="range" min="0" max="${duration}" value="${Math.floor(current)}" step="1" data-player-seek aria-label="播放位置" />
              <div class="time-row"><span data-player-time>${formatTime(current)}</span><span data-player-duration>${formatTime(duration)}</span></div>
            </div>

            <div class="transport-controls">
              <button class="transport-small" type="button" data-seek-by="-10" aria-label="後退 10 秒">${icon("rewind")}<span>10</span></button>
              <button class="transport-main" type="button" data-toggle-playback aria-label="${player.isPlaying ? "暫停" : hasLocalRecording ? "播放真人粵語原聲" : "播放粵語合成朗讀"}">${icon(player.isPlaying ? "pause" : "play")}</button>
              <button class="transport-small" type="button" data-seek-by="10" aria-label="前進 10 秒">${icon("forward")}<span>10</span></button>
            </div>

            <div class="speed-row" aria-label="播放速度">
              ${[0.75, 0.8, 1, 1.2, 1.5].map((value) => `
                <button type="button" class="speed-button ${speed === value ? "is-active" : ""}" data-speed="${value}" aria-pressed="${speed === value}">${value}×</button>`).join("")}
            </div>
            <button class="ab-button ${player.abStart != null ? "is-active" : ""}" type="button" data-ab-repeat>${escapeHtml(abLabel)}</button>
            <p class="player-caption">${hasLocalRecording
              ? episode.sourceId === "spice"
                ? "SpiCE 原始資料是雙聲道研究訪談；本站離線片段與文字均只取受訪者聲道，不會補寫訪者台詞。"
                : "HKCanCor 真人錄音保存在本機；句段位置按字數估算，播放進度與速度也只保存在本機。"
              : `使用「${escapeHtml(cantoneseSpeech.voice.name)}」逐句合成；這不是節目原聲。進度與速度會保存在本機。`}</p>` : `
            <div class="player-voice-block is-${cantoneseSpeech.status}" data-cantonese-voice-status="${cantoneseSpeech.status}">
              <span aria-hidden="true">止</span>
              <div class="player-voice-copy">
                <p><strong>${escapeHtml(voiceMessage.title)}</strong><small>${escapeHtml(voiceMessage.detail)}</small></p>
                ${renderCantoneseVoiceTools()}
              </div>
            </div>`}
        </aside>

        <section class="transcript-panel">
          <header class="transcript-heading">
            <div>
              <p class="eyebrow">${escapeHtml(transcriptEyebrow)}</p>
              <h2>${escapeHtml(transcriptTitle)}</h2>
            </div>
            <div class="transcript-controls">
              <div class="mode-switch" role="group" aria-label="字幕顯示方式">
                ${[
                  ["full", "全文"],
                  ["reveal", "按需"],
                  ["listen", "純聽"]
                ].map(([value, label]) => `
                  <button type="button" class="${mode === value ? "is-active" : ""}" data-transcript-mode="${value}" aria-pressed="${mode === value}">${label}</button>`).join("")}
              </div>
              <button class="quiet-button transcript-jyutping-toggle ${showTranscriptJyutping ? "is-active" : ""}" type="button"
                data-toggle-transcript-jyutping aria-pressed="${showTranscriptJyutping}"
                aria-label="${showTranscriptJyutping ? "隱藏逐字稿粵拼" : "顯示逐字稿粵拼"}">粵拼</button>
            </div>
          </header>

          ${episode.transcriptScope ? `<aside class="transcript-scope-note is-${escapeHtml(episode.transcriptScope)}">
            <span aria-hidden="true">${episode.transcriptScope === "two-party" ? "雙" : "單"}</span>
            <div>
              <strong>${episode.transcriptScope === "two-party" ? "雙方文稿" : "單方對齊稿"}</strong>
              <p>${escapeHtml(episode.transcriptScope === "two-party"
                ? episode.roleAttribution || "每個話輪都標明提問者與受訪者。"
                : "原資料只提供受訪者的對齊文字；訪者的問句未經核對，所以不在這裏臆補。")}</p>
            </div>
          </aside>` : ""}

          ${mode === "listen" ? `
            <div class="listen-only-state">
              <span class="listening-orbit">${icon("headphones")}</span>
              <h3>先不看文字</h3>
              <p>把注意力留給語速、停頓和句尾。需要時再切回按需顯示。</p>
            </div>` : `
            ${showTranscriptJyutping && needsGeneratedJyutping ? `
              <aside class="transcript-pronunciation-note is-${cantoneseLexiconState.status}"
                data-transcript-pronunciation-status="${cantoneseLexiconState.status}">
                <span class="pronunciation-mark" aria-hidden="true">${cantoneseLexiconState.status === "error" ? "再" : "音"}</span>
                <div>
                  <strong>${cantoneseLexiconState.status === "ready"
                    ? `全文粵拼 · ${visibleJyutpingCount} 段`
                    : cantoneseLexiconState.status === "error"
                      ? `已顯示 ${visibleJyutpingCount} 段語料原注`
                      : "正在補齊逐字稿粵拼"}</strong>
                  <p>${cantoneseLexiconState.status === "ready"
                    ? "粵拼貼在對應字詞上方；語料原注能可靠對齊時優先，其餘顯示本機詞表的首個候選。多音字可點詞查看。"
                    : cantoneseLexiconState.status === "error"
                      ? "自動粵拼暫時未能載入；正文和已有語料標注仍可閱讀。"
                      : "完成後會把粵拼直接標在對應字詞上方。"}</p>
                </div>
                ${cantoneseLexiconState.status === "error"
                  ? `<button type="button" data-retry-cantonese-lexicon>重新載入</button>`
                  : ""}
              </aside>` : ""}
            <div class="transcript-list" data-transcript-list>
              ${episode.transcript.map((segment, index) => transcriptSegmentHtml(segment, index, mode, episode.id, showTranscriptJyutping)).join("")}
            </div>`}
        </section>
      </div>
    </section>`;
}

function renderEnglishIndex() {
  const state = appStore.getState();
  const localArticles = articles.map((article) => ({ ...article, access: "internal", sourceId: article.sourceId || "local" }));
  const indexItems = [...localArticles, ...englishDiscoveries];
  const categoryOrder = ["全部", "語言", "文化", "科學", "文學", "生活"];
  const categories = categoryOrder.filter((category) => category === "全部" || indexItems.some((item) => item.category === category));
  const visible = indexItems.filter((item) => {
    const sourceMatches = ui.englishSourceFilter === "全部" || item.sourceId === ui.englishSourceFilter;
    const categoryMatches = ui.englishCategory === "全部" || item.category === ui.englishCategory;
    return sourceMatches && categoryMatches;
  });
  const renderedArticles = visible.slice(0, ui.englishLimit);
  const syncedAt = englishSourceSnapshot.generatedAt
    ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric" }).format(new Date(englishSourceSnapshot.generatedAt))
    : "Not yet synced";

  const renderIndexRow = (article, index) => {
    const isExternal = article.access === "external" || !Array.isArray(article.paragraphs);
    const progress = isExternal ? 0 : itemProgress(state, "article", article);
    const readingStatus = contentStatusMeta(progress, "en");
    const date = article.publishedAt
      ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric" }).format(new Date(article.publishedAt))
      : "";
    const sourceName = getEnglishArticleSourceName(article);
    const meta = [sourceName, article.topic, date].filter(Boolean).map(escapeHtml).join(" · ");
    const readerStatus = readingStatus.seen
      ? readingStatus.detail
      : article.sourceId === "local"
        ? progress ? `${Math.round(progress)}% read` : "Close reading"
        : article.contentScope === "chapter"
          ? progress ? `${Math.round(progress)}% read` : "Opening chapter"
          : progress ? `${Math.round(progress)}% read` : "Full text";
    const main = `
      <span class="article-ordinal">${String(index + 1).padStart(2, "0")}</span>
      <span class="article-heading">
        <small>${meta}</small>
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.deck)}</span>
        ${isExternal ? "" : renderListReadingMark(progress, "en")}
      </span>
      <span class="article-status ${isExternal ? "is-external" : `is-${readingStatus.status}`}">${isExternal ? "Publisher site" : readerStatus}</span>
      <span class="row-arrow">${icon(isExternal ? "external" : "arrow")}</span>`;

    return `
      <article class="article-row ${isExternal ? "is-external" : `is-internal is-${readingStatus.status}`}" data-english-row-index="${index}" data-english-source-row="${escapeHtml(article.sourceId)}" data-english-category-row="${escapeHtml(article.category)}">
        ${isExternal
          ? `<a class="article-main" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="Read ${escapeHtml(article.title)} at ${escapeHtml(sourceName)}">${main}</a>`
          : `<button class="article-main" type="button" data-route="english" data-route-id="${article.id}">${main}</button>`}
        ${isExternal ? "" : `<div class="article-line"><span style="width:${progress}%"></span></div>${favoriteButton(`article:${article.id}`, article.title, "en")}`}
      </article>`;
  };

  return `
    <section class="collection-view page-enter english-view">
      <header class="section-hero english-hero">
        <div>
          <p class="eyebrow">English Input</p>
          <h1>Read for thought.<br><em>Keep the language.</em></h1>
        </div>
        <p>Save the phrases, collocations, and full contexts that make you pause.</p>
      </header>

      <section class="english-source-ledger" aria-labelledby="english-source-title">
        <header>
          <div><p class="eyebrow">Source shelf</p><h2 id="english-source-title">${englishSourceCatalog.length} reading shelves, ${englishNewsDesks.length} news desks.</h2></div>
          <div class="english-sync-state"><span>${englishSourceSnapshot.itemCount} in-app texts</span><small>Synced ${escapeHtml(syncedAt)}</small></div>
        </header>
        <div class="english-source-cards">
          ${englishSourceCatalog.map((source) => {
            const count = indexItems.filter((item) => item.sourceId === source.id).length;
            const copy = getEnglishSourceUi(source);
            return `
              <button type="button" class="english-source-card ${ui.englishSourceFilter === source.id ? "is-active" : ""}" data-english-source="${escapeHtml(source.id)}" aria-pressed="${ui.englishSourceFilter === source.id}">
                <span class="english-source-mark" aria-hidden="true">${escapeHtml(copy.mark)}</span>
                <span><small>${escapeHtml(copy.mode)}</small><strong>${escapeHtml(source.shortName)}</strong><em>${escapeHtml(copy.description)}</em></span>
                <b>${count}</b>
              </button>`;
          }).join("")}
        </div>
        <button class="english-source-reset ${ui.englishSourceFilter === "全部" ? "is-active" : ""}" type="button" data-english-source="全部">${ui.englishSourceFilter === "全部" ? "Showing all sources" : "Back to all sources"} · ${indexItems.length}</button>

        <section class="english-news-directory" aria-labelledby="english-news-directory-title">
          <header>
            <div>
              <p class="eyebrow">News desks</p>
              <h3 id="english-news-directory-title">Public reading, organised by source.</h3>
            </div>
            <p class="english-news-disclaimer">Commercial publishers remain external; Leafbound never copies unlicensed full text.</p>
          </header>
          <div class="english-news-desks">
            ${englishNewsDesks.map((source) => {
              const copy = getEnglishNewsUi(source);
              return `
              <a class="english-news-desk is-${escapeHtml(source.access)}" href="${safeExternalHref(source.homepage)}" target="_blank" rel="noreferrer" aria-label="Read public articles at ${escapeHtml(source.name)}">
                <span class="english-news-mark" aria-hidden="true">${escapeHtml(source.mark)}</span>
                <span class="english-news-copy">
                  <small>${escapeHtml(copy.mode)}</small>
                  <strong>${escapeHtml(source.shortName)}</strong>
                  <em>${escapeHtml(copy.description)}</em>
                </span>
                <span class="english-news-arrow" aria-hidden="true">${icon("external")}</span>
              </a>`;
            }).join("")}
          </div>
        </section>
      </section>

      <div class="english-index-tools">
        <div class="english-category-tabs" role="tablist" aria-label="English reading categories">
          ${categories.map((category) => `
            <button type="button" role="tab" class="${ui.englishCategory === category ? "is-active" : ""}" data-english-category="${escapeHtml(category)}" aria-selected="${ui.englishCategory === category}">${escapeHtml(englishCategoryLabels[category] || "Other")}</button>`).join("")}
        </div>
        <p><span>${renderedArticles.length} / ${visible.length}</span> texts · ${ui.englishSourceFilter === "全部" ? "All sources" : escapeHtml(englishSourceCatalog.find((source) => source.id === ui.englishSourceFilter)?.shortName || "Source")}</p>
      </div>

      <div class="article-stack" aria-live="polite">
        ${visible.length ? renderedArticles.map(renderIndexRow).join("") : `
          <div class="empty-state english-empty">
            <span class="empty-glyph">Aa</span>
            <h2>Nothing in this shelf yet</h2>
            <p>Try another category or return to all sources.</p>
            <button class="secondary-button" type="button" data-english-source="全部" data-english-category="全部">View all reading</button>
          </div>`}
      </div>
      ${renderedArticles.length < visible.length ? `
        <div class="collection-load-more is-english" aria-label="English reading pagination">
          <p role="status">Showing ${renderedArticles.length} of ${visible.length} texts</p>
          <button class="secondary-button" type="button" data-load-more-english
            aria-label="Show ${Math.min(COLLECTION_BATCH_SIZE, visible.length - renderedArticles.length)} more English texts">
            Show ${Math.min(COLLECTION_BATCH_SIZE, visible.length - renderedArticles.length)} more ${icon("arrow")}
          </button>
        </div>` : visible.length ? `
        <p class="collection-end-note is-english" role="status">All ${visible.length} texts in this shelf are showing</p>` : ""}

    </section>`;
}

function renderArticleWordChunk(text, articleId, paragraphIndex, baseOffset = 0) {
  const savedIds = new Set(appStore.getState().savedItems.map((item) => item.id));
  const wordPattern = /[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
  let cursor = 0;
  let html = "";
  let match;

  while ((match = wordPattern.exec(text))) {
    const word = match[0];
    const offset = baseOffset + match.index;
    const lookupKey = `${articleId}:${paragraphIndex}:${offset}`;
    const isActive = ui.selectedEnglishItem?.lookupKey === lookupKey;
    const isSaved = savedIds.has(englishItemId(word));
    const isDropCap = paragraphIndex === 0 && offset === 0;
    const classes = ["word-token", isActive ? "is-active" : "", isSaved ? "is-saved" : "", isDropCap ? "has-dropcap" : ""].filter(Boolean).join(" ");

    html += escapeHtml(text.slice(cursor, match.index));
    html += `<button type="button" class="${classes}" data-english-word="${escapeHtml(word)}" data-article-id="${articleId}" data-paragraph-index="${paragraphIndex}" data-word-offset="${offset}" aria-label="Look up ${escapeHtml(word)}">${isDropCap ? `<span class="reader-dropcap" aria-hidden="true">${escapeHtml(word[0])}</span><span>${escapeHtml(word.slice(1))}</span>` : escapeHtml(word)}</button>`;
    cursor = match.index + word.length;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function highlightArticleParagraph(text, phrases, articleId, paragraphIndex) {
  const lower = text.toLowerCase();
  const matches = [];
  phrases.forEach((phrase, index) => {
    const start = lower.indexOf(phrase.text.toLowerCase());
    if (start >= 0) matches.push({ start, end: start + phrase.text.length, index, phrase });
  });
  matches.sort((a, b) => a.start - b.start);
  let cursor = 0;
  let html = "";
  matches.forEach((match) => {
    if (match.start < cursor) return;
    const lookupKey = `${articleId}:${paragraphIndex}:phrase:${match.start}`;
    const isActive = ui.selectedEnglishItem?.lookupKey === lookupKey;
    const isSaved = appStore.getState().savedItems.some((item) => item.id === englishItemId(match.phrase.text));
    html += renderArticleWordChunk(text.slice(cursor, match.start), articleId, paragraphIndex, cursor);
    html += `<button type="button" class="phrase-mark ${isActive ? "is-active" : ""} ${isSaved ? "is-saved" : ""}" data-english-phrase="${articleId}:${match.index}" data-paragraph-index="${paragraphIndex}" data-phrase-offset="${match.start}">${escapeHtml(text.slice(match.start, match.end))}</button>`;
    cursor = match.end;
  });
  html += renderArticleWordChunk(text.slice(cursor), articleId, paragraphIndex, cursor);
  return html;
}

function renderEnglishLookupHint(article) {
  const savedCount = appStore.getState().savedItems.filter((item) => item.language === "English" && item.source === article.title).length;
  return `
    <section class="reader-lookup-hint" aria-label="Word lookup guide">
      <span class="lookup-hint-mark" aria-hidden="true">Aa</span>
      <p class="eyebrow">READ · TAP · KEEP</p>
      <h2>Tap a word.<br>Stay on the page.</h2>
      <p>Tap any word for its Chinese meaning, English definition, common usage, pronunciation, and examples. Select a longer passage to keep a phrase or sentence.</p>
      <small>${savedCount ? `${savedCount} entries saved from this article` : "Definitions and reading history stay on this device"}</small>
    </section>`;
}

function renderEnglishLookupPanel(article) {
  const item = ui.selectedEnglishItem || ui.selectedText;
  if (!item) return renderEnglishLookupHint(article);

  const text = item.text.trim();
  const saved = appStore.getState().savedItems.some((savedItem) => savedItem.id === englishItemId(text));
  const type = item.type || (text.includes(" ") ? "phrase" : "word");
  const typeLabel = type.replaceAll("-", " ").toUpperCase();
  const meta = [item.partOfSpeech, item.lemma && item.lemma.toLowerCase() !== text.toLowerCase() ? `lemma ${item.lemma}` : ""].filter(Boolean).join(" · ");
  const commonUses = Array.isArray(item.commonUses) ? item.commonUses.slice(0, 3) : [];
  const dictionarySenses = Array.isArray(item.dictionarySenses) ? item.dictionarySenses.slice(0, 3) : [];
  const dictionaryExamples = Array.isArray(item.dictionaryExamples) ? item.dictionaryExamples : [];
  const examples = [...dictionaryExamples, ...dictionarySenses.map((sense) => sense.example)]
    .map((example) => String(example || "").trim())
    .filter((example, index, list) => example && list.findIndex((candidate) => candidate.toLocaleLowerCase() === example.toLocaleLowerCase()) === index)
    .slice(0, 2);
  const commonUseEmpty = type === "word"
    ? "No reliable common collocations are available yet."
    : "This entry is already a fixed expression; learn it as a complete unit.";
  const meaningFallback = item.dictionaryStatus === "loading"
    ? "Opening the local dictionary…"
    : item.dictionaryStatus === "error"
      ? "The local dictionary could not be loaded. Try again later or save the word for now."
      : "No local Chinese definition is available yet; you can still save this word.";

  return `
    <section class="english-lookup-card" data-english-lookup-card tabindex="-1" aria-live="polite" aria-label="Dictionary entry for ${escapeHtml(text)}">
      <header class="lookup-card-header">
        <p class="eyebrow">${escapeHtml(typeLabel)}</p>
        <button class="icon-button lookup-close" type="button" data-close-english-sheet aria-label="Close dictionary card">${icon("close")}</button>
      </header>
      <div class="lookup-word-line">
        <div>
          <h2>${escapeHtml(text)}</h2>
          ${item.pronunciation ? `<p class="pronunciation" data-lookup-pronunciation>${escapeHtml(item.pronunciation)}</p>` : ""}
          ${meta ? `<p class="lookup-meta">${escapeHtml(meta)}</p>` : ""}
        </div>
        <button class="lookup-speak" type="button" data-speak-english="term" aria-label="Listen to ${escapeHtml(text)}">${icon("headphones")}<span>Listen</span></button>
      </div>
      <section class="lookup-field lookup-meaning" data-lookup-section="chinese" aria-label="Chinese definition">
        <small>Chinese</small>
        <p lang="zh-Hant">${escapeHtml(item.meaning || meaningFallback)}</p>
      </section>
      <section class="lookup-field lookup-definition" data-lookup-section="english" aria-label="English definition">
        <small>English</small>
        <p lang="en">${escapeHtml(item.definition || "No English definition is available yet.")}</p>
      </section>
      <section class="lookup-field lookup-common-uses" data-lookup-section="usage" aria-label="Common usage">
        <small>Usage</small>
        ${commonUses.length ? `
          <ul>
            ${commonUses.map((use) => `<li><span lang="en">${escapeHtml(use.pattern)}</span><em lang="zh-Hant">${escapeHtml(use.meaning)}</em></li>`).join("")}
          </ul>` : `<p>${escapeHtml(item.usage || commonUseEmpty)}</p>`}
      </section>
      <section class="lookup-field lookup-examples" data-lookup-section="examples" aria-label="Examples">
        <small>Examples</small>
        ${examples.length ? `<ul>${examples.map((example) => `<li lang="en">${escapeHtml(example)}</li>`).join("")}</ul>` : `<p>No examples are available yet.</p>`}
      </section>
      <button class="primary-button lookup-save" type="button" data-save-english ${saved ? "disabled" : ""}>${saved ? `${icon("check")} Saved to vocabulary` : "Add to vocabulary"}</button>
    </section>`;
}

function renderArticleReader(id) {
  const article = findEnglishArticle(id);
  const state = appStore.getState();
  const progress = state.readingProgress[article.id] || 0;
  const activityProgress = itemProgress(state, "article", article);
  const preferences = state.preferences;
  const noteKey = `article:${article.id}`;
  const note = state.notes[noteKey]?.content || "";
  const noteOpen = ui.notePanel === noteKey;
  const sourceUi = getEnglishArticleSourceUi(article);

  return `
    <article class="article-reader page-enter ${preferences.englishDark ? "is-dark" : ""}" style="--reader-scale:${preferences.englishFontScale}; --reader-leading:${preferences.englishLineHeight}">
      <header class="reader-toolbar article-toolbar">
        <button class="back-button" type="button" data-route="english">${icon("back")} English</button>
        <div class="reader-actions">
          <button class="text-control" type="button" data-reader-font="-0.08" aria-label="Decrease text size">A−</button>
          <button class="text-control" type="button" data-reader-font="0.08" aria-label="Increase text size">A+</button>
          <button class="text-control leading-control" type="button" data-reader-leading aria-label="Adjust line spacing">Spacing</button>
          <button class="quiet-button ${preferences.englishDark ? "is-active" : ""}" type="button" data-reader-dark aria-pressed="${preferences.englishDark}">Night</button>
          ${renderReadingStateButton("article", article.id, activityProgress, article.title, "en")}
          <button class="icon-button" type="button" data-toggle-note="${noteKey}" aria-label="${noteOpen ? "Close note" : "Open note"}">${icon("note")}</button>
          ${favoriteButton(`article:${article.id}`, article.title, "en")}
        </div>
      </header>

      <div class="article-reader-layout">
        <aside class="article-margin">
          <span>${escapeHtml(article.topic)}</span>
          <div class="vertical-progress"><i style="height:${progress}%"></i></div>
          <small data-reader-progress-copy>${Math.round(progress)}%</small>
        </aside>

        <div class="reader-scroll" data-reader-scroll="${article.id}">
          <header class="article-title-block">
            <p>${escapeHtml(getEnglishArticleSourceName(article))} · ${article.minutes} min read</p>
            <h1>${escapeHtml(article.title)}</h1>
            <h2>${escapeHtml(article.deck)}</h2>
            ${article.sectionTitle ? `<p class="article-section-title">In-app chapter · ${escapeHtml(article.sectionTitle)}</p>` : ""}
            ${article.sourceUrl ? `
              <aside class="article-source-note">
                <span>${escapeHtml(sourceUi.label)}</span>
                <p><strong>${escapeHtml(article.attribution || article.source)}</strong> · ${escapeHtml(sourceUi.description)}</p>
                <a href="${safeExternalHref(article.fullTextUrl || article.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUi.linkLabel)} ${icon("external")}</a>
              </aside>` : ""}
          </header>
          <div class="article-body" data-article-body="${article.id}" lang="en">
            ${article.paragraphs.map((paragraph, index) => `<p class="${index === 0 ? "lede" : ""}" data-paragraph-index="${index}">${highlightArticleParagraph(paragraph, article.phrases || [], article.id, index)}</p>`).join("")}
          </div>
          <footer class="article-end">
            <span>End note</span>
            <p>Keep one phrase that changes how you would say something.</p>
          </footer>
        </div>

        <aside class="article-learning-rail">
          ${renderEnglishLookupPanel(article)}
          ${noteOpen ? `
            <section class="article-note-panel">
              <div class="aside-title"><span>Article note</span><small>Stored on this device only</small></div>
              <textarea data-note-input="${noteKey}" placeholder="What stayed with you?">${escapeHtml(note)}</textarea>
              <button class="primary-button compact" type="button" data-save-note="${noteKey}">Save note</button>
            </section>` : ""}
        </aside>
      </div>
      <div class="reader-bottom-progress"><span data-reader-progress-bar style="width:${progress}%"></span></div>
    </article>`;
}

function buildLibraryItems() {
  const state = appStore.getState();
  const items = [];

  state.favorites.forEach((key) => {
    const [kind, id] = key.split(":");
    if (kind === "poem") {
      const poem = poems.find((candidate) => candidate.id === id);
      if (poem) items.push({ id: key, module: "poetry", kind: `收藏${poem.kind}`, title: poem.title, detail: `${poem.poet} · ${poem.dynasty}`, route: ["poetry", poem.id], removableFavorite: key });
    }
    if (kind === "episode") {
      const episode = episodes.find((candidate) => candidate.id === id);
      if (episode) items.push({ id: key, module: "cantonese", kind: "收藏 Episode", title: episode.title, detail: episode.source, route: ["cantonese", episode.id], removableFavorite: key });
    }
    if (kind === "article") {
      const article = findEnglishArticle(id, false);
      if (article) items.push({ id: key, module: "english", kind: "收藏文章", title: article.title, detail: article.topic, route: ["english", article.id], removableFavorite: key });
    }
  });

  state.savedItems.forEach((item) => {
    const poetrySource = item.poemId ? poems.find((candidate) => candidate.id === item.poemId) : null;
    items.push({
      ...item,
      module: item.language === "Cantonese" ? "cantonese" : item.language === "English" ? "english" : "poetry",
      kind: item.type,
      title: item.text,
      detail: item.meaning || item.source || "已保存",
      route: poetrySource ? ["poetry", poetrySource.id] : null,
      removableSaved: item.id
    });
  });

  Object.entries(state.notes).forEach(([key, note]) => {
    if (!note?.content) return;
    const [kind, id] = key.split(":");
    const poem = kind === "poem" ? poems.find((candidate) => candidate.id === id) : null;
    const article = kind === "article" ? findEnglishArticle(id, false) : null;
    items.push({
      id: `note:${key}`,
      module: poem ? "poetry" : "english",
      kind: "個人筆記",
      title: poem?.title || article?.title || "筆記",
      detail: note.content,
      route: poem ? ["poetry", poem.id] : article ? ["english", article.id] : null
    });
  });

  return items;
}

function localDayKeyFromTimestamp(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? getLocalDayKey(date) : null;
}

function offsetLocalDate(date, offset) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12);
}

function libraryContentEntry(state, kind, item) {
  if (!item) return null;
  const activity = state.contentActivity?.[contentActivityKey(kind, item.id)] || {};
  const progress = itemProgress(state, kind, item);
  const historyField = kind === "poem" ? "poems" : kind === "episode" ? "episodes" : "articles";
  const historyIndex = (state.history?.[historyField] || []).indexOf(item.id);

  if (kind === "poem") {
    return {
      kind,
      module: "poetry",
      mark: item.kind === "古文" ? "文" : item.kind || "詩",
      eyebrow: item.kind === "古文" ? "Classical prose" : "Classical reading",
      title: item.title,
      detail: `${item.poet} · ${item.dynasty}`,
      action: progress > 0 && progress < SEEN_PROGRESS_THRESHOLD ? "繼續讀" : "讀今日一篇",
      route: ["poetry", item.id],
      progress,
      updatedAt: activity.updatedAt || "",
      recency: historyIndex < 0 ? 0 : 100 - historyIndex
    };
  }

  if (kind === "episode") {
    return {
      kind,
      module: "cantonese",
      mark: "粵",
      eyebrow: "Cantonese listening",
      title: item.title,
      detail: `${item.source} · ${formatTime(item.duration)}`,
      action: progress > 0 && progress < SEEN_PROGRESS_THRESHOLD ? "繼續收聽" : "聽今日一段",
      route: ["cantonese", item.id],
      progress,
      updatedAt: activity.updatedAt || "",
      recency: historyIndex < 0 ? 0 : 100 - historyIndex
    };
  }

  return {
    kind,
    module: "english",
    mark: "EN",
    eyebrow: "English reading",
    title: item.title,
    detail: `${item.topic} · ${Number(item.minutes) || Math.max(1, Math.ceil((item.paragraphs || []).join(" ").split(/\s+/).length / 190))} min read`,
    action: progress > 0 && progress < SEEN_PROGRESS_THRESHOLD ? "Continue reading" : "Read today’s page",
    route: ["english", item.id],
    progress,
    updatedAt: activity.updatedAt || "",
    recency: historyIndex < 0 ? 0 : 100 - historyIndex
  };
}

function buildLibraryLearningSnapshot(state, allItems, now = new Date()) {
  const englishItems = [...new Map(dailyEnglishArticles.map((article) => [article.id, article])).values()];
  const activeContentKeys = new Set(Object.keys(state.contentActivity || {}));
  Object.entries(state.readingProgress || {}).forEach(([id, progress]) => {
    if ((Number(progress) || 0) > 0) activeContentKeys.add(contentActivityKey("article", id));
  });
  Object.entries(state.playbackProgress || {}).forEach(([id, progress]) => {
    if ((Number(progress) || 0) > 0) activeContentKeys.add(contentActivityKey("episode", id));
  });
  const content = [...activeContentKeys].map((key) => {
    const separator = key.indexOf(":");
    if (separator < 1) return null;
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (kind === "poem") return libraryContentEntry(state, kind, poems.find((item) => item.id === id));
    if (kind === "episode") return libraryContentEntry(state, kind, episodes.find((item) => item.id === id));
    if (kind === "article") return libraryContentEntry(state, kind, englishItems.find((item) => item.id === id));
    return null;
  }).filter((entry) => entry && entry.progress > 0);
  const started = content.filter((entry) => entry.progress > 0);
  const unfinished = started
    .filter((entry) => entry.progress < SEEN_PROGRESS_THRESHOLD)
    .sort((left, right) => (
      (Number.isFinite(Date.parse(right.updatedAt || "")) ? Date.parse(right.updatedAt) : 0)
      - (Number.isFinite(Date.parse(left.updatedAt || "")) ? Date.parse(left.updatedAt) : 0)
      || right.recency - left.recency
      || right.progress - left.progress
    ));
  const todayKey = getLocalDayKey(now);
  let next = unfinished[0] || null;

  if (!next) {
    const recorded = state.dailySelections?.[todayKey] || {};
    const dailyCandidates = {
      poem: recorded.poem
        ? dailyPoems.find((item) => item.id === recorded.poem)
        : selectDailyItem(dailyPoems, "poem", state, now, 0).item,
      episode: recorded.episode
        ? episodes.find((item) => item.id === recorded.episode)
        : selectDailyItem(episodes, "episode", state, now, 2).item,
      article: recorded.article
        ? englishItems.find((item) => item.id === recorded.article)
        : selectDailyItem(englishItems, "article", state, now, 11).item
    };
    const kinds = ["poem", "episode", "article"];
    const rotation = getDailyIndex(kinds.length, now, 17);
    const rotatedKinds = kinds.map((_, index) => kinds[(index + rotation) % kinds.length]);
    const choices = rotatedKinds
      .map((kind) => libraryContentEntry(state, kind, dailyCandidates[kind]))
      .filter(Boolean);
    next = choices.find((entry) => entry.progress < SEEN_PROGRESS_THRESHOLD) || choices[0];
  }

  const activeDayCounts = new Map();
  Object.values(state.contentActivity || {}).forEach((activity) => {
    if ((Number(activity?.maxProgress) || 0) <= 0) return;
    const dayKey = localDayKeyFromTimestamp(activity.updatedAt || activity.seenAt || activity.completedAt);
    if (dayKey) activeDayCounts.set(dayKey, (activeDayCounts.get(dayKey) || 0) + 1);
  });
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = offsetLocalDate(now, index - 6);
    const key = getLocalDayKey(date);
    const count = activeDayCounts.get(key) || 0;
    return {
      key,
      label: index === 6 ? "今" : ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
      count,
      active: count > 0
    };
  });
  const activeDayKeys = new Set(activeDayCounts.keys());
  const todayActive = activeDayKeys.has(todayKey);
  let streak = 0;
  let streakDate = offsetLocalDate(now, todayActive ? 0 : -1);
  while (activeDayKeys.has(getLocalDayKey(streakDate))) {
    streak += 1;
    streakDate = offsetLocalDate(streakDate, -1);
  }

  const todaySeen = Object.values(state.contentActivity || {}).some((activity) => (
    (Number(activity?.maxProgress) || 0) >= SEEN_PROGRESS_THRESHOLD
    && localDayKeyFromTimestamp(activity.updatedAt || activity.seenAt) === todayKey
  ));
  const todaySaved = (state.savedItems || []).some((item) => (
    localDayKeyFromTimestamp(item.createdAt || item.updatedAt) === todayKey
  ));
  const quests = [
    {
      label: "翻開今日選頁",
      detail: "先看今天為你選出的三頁",
      done: Boolean(state.dailySelections?.[todayKey]),
      route: ["today", null]
    },
    {
      label: "讀到一半",
      detail: "任選詩文、粵語或 English",
      done: todaySeen,
      route: next?.route || ["today", null]
    },
    {
      label: "留下一頁",
      detail: "收藏一個真正想再見的詞句",
      done: todaySaved,
      route: next?.route || ["today", null]
    }
  ];

  const shelves = [
    { module: "poetry", mark: "文", eyebrow: "Classics", title: "詩詞古文", route: ["poetry", null] },
    { module: "cantonese", mark: "粵", eyebrow: "Cantonese", title: "粵語", route: ["cantonese", null] },
    { module: "english", mark: "EN", eyebrow: "English", title: "English", route: ["english", null] }
  ].map((shelf) => {
    const shelfContent = content.filter((entry) => entry.module === shelf.module);
    return {
      ...shelf,
      read: shelfContent.filter((entry) => entry.progress >= SEEN_PROGRESS_THRESHOLD).length,
      started: shelfContent.filter((entry) => entry.progress > 0 && entry.progress < SEEN_PROGRESS_THRESHOLD).length,
      saved: allItems.filter((item) => item.module === shelf.module).length
    };
  });

  return {
    next,
    week,
    activeDays: week.filter((day) => day.active).length,
    streak,
    todayActive,
    quests,
    completedQuests: quests.filter((quest) => quest.done).length,
    shelves,
    readCount: content.filter((entry) => entry.progress >= SEEN_PROGRESS_THRESHOLD).length
  };
}

function renderLibraryLearningDashboard(snapshot) {
  const next = snapshot.next;
  if (!next) return "";
  const nextProgress = Math.round(Math.max(0, Math.min(100, next.progress)));
  return `
    <section class="library-learning" aria-label="你的學習概覽">
      <article class="library-next-card is-${next.module}">
        <span class="library-next-thread" aria-hidden="true"></span>
        <header>
          <span class="library-next-mark" aria-hidden="true">${escapeHtml(next.mark)}</span>
          <div><p class="eyebrow">${nextProgress ? "Continue your path" : "Next leaf"}</p><span>${escapeHtml(next.eyebrow)}</span></div>
          <strong>${nextProgress ? `${nextProgress}%` : "新"}</strong>
        </header>
        <div class="library-next-copy">
          <p>${nextProgress ? "接著上次停下的位置" : "今天從這一頁開始"}</p>
          <h2>${escapeHtml(next.title)}</h2>
          <span>${escapeHtml(next.detail)}</span>
        </div>
        <div class="library-next-progress" role="progressbar" aria-label="${escapeHtml(next.title)}進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nextProgress}">
          <i style="--library-progress:${nextProgress}%"></i>
        </div>
        <button class="library-next-action" type="button" data-route="${next.route[0]}" data-route-id="${next.route[1]}">
          <span>${escapeHtml(next.action)}</span>${icon("arrow")}
        </button>
      </article>

      <div class="library-rhythm">
        <section class="library-week-card" aria-labelledby="library-week-title">
          <header><div><p class="eyebrow">Seven-day rhythm</p><h2 id="library-week-title">本周書脊</h2></div><strong>${snapshot.activeDays}<small>/ 7 日</small></strong></header>
          <div class="library-week" aria-label="最近七日閱讀活動">
            ${snapshot.week.map((day) => `
              <div class="library-day ${day.active ? "is-active" : ""}" aria-label="${day.key}，${day.count ? `${day.count} 項閱讀活動` : "沒有閱讀活動"}">
                <span><i style="--habit-height:${10 + Math.min(4, day.count) * 9}px"></i></span><small>${day.label}</small>
              </div>`).join("")}
          </div>
          <p>${snapshot.todayActive ? "今天已經留下閱讀痕跡。" : snapshot.streak ? "連續仍在，今天再翻開一頁。" : "不必追趕，今天留下一道痕跡就好。"}</p>
        </section>

        <section class="library-quest-card" aria-labelledby="library-quest-title">
          <header><div><p class="eyebrow">Today’s practice</p><h2 id="library-quest-title">今日三件小事</h2></div><strong>${snapshot.completedQuests}/3</strong></header>
          <div class="library-quest-list">
            ${snapshot.quests.map((quest, index) => `
              <button class="library-quest ${quest.done ? "is-done" : ""}" type="button" data-route="${quest.route[0]}" ${quest.route[1] ? `data-route-id="${quest.route[1]}"` : ""}>
                <small>${String(index + 1).padStart(2, "0")}</small>
                <span><strong>${escapeHtml(quest.label)}</strong><em>${escapeHtml(quest.detail)}</em></span>
                <i aria-hidden="true">${quest.done ? "✓" : "→"}</i>
              </button>`).join("")}
          </div>
        </section>
      </div>
    </section>`;
}

function renderLibraryShelves(snapshot) {
  return `
    <section class="library-shelves" aria-labelledby="library-shelves-title">
      <header>
        <div><p class="eyebrow">Learning shelves</p><h2 id="library-shelves-title">三座正在長大的書架</h2></div>
        <p><strong>${snapshot.readCount}</strong> 篇讀過一半以上</p>
      </header>
      <div class="library-shelf-grid">
        ${snapshot.shelves.map((shelf) => `
          <button class="library-shelf is-${shelf.module}" type="button" data-route="${shelf.route[0]}">
            <span class="library-shelf-mark" aria-hidden="true">${shelf.mark}</span>
            <span class="library-shelf-copy"><small>${shelf.eyebrow}</small><strong>${shelf.title}</strong><em>${shelf.started ? `${shelf.started} 篇待續` : "下一篇等你翻開"}</em></span>
            <span class="library-shelf-stats"><b>${shelf.read}</b><small>已閱</small><b>${shelf.saved}</b><small>收下</small></span>
            <span class="library-shelf-arrow" aria-hidden="true">→</span>
          </button>`).join("")}
      </div>
    </section>`;
}

function renderAboutPanel() {
  const openWorks = poems.filter((poem) => poem.isOpenCorpus).length;
  const kindCount = (kind) => poems.filter((poem) => poem.kind === kind).length;
  const lexiconCount = cantoneseLexiconState.entryCount || 62_274;
  const characterCount = cantoneseLexiconState.characterEntryCount || 26_983;
  const definitionCount = cantoneseLexiconState.definitionEntryCount || 38_450;
  const importedEnglishCount = englishDiscoveries.length;
  const localCantoneseCount = episodes.filter((episode) => episode.sourceId === "local").length;

  return `
    <section class="about-panel" id="library-about-panel" tabindex="-1" aria-labelledby="about-title">
      <header class="about-heading">
        <div><p class="eyebrow">About Leafbound</p><h2 id="about-title">關於 Leafbound</h2></div>
        <p>Leafbound（拾頁）是一座 local-first 個人語言書房。內容來源、授權與資料邊界集中記錄在這裡，閱讀頁保持安靜。</p>
      </header>

      <div class="about-source-grid">
        <article class="about-source-card is-classics">
          <span class="about-source-mark" aria-hidden="true">文</span>
          <div class="about-source-copy">
            <p class="eyebrow">Classical library</p>
            <h3>古典文庫</h3>
            <p>${poems.length} 篇本地內容，包括 ${kindCount("詩")} 首詩、${kindCount("詞")} 首詞、${kindCount("曲")} 首曲與 ${kindCount("古文")} 篇古文；其中 ${openWorks} 篇來自固定版本的 chinese-poetry 開放資料。</p>
            <dl>
              <div><dt>收錄</dt><dd>唐詩三百首 · 全唐詩選 · 千家詩 · 宋詞三百首 · 全宋詞選 · 古文觀止 · 詩經 · 楚辭 · 元曲 · 四書 · 曹操詩集 · 納蘭詞 · 幽夢影 · 蒙學原典</dd></div>
              <div><dt>內置今譯</dt><dd>${completeClassicalTranslationCount} 篇隨主程式提供：${completeClassicalTranslationByKind.詩 || 0} 首詩、${completeClassicalTranslationByKind.詞 || 0} 首詞、${completeClassicalTranslationByKind.曲 || 0} 首曲、${completeClassicalTranslationByKind.古文 || 0} 篇古文；其中 ${classicalTranslationSnapshot.openCount} 篇為精確原文匹配的開放機器語料，其餘 ${completeClassicalTranslationCount - classicalTranslationSnapshot.openCount} 篇為 Leafbound 編輯稿</dd></div>
              <div><dt>AI 分片</dt><dd>每篇保留繁體、漏譯、照抄、長度、拒答、重複與段落結構檢查結果；有阻斷警告的草稿不算成品。閱讀頁只按需載入目前作品所在分片，並明確標示機器草稿、待校對、人工已校或已退回</dd></div>
              <div><dt>授權</dt><dd>古典正文 MIT · 開放今譯 Apache 2.0</dd></div>
              <div><dt>邊界</dt><dd>只有無阻斷項的「人工已校」記錄才算可發布成品；機器稿只作理解參考。沒有精確匹配的作品不以同題、近似文字或來源不明的網頁譯文補位</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://github.com/chinese-poetry/chinese-poetry" target="_blank" rel="noreferrer">查看資料庫</a>
              <a href="https://github.com/chinese-poetry/chinese-poetry/blob/master/LICENSE" target="_blank" rel="noreferrer">MIT 授權</a>
              <a href="https://github.com/mobvoi/seq-monkey-data/blob/main/docs/cchs_open_corpus.md" target="_blank" rel="noreferrer">古詩今譯資料說明</a>
              <a href="https://github.com/mobvoi/seq-monkey-data/blob/main/LICENSE" target="_blank" rel="noreferrer">Apache 2.0</a>
              <a href="./data/licenses/mobvoi-seq-monkey-apache-2.0.txt" target="_blank" rel="noreferrer">完整修改與授權說明</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-cantonese-content">
          <span class="about-source-mark" aria-hidden="true">聲</span>
          <div class="about-source-copy">
            <p class="eyebrow">Cantonese listening shelf</p>
            <h3>香港口語、研究訪談口述與分級故事</h3>
            <p>${cantoneseSourceSnapshot.authenticSampleCount} 段 HKCanCor 真人錄音與標注逐字稿保存在本機，其中一段以「問／答」呈現雙方訪談式話輪；另有 ${episodes.filter((episode) => episode.sourceId === "spice").length} 段 SpiCE 受訪者對齊口述及 ${cantoneseSourceSnapshot.importedStoryCount} 篇冚唪唥粵文故事。</p>
            <dl>
              <div><dt>HKCanCor</dt><dd>1997–1998 香港自然對話／電台樣本 · 保留說話者代號與原有粵拼 · CC BY 4.0</dd></div>
              <div><dt>SpiCE</dt><dd>12 段匿名受訪者對齊稿；1 段本機受訪者聲道，其餘原聲只作官方引用 · CC BY 4.0</dd></div>
              <div><dt>冚唪唥</dt><dd>${cantoneseSourceSnapshot.catalogCount} 篇公開目錄中，匯入 ${cantoneseSourceSnapshot.importedStoryCount} 篇有正文、署名與原聲入口的故事</dd></div>
              <div><dt>分組</dt><dd>原站按詞頻與用法分級；Leafbound 整理為起步、日常、進階三組，不等同 CEFR</dd></div>
              <div><dt>教材邊界</dt><dd>香港教育局與出版社教材不整套複製；只接受使用者有權使用的個人檔案</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://github.com/fcbond/hkcancor" target="_blank" rel="noreferrer">HKCanCor</a>
              <a href="https://doi.org/10.5683/SP2/MJOXP3" target="_blank" rel="noreferrer">SpiCE 訪談語料</a>
              <a href="https://hambaanglaang.hk/all-levels/" target="_blank" rel="noreferrer">冚唪唥 7 級目錄</a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
            </div>
            <details class="about-attribution-list">
              <summary>查看 ${cantoneseSourceSnapshot.importedStoryCount} 篇故事的逐篇署名</summary>
              <ul>
                ${episodes.filter((episode) => episode.sourceId === "hbl").map((episode) => `
                  <li><a href="${safeExternalHref(episode.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(episode.title)}</a><span>${escapeHtml(episode.attribution)}</span></li>`).join("")}
              </ul>
            </details>
          </div>
        </article>

        <article class="about-source-card is-cantonese">
          <span class="about-source-mark" aria-hidden="true">字</span>
          <div class="about-source-copy">
            <p class="eyebrow">Cantonese pronunciation & Chinese definitions</p>
            <h3>粵拼與中文釋義</h3>
            <p>${lexiconCount.toLocaleString("en-US")} 個粵典本地詞條用於點詞查音，${characterCount.toLocaleString("en-US")} 個 Rime Cantonese 單字條目補全古文逐字粵拼；另按需載入 ${definitionCount.toLocaleString("en-US")} 個教育部辭典繁體中文釋義。</p>
            <dl>
              <div><dt>收錄</dt><dd>詞形候選讀音 · 古文單字候選讀音 · 歷史語詞中文釋義</dd></div>
              <div><dt>授權</dt><dd>Public domain · CC BY 4.0 · CC BY-ND 3.0 TW</dd></div>
              <div><dt>邊界</dt><dd>粵拼是候選讀音；中文釋義原樣保留，不改寫、不轉簡體，也不顯示英譯</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://words.hk/faiman/analysis/" target="_blank" rel="noreferrer">粵典開放詞表</a>
              <a href="https://words.hk/" target="_blank" rel="noreferrer">前往粵典</a>
              <a href="https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/jyut6ping3.chars.dict.yaml" target="_blank" rel="noreferrer">Rime 單字表</a>
              <a href="https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/LICENSE-CC-BY" target="_blank" rel="noreferrer">CC BY 4.0</a>
              <a href="https://dict.revised.moe.edu.tw/" target="_blank" rel="noreferrer">教育部重編國語辭典</a>
              <a href="https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html" target="_blank" rel="noreferrer">公眾授權與版本</a>
              <a href="./data/licenses/moe-revised-dictionary-usage.txt" target="_blank" rel="noreferrer">完整使用說明</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-english">
          <span class="about-source-mark" aria-hidden="true">EN</span>
          <div class="about-source-copy">
            <p class="eyebrow">English shelf & dictionary</p>
            <h3>英文來源與本地詞典</h3>
            <p>${importedEnglishCount} 篇來自 ${englishSourceSnapshot.feeds.length} 個官方訂閱源的正文與 ${articles.length} 篇 Leafbound 精讀稿均支援點詞；本地詞庫為現有文章準備了 ${englishDictionarySnapshot.matchedWordCount.toLocaleString("en-US")} 個詞形，其中 ${englishDictionarySnapshot.bilingualWordCount.toLocaleString("en-US")} 個有中英對齊詞義。</p>
            <dl>
              <div><dt>VOA</dt><dd>Learning English · 自製文章全文；通訊社材料排除</dd></div>
              <div><dt>NASA</dt><dd>Technology · 官方正文純文字</dd></div>
              <div><dt>Standard</dt><dd>New Releases · 公共領域作品首章</dd></div>
              <div><dt>Global Voices</dt><dd>原創文章 · CC BY 3.0 · 作者與原文連結完整保留；外部共享稿件排除</dd></div>
              <div><dt>新聞台</dt><dd>AP、Reuters、Guardian、CNN、RFI、Economist 只列公開閱讀入口；Open Newswire 用來尋找授權清楚的下一批全文</dd></div>
              <div><dt>詞典</dt><dd>Princeton WordNet 3.0 英文釋義與例句 · Chinese Open Wordnet 2.0 中文對齊 · FreeDict 為 ${englishDictionarySnapshot.freedictFallbackWordCount.toLocaleString("en-US")} 個缺口補義（CC BY-SA 3.0）</dd></div>
              <div><dt>邊界</dt><dd>不下載、抓取或轉載牛津、劍橋等商業詞典內容；未將任何私有 API 金鑰放進網頁</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://learningenglish.voanews.com/rssfeeds" target="_blank" rel="noreferrer">VOA RSS</a>
              <a href="https://www.nasa.gov/rss-feeds/" target="_blank" rel="noreferrer">NASA RSS</a>
              <a href="https://standardebooks.org/feeds" target="_blank" rel="noreferrer">Standard Ebooks feeds</a>
              <a href="https://globalvoices.org/about/global-voices-attribution-policy/" target="_blank" rel="noreferrer">Global Voices CC BY</a>
              <a href="https://github.com/omwn/omw-data/releases/tag/v2.0" target="_blank" rel="noreferrer">Open Multilingual Wordnet</a>
              <a href="https://freedict.org/zh_cn/downloads/" target="_blank" rel="noreferrer">FreeDict</a>
              <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">查看授權邊界</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-originals">
          <span class="about-source-mark" aria-hidden="true">拾</span>
          <div class="about-source-copy">
            <p class="eyebrow">Leafbound originals</p>
            <h3>編輯示範內容</h3>
            <p>目前的 ${articles.length} 篇 English 精讀稿、${localCantoneseCount} 篇粵語練習、${inlineClassicalTranslationCount} 篇自帶今譯的精修古典內容與 ${classicalTranslationSnapshot.editorialCount} 篇條目級今譯均為 Leafbound 本地編輯稿，用來驗證閱讀、收藏與筆記流程。</p>
            <dl>
              <div><dt>English</dt><dd>本地精讀稿與清洗後的公開來源正文分開標示</dd></div>
              <div><dt>粵語</dt><dd>本地練習與 HKCanCor 真人錄音、冚唪唥分級故事分開標示</dd></div>
            </dl>
          </div>
        </article>
      </div>

      <section class="about-data-note">
        <span aria-hidden="true">本</span>
        <div><h3>所有個人資料只留在本機</h3><p>偏好設定保存在 localStorage；收藏、筆記、詞庫、最近閱讀／收聽記錄、閱讀與播放進度和每日選擇保存在目前瀏覽器的 IndexedDB。Leafbound 不設帳戶同步、分析 SDK 或遠端資料庫，也不以 Cookie 保存狀態；IndexedDB 不可用時才回退到完整 localStorage。SoundCloud 與線上語音只在你明確操作後讀取，可能按各自政策處理網路請求，但不會收到上述個人狀態。清除瀏覽器資料前，建議先匯出版本化備份。</p></div>
      </section>

      <footer class="about-footer">
        <span>Leafbound · 拾頁 · Personal Language Library</span>
        <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">完整第三方資料與授權說明</a>
      </footer>
    </section>`;
}

function renderSettingsSwitch(key, title, description, checked) {
  return `
    <button class="settings-switch" type="button" data-setting-toggle="${key}" role="switch" aria-checked="${checked}">
      <span class="settings-switch-copy"><strong>${title}</strong><small>${description}</small></span>
      <span class="settings-switch-state" aria-hidden="true">
        <span class="settings-switch-track"><i></i></span>
        <b>${checked ? "開" : "關"}</b>
      </span>
    </button>`;
}

function renderLanguageSettingsGroup() {
  return `
    <section class="settings-group settings-language-group" aria-labelledby="settings-language-title">
      <header>
        <span aria-hidden="true">語</span>
        <div><p class="eyebrow">Language library</p><h3 id="settings-language-title">目前語言</h3></div>
      </header>
      <div class="language-list settings-language-list">
        <span>粵語 <small>Jyutping · Hong Kong</small></span>
        <span>English <small>Latin · Global</small></span>
        <button type="button" disabled title="第二階段開放">＋ 新增語言 <small>P1</small></button>
      </div>
    </section>`;
}

function renderSettingsPanel() {
  const preferences = appStore.getState().preferences;
  const typography = getClassicalTypography(preferences);
  const persistenceMode = appStore.getPersistenceMode();
  const storageRemembered = persistenceMode !== "localStorage" || (() => {
    try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
  })();

  return `
    <section class="settings-panel" id="library-settings-panel" tabindex="-1" aria-labelledby="settings-title">
      <header class="settings-heading">
        <div>
          <p class="eyebrow">Reading preferences</p>
          <h2 id="settings-title">把書房調成你的節奏。</h2>
        </div>
        <p>改動會立即套用到每一篇正文。這裡只記錄閱讀方式，不記錄你讀過甚麼。</p>
      </header>

      <div class="settings-local-note ${storageRemembered ? "is-remembered" : "is-session-only"}" data-storage-status="${storageRemembered ? "remembered" : "session-only"}">
        <span class="settings-local-mark" aria-hidden="true">本</span>
        <div>
          <strong>${storageRemembered ? "所有設定只由這部瀏覽器記住" : "瀏覽器封鎖了持久儲存"}</strong>
          <p>偏好保存在 localStorage；收藏、筆記、詞庫、歷史和進度保存在本機 IndexedDB。Leafbound 不使用 Cookie，也不會上傳到 Leafbound 或第三方資料庫。</p>
        </div>
        <small>${storageRemembered ? "LOCAL · ONLY" : "SESSION · ONLY"}</small>
      </div>

      <div class="settings-ledger">
        <section class="settings-group" aria-labelledby="settings-classical-title">
          <header><span aria-hidden="true">文</span><div><p class="eyebrow">Classical</p><h3 id="settings-classical-title">古典閱讀</h3></div></header>
          <div class="settings-control-row">
            <div><strong>正文字體</strong><small>詩、詞、曲與古文共用</small></div>
            <div class="settings-segmented" role="group" aria-label="古典正文字體">
              ${classicalFontOptions.map((option) => `
                <button class="${typography.font === option.id ? "is-active" : ""}" type="button" data-classical-font="${option.id}" aria-pressed="${typography.font === option.id}">${option.label}</button>`).join("")}
            </div>
          </div>
          <div class="settings-control-row">
            <div><strong>字號</strong><small>目前 ${Math.round(typography.scale * 100)}%</small></div>
            <div class="settings-stepper" role="group" aria-label="古典正文字號">
              <button type="button" data-classical-size="-0.08" aria-label="縮小古典正文字號">A−</button>
              <button class="settings-readout" type="button" data-classical-size-reset aria-label="古典字號還原為 100%">${Math.round(typography.scale * 100)}%</button>
              <button type="button" data-classical-size="0.08" aria-label="放大古典正文字號">A+</button>
            </div>
          </div>
          <div class="settings-control-row">
            <div><strong>行距</strong><small>控制原文留白</small></div>
            <div class="settings-segmented" role="group" aria-label="古典正文行距">
              ${classicalLeadingOptions.map((option) => `
                <button class="${typography.leading === option.value ? "is-active" : ""}" type="button" data-classical-leading="${option.value}" aria-pressed="${typography.leading === option.value}">${option.label}</button>`).join("")}
            </div>
          </div>
          <div class="settings-control-row">
            <div><strong>預設閱讀模式</strong><small>原文、逐段對照或只讀今譯</small></div>
            <div class="settings-segmented" role="group" aria-label="古典預設閱讀模式">
              ${classicalReadingModes.map((option) => `
                <button class="${typography.readingMode === option.id ? "is-active" : ""}" type="button" data-classical-reading-mode="${option.id}" aria-pressed="${typography.readingMode === option.id}">${option.label}</button>`).join("")}
            </div>
          </div>
          ${[
            { id: "size", label: "粵拼字號", detail: "獨立於原文字級", value: typography.jyutpingSize },
            { id: "color", label: "粵拼顏色", detail: "玉色、朱色或墨色", value: typography.jyutpingColor },
            { id: "opacity", label: "粵拼濃淡", detail: "降低或提高視覺份量", value: typography.jyutpingOpacity },
            { id: "gap", label: "粵拼上下距", detail: "控制讀音與原文留白", value: typography.jyutpingGap }
          ].map((group) => `
            <div class="settings-control-row">
              <div><strong>${group.label}</strong><small>${group.detail}</small></div>
              <div class="settings-segmented" role="group" aria-label="${group.label}">
                ${classicalJyutpingOptions[group.id].map((option) => `
                  <button class="${group.value === option.value ? "is-active" : ""}" type="button"
                    data-classical-jyutping-setting="${group.id}" data-classical-jyutping-value="${option.value}"
                    aria-pressed="${group.value === option.value}">${option.label}</button>`).join("")}
              </div>
            </div>`).join("")}
          ${renderSettingsSwitch("showJyutping", "顯示古典粵拼", "詩、詞、曲與古文預設顯示首個候選讀音", preferences.showJyutping !== false)}
        </section>

        <section class="settings-group" aria-labelledby="settings-cantonese-title">
          <header><span aria-hidden="true">粵</span><div><p class="eyebrow">Cantonese</p><h3 id="settings-cantonese-title">粵語逐字稿</h3></div></header>
          ${renderSettingsSwitch("showTranscriptJyutping", "顯示逐字稿粵拼", "直接標在字詞上方；有語料原注時優先使用", preferences.showTranscriptJyutping !== false)}
          <div class="settings-control-row is-stacked">
            <div><strong>打開故事時</strong><small>選擇逐字稿的預設閱讀方式</small></div>
            <div class="settings-segmented transcript-settings" role="group" aria-label="逐字稿預設模式">
              ${[["full", "全文"], ["reveal", "按需"], ["listen", "純聽"]].map(([value, label]) => `
                <button class="${preferences.transcriptMode === value ? "is-active" : ""}" type="button" data-transcript-mode="${value}" aria-pressed="${preferences.transcriptMode === value}">${label}</button>`).join("")}
            </div>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="settings-english-title">
          <header><span class="settings-english-mark" aria-hidden="true">Aa</span><div><p class="eyebrow">English</p><h3 id="settings-english-title">English 閱讀</h3></div></header>
          <div class="settings-control-row">
            <div><strong>字號</strong><small>目前 ${Math.round(preferences.englishFontScale * 100)}%</small></div>
            <div class="settings-stepper" role="group" aria-label="English 正文字號">
              <button type="button" data-reader-font="-0.08" aria-label="縮小 English 正文字號">A−</button>
              <output class="settings-readout">${Math.round(preferences.englishFontScale * 100)}%</output>
              <button type="button" data-reader-font="0.08" aria-label="放大 English 正文字號">A+</button>
            </div>
          </div>
          <div class="settings-control-row">
            <div><strong>行距</strong><small>目前 ${preferences.englishLineHeight.toFixed(2)}</small></div>
            <div class="settings-segmented" role="group" aria-label="English 正文行距">
              ${englishLeadingOptions.map((option) => `
                <button class="${preferences.englishLineHeight === option.value ? "is-active" : ""}" type="button" data-english-leading="${option.value}" aria-pressed="${preferences.englishLineHeight === option.value}">${option.label}</button>`).join("")}
            </div>
          </div>
          ${renderSettingsSwitch("englishDark", "夜讀模式", "只改變 English 文章的閱讀紙色", preferences.englishDark === true)}
        </section>

        <section class="settings-group" aria-labelledby="settings-audio-title">
          <header><span aria-hidden="true">聲</span><div><p class="eyebrow">Listening</p><h3 id="settings-audio-title">收聽速度</h3></div></header>
          <div class="settings-control-row is-stacked">
            <div><strong>預設播放速度</strong><small>真人原聲與本機粵語朗讀共用</small></div>
            <div class="settings-segmented speed-settings" role="group" aria-label="預設播放速度">
              ${playbackSpeedOptions.map((value) => `
                <button class="${preferences.playbackSpeed === value ? "is-active" : ""}" type="button" data-speed="${value}" aria-pressed="${preferences.playbackSpeed === value}">${value}×</button>`).join("")}
            </div>
          </div>
        </section>

        ${renderLanguageSettingsGroup()}
      </div>

      <footer class="settings-footer">
        <div><strong>想重新開始？</strong><span>只重設閱讀偏好，不會刪除收藏、筆記或進度。</span></div>
        <button class="secondary-button" type="button" data-reset-settings>還原全部設定</button>
      </footer>
    </section>`;
}

function renderLibraryUtilityMenu(activePanel) {
  const entries = [
    { id: "settings", mark: "調", eyebrow: "Reading preferences", title: "設定", detail: "字體、間距、粵拼、夜讀與播放速度" },
    { id: "about", mark: "關", eyebrow: "Sources & privacy", title: "關於 Leafbound", detail: "內容來源、授權、資料保存與第三方邊界" }
  ];

  return `
    <nav class="library-utility-menu" aria-label="書房選項">
      ${entries.map((entry) => `
        <button class="library-utility-row ${activePanel === entry.id ? "is-active" : ""}" type="button" data-library-panel="${entry.id}"
          aria-expanded="${activePanel === entry.id}" aria-controls="library-${entry.id}-panel">
          <span class="library-utility-mark" aria-hidden="true">${entry.mark}</span>
          <span class="library-utility-copy"><small>${entry.eyebrow}</small><strong>${entry.title}</strong><em>${entry.detail}</em></span>
          <span class="library-utility-arrow" aria-hidden="true">${activePanel === entry.id ? "×" : "→"}</span>
        </button>`).join("")}
    </nav>`;
}

function renderLibrary() {
  const state = appStore.getState();
  const allItems = buildLibraryItems();
  const activePanel = ["settings", "about"].includes(ui.libraryPanel) ? ui.libraryPanel : null;
  const learning = buildLibraryLearningSnapshot(state, allItems);
  const visible = ui.libraryFilter === "all"
    ? allItems
    : ui.libraryFilter === "notes"
      ? allItems.filter((item) => item.kind === "個人筆記")
      : allItems.filter((item) => item.module === ui.libraryFilter);
  const filters = [
    ["all", "全部"],
    ["poetry", "詩詞"],
    ["cantonese", "粵語"],
    ["english", "English"],
    ["notes", "筆記"]
  ];

  return `
    <section class="library-view page-enter">
      <header class="library-hero">
        <div>
          <p class="eyebrow">My Leafbound · Personal practice</p>
          <h1>從讀過的地方，<br>接著往前。</h1>
          <p>這裡不只收藏內容，也把未讀完的一頁、本周節奏與今天最小的一步放回你面前。</p>
        </div>
        <div class="library-streak-seal ${learning.todayActive ? "is-active" : ""}" aria-label="連續閱讀 ${learning.streak} 日">
          <span>連</span>
          <strong>${learning.streak}</strong>
          <small>日閱讀</small>
          <em>${learning.todayActive ? "今日已留痕" : "今天再翻一頁"}</em>
        </div>
      </header>

      ${activePanel ? `
        <div class="library-panel-nav">${renderLibraryUtilityMenu(activePanel)}</div>
        <div class="library-panel-content page-enter">
          ${activePanel === "settings" ? renderSettingsPanel() : renderAboutPanel()}
        </div>` : `
        ${renderLibraryLearningDashboard(learning)}
        ${renderLibraryShelves(learning)}

        <section class="library-kept" aria-labelledby="library-kept-title">
          <header class="library-kept-heading">
            <div><p class="eyebrow">Kept leaves</p><h2 id="library-kept-title">收藏與筆記</h2></div>
            <p><strong>${allItems.length}</strong> 頁留在這部裝置</p>
          </header>
          <div class="library-tabs" role="tablist" aria-label="收藏分類">
            ${filters.map(([id, label]) => `
              <button type="button" role="tab" class="${ui.libraryFilter === id ? "is-active" : ""}" data-library-filter="${id}" aria-selected="${ui.libraryFilter === id}">${label}</button>`).join("")}
          </div>

          <div class="library-list">
            ${visible.length ? visible.map((item) => `
            <article class="library-item">
              <div class="library-module module-${item.module}" aria-hidden="true">${item.module === "poetry" ? "詩" : item.module === "cantonese" ? "粵" : "EN"}</div>
              <button class="library-main" type="button" ${item.route ? `data-route="${item.route[0]}" data-route-id="${item.route[1]}"` : "disabled"}>
                <small>${escapeHtml(item.kind)}</small>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
              </button>
              ${item.removableFavorite ? `
                <button class="icon-button remove-button" type="button" data-toggle-favorite="${escapeHtml(item.removableFavorite)}" aria-label="從收藏移除">${icon("trash")}</button>` : item.removableSaved ? `
                <button class="icon-button remove-button" type="button" data-remove-saved="${escapeHtml(item.removableSaved)}" aria-label="從 Library 移除">${icon("trash")}</button>` : ""}
            </article>`).join("") : `
            <div class="empty-state library-empty">
              <span class="empty-glyph">頁</span>
              <h2>${allItems.length ? "這個分類還是空的" : "你的 Library 正等著第一頁"}</h2>
              <p>${allItems.length ? "到其他分類看看，或在閱讀時保存新的內容。" : "收藏一首詩、一個粵語詞，或在 English 文章中選取一段 phrase。"}</p>
              <button class="secondary-button" type="button" data-route="today">回到今日</button>
            </div>`}
          </div>
        </section>

        <section class="library-management" aria-labelledby="library-management-title">
          <header><div><p class="eyebrow">Your reading room</p><h2 id="library-management-title">書房管理</h2></div><p>偏好、來源與本地資料都收在最後，不打斷每日閱讀。</p></header>
          ${renderLibraryUtilityMenu(activePanel)}
          <div class="privacy-note">
            <span>${icon("bookmark")}</span>
            <p><strong>內容只屬於這部裝置。</strong> 偏好保存在 localStorage，收藏、筆記、詞庫、歷史與進度保存在 IndexedDB；不使用 Cookie、帳戶同步或遠端資料庫。</p>
            <div class="local-backup-actions">
              <button class="quiet-button" type="button" data-export-data>匯出備份</button>
              <label class="quiet-button" for="leafbound-import-file">匯入備份</label>
              <input id="leafbound-import-file" class="sr-only" type="file" accept="application/json,.json" data-import-data>
            </div>
          </div>
        </section>`}
    </section>`;
}

function searchResults(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    const state = appStore.getState();
    const recentPoem = findPoem(state.history.poems?.[0]);
    return [
      { module: "poetry", badge: recentPoem.kind === "古文" ? "文" : recentPoem.kind, kicker: `最近讀過 · ${recentPoem.kind}`, title: recentPoem.title, detail: recentPoem.poet, route: ["poetry", state.history.poems?.[0] || poems[0].id] },
      { module: "cantonese", kicker: "繼續聽", title: findEpisode(state.history.episodes?.[0]).title, detail: findEpisode(state.history.episodes?.[0]).source, route: ["cantonese", state.history.episodes?.[0] || episodes[0].id] },
      { module: "english", kicker: "Continue reading", title: findEnglishArticle(state.history.articles?.[0]).title, detail: findEnglishArticle(state.history.articles?.[0]).topic, route: ["english", state.history.articles?.[0] || articles[0].id] }
    ];
  }

  const results = [];
  poems.forEach((poem) => {
    const text = [poem.kind, poem.title, poem.poet, poem.dynasty, poem.form, poem.originalSource, ...poem.themes, ...poem.lines.map((line) => line.text)].join(" ").toLocaleLowerCase();
    if (text.includes(normalized)) results.push({ module: "poetry", badge: poem.kind === "古文" ? "文" : poem.kind, kicker: `${poem.kind} · ${poem.dynasty} · ${poem.form}`, title: poem.title, detail: `${poem.poet} · ${poem.lines[0].text}`, route: ["poetry", poem.id] });
  });
  episodes.forEach((episode) => {
    const text = [episode.title, episode.source, episode.description, ...episode.transcript.map((item) => item.text)].join(" ").toLocaleLowerCase();
    if (text.includes(normalized)) results.push({ module: "cantonese", kicker: episode.source, title: episode.title, detail: episode.description, route: ["cantonese", episode.id] });
  });
  [...articles, ...englishDiscoveries].forEach((article) => {
    const text = [article.title, article.deck, article.topic, article.source, ...(article.paragraphs || []), ...(article.phrases || []).map((item) => item.text)].join(" ").toLocaleLowerCase();
    if (text.includes(normalized)) results.push({ module: "english", kicker: article.topic, title: article.title, detail: article.deck, route: ["english", article.id] });
  });
  appStore.getState().savedItems.forEach((item) => {
    if ([item.text, item.meaning, item.source].join(" ").toLocaleLowerCase().includes(normalized)) {
      const module = item.language === "Cantonese" ? "cantonese" : item.language === "English" ? "english" : "poetry";
      results.push({ module, kicker: item.type, title: item.text, detail: item.meaning || item.source, route: item.poemId ? ["poetry", item.poemId] : ["library", null] });
    }
  });
  return results.slice(0, 20);
}

function renderSearchOverlay(englishMode = false) {
  if (!ui.searchOpen) return "";
  const allResults = searchResults(ui.searchQuery);
  const results = englishMode
    ? allResults.filter((result) => result.module === "english").map((result) => ({
        ...result,
        kicker: /[\u3400-\u9fff]/u.test(result.kicker || "") ? "English" : result.kicker,
        detail: /[\u3400-\u9fff]/u.test(result.detail || "") ? "Saved English reading" : result.detail
      }))
    : allResults;
  return `
    <div class="modal-backdrop search-backdrop" data-close-search>
      <section class="search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title" data-modal-panel>
        <header>
          <div><p class="eyebrow">${englishMode ? "English search" : "全域搜尋"}</p><h2 id="search-title">${englishMode ? "Find a passage" : "找回一頁"}</h2></div>
          <button class="icon-button" type="button" data-close-search aria-label="${englishMode ? "Close search" : "關閉搜尋"}">${icon("close")}</button>
        </header>
        <label class="large-search">
          ${icon("search")}
          <span class="sr-only">${englishMode ? "Search English articles, phrases, and saved vocabulary" : "搜尋詩、詞、古文、Episode、文章與 Library"}</span>
          <input type="search" data-global-search value="${escapeHtml(ui.searchQuery)}" placeholder="${englishMode ? "Title, phrase, or saved word…" : "作者、原文、phrase 或聲音……"}" autocomplete="off" />
        </label>
        <p class="search-count">${englishMode ? ui.searchQuery ? `${results.length} results` : "Recently opened" : ui.searchQuery ? `找到 ${results.length} 項` : "最近打開"}</p>
        <div class="search-results">
          ${results.length ? results.map((result) => `
            <button type="button" class="search-result" data-route="${result.route[0]}" ${result.route[1] ? `data-route-id="${result.route[1]}"` : ""}>
              <span class="result-module module-${result.module}">${result.module === "poetry" ? result.badge || "詩" : result.module === "cantonese" ? "粵" : "EN"}</span>
              <span><small>${escapeHtml(result.kicker)}</small><strong>${escapeHtml(result.title)}</strong><em>${escapeHtml(result.detail)}</em></span>
              ${icon("arrow")}
            </button>`).join("") : `
            <div class="empty-search"><p>${englishMode ? `No results for “${escapeHtml(ui.searchQuery)}”` : `沒有找到「${escapeHtml(ui.searchQuery)}」`}</p><span>${englishMode ? "Try a shorter word, phrase, or article title." : "試試更短的詞，或搜尋詩人與文章標題。"}</span></div>`}
        </div>
        <footer><kbd>Esc</kbd> ${englishMode ? "Close" : "關閉"} <span>·</span> ${englishMode ? "All results come from local content" : "所有結果都來自本機內容"}</footer>
      </section>
    </div>`;
}

function renderTermSheet() {
  if (!ui.selectedTerm) return "";
  const term = getCantoneseTermData(ui.selectedTerm, cantoneseTerms);
  if (!term) return "";
  const id = `cantonese:${term.text}`;
  const saved = appStore.getState().savedItems.some((item) => item.id === id);
  const definitions = Array.isArray(term.definitions) ? term.definitions : [];
  const definitionStatusCopy = cantoneseLexiconState.definitionStatus === "loading"
    ? "中文釋義正在載入……"
    : cantoneseLexiconState.definitionStatus === "error"
      ? "中文釋義資料暫時未能載入；粵拼候選仍可使用。"
      : "教育部《重編國語辭典修訂本》暫未收錄這個詞目；粵拼候選仍可使用。";
  return `
    <div class="modal-backdrop sheet-backdrop" data-close-sheet>
      <section class="word-sheet" role="dialog" aria-modal="true" aria-labelledby="term-title" data-modal-panel>
        <button class="icon-button sheet-close" type="button" data-close-sheet aria-label="關閉詞語解釋">${icon("close")}</button>
        <p class="eyebrow">${term.dictionaryOnly ? `${escapeHtml(term.type)} · 中文釋義` : "粵語詞語 · 中文釋義"}</p>
        <h2 id="term-title">${escapeHtml(term.text)}</h2>
        <p class="term-jyutping" lang="yue-Latn">${escapeHtml(term.jyutping)}</p>
        <dl>
          <div class="term-definition-row"><dt>中文釋義</dt><dd>${definitions.length
            ? `<div class="term-definition-list">${definitions.map((definition, index) => `
                <article>${definitions.length > 1 ? `<small>詞典條目 ${index + 1}</small>` : ""}<p>${escapeHtml(definition)}</p></article>`).join("")}</div>`
            : `<p class="term-definition-status">${escapeHtml(term.dictionaryOnly ? definitionStatusCopy : "暫未收錄中文釋義。")}</p>`}</dd></div>
          ${term.readingNote ? `<div><dt>讀音說明</dt><dd>${escapeHtml(term.readingNote)}</dd></div>` : ""}
        </dl>
        ${term.definitionSource ? `
          <p class="word-sheet-source definition-source">中文釋義原文來自
            <a href="${safeExternalHref(term.definitionSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(term.definitionSource)}</a>
            （版本 ${escapeHtml(term.definitionVersion)} · <a href="${safeExternalHref(term.definitionLicenseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(term.definitionLicense)}</a>），內容未改寫。
            ${term.definitionUsageGuideUrl ? `<a href="${safeExternalHref(term.definitionUsageGuideUrl)}" target="_blank" rel="noreferrer">查看完整使用說明</a>` : ""}
          </p>` : ""}
        ${term.dictionaryOnly ? `
          <p class="word-sheet-source">讀音來自 ${escapeHtml(term.source)}（${escapeHtml(term.sourceLicense)}）。<a href="${safeExternalHref(term.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(term.sourceLinkLabel || "查看資料來源")}</a></p>` : ""}
        <button class="primary-button" type="button" data-save-term="${escapeHtml(term.text)}" ${saved ? "disabled" : ""}>${saved ? `${icon("check")} 已加入粵語詞庫` : "加入粵語詞庫"}</button>
      </section>
    </div>`;
}

function renderImmersive() {
  if (!ui.immersivePoemId) return "";
  const poem = findPoem(ui.immersivePoemId);
  const state = appStore.getState();
  const typography = getClassicalTypography(state.preferences);
  const hasCuratedJyutping = poem.lines.some((line) => Boolean(String(line.jyutping || "").trim()));
  const classicalJyutpingVisible = state.preferences.showJyutping
    && (hasCuratedJyutping || cantoneseLexiconState.status === "ready");
  return `
    <section class="immersive-reader classical-font-${typography.font} ${poem.kind === "古文" ? "is-prose" : ""} ${classicalJyutpingVisible ? "has-jyutping" : ""}
      jyutping-size-${typography.jyutpingSize} jyutping-color-${typography.jyutpingColor}
      jyutping-opacity-${typography.jyutpingOpacity} jyutping-gap-${typography.jyutpingGap}"
      style="--classical-scale:${typography.scale}; --classical-leading:${typography.leading}" role="dialog" aria-modal="true" aria-labelledby="immersive-title">
      <button class="immersive-close" type="button" data-close-immersive aria-label="離開沉浸閱讀">${icon("close")}<span>離開沉浸</span></button>
      <div class="immersive-title"><p>${escapeHtml(poem.poet)} · ${escapeHtml(poem.dynasty)}</p><h2 id="immersive-title">${escapeHtml(poem.title)}</h2></div>
      <div class="immersive-lines" lang="zh-Hant">${poem.lines.map((line) => {
        if (poem.kind === "古文") {
          return `<p>${renderProseText(line.text, classicalJyutpingVisible, false)}</p>`;
        }
        const pronunciation = classicalJyutpingVisible
          ? classicalLinePronunciation(line)
          : { value: "", kind: "pending" };
        const lineText = pronunciation.value
          ? renderClassicalAnnotatedText(
            line.text,
            pronunciation.kind === "curated" ? pronunciation.value : "",
            false,
            "verse-jyutping-token"
          )
          : escapeHtml(line.text);
        return `<p${pronunciation.value ? ` data-verse-jyutping="${pronunciation.kind}"` : ""}>${lineText}</p>`;
      }).join("")}</div>
      <span class="immersive-seal" aria-hidden="true">讀</span>
    </section>`;
}

function renderOverlays(route) {
  return `${renderSearchOverlay(route?.page === "english")}${renderTermSheet()}${renderImmersive()}`;
}

function render() {
  poetryProgressCleanup?.();
  poetryProgressCleanup = null;
  const route = parseRoute();
  recordRouteVisit(route);
  app.innerHTML = renderShell(route);
  document.body.classList.toggle("modal-open", Boolean(ui.searchOpen || ui.selectedTerm || ui.immersivePoemId));
  afterRender(route);
  lastRenderedRoute = route;
}

function keepActiveEnglishTokenVisible() {
  if (!window.matchMedia("(max-width: 980px)").matches) return;
  const scroll = document.querySelector("[data-reader-scroll]");
  const card = document.querySelector("[data-english-lookup-card]");
  const token = document.querySelector(".word-token.is-active, .article-reader .phrase-mark.is-active");
  if (!scroll || !card || !token) return;

  const tokenRect = token.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const toolbarBottom = document.querySelector(".article-toolbar")?.getBoundingClientRect().bottom || 0;
  const safeBottom = cardRect.top - 18;
  const safeTop = toolbarBottom + 18;
  if (tokenRect.bottom > safeBottom) scroll.scrollTop += tokenRect.bottom - safeBottom;
  else if (tokenRect.top < safeTop) scroll.scrollTop -= safeTop - tokenRect.top;
}

function afterRender(route) {
  if (ui.focusTarget) {
    const selector = ui.focusTarget;
    ui.focusTarget = null;
    window.requestAnimationFrame(() => {
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if ("setSelectionRange" in target) target.setSelectionRange(target.value.length, target.value.length);
      }
    });
  }

  if (collectionScrollRestorePage === route.page && isCollectionListRoute(route)) {
    const targetY = collectionSession[route.page]?.scrollY || 0;
    collectionScrollRestorePage = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: targetY, behavior: "instant" }));
    });
  }

  const scroll = document.querySelector("[data-reader-scroll]");
  if (scroll) {
    const articleId = scroll.dataset.readerScroll;
    const saved = appStore.getState().readingProgress[articleId] || 0;
    window.requestAnimationFrame(() => {
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      scroll.scrollTop = max * (saved / 100);
      window.requestAnimationFrame(keepActiveEnglishTokenVisible);
    });
    let progressTimer;
    scroll.addEventListener("scroll", () => {
      window.clearTimeout(progressTimer);
      progressTimer = window.setTimeout(() => {
        const max = Math.max(1, scroll.scrollHeight - scroll.clientHeight);
        const progress = Math.max(0, Math.min(100, (scroll.scrollTop / max) * 100));
        const nextState = appStore.update((state) => {
          const positioned = setProgressInState(state, "reading", articleId, progress);
          return setContentProgressInState(positioned, "article", articleId, progress);
        }, false);
        syncContentStatusDom("article", articleId, getContentProgress(nextState, "article", articleId, progress));
        document.querySelector("[data-reader-progress-copy]")?.replaceChildren(document.createTextNode(`${Math.round(progress)}%`));
        const bar = document.querySelector("[data-reader-progress-bar]");
        if (bar) bar.style.width = `${progress}%`;
      }, 120);
    });
  }

  if (route.page === "poetry" && route.id) {
    const poem = findPoem(route.id);
    const contentPending = poem.contentShard && !poem.contentLoaded;
    if (contentPending) {
      if (!poemContentLoadStates.has(poem.id)) requestPoemContent(poem);
    } else {
      setupPoetryProgressTracking();
      if (!poem.translation && !getClassicalTranslation(poem) && !classicalTranslationLoadStates.has(poem.id)) {
        requestClassicalTranslation(poem);
      }
    }
  }

  if (route.page === "cantonese" && route.id) syncPlayerDom();

  const needsCantoneseLexicon = route.page === "today"
    || route.page === "cantonese"
    || (route.page === "poetry" && Boolean(route.id));
  if (needsCantoneseLexicon && cantoneseLexiconState.status === "idle") {
    loadCantoneseLexicon().then(() => render()).catch(() => render());
  }

  const needsEnglishDictionary = route.page === "english" && Boolean(route.id);
  if (needsEnglishDictionary && englishDictionaryState.status === "idle") {
    loadEnglishDictionary().then(() => render()).catch(() => render());
  }
}

function toggleFavorite(key) {
  const wasFavorite = appStore.getState().favorites.includes(key);
  appStore.replace(toggleFavoriteInState(appStore.getState(), key));
  announce(wasFavorite ? "已取消收藏" : "已加入收藏");
}

function toggleContentSeen(key) {
  const separator = key.indexOf(":");
  if (separator < 1) return;
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id || !["poem", "article", "episode"].includes(kind)) return;
  const state = appStore.getState();
  let fallback = 0;
  if (kind === "article") fallback = state.readingProgress[id] || 0;
  if (kind === "episode") {
    const episode = episodes.find((candidate) => candidate.id === id);
    fallback = episode ? progressPercent(state.playbackProgress[id] || 0, episode.duration) : 0;
  }
  const wasSeen = getContentProgress(state, kind, id, fallback) >= SEEN_PROGRESS_THRESHOLD;
  if (wasSeen && kind === "poem") window.scrollTo({ top: 0, behavior: "instant" });
  if (wasSeen && kind === "episode" && player.episodeId === id) {
    player.currentTime = 0;
    if (player.audio) player.audio.currentTime = 0;
  }
  appStore.replace(setContentSeenInState(state, kind, id, !wasSeen));
  announce(wasSeen ? "已標為未讀，之後可再次推薦" : "已標為已閱，之後會跳過推薦");
}

function saveNote(key) {
  const input = document.querySelector(`[data-note-input="${CSS.escape(key)}"]`);
  const content = input?.value.trim() || "";
  appStore.update((state) => {
    if (!content) delete state.notes[key];
    else state.notes[key] = {
      content,
      sourceItem: key,
      createdAt: state.notes[key]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return state;
  });
  announce(content ? "筆記已保存" : "空白筆記已移除");
}

function selectEnglishWord(args) {
  const selected = lookupEnglishWord(args);
  ui.selectedEnglishItem = selected;
  const expectedLookupKey = selected.lookupKey;
  if (englishDictionaryState.status !== "ready") {
    loadEnglishDictionary().then(() => {
      if (ui.selectedEnglishItem?.lookupKey !== expectedLookupKey) return;
      ui.selectedEnglishItem = lookupEnglishWord(args);
      render();
    }).catch(() => {
      if (ui.selectedEnglishItem?.lookupKey === expectedLookupKey) render();
    });
  }
  return selected;
}

function togglePoetryLine(reference) {
  const separator = reference.lastIndexOf(":");
  const poemId = reference.slice(0, separator);
  const lineIndex = Number(reference.slice(separator + 1));
  const poem = poems.find((candidate) => candidate.id === poemId);
  const line = poem?.lines[lineIndex];
  if (!poem || !line) return;

  const id = poetryLineId(poem.id, lineIndex);
  const alreadySaved = appStore.getState().savedItems.some((item) => item.id === id);
  const itemType = poem.kind === "古文" ? "收藏古文段落" : poem.kind === "詞" ? "收藏詞句" : poem.kind === "曲" ? "收藏曲句" : "收藏詩句";
  const itemLabel = poem.kind === "古文" ? `第 ${lineIndex + 1} 段` : "原句";
  if (alreadySaved) {
    appStore.replace(removeSavedItemInState(appStore.getState(), id));
    announce(`已取消收藏${itemLabel}`);
    return;
  }

  appStore.replace(upsertSavedItemInState(appStore.getState(), {
    id,
    text: line.text,
    type: itemType,
    language: "Classical Chinese",
    pronunciation: line.jyutping,
    meaning: `${poem.poet}《${poem.title}》`,
    source: poem.title,
    poemId: poem.id,
    lineIndex,
    tags: [poem.dynasty, poem.poet, poem.form, ...poem.themes],
    favorite: true,
    reviewStatus: "saved"
  }));
  announce(`已收藏${itemLabel}`);
}

function saveCantoneseTerm(termText) {
  const term = getCantoneseTermData(termText, cantoneseTerms);
  if (!term) return;
  const route = parseRoute();
  const source = route.page === "cantonese" && route.id
    ? findEpisode(route.id).title
    : route.page === "poetry" && route.id
      ? `《${findPoem(route.id).title}》`
      : term.source || "粵典詞表";
  const item = {
    id: `cantonese:${term.text}`,
    text: term.text,
    type: term.type,
    language: "Cantonese",
    pronunciation: term.jyutping,
    meaning: Array.isArray(term.definitions) && term.definitions.length
      ? term.definitions.join("\n\n")
      : term.mandarin || term.readingNote || "",
    source,
    sourceUrl: term.definitionSourceUrl || term.sourceUrl || "",
    sourceLicense: term.definitionLicense || term.sourceLicense || "",
    tags: term.dictionaryOnly
      ? ["粵典", "讀音", ...(term.definitions?.length ? ["中文釋義", "教育部辭典"] : [])]
      : ["transcript"],
    favorite: true,
    reviewStatus: "new"
  };
  ui.selectedTerm = null;
  appStore.replace(upsertSavedItemInState(appStore.getState(), item));
  announce(`${term.text} 已加入粵語詞庫`);
}

function persistCurrentReaderProgress() {
  const scroll = document.querySelector("[data-reader-scroll]");
  if (!scroll) return;
  const articleId = scroll.dataset.readerScroll;
  const max = Math.max(1, scroll.scrollHeight - scroll.clientHeight);
  const progress = Math.max(0, Math.min(100, (scroll.scrollTop / max) * 100));
  const nextState = appStore.update((state) => {
    const positioned = setProgressInState(state, "reading", articleId, progress);
    return setContentProgressInState(positioned, "article", articleId, progress);
  }, false);
  syncContentStatusDom("article", articleId, getContentProgress(nextState, "article", articleId, progress));
}

function speakEnglishLookup() {
  const selected = ui.selectedEnglishItem || ui.selectedText;
  if (!selected) return;
  const text = selected.text;
  if (!text) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    announce("這個瀏覽器暫不支援英文朗讀");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((candidate) => /^en-GB\b/i.test(candidate.lang))
    || voices.find((candidate) => /^en-US\b/i.test(candidate.lang))
    || voices.find((candidate) => /^en\b/i.test(candidate.lang));
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "en-GB";
  utterance.rate = 0.88;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  announce(`正在朗讀 ${selected.text}`);
}

function saveEnglishItem() {
  const selected = ui.selectedEnglishItem || ui.selectedText;
  if (!selected) return;
  const route = parseRoute();
  const article = findEnglishArticle(route.id);
  const text = selected.text.trim();
  const rawType = selected.type || (text.includes(" ") ? "phrase" : "word");
  const item = {
    id: englishItemId(text),
    text,
    type: rawType.toLowerCase().startsWith("english") ? rawType : `English ${rawType}`,
    language: "English",
    pronunciation: selected.pronunciation || "",
    partOfSpeech: selected.partOfSpeech || "",
    lemma: selected.lemma || "",
    meaning: selected.meaning || "待補充個人理解",
    definition: selected.definition || "",
    exampleSentence: selected.context || "",
    originalContext: selected.context || "Selected from the article reader",
    contextMeaning: selected.contextMeaning || "",
    usage: selected.usage || "",
    commonUses: Array.isArray(selected.commonUses) ? selected.commonUses : [],
    source: article.title,
    tags: [article.topic],
    favorite: true,
    reviewStatus: "new"
  };
  persistCurrentReaderProgress();
  appStore.replace(upsertSavedItemInState(appStore.getState(), item));
  announce(`${text} 已加入我的詞庫`);
}

function currentSegmentIndex(episode) {
  let index = 0;
  episode.transcript.forEach((segment, candidate) => {
    if (segment.at <= player.currentTime) index = candidate;
  });
  return index;
}

function effectiveEpisodeDuration(episode) {
  if (player.episodeId === episode.id && Number.isFinite(player.mediaDuration) && player.mediaDuration > 0) {
    return player.mediaDuration;
  }
  return episode.duration;
}

function releaseNativeRecording() {
  if (player.audio) {
    player.audio.pause();
    player.audio.removeAttribute("src");
    player.audio.load();
  }
  player.audio = null;
  player.audioEpisodeId = null;
  player.mediaDuration = 0;
}

function prepareNativeRecording(episode) {
  if (episode.audioKind !== "local" || !episode.audioFile) return null;
  if (player.audio && player.audioEpisodeId === episode.id) return player.audio;

  releaseNativeRecording();
  const audio = new Audio(episode.audioFile);
  audio.preload = "metadata";
  audio.playbackRate = appStore.getState().preferences.playbackSpeed;
  player.audio = audio;
  player.audioEpisodeId = episode.id;
  player.mediaDuration = episode.duration;

  audio.addEventListener("loadedmetadata", () => {
    if (player.audio !== audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) player.mediaDuration = audio.duration;
    const duration = effectiveEpisodeDuration(episode);
    player.currentTime = Math.min(player.currentTime, duration);
    if (player.currentTime > 0) audio.currentTime = player.currentTime;
    syncPlayerDom();
  });
  audio.addEventListener("timeupdate", () => {
    if (player.audio !== audio) return;
    player.currentTime = audio.currentTime;
    if (player.abEnd != null && player.currentTime >= player.abEnd) {
      audio.currentTime = player.abStart || 0;
      player.currentTime = audio.currentTime;
    }
    const wholeSecond = Math.floor(player.currentTime);
    if (wholeSecond !== player.lastPersistSecond && wholeSecond % 5 === 0) {
      player.lastPersistSecond = wholeSecond;
      persistPlayerProgress();
    }
    syncPlayerDom();
  });
  audio.addEventListener("ended", () => {
    if (player.audio !== audio) return;
    player.currentTime = effectiveEpisodeDuration(episode);
    player.isPlaying = false;
    persistPlayerProgress();
    render();
  });
  return audio;
}

function speakCurrentSegment(force = false) {
  if (!player.isPlaying || !("speechSynthesis" in window)) return false;
  const episode = findEpisode(player.episodeId);
  if (episode.audioKind === "local") return true;
  const cantoneseVoice = cantoneseSpeech.voice || refreshCantoneseVoice(true, false);
  if (!cantoneseVoice) return false;
  const index = currentSegmentIndex(episode);
  if (!force && player.spokenSegment === index) return true;
  player.spokenSegment = index;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(episode.transcript[index].text);
  utterance.voice = cantoneseVoice;
  utterance.lang = cantoneseVoice.lang || "zh-HK";
  utterance.rate = appStore.getState().preferences.playbackSpeed;
  utterance.addEventListener("error", (event) => {
    if (["canceled", "interrupted"].includes(event.error)) return;
    stopPlayback(true);
    announce("粵語合成朗讀失敗，播放已停止");
  });
  window.speechSynthesis.speak(utterance);
  return true;
}

function persistPlayerProgress() {
  if (!player.episodeId) return;
  const episode = findEpisode(player.episodeId);
  const progress = progressPercent(player.currentTime, effectiveEpisodeDuration(episode));
  const nextState = appStore.update((state) => {
    const positioned = setProgressInState(state, "playback", player.episodeId, player.currentTime);
    return setContentProgressInState(positioned, "episode", player.episodeId, progress);
  }, false);
  syncContentStatusDom("episode", player.episodeId, getContentProgress(nextState, "episode", player.episodeId, progress));
}

function syncPlayerDom() {
  const episode = findEpisode(player.episodeId);
  const duration = effectiveEpisodeDuration(episode);
  const time = document.querySelector("[data-player-time]");
  const durationCopy = document.querySelector("[data-player-duration]");
  const seek = document.querySelector("[data-player-seek]");
  if (time) time.textContent = formatTime(player.currentTime);
  if (durationCopy) durationCopy.textContent = formatTime(duration);
  if (seek) {
    seek.max = String(duration);
    seek.value = String(Math.floor(player.currentTime));
    seek.style.setProperty("--seek", `${progressPercent(player.currentTime, duration)}%`);
  }
  document.querySelectorAll("[data-segment-index]").forEach((element) => {
    element.classList.toggle("is-current", episode.timing !== "untimed" && Number(element.dataset.segmentIndex) === currentSegmentIndex(episode));
  });
}

function startPlayback() {
  const episode = findEpisode(player.episodeId);
  if (episode.audioKind === "local") {
    const audio = prepareNativeRecording(episode);
    if (!audio) return false;
    const duration = effectiveEpisodeDuration(episode);
    if (player.currentTime >= duration) player.currentTime = 0;
    if (audio.readyState > 0) audio.currentTime = player.currentTime;
    audio.playbackRate = appStore.getState().preferences.playbackSpeed;
    player.isPlaying = true;
    const playPromise = audio.play();
    render();
    playPromise?.catch(() => {
      player.isPlaying = false;
      render();
      announce("真人粵語錄音未能播放，請檢查本機音訊檔案");
    });
    return true;
  }
  if (!refreshCantoneseVoice(true, false)) {
    player.isPlaying = false;
    render();
    announce("未偵測到粵語聲線；朗讀已停用，不會使用普通話代替");
    return false;
  }
  if (player.currentTime >= episode.duration) player.currentTime = 0;
  player.isPlaying = true;
  render();
  speakCurrentSegment(true);
  player.timer = window.setInterval(() => {
    const speed = appStore.getState().preferences.playbackSpeed;
    player.currentTime += speed;
    if (player.abEnd != null && player.currentTime >= player.abEnd) {
      player.currentTime = player.abStart;
      player.spokenSegment = -1;
      speakCurrentSegment(true);
    }
    if (player.currentTime >= episode.duration) {
      player.currentTime = episode.duration;
      stopPlayback(true);
      return;
    }
    if (Math.floor(player.currentTime) % 5 === 0) persistPlayerProgress();
    syncPlayerDom();
    speakCurrentSegment();
  }, 1000);
  return true;
}

function stopPlayback(shouldRender = true) {
  player.isPlaying = false;
  if (player.timer) window.clearInterval(player.timer);
  player.timer = null;
  if (player.audio && !player.audio.paused) player.audio.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  persistPlayerProgress();
  if (shouldRender) render();
}

function seekTo(seconds, shouldSpeak = true) {
  const episode = findEpisode(player.episodeId);
  const duration = effectiveEpisodeDuration(episode);
  player.currentTime = Math.max(0, Math.min(duration, Number(seconds) || 0));
  if (episode.audioKind === "local" && player.audio) player.audio.currentTime = player.currentTime;
  player.spokenSegment = -1;
  persistPlayerProgress();
  syncPlayerDom();
  if (player.isPlaying && shouldSpeak) speakCurrentSegment(true);
}

function handleAbRepeat() {
  if (player.abStart == null) {
    player.abStart = player.currentTime;
    announce(`A 點已設於 ${formatTime(player.abStart)}`);
  } else if (player.abEnd == null) {
    player.abEnd = Math.max(player.abStart + 3, player.currentTime);
    announce(`B 點已設於 ${formatTime(player.abEnd)}`);
  } else {
    player.abStart = null;
    player.abEnd = null;
    announce("AB Repeat 已關閉");
  }
  render();
}

async function exportData() {
  await appStore.flush();
  const payload = JSON.stringify(appStore.createBackup(), null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `leafbound-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  announce("備份已匯出");
}

async function importData(file) {
  if (!file) return;
  try {
    const payload = await file.text();
    const approved = window.confirm("匯入會以備份內容取代這部裝置目前的收藏、筆記、詞庫與進度。要繼續嗎？");
    if (!approved) return;
    appStore.restore(payload);
    await appStore.flush();
    announce("備份已匯入，書房內容已恢復");
  } catch (error) {
    announce(error?.message || "備份無法匯入");
  }
}

app.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton && !routeButton.disabled) {
    ui.searchOpen = false;
    ui.selectedTerm = null;
    ui.selectedEnglishItem = null;
    ui.selectedText = null;
    ui.classicalTypographyOpen = false;
    if (routeButton.dataset.route !== "library" || parseRoute().page === "library") ui.libraryPanel = null;
    routeTo(routeButton.dataset.route, routeButton.dataset.routeId || null);
    return;
  }

  const favorite = event.target.closest("[data-toggle-favorite]");
  if (favorite) return toggleFavorite(favorite.dataset.toggleFavorite);

  const contentSeen = event.target.closest("[data-toggle-content-seen]");
  if (contentSeen) return toggleContentSeen(contentSeen.dataset.toggleContentSeen);

  const retryClassicalTranslation = event.target.closest("[data-retry-classical-translation]");
  if (retryClassicalTranslation) {
    const poem = findPoem(retryClassicalTranslation.dataset.retryClassicalTranslation);
    requestClassicalTranslation(poem, true);
    render();
    return;
  }

  const retryPoemContent = event.target.closest("[data-retry-poem-content]");
  if (retryPoemContent) {
    const poem = findPoem(retryPoemContent.dataset.retryPoemContent);
    requestPoemContent(poem, true);
    render();
    return;
  }

  if (event.target.closest("[data-open-search]")) {
    ui.searchOpen = true;
    ui.focusTarget = "[data-global-search]";
    render();
    return;
  }
  if (event.target.closest("[data-close-search]")) {
    if (event.target.closest("[data-modal-panel]") && !event.target.closest("button[data-close-search]")) return;
    ui.searchOpen = false;
    ui.searchQuery = "";
    render();
    return;
  }

  const poetryRelation = event.target.closest("[data-poetry-link-facet]");
  if (poetryRelation) {
    const facet = poetryRelation.dataset.poetryLinkFacet;
    const relationKind = poetryRelation.dataset.poetryLinkKind;
    if (poetryKinds.includes(relationKind)) ui.poetryKind = relationKind;
    clearPoetryFilters();
    ui.poetryFacet = facet;
    ui.poetryFilters[facet] = poetryRelation.dataset.poetryLinkValue;
    ui.poetryQuery = "";
    ui.poetryLimit = 24;
    ui.poemThreadOpen = false;
    routeTo("poetry");
    return;
  }

  const poetryKind = event.target.closest("[data-poetry-kind]");
  if (poetryKind) {
    ui.poetryKind = poetryKind.dataset.poetryKind;
    clearPoetryFilters();
    ui.poetryQuery = "";
    ui.poetryFacet = "dynasty";
    ui.poetryLimit = 24;
    render();
    return;
  }

  const facet = event.target.closest("[data-poetry-facet]");
  if (facet) {
    ui.poetryFacet = facet.dataset.poetryFacet;
    ui.poetryLimit = 24;
    render();
    return;
  }
  const poetryFilter = event.target.closest("[data-poetry-filter]");
  if (poetryFilter) {
    const value = poetryFilter.dataset.poetryFilter;
    const current = ui.poetryFilters[ui.poetryFacet];
    ui.poetryFilters[ui.poetryFacet] = value === "全部" || value === current ? null : value;
    ui.poetryLimit = 24;
    render();
    return;
  }
  const removePoetryFilter = event.target.closest("[data-remove-poetry-filter]");
  if (removePoetryFilter) {
    ui.poetryFilters[removePoetryFilter.dataset.removePoetryFilter] = null;
    ui.poetryLimit = 24;
    render();
    return;
  }
  if (event.target.closest("[data-clear-poetry]")) {
    clearPoetryFilters();
    ui.poetryQuery = "";
    ui.poetryLimit = 24;
    render();
    return;
  }
  if (event.target.closest("[data-load-more-poetry]")) {
    ui.poetryLimit += 24;
    render();
    return;
  }

  const settingToggle = event.target.closest("[data-setting-toggle]");
  if (settingToggle) {
    const key = settingToggle.dataset.settingToggle;
    if (!["showJyutping", "showTranscriptJyutping", "englishDark"].includes(key)) return;
    ui.focusTarget = `[data-setting-toggle="${key}"]`;
    appStore.update((state) => {
      state.preferences[key] = !state.preferences[key];
      return state;
    });
    announce(`${settingToggle.querySelector("strong")?.textContent || "設定"}已${appStore.getState().preferences[key] ? "開啟" : "關閉"}`);
    return;
  }
  if (event.target.closest("[data-reset-settings]")) {
    ui.focusTarget = "[data-reset-settings]";
    appStore.update((state) => {
      state.preferences = createDefaultPreferences();
      return state;
    });
    if (player.audio) player.audio.playbackRate = 1;
    announce("已還原全部閱讀設定");
    return;
  }

  if (event.target.closest("[data-toggle-classical-typography]")) {
    ui.classicalTypographyOpen = !ui.classicalTypographyOpen;
    ui.focusTarget = ui.classicalTypographyOpen
      ? "#classical-typography-panel [data-classical-font]"
      : "[data-toggle-classical-typography]";
    render();
    return;
  }
  if (event.target.closest("[data-classical-typography-reset]")) {
    ui.focusTarget = "[data-classical-typography-reset]";
    const defaults = createDefaultPreferences();
    appStore.update((state) => {
      state.preferences.classicalFont = defaults.classicalFont;
      state.preferences.classicalFontScale = defaults.classicalFontScale;
      state.preferences.classicalLineHeight = defaults.classicalLineHeight;
      state.preferences.classicalReadingMode = defaults.classicalReadingMode;
      state.preferences.classicalJyutpingSize = defaults.classicalJyutpingSize;
      state.preferences.classicalJyutpingColor = defaults.classicalJyutpingColor;
      state.preferences.classicalJyutpingOpacity = defaults.classicalJyutpingOpacity;
      state.preferences.classicalJyutpingGap = defaults.classicalJyutpingGap;
      return state;
    });
    announce("已還原閱讀排版");
    return;
  }
  const classicalFont = event.target.closest("[data-classical-font]");
  if (classicalFont && classicalFontOptions.some((option) => option.id === classicalFont.dataset.classicalFont)) {
    const nextFont = classicalFont.dataset.classicalFont;
    ui.focusTarget = `[data-classical-font="${nextFont}"]`;
    appStore.update((state) => {
      state.preferences.classicalFont = nextFont;
      return state;
    });
    return;
  }
  const classicalSize = event.target.closest("[data-classical-size]");
  if (classicalSize) {
    const delta = Number(classicalSize.dataset.classicalSize);
    if (!Number.isFinite(delta)) return;
    ui.focusTarget = `[data-classical-size="${classicalSize.dataset.classicalSize}"]`;
    appStore.update((state) => {
      const current = getClassicalTypography(state.preferences).scale;
      state.preferences.classicalFontScale = Number(Math.max(0.84, Math.min(1.32, current + delta)).toFixed(2));
      return state;
    });
    return;
  }
  if (event.target.closest("[data-classical-size-reset]")) {
    ui.focusTarget = "[data-classical-size-reset]";
    appStore.update((state) => {
      state.preferences.classicalFontScale = 1;
      return state;
    });
    return;
  }
  const classicalLeading = event.target.closest("[data-classical-leading]");
  if (classicalLeading) {
    const nextLeading = Number(classicalLeading.dataset.classicalLeading);
    if (!classicalLeadingOptions.some((option) => option.value === nextLeading)) return;
    ui.focusTarget = `[data-classical-leading="${classicalLeading.dataset.classicalLeading}"]`;
    appStore.update((state) => {
      state.preferences.classicalLineHeight = nextLeading;
      return state;
    });
    return;
  }

  const classicalReadingMode = event.target.closest("[data-classical-reading-mode]");
  if (classicalReadingMode && classicalReadingModes.some((option) => option.id === classicalReadingMode.dataset.classicalReadingMode)) {
    const nextMode = classicalReadingMode.dataset.classicalReadingMode;
    ui.classicalFocusIndex = null;
    ui.focusTarget = `[data-classical-reading-mode="${nextMode}"]`;
    appStore.update((state) => {
      state.preferences.classicalReadingMode = nextMode;
      return state;
    });
    announce(`已切換為${classicalReadingModes.find((option) => option.id === nextMode)?.label || "原文"}模式`);
    return;
  }

  const classicalJyutpingSetting = event.target.closest("[data-classical-jyutping-setting]");
  if (classicalJyutpingSetting) {
    const setting = classicalJyutpingSetting.dataset.classicalJyutpingSetting;
    const value = classicalJyutpingSetting.dataset.classicalJyutpingValue;
    if (!classicalJyutpingOptions[setting]?.some((option) => option.value === value)) return;
    const preferenceKey = {
      size: "classicalJyutpingSize",
      color: "classicalJyutpingColor",
      opacity: "classicalJyutpingOpacity",
      gap: "classicalJyutpingGap"
    }[setting];
    ui.focusTarget = `[data-classical-jyutping-setting="${setting}"][data-classical-jyutping-value="${value}"]`;
    appStore.update((state) => {
      state.preferences[preferenceKey] = value;
      return state;
    });
    return;
  }

  const classicalReadingUnit = event.target.closest("[data-classical-reading-unit]");
  if (classicalReadingUnit && !event.target.closest("button, a, input, textarea, select, summary")) {
    const unitIndex = Number(classicalReadingUnit.dataset.classicalReadingUnit);
    if (!Number.isInteger(unitIndex)) return;
    ui.classicalFocusIndex = ui.classicalFocusIndex === unitIndex ? null : unitIndex;
    ui.focusTarget = `[data-classical-reading-unit="${unitIndex}"]`;
    render();
    return;
  }

  if (event.target.closest("[data-toggle-jyutping]")) {
    appStore.update((state) => {
      state.preferences.showJyutping = !state.preferences.showJyutping;
      return state;
    });
    return;
  }
  if (event.target.closest("[data-toggle-poem-thread]")) {
    ui.poemThreadOpen = !ui.poemThreadOpen;
    if (ui.poemThreadOpen) ui.focusTarget = "#poem-thread-panel";
    render();
    return;
  }
  const savePoetryLine = event.target.closest("[data-save-poetry-line]");
  if (savePoetryLine) return togglePoetryLine(savePoetryLine.dataset.savePoetryLine);
  const noteToggle = event.target.closest("[data-toggle-note]");
  if (noteToggle) {
    if (noteToggle.dataset.toggleNote.startsWith("article:")) {
      persistCurrentReaderProgress();
      ui.selectedEnglishItem = null;
      ui.selectedText = null;
    }
    ui.notePanel = ui.notePanel === noteToggle.dataset.toggleNote ? null : noteToggle.dataset.toggleNote;
    render();
    return;
  }
  const saveNoteButton = event.target.closest("[data-save-note]");
  if (saveNoteButton) return saveNote(saveNoteButton.dataset.saveNote);

  const immersive = event.target.closest("[data-immersive]");
  if (immersive) {
    ui.immersivePoemId = immersive.dataset.immersive;
    ui.classicalTypographyOpen = false;
    render();
    return;
  }
  if (event.target.closest("[data-close-immersive]")) {
    ui.immersivePoemId = null;
    render();
    return;
  }

  const sourceFilter = event.target.closest("[data-source-filter]");
  if (sourceFilter) {
    ui.sourceFilter = sourceFilter.dataset.sourceFilter;
    if (sourceFilter.hasAttribute("data-cantonese-level")) ui.cantoneseLevel = sourceFilter.dataset.cantoneseLevel;
    if (!["全部", "hbl"].includes(ui.sourceFilter)) ui.cantoneseLevel = "全部";
    ui.cantoneseLimit = COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-source-filter="${CSS.escape(ui.sourceFilter)}"]`;
    persistCollectionRoute({ page: "cantonese", id: null });
    render();
    return;
  }

  const cantoneseLevel = event.target.closest("[data-cantonese-level]");
  if (cantoneseLevel) {
    ui.cantoneseLevel = cantoneseLevel.dataset.cantoneseLevel;
    if (ui.cantoneseLevel !== "全部") ui.sourceFilter = "hbl";
    ui.cantoneseLimit = COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-cantonese-level="${CSS.escape(ui.cantoneseLevel)}"]`;
    persistCollectionRoute({ page: "cantonese", id: null });
    render();
    return;
  }
  if (event.target.closest("[data-load-more-cantonese]")) {
    const firstNewIndex = ui.cantoneseLimit;
    ui.cantoneseLimit += COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-cantonese-row-index="${firstNewIndex}"] .episode-main`;
    persistCollectionRoute({ page: "cantonese", id: null });
    render();
    return;
  }

  const englishSource = event.target.closest("[data-english-source]");
  if (englishSource) {
    ui.englishSourceFilter = englishSource.dataset.englishSource;
    if (englishSource.hasAttribute("data-english-category")) ui.englishCategory = englishSource.dataset.englishCategory;
    ui.englishLimit = COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-english-source="${CSS.escape(ui.englishSourceFilter)}"]`;
    persistCollectionRoute({ page: "english", id: null });
    render();
    return;
  }
  const englishCategory = event.target.closest("[data-english-category]");
  if (englishCategory) {
    ui.englishCategory = englishCategory.dataset.englishCategory;
    ui.englishLimit = COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-english-category="${CSS.escape(ui.englishCategory)}"]`;
    persistCollectionRoute({ page: "english", id: null });
    render();
    return;
  }
  if (event.target.closest("[data-load-more-english]")) {
    const firstNewIndex = ui.englishLimit;
    ui.englishLimit += COLLECTION_BATCH_SIZE;
    ui.focusTarget = `[data-english-row-index="${firstNewIndex}"] .article-main`;
    persistCollectionRoute({ page: "english", id: null });
    render();
    return;
  }

  const voiceGuide = event.target.closest("[data-toggle-cantonese-voice-guide]");
  if (voiceGuide) {
    ui.cantoneseVoiceGuideOpen = !voiceGuide.closest("details")?.open;
    return;
  }
  if (event.target.closest("[data-refresh-cantonese-voice]")) {
    const voice = refreshCantoneseVoice(true, false);
    render();
    announce(voice ? `已偵測到粵語聲線：${voice.name}` : "仍未偵測到粵語聲線；安裝後請重新開啟瀏覽器再試");
    return;
  }
  if (event.target.closest("[data-retry-cantonese-lexicon]")) {
    const pending = loadCantoneseLexicon();
    render();
    pending.then(() => render()).catch(() => render());
    return;
  }

  const soundcloudLoader = event.target.closest("[data-load-soundcloud]");
  if (soundcloudLoader) {
    const shell = soundcloudLoader.closest("[data-soundcloud-shell]");
    const iframe = document.createElement("iframe");
    iframe.title = `播放${soundcloudLoader.dataset.soundcloudTitle || "粵語故事"}真人粵語錄音`;
    iframe.allow = "autoplay";
    iframe.loading = "eager";
    iframe.src = soundcloudLoader.dataset.loadSoundcloud;
    shell?.replaceChildren(iframe);
    return;
  }

  if (event.target.closest("[data-toggle-playback]")) {
    player.isPlaying ? stopPlayback(true) : startPlayback();
    return;
  }
  const seekBy = event.target.closest("[data-seek-by]");
  if (seekBy) return seekTo(player.currentTime + Number(seekBy.dataset.seekBy));
  const speedButton = event.target.closest("[data-speed]");
  if (speedButton) {
    const nextSpeed = Number(speedButton.dataset.speed);
    if (!playbackSpeedOptions.includes(nextSpeed)) return;
    ui.focusTarget = `[data-speed="${speedButton.dataset.speed}"]`;
    appStore.update((state) => {
      state.preferences.playbackSpeed = nextSpeed;
      return state;
    });
    if (player.audio) player.audio.playbackRate = nextSpeed;
    if (player.isPlaying) speakCurrentSegment(true);
    return;
  }
  if (event.target.closest("[data-ab-repeat]")) return handleAbRepeat();
  const jump = event.target.closest("[data-jump-time]");
  if (jump) return seekTo(Number(jump.dataset.jumpTime));
  const transcriptMode = event.target.closest("[data-transcript-mode]");
  if (transcriptMode) {
    appStore.update((state) => {
      state.preferences.transcriptMode = transcriptMode.dataset.transcriptMode;
      return state;
    });
    return;
  }
  if (event.target.closest("[data-toggle-transcript-jyutping]")) {
    appStore.update((state) => {
      state.preferences.showTranscriptJyutping = state.preferences.showTranscriptJyutping === false;
      return state;
    });
    return;
  }
  const reveal = event.target.closest("[data-reveal-segment]");
  if (reveal) {
    ui.revealedSegments.add(reveal.dataset.revealSegment);
    render();
    return;
  }
  const term = event.target.closest("[data-term], [data-dictionary-term]");
  if (term) {
    const selectedTerm = term.dataset.term || term.dataset.dictionaryTerm;
    ui.selectedTerm = selectedTerm;
    const definitionPromise = term.dataset.dictionaryTerm && cantoneseLexiconState.definitionStatus !== "ready"
      ? loadCantoneseDefinitions()
      : null;
    render();
    if (definitionPromise) {
      definitionPromise
        .then(() => {
          if (ui.selectedTerm === selectedTerm) render();
        })
        .catch(() => {
          if (ui.selectedTerm === selectedTerm) render();
        });
    }
    return;
  }
  const saveTerm = event.target.closest("[data-save-term]");
  if (saveTerm) return saveCantoneseTerm(saveTerm.dataset.saveTerm);
  if (event.target.closest("[data-close-sheet]")) {
    if (event.target.closest("[data-modal-panel]") && !event.target.closest("button[data-close-sheet]")) return;
    ui.selectedTerm = null;
    render();
    return;
  }

  const wordButton = event.target.closest("[data-english-word]");
  if (wordButton) {
    const articleId = wordButton.dataset.articleId;
    const article = findEnglishArticle(articleId);
    const paragraphIndex = Number(wordButton.dataset.paragraphIndex);
    const offset = Number(wordButton.dataset.wordOffset);
    persistCurrentReaderProgress();
    ui.notePanel = null;
    selectEnglishWord({
      word: wordButton.dataset.englishWord,
      articleId,
      paragraph: article.paragraphs[paragraphIndex],
      paragraphIndex,
      offset
    });
    ui.selectedText = null;
    ui.focusTarget = "[data-english-lookup-card]";
    render();
    return;
  }

  const phraseButton = event.target.closest("[data-english-phrase]");
  if (phraseButton) {
    const [articleId, index] = phraseButton.dataset.englishPhrase.split(":");
    const article = findEnglishArticle(articleId);
    const paragraphIndex = Number(phraseButton.dataset.paragraphIndex);
    const offset = Number(phraseButton.dataset.phraseOffset);
    const context = getEnglishContext({ articleId, paragraph: article.paragraphs[paragraphIndex], paragraphIndex, offset });
    persistCurrentReaderProgress();
    ui.notePanel = null;
    ui.selectedEnglishItem = {
      ...article.phrases[Number(index)],
      ...context,
      lookupKey: `${articleId}:${paragraphIndex}:phrase:${offset}`
    };
    ui.selectedText = null;
    ui.focusTarget = "[data-english-lookup-card]";
    render();
    return;
  }
  if (event.target.closest("[data-close-english-sheet]")) {
    persistCurrentReaderProgress();
    ui.selectedEnglishItem = null;
    ui.selectedText = null;
    render();
    return;
  }
  if (event.target.closest("[data-save-english]")) return saveEnglishItem();
  const speakEnglish = event.target.closest("[data-speak-english]");
  if (speakEnglish) return speakEnglishLookup(speakEnglish.dataset.speakEnglish);

  const fontButton = event.target.closest("[data-reader-font]");
  if (fontButton) {
    ui.focusTarget = `[data-reader-font="${fontButton.dataset.readerFont}"]`;
    appStore.update((state) => {
      state.preferences.englishFontScale = Math.max(0.84, Math.min(1.32, state.preferences.englishFontScale + Number(fontButton.dataset.readerFont)));
      return state;
    });
    return;
  }
  const englishLeading = event.target.closest("[data-english-leading]");
  if (englishLeading) {
    const nextLeading = Number(englishLeading.dataset.englishLeading);
    if (!englishLeadingOptions.some((option) => option.value === nextLeading)) return;
    ui.focusTarget = `[data-english-leading="${englishLeading.dataset.englishLeading}"]`;
    appStore.update((state) => {
      state.preferences.englishLineHeight = nextLeading;
      return state;
    });
    return;
  }
  if (event.target.closest("[data-reader-leading]")) {
    appStore.update((state) => {
      const current = state.preferences.englishLineHeight;
      state.preferences.englishLineHeight = current >= 2 ? 1.58 : Number((current + 0.14).toFixed(2));
      return state;
    });
    return;
  }
  if (event.target.closest("[data-reader-dark]")) {
    appStore.update((state) => {
      state.preferences.englishDark = !state.preferences.englishDark;
      return state;
    });
    return;
  }

  const libraryPanel = event.target.closest("[data-library-panel]");
  if (libraryPanel) {
    const nextPanel = libraryPanel.dataset.libraryPanel;
    if (!["settings", "about"].includes(nextPanel)) return;
    ui.libraryPanel = ui.libraryPanel === nextPanel ? null : nextPanel;
    ui.focusTarget = ui.libraryPanel ? `#library-${nextPanel}-panel` : `[data-library-panel="${nextPanel}"]`;
    render();
    return;
  }
  const libraryFilter = event.target.closest("[data-library-filter]");
  if (libraryFilter) {
    ui.libraryPanel = null;
    ui.libraryFilter = libraryFilter.dataset.libraryFilter;
    render();
    return;
  }
  const removeSaved = event.target.closest("[data-remove-saved]");
  if (removeSaved) {
    appStore.replace(removeSavedItemInState(appStore.getState(), removeSaved.dataset.removeSaved));
    announce("已從 Library 移除");
    return;
  }
  if (event.target.closest("[data-export-data]")) exportData();
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-poetry-search]")) {
    ui.poetryQuery = event.target.value;
    ui.poetryLimit = 24;
    ui.focusTarget = "[data-poetry-search]";
    render();
  }
  if (event.target.matches("[data-global-search]")) {
    ui.searchQuery = event.target.value;
    ui.focusTarget = "[data-global-search]";
    render();
  }
  if (event.target.matches("[data-player-seek]")) seekTo(event.target.value, false);
});

app.addEventListener("pointerup", (event) => {
  const articleBody = event.target.closest("[data-article-body]");
  if (!articleBody) return;
  window.setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length > 180 || selection.isCollapsed) return;
    const anchorElement = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const focusElement = selection.focusNode?.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode?.parentElement;
    if (!articleBody.contains(anchorElement) || !articleBody.contains(focusElement)) return;
    const paragraphElement = anchorElement?.closest("p[data-paragraph-index]");
    const articleId = articleBody.dataset.articleBody;
    const article = findEnglishArticle(articleId);
    const paragraphIndex = Number(paragraphElement?.dataset.paragraphIndex || 0);
    const paragraph = article.paragraphs[paragraphIndex];
    const offset = Math.max(0, paragraph.toLowerCase().indexOf(text.toLowerCase()));
    persistCurrentReaderProgress();
    ui.notePanel = null;
    if (/^[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)$/.test(text)) {
      selectEnglishWord({ word: text, articleId, paragraph, paragraphIndex, offset });
      ui.selectedText = null;
    } else {
      ui.selectedText = {
        text,
        type: text.split(/\s+/).length > 10 ? "sentence" : "phrase",
        ...getEnglishContext({ articleId, paragraph, paragraphIndex, offset }),
        lookupKey: `${articleId}:${paragraphIndex}:selection:${offset}:${text.length}`
      };
      ui.selectedEnglishItem = null;
    }
    ui.focusTarget = "[data-english-lookup-card]";
    render();
  }, 0);
});

document.addEventListener("keydown", (event) => {
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  const focusedClassicalUnit = document.activeElement?.closest?.("[data-classical-reading-unit]");
  if (focusedClassicalUnit && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    const unitIndex = Number(focusedClassicalUnit.dataset.classicalReadingUnit);
    if (Number.isInteger(unitIndex)) {
      ui.classicalFocusIndex = ui.classicalFocusIndex === unitIndex ? null : unitIndex;
      ui.focusTarget = `[data-classical-reading-unit="${unitIndex}"]`;
      render();
    }
    return;
  }
  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    ui.searchOpen = true;
    ui.focusTarget = "[data-global-search]";
    render();
  }
  if (event.key === "Escape") {
    if (ui.immersivePoemId) ui.immersivePoemId = null;
    else if (ui.selectedTerm) ui.selectedTerm = null;
    else if (ui.selectedEnglishItem || ui.selectedText) {
      persistCurrentReaderProgress();
      ui.selectedEnglishItem = null;
      ui.selectedText = null;
    } else if (ui.searchOpen) {
      ui.searchOpen = false;
      ui.searchQuery = "";
    } else if (ui.classicalTypographyOpen) {
      ui.classicalTypographyOpen = false;
      ui.focusTarget = "[data-toggle-classical-typography]";
    } else if (ui.libraryPanel && parseRoute().page === "library") {
      const previousPanel = ui.libraryPanel;
      ui.libraryPanel = null;
      ui.focusTarget = `[data-library-panel="${previousPanel}"]`;
    } else return;
    render();
  }
});

window.addEventListener("hashchange", () => {
  persistCollectionRoute(lastRenderedRoute);
  const route = parseRoute();
  if (player.isPlaying && (route.page !== "cantonese" || route.id !== player.episodeId)) stopPlayback(false);
  ui.selectedEnglishItem = null;
  ui.selectedText = null;
  ui.notePanel = null;
  ui.classicalTypographyOpen = false;
  ui.classicalFocusIndex = null;
  if (route.page !== "library") ui.libraryPanel = null;
  collectionScrollRestorePage = isCollectionListRoute(route) ? route.page : null;
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
});

app.addEventListener("change", (event) => {
  if (!event.target.matches("[data-import-data]")) return;
  const [file] = event.target.files || [];
  importData(file).finally(() => {
    event.target.value = "";
  });
});

window.addEventListener("scroll", () => {
  if (!isCollectionListRoute(parseRoute())) return;
  window.clearTimeout(collectionScrollPersistTimer);
  collectionScrollPersistTimer = window.setTimeout(() => persistCollectionRoute(parseRoute()), 120);
}, { passive: true });
window.addEventListener("beforeunload", () => {
  persistCollectionRoute(parseRoute());
  persistPlayerProgress();
});
window.addEventListener("focus", () => {
  refreshDailyContentIfNeeded();
  scheduleDailyRefresh();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  refreshDailyContentIfNeeded();
  scheduleDailyRefresh();
});

appStore.subscribe(() => render());

if (!window.location.hash) window.history.replaceState(null, "", "#today");
initializeCantoneseSpeech();
scheduleDailyRefresh();
render();
