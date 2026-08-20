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
  poems,
  poetryKinds
} from "./data.js";
import { icon } from "./icons.js";
import { englishItemId, getEnglishContext, lookupEnglishWord } from "./english.js";
import { cantoneseSourceCatalog, cantoneseSourceSnapshot } from "./open-cantonese.js";
import { englishDiscoveries, englishSourceCatalog, englishSourceSnapshot } from "./open-english.js";
import {
  buildCantonesePronunciationLine,
  cantoneseLexiconState,
  getCantoneseTermData,
  loadCantoneseLexicon,
  segmentCantonesePronunciation,
  segmentCantoneseText
} from "./cantonese-lexicon.js";
import { findCantoneseVoice } from "./voice.js";
import {
  appStore,
  formatTime,
  progressPercent,
  removeSavedItemInState,
  setProgressInState,
  toggleFavoriteInState,
  touchHistoryInState,
  upsertSavedItemInState
} from "./store.js";

const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
const dailyEnglishArticles = [...articles, ...englishDiscoveries]
  .filter((article) => Array.isArray(article.paragraphs) && article.paragraphs.length);

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
    theme: null
  },
  poetryQuery: "",
  poetryLimit: 24,
  libraryFilter: "all",
  sourceFilter: "全部",
  cantoneseLevel: "全部",
  englishSourceFilter: "全部",
  englishCategory: "全部",
  searchOpen: false,
  searchQuery: "",
  selectedTerm: null,
  selectedEnglishItem: null,
  selectedText: null,
  immersivePoemId: null,
  classicalTypographyOpen: false,
  poemThreadOpen: false,
  cantoneseVoiceGuideOpen: false,
  notePanel: null,
  revealedSegments: new Set(),
  focusTarget: null
};

const poetryFacetLabels = {
  dynasty: "朝代",
  poet: "作者",
  form: "體裁",
  theme: "主題"
};

const poetryKindDetails = {
  全部: { eyebrow: "總覽", description: "跨體裁漫遊" },
  詩: { eyebrow: "Poetry", description: "古詩與近體詩" },
  詞: { eyebrow: "Ci", description: "長短句與詞牌" },
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

function getClassicalTypography(preferences = {}) {
  const requestedFont = String(preferences.classicalFont || "");
  const font = classicalFontOptions.some((option) => option.id === requestedFont) ? requestedFont : "song";
  const requestedScale = Number(preferences.classicalFontScale);
  const scale = Number(Math.max(0.84, Math.min(1.32, Number.isFinite(requestedScale) ? requestedScale : 1)).toFixed(2));
  const requestedLeading = Number(preferences.classicalLineHeight);
  const leading = classicalLeadingOptions.some((option) => option.value === requestedLeading) ? requestedLeading : 1;
  return { font, scale, leading };
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

function safeExternalHref(value = "") {
  const href = String(value);
  return /^https:\/\/[^\s]+$/i.test(href) ? escapeHtml(href) : "#";
}

function parseRoute() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = navItems.some((item) => item.id === parts[0]) ? parts[0] : "today";
  return { page, id: parts[1] || null };
}

function routeTo(page, id = null) {
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
  return navItems.find((item) => item.id === route.page)?.label || "今日";
}

function favoriteButton(key, label) {
  const active = appStore.getState().favorites.includes(key);
  return `
    <button class="icon-button ${active ? "is-active" : ""}" type="button"
      data-toggle-favorite="${escapeHtml(key)}"
      aria-label="${active ? `取消收藏${label}` : `收藏${label}`}"
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
  return `
    <div class="app-shell" data-page="${route.page}">
      <header class="topbar">
        <button class="wordmark" type="button" data-route="today" aria-label="回到今日">
          <span class="wordmark-seal" aria-hidden="true">拾</span>
          <span class="wordmark-copy"><strong>Leafbound</strong><small>拾頁 · 私人語言書房</small></span>
        </button>
        <div class="topbar-context" aria-hidden="true">
          <span>${escapeHtml(pageLabel(route))}</span>
        </div>
        <button class="search-trigger" type="button" data-open-search aria-label="搜尋所有內容">
          ${icon("search")}
          <span>搜尋</span>
          <kbd>/</kbd>
        </button>
      </header>

      <main id="main-content" class="main-content" tabindex="-1">
        ${renderRoute(route)}
      </main>

      <nav class="bottom-nav" aria-label="主要導航">
        ${navItems.map((item) => `
          <button class="nav-item ${route.page === item.id ? "is-active" : ""}" type="button"
            data-route="${item.id}" aria-current="${route.page === item.id ? "page" : "false"}">
            <span class="nav-icon">${icon(item.icon)}</span>
            <span>${item.label}</span>
          </button>`).join("")}
      </nav>
    </div>
    ${renderOverlays(route)}`;
}

function renderRoute(route) {
  if (route.page === "poetry") return route.id ? renderPoemReader(route.id) : renderPoetryIndex();
  if (route.page === "cantonese") return route.id ? renderEpisodePlayer(route.id) : renderCantoneseFeed();
  if (route.page === "english") return route.id ? renderArticleReader(route.id) : renderEnglishIndex();
  if (route.page === "library") return renderLibrary();
  return renderToday();
}

function renderToday() {
  const state = appStore.getState();
  const now = new Date();
  const dailyKey = getLocalDayKey(now);
  const poem = getTodayPoem(now);
  const article = dailyEnglishArticles[getDailyIndex(dailyEnglishArticles.length, now, 11)] || articles[0];
  const episode = episodes[getDailyIndex(episodes.length, now, 2)] || episodes[0];
  const articleProgress = state.readingProgress[article.id] || 0;
  const episodeTime = Math.min(episode.duration, state.playbackProgress[episode.id] || 0);
  const remaining = Math.max(1, Math.ceil(article.minutes * (1 - articleProgress / 100)));
  const articleStarted = articleProgress > 0 && articleProgress < 100;
  const articleCompleted = articleProgress >= 100;
  const articleKicker = articleStarted
    ? `Continue reading · 還有 ${remaining} 分鐘`
    : articleCompleted
      ? `Today's reread · ${article.minutes} MIN`
      : `Today's reading · ${article.minutes} MIN`;
  const articleAction = articleStarted ? "繼續閱讀" : articleCompleted ? "重新閱讀" : "開始閱讀";
  const episodeStarted = episodeTime > 0 && episodeTime < episode.duration;
  const episodeCompleted = episodeTime >= episode.duration;
  const episodeKicker = `${episodeStarted ? "今日續聽" : episodeCompleted ? "今日重聽" : "今日選聽"} · ${episode.source}`;
  const episodeAction = episodeStarted ? "繼續收聽" : episodeCompleted ? "重新收聽" : "開始收聽";
  const date = new Intl.DateTimeFormat("zh-Hant", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());

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
            <span>今日一詩</span>
            <span>${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.form)}</span>
          </div>
          <div class="poem-preview">
            <p class="poem-author">${escapeHtml(poem.poet)}</p>
            <h2>${escapeHtml(poem.title)}</h2>
            <div class="preview-verses">
              ${poem.lines.slice(0, 2).map((line) => `
                <div class="preview-line">
                  <span>${escapeHtml(line.text)}</span>
                  <small lang="yue-Latn">${escapeHtml(line.jyutping)}</small>
                </div>`).join("")}
            </div>
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
            <p>每天按本地日期更換，進度仍只留在這部裝置。</p>
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
              ${progressLine(progressPercent(episodeTime, episode.duration), `${episode.title} 播放進度`)}
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
  return kind === "詩" || kind === "詞" ? "首" : "篇";
}

function filteredPoems() {
  const query = ui.poetryQuery.trim().toLocaleLowerCase();
  return poems.filter((poem) => {
    const matchesKind = ui.poetryKind === "全部" || poem.kind === ui.poetryKind;
    const matchesFacets = Object.entries(ui.poetryFilters).every(([facet, value]) => {
      if (!value) return true;
      return facet === "theme" ? poem.themes.includes(value) : poem[facet] === value;
    });
    const searchable = [poem.kind, poem.title, poem.poet, poem.dynasty, poem.form, poem.originalSource, ...poem.themes, ...poem.lines.map((line) => line.text)].join(" ").toLocaleLowerCase();
    return matchesKind && matchesFacets && (!query || searchable.includes(query));
  });
}

function visiblePoetryFacetValues() {
  const candidates = poetryKindWorks();
  const facetValues = ui.poetryFacet === "theme"
    ? candidates.flatMap((poem) => poem.themes)
    : candidates.map((poem) => poem[ui.poetryFacet]);
  const values = ["全部", ...new Set(facetValues.filter(Boolean))];
  if (ui.poetryFacet !== "poet" || values.length <= 25) return values;
  const active = ui.poetryFilters.poet;
  const counts = new Map();
  candidates.forEach((poem) => counts.set(poem.poet, (counts.get(poem.poet) || 0) + 1));
  const popular = values.slice(1)
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b, "zh-Hant"))
    .slice(0, 24);
  if (active && !popular.includes(active)) popular.push(active);
  return ["全部", ...popular];
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
          <button type="button" data-remove-poetry-filter="${facet}" aria-label="移除${poetryFacetLabels[facet]}條件${escapeHtml(value)}">
            <small>${poetryFacetLabels[facet]}</small>${escapeHtml(value)} <span aria-hidden="true">×</span>
          </button>`).join("")}
      </div>
      <button class="clear-filter-link" type="button" data-clear-poetry>清除全部</button>
    </div>`;
}

function renderPoetryIndex() {
  const results = filteredPoems();
  const visibleResults = results.slice(0, ui.poetryLimit);
  const active = activePoetryFilters();
  const resultUnit = poetryWorkUnit();

  return `
    <section class="collection-view page-enter">
      <header class="section-hero poetry-hero">
        <div>
          <p class="eyebrow">古典文庫</p>
          <h1>詩、詞與古文，<br>在同一座書房。</h1>
        </div>
        <p>先選文類，再沿朝代、作者、體裁或主題進入。原文與來源一同保存，讀音查詢保留人工校正的空間。</p>
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
          ${Object.entries(poetryFacetLabels).map(([id, label]) => `
            <button type="button" role="tab" class="facet-tab ${ui.poetryFacet === id ? "is-active" : ""}"
              data-poetry-facet="${id}" aria-selected="${ui.poetryFacet === id}">按${label}</button>`).join("")}
        </div>
        <div class="filter-chips" aria-label="${poetryFacetLabels[ui.poetryFacet]}選項">
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
        ${results.length ? visibleResults.map((poem, index) => `
          <article class="poem-row">
            <button class="poem-row-main" type="button" data-route="poetry" data-route-id="${poem.id}">
              <span class="poem-number">${String(index + 1).padStart(2, "0")}</span>
              <span class="poem-row-title">
                <strong class="poem-row-quote">${escapeHtml(poem.featuredQuote)}</strong>
                <small class="poem-row-work-title">《${escapeHtml(poem.title)}》</small>
                <em class="poem-row-meta">${escapeHtml(poem.poet)} · ${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.form)}</em>
              </span>
              <span class="row-arrow">${icon("arrow")}</span>
            </button>
            ${favoriteButton(`poem:${poem.id}`, poem.title)}
          </article>`).join("") : `
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
  const authorReason = poem.kind === "古文" ? "同一作者" : poem.kind === "詞" ? "同一詞人" : "同一詩人";
  return poems
    .filter((candidate) => candidate.id !== poem.id && candidate.kind === poem.kind)
    .map((candidate) => {
      const sharedThemes = candidate.themes.filter((theme) => poem.themes.includes(theme));
      const score = (candidate.poet === poem.poet ? 4 : 0)
        + sharedThemes.length * 2
        + (candidate.form === poem.form ? 1 : 0)
        + (candidate.dynasty === poem.dynasty ? 1 : 0);
      const reason = candidate.poet === poem.poet
        ? authorReason
        : sharedThemes.length
          ? `同寫${sharedThemes[0]}`
          : candidate.form === poem.form
            ? `同為${poem.form}`
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
  return { label: "詩脈", work: "這首詩" };
}

function renderPoemThread(poem) {
  if (!ui.poemThreadOpen) return "";
  const related = relatedPoemsFor(poem);
  const thread = poemThreadCopy(poem);
  return `
    <section class="poem-thread-panel" id="poem-thread-panel" aria-label="${thread.label}" tabindex="-1">
      <div class="aside-title"><span>${thread.label}</span><button class="thread-close" type="button" data-toggle-poem-thread>收起</button></div>
      <p class="thread-intro">沿著作者、時代與題材，找到${thread.work}在書房裡的位置。</p>
      <dl class="poem-relations">
        <div><dt>作者</dt><dd>${poetryRelationButton("poet", poem.poet, poem.poet, poem.kind)}</dd></div>
        <div><dt>時代</dt><dd>${poetryRelationButton("dynasty", poem.dynasty, poem.dynasty, poem.kind)}</dd></div>
        <div><dt>體裁</dt><dd>${poetryRelationButton("form", poem.form, poem.form, poem.kind)}</dd></div>
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

function renderProseText(text, showJyutping, interactive = true) {
  if (!showJyutping || cantoneseLexiconState.status !== "ready") {
    return interactive ? renderPoemLineText({ text }) : escapeHtml(text);
  }

  return segmentCantonesePronunciation(text).map((part) => {
    if (!part.isWord || !part.readings.length) return escapeHtml(part.text);
    const primaryReading = part.readings[0];
    const characters = Array.from(part.text);
    const syllables = primaryReading.trim().split(/\s+/);
    const ruby = characters.length === syllables.length
      ? characters.map((character, index) => `<ruby class="prose-jyutping-token"><span>${escapeHtml(character)}</span><rt lang="yue-Latn" aria-hidden="true">${escapeHtml(syllables[index])}</rt></ruby>`).join("")
      : `<ruby class="prose-jyutping-token"><span>${escapeHtml(part.text)}</span><rt lang="yue-Latn" aria-hidden="true">${escapeHtml(primaryReading)}</rt></ruby>`;
    if (!interactive) return ruby;
    const candidates = part.readings.join("、");
    return `<button class="poem-term-button prose-pronunciation-term" type="button" data-dictionary-term="${escapeHtml(part.text)}" title="查看${escapeHtml(part.text)}，候選讀音 ${escapeHtml(candidates)}">${ruby}</button>`;
  }).join("");
}

function renderPoemDetails(poem) {
  const details = [
    ["注釋", poem.annotation, true],
    ["譯文", poem.translation, false],
    ["賞析", poem.appreciation, false],
    ["典故", poem.allusion, false]
  ].filter(([, content]) => Boolean(content));

  if (!details.length) {
    const saveCopy = poem.kind === "古文" ? "收藏段落" : poem.kind === "詞" ? "收藏詞句" : "收藏詩句";
    return `
      <section class="source-only-note">
        <span aria-hidden="true">原</span>
        <div><strong>這一頁只收錄古典原文</strong><p>未把來源不明的現代譯文、注釋或賞析混入書房；你仍可${saveCopy}、寫筆記與點詞查音。</p></div>
      </section>`;
  }

  return details.map(([label, content, open]) => `
    <details class="reader-detail" ${open ? "open" : ""}>
      <summary>${label} ${icon("chevron")}</summary>
      <p>${escapeHtml(content)}</p>
    </details>`).join("");
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

function renderPoemBody(poem, savedLineIds, showJyutping) {
  if (poem.kind === "古文") {
    const jyutpingVisible = showJyutping && cantoneseLexiconState.status === "ready";
    return `
      <div class="prose-work ${jyutpingVisible ? "is-showing-jyutping" : ""}" lang="zh-Hant">
        ${poem.lines.map((line, lineIndex) => {
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

  const lineKind = poem.kind === "詞" ? "詞句" : "詩句";
  return `
    <div class="full-poem" lang="zh-Hant">
      ${poem.lines.map((line, lineIndex) => {
        const lineId = poetryLineId(poem.id, lineIndex);
        const saved = savedLineIds.has(lineId);
        return `
          <div class="verse-line ${saved ? "is-saved" : ""}">
            <div class="verse-line-main">
              <p>${renderPoemLineText(line)}</p>
              <button class="verse-save" type="button" data-save-poetry-line="${poem.id}:${lineIndex}"
                aria-label="${saved ? `取消收藏${lineKind}` : `收藏${lineKind}`} ${escapeHtml(line.text)}" aria-pressed="${saved}">
                ${icon("bookmark")}
              </button>
            </div>
            ${showJyutping && line.jyutping ? `<span lang="yue-Latn">${escapeHtml(line.jyutping)}</span>` : ""}
          </div>`;
      }).join("")}
    </div>`;
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
    </section>`;
}

function renderPoemReader(id) {
  const poem = findPoem(id);
  const state = appStore.getState();
  const showJyutping = state.preferences.showJyutping;
  const hasJyutping = poem.lines.some((line) => Boolean(line.jyutping));
  const savedLineIds = new Set(state.savedItems.map((item) => item.id));
  const noteKey = `poem:${poem.id}`;
  const note = state.notes[noteKey]?.content || "";
  const noteOpen = ui.notePanel === noteKey;
  const isProse = poem.kind === "古文";
  const proseJyutpingReady = isProse && cantoneseLexiconState.status === "ready";
  const jyutpingVisible = showJyutping && (hasJyutping || proseJyutpingReady);
  const typography = getClassicalTypography(state.preferences);
  const thread = poemThreadCopy(poem);

  return `
    <article class="poem-reader page-enter ${isProse ? "is-prose" : ""} classical-font-${typography.font}"
      style="--classical-scale:${typography.scale}; --classical-leading:${typography.leading}">
      <header class="reader-toolbar">
        <button class="back-button" type="button" data-route="poetry">${icon("back")} 詩詞</button>
        <div class="reader-actions">
          <button class="quiet-button typography-toggle ${ui.classicalTypographyOpen ? "is-active" : ""}" type="button"
            data-toggle-classical-typography aria-expanded="${ui.classicalTypographyOpen}" aria-controls="classical-typography-panel"
            aria-label="${ui.classicalTypographyOpen ? "關閉閱讀排版" : "打開閱讀排版"}">
            <span class="typography-mark" aria-hidden="true">Aa</span><span class="typography-label">排版</span>
          </button>
          ${hasJyutping || isProse
            ? `<button class="quiet-button ${jyutpingVisible ? "is-active" : ""}" type="button" data-toggle-jyutping aria-pressed="${jyutpingVisible}"
                aria-label="${jyutpingVisible ? "隱藏粵拼" : "顯示粵拼"}" ${isProse && !proseJyutpingReady ? "disabled" : ""}>粵拼</button>`
            : `<span class="reader-source-badge">點詞查音</span>`}
          <button class="icon-button" type="button" data-toggle-note="${noteKey}" aria-label="${noteOpen ? "關閉筆記" : "打開筆記"}">${icon("note")}</button>
          ${favoriteButton(`poem:${poem.id}`, poem.title)}
          <button class="icon-button" type="button" data-immersive="${poem.id}" aria-label="進入沉浸閱讀">${icon("expand")}</button>
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

          ${renderPoemBody(poem, savedLineIds, showJyutping)}

          <p class="pronunciation-note" data-lexicon-status="${cantoneseLexiconState.status}">${isProse
            ? cantoneseLexiconState.status === "ready"
              ? "粵拼由粵典詞語讀音配合 Rime Cantonese 單字表自動標註，顯示首個候選；多音字及古典語境可能有不同讀法。點擊字詞可查看全部候選。"
              : cantoneseLexiconState.status === "error"
                ? "粵拼資料暫時未能載入；正文仍可閱讀及點選已收錄詞語。"
                : "正在準備古文粵拼資料。"
            : hasJyutping
              ? `粵拼為逐首保存的${escapeHtml(poem.jyutpingStatus)}；古典語境可能存在不同讀法。`
              : "未自動拼出整句，以免把候選讀音當作校訂讀法。讀音表載入後，可點有底線的詞查看粵典候選讀音。"}</p>
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
          ${renderPoemDetails(poem)}
        </aside>
      </div>
    </article>`;
}

function renderCantoneseFeed() {
  const state = appStore.getState();
  const visible = episodes.filter((episode) => {
    const sourceMatches = ui.sourceFilter === "全部" || episode.sourceId === ui.sourceFilter;
    const levelMatches = ui.cantoneseLevel === "全部" || episode.level === Number(ui.cantoneseLevel);
    return sourceMatches && levelMatches;
  });
  const activeSource = cantoneseSourceCatalog.find((source) => source.id === ui.sourceFilter);
  const sourceLabel = activeSource?.shortName || "全部內容";
  const levelCounts = cantoneseSourceSnapshot.levelCounts || {};

  return `
    <section class="collection-view page-enter cantonese-view">
      <header class="section-hero listening-hero">
        <div>
          <p class="eyebrow">Cantonese Listening</p>
          <h1>先聽見語氣，<br>再追上每個字。</h1>
        </div>
        <p>香港口語原聲、七級粵文故事與本地練習，全部可以在 Leafbound 閱讀全文。真人錄音優先；沒有原聲時，也不會用普通話代替。</p>
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
              : `${count} ${source.id === "hkcancor" ? "段" : "篇"}可用內容`;
            return `
              <button type="button" class="cantonese-source-card ${ui.sourceFilter === source.id ? "is-active" : ""}" data-source-filter="${escapeHtml(source.id)}" aria-pressed="${ui.sourceFilter === source.id}">
                <span class="cantonese-source-mark" aria-hidden="true">${escapeHtml(source.mark)}</span>
                <span><small>${escapeHtml(source.mode)}</small><strong>${escapeHtml(source.shortName)}</strong><em>${escapeHtml(detail)}</em></span>
                <b>${count}</b>
              </button>`;
          }).join("")}
        </div>
      </section>

      ${["全部", "hbl"].includes(ui.sourceFilter) ? `
        <div class="cantonese-level-ladder" aria-label="粵文故事等級">
          <button type="button" class="${ui.cantoneseLevel === "全部" ? "is-active" : ""}" data-cantonese-level="全部" aria-pressed="${ui.cantoneseLevel === "全部"}">
            <span>ALL</span><strong>全部等級</strong><small>${cantoneseSourceSnapshot.importedStoryCount} 篇</small>
          </button>
          ${Array.from({ length: 7 }, (_, index) => index + 1).map((level) => `
            <button type="button" class="${ui.cantoneseLevel === String(level) ? "is-active" : ""}" data-cantonese-level="${level}" aria-pressed="${ui.cantoneseLevel === String(level)}">
              <span>L${level}</span><strong>${level <= 2 ? "短句起步" : level <= 5 ? "故事進階" : "長篇閱讀"}</strong><small>${levelCounts[level] || 0} 篇</small>
            </button>`).join("")}
        </div>` : ""}

      ${ui.sourceFilter === "local" ? renderCantoneseVoiceNotice() : ""}

      <div class="feed-heading">
        <div><span>${escapeHtml(sourceLabel)}</span><small>${visible.length} items</small></div>
        <p>站內保留正文；原聲、粵拼與授權狀態按每篇內容分別標示。</p>
      </div>

      <div class="episode-list">
        ${visible.map((episode) => {
          const current = state.playbackProgress[episode.id] || 0;
          const date = episode.publishedAt
            ? new Intl.DateTimeFormat("zh-Hant", { year: "numeric", month: "short", day: "numeric" }).format(new Date(episode.publishedAt))
            : episode.recordedPeriod || "";
          const availability = episode.audioKind === "local"
            ? `真人原聲 ${formatTime(episode.duration)} · 語料粵拼`
            : episode.audioKind === "soundcloud"
              ? `真人原聲 · ${episode.transcript.length} 段完整粵文`
              : `本機粵語朗讀 · ${formatTime(episode.duration)}`;
          const progressCopy = episode.audioKind === "soundcloud"
            ? "站內全文"
            : current ? `${progressPercent(current, episode.duration)}%` : "未開始";
          const artMark = episode.sourceId === "hbl" ? `L${episode.level}` : episode.sourceId === "hkcancor" ? "港" : "";
          return `
            <article class="episode-row is-${escapeHtml(episode.sourceId)}">
              <button class="episode-main" type="button" data-route="cantonese" data-route-id="${episode.id}">
                <span class="episode-art is-${escapeHtml(episode.sourceId)}" aria-hidden="true">
                  ${artMark ? `<b>${escapeHtml(artMark)}</b>` : ""}<i></i><i></i><i></i><i></i><i></i>
                </span>
                <span class="episode-copy">
                  <small>${escapeHtml(episode.source)} · ${escapeHtml(episode.episode)}</small>
                  <strong>${escapeHtml(episode.title)}</strong>
                  <span>${escapeHtml(episode.description)}</span>
                  <span class="episode-meta">${[date, availability].filter(Boolean).map(escapeHtml).join(" · ")}</span>
                </span>
                <span class="episode-progress-copy">${progressCopy}</span>
              </button>
              <div class="episode-side">
                ${favoriteButton(`episode:${episode.id}`, episode.title)}
                <button class="round-play" type="button" data-route="cantonese" data-route-id="${episode.id}" aria-label="開啟${escapeHtml(episode.title)}逐字稿">${icon("arrow")}</button>
              </div>
              ${episode.audioKind === "soundcloud" ? "" : `<div class="episode-progress-track"><span style="width:${progressPercent(current, episode.duration)}%"></span></div>`}
            </article>`;
        }).join("") || `
          <div class="empty-state cantonese-empty">
            <span class="empty-glyph">聲</span>
            <h2>這個等級暫時沒有內容</h2>
            <p>返回全部等級，或切換另一座聲音書架。</p>
            <button class="secondary-button" type="button" data-source-filter="全部" data-cantonese-level="全部">查看全部粵語內容</button>
          </div>`}
      </div>
    </section>`;
}

function transcriptSegmentHtml(segment, index, mode, episodeId, showJyutping) {
  if (mode === "listen") return "";
  const episode = findEpisode(episodeId);
  const hidden = mode === "reveal" && !ui.revealedSegments.has(`${episodeId}:${index}`);
  const text = segmentCantoneseText(segment.text, segment.terms || []).map((part) => {
    if (!part.isWord) return escapeHtml(part.text);
    const attribute = part.isCurated ? "data-term" : "data-dictionary-term";
    const pronunciation = part.readings.length ? ` title="${escapeHtml(part.readings.join(" / "))}"` : "";
    return `<button class="term-button ${part.isCurated ? "is-curated" : "is-dictionary"}" type="button" ${attribute}="${escapeHtml(part.text)}"${pronunciation}>${escapeHtml(part.text)}</button>`;
  }).join("");
  const suppliedJyutping = String(segment.jyutping || "").trim();
  const generatedJyutping = showJyutping && !suppliedJyutping && cantoneseLexiconState.status === "ready"
    ? buildCantonesePronunciationLine(segment.text)
    : "";
  const jyutping = showJyutping ? suppliedJyutping || generatedJyutping : "";
  const jyutpingKind = suppliedJyutping ? "corpus" : "auto";

  return `
    <div class="transcript-segment ${hidden ? "is-hidden" : ""}" data-segment-index="${index}">
      ${episode.timing === "untimed"
        ? `<span class="segment-time is-label">${escapeHtml(segment.label || String(index + 1).padStart(2, "0"))}</span>`
        : `<button class="segment-time" type="button" data-jump-time="${segment.at}" aria-label="跳到約 ${formatTime(segment.at)}">${formatTime(segment.at)}</button>`}
      ${hidden ? `
        <button class="reveal-line" type="button" data-reveal-segment="${episodeId}:${index}">顯示這一句</button>` : `
         <div class="segment-copy">
           <p lang="yue-Hant">${text}</p>
           ${jyutping ? `<small class="segment-jyutping is-${jyutpingKind}" lang="yue-Latn" data-segment-jyutping="${jyutpingKind}">${escapeHtml(jyutping)}</small>` : ""}
         </div>`}
    </div>`;
}

function renderEpisodePlayer(id) {
  const episode = findEpisode(id);
  const state = appStore.getState();
  const mode = state.preferences.transcriptMode;
  const showTranscriptJyutping = state.preferences.showTranscriptJyutping !== false;
  const speed = state.preferences.playbackSpeed;

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
  const abLabel = player.abStart == null ? "AB" : player.abEnd == null ? `A · ${formatTime(player.abStart)}` : `AB · ${formatTime(player.abStart)}–${formatTime(player.abEnd)}`;
  const speechReady = cantoneseSpeech.status === "available";
  const hasLocalRecording = episode.audioKind === "local" && Boolean(episode.audioFile);
  const hasRemoteRecording = episode.audioKind === "soundcloud" && Boolean(episode.audioUrl);
  const canUseTransport = hasLocalRecording || speechReady;
  const voiceMessage = cantoneseVoiceMessage();
  const playbackLabel = hasLocalRecording ? "真人粵語原聲" : speechReady ? "粵語合成示範" : "僅粵語逐字稿";
  const playbackStatus = hasLocalRecording || hasRemoteRecording ? "recording" : cantoneseSpeech.status;
  const soundcloudEmbed = hasRemoteRecording
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(episode.audioUrl)}&color=%23183f38&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
    : "";

  return `
    <section class="episode-player-view page-enter">
      <header class="reader-toolbar">
        <button class="back-button" type="button" data-route="cantonese">${icon("back")} 粵語</button>
        <div class="reader-actions">
          <span class="demo-badge is-${playbackStatus}" data-cantonese-voice-status="${cantoneseSpeech.status}" data-cantonese-audio-kind="${escapeHtml(episode.audioKind || "speech")}">${playbackLabel}</span>
          ${favoriteButton(`episode:${episode.id}`, episode.title)}
        </div>
      </header>

      <div class="player-layout">
        <aside class="now-playing-card">
          <div class="large-wave" aria-hidden="true">
            ${Array.from({ length: 19 }, (_, index) => `<i style="--h:${24 + ((index * 17) % 58)}%"></i>`).join("")}
          </div>
          <p class="eyebrow">${escapeHtml(episode.source)} · ${escapeHtml(episode.episode)}</p>
          <h1>${escapeHtml(episode.title)}</h1>
          <p>${escapeHtml(episode.description)}</p>

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
              ? "HKCanCor 真人錄音保存在本機；句段位置按字數估算，播放進度與速度也只保存在本機。"
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
              <p class="eyebrow">${episode.sourceId === "hbl" ? `HBL Level ${episode.level}` : "Transcript"}</p>
              <h2>${episode.sourceId === "hbl" ? "故事全文" : "逐字稿"}</h2>
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

          ${mode === "listen" ? `
            <div class="listen-only-state">
              <span class="listening-orbit">${icon("headphones")}</span>
              <h3>先不看文字</h3>
              <p>把注意力留給語速、停頓和句尾。需要時再切回按需顯示。</p>
            </div>` : `
            ${showTranscriptJyutping && episode.transcript.some((segment) => !segment.jyutping) ? `
              <p class="transcript-pronunciation-note" data-transcript-pronunciation-status="${cantoneseLexiconState.status}">${cantoneseLexiconState.status === "ready"
                ? "粵拼為詞表自動標註的首個候選；多音字可點詞查看其他讀法。"
                : cantoneseLexiconState.status === "error"
                  ? "粵拼資料暫時未能載入，正文仍可閱讀及點選已收錄詞語。"
                  : "正在準備粵拼……"}</p>` : ""}
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
  const syncedAt = englishSourceSnapshot.generatedAt
    ? new Intl.DateTimeFormat("zh-Hant", { year: "numeric", month: "short", day: "numeric" }).format(new Date(englishSourceSnapshot.generatedAt))
    : "尚未同步";

  const renderIndexRow = (article, index) => {
    const isExternal = article.access === "external" || !Array.isArray(article.paragraphs);
    const progress = isExternal ? 0 : state.readingProgress[article.id] || 0;
    const date = article.publishedAt
      ? new Intl.DateTimeFormat("zh-Hant", { year: "numeric", month: "short", day: "numeric" }).format(new Date(article.publishedAt))
      : "";
    const meta = [article.source, article.topic, date].filter(Boolean).map(escapeHtml).join(" · ");
    const readerStatus = article.sourceId === "local"
      ? progress ? `${Math.round(progress)}% read` : "站內精讀"
      : article.contentScope === "chapter"
        ? progress ? `${Math.round(progress)}% read` : "首章站內讀"
        : progress ? `${Math.round(progress)}% read` : "站內全文";
    const main = `
      <span class="article-ordinal">${String(index + 1).padStart(2, "0")}</span>
      <span class="article-heading">
        <small>${meta}</small>
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.deck)}</span>
      </span>
      <span class="article-status ${isExternal ? "is-external" : ""}">${isExternal ? "原站閱讀" : readerStatus}</span>
      <span class="row-arrow">${icon(isExternal ? "external" : "arrow")}</span>`;

    return `
      <article class="article-row ${isExternal ? "is-external" : "is-internal"}" data-english-source-row="${escapeHtml(article.sourceId)}" data-english-category-row="${escapeHtml(article.category)}">
        ${isExternal
          ? `<a class="article-main" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="在 ${escapeHtml(article.source)} 閱讀 ${escapeHtml(article.title)}">${main}</a>`
          : `<button class="article-main" type="button" data-route="english" data-route-id="${article.id}">${main}</button>`}
        ${isExternal ? "" : `<div class="article-line"><span style="width:${progress}%"></span></div>${favoriteButton(`article:${article.id}`, article.title)}`}
      </article>`;
  };

  return `
    <section class="collection-view page-enter english-view">
      <header class="section-hero english-hero">
        <div>
          <p class="eyebrow">English Input</p>
          <h1>Read for thought.<br><em>Keep the language.</em></h1>
        </div>
        <p>閱讀不是單字採集。保存讓你停下來的 phrase、collocation 和完整語境。</p>
      </header>

      <section class="english-source-ledger" aria-labelledby="english-source-title">
        <header>
          <div><p class="eyebrow">Source shelf</p><h2 id="english-source-title">四座書架，同一個閱讀入口。</h2></div>
          <div class="english-sync-state"><span>${englishSourceSnapshot.itemCount} 篇站內正文</span><small>${escapeHtml(syncedAt)} 同步</small></div>
        </header>
        <div class="english-source-cards">
          ${englishSourceCatalog.map((source) => {
            const count = indexItems.filter((item) => item.sourceId === source.id).length;
            return `
              <button type="button" class="english-source-card ${ui.englishSourceFilter === source.id ? "is-active" : ""}" data-english-source="${escapeHtml(source.id)}" aria-pressed="${ui.englishSourceFilter === source.id}">
                <span class="english-source-mark" aria-hidden="true">${escapeHtml(source.mark)}</span>
                <span><small>${escapeHtml(source.mode)}</small><strong>${escapeHtml(source.shortName)}</strong><em>${escapeHtml(source.description)}</em></span>
                <b>${count}</b>
              </button>`;
          }).join("")}
        </div>
        <button class="english-source-reset ${ui.englishSourceFilter === "全部" ? "is-active" : ""}" type="button" data-english-source="全部">${ui.englishSourceFilter === "全部" ? "正在顯示全部來源" : "返回全部來源"} · ${indexItems.length}</button>
      </section>

      <div class="english-index-tools">
        <div class="english-category-tabs" role="tablist" aria-label="English 文章分類">
          ${categories.map((category) => `
            <button type="button" role="tab" class="${ui.englishCategory === category ? "is-active" : ""}" data-english-category="${escapeHtml(category)}" aria-selected="${ui.englishCategory === category}">${escapeHtml(category)}</button>`).join("")}
        </div>
        <p><span>${visible.length}</span> 篇 · ${ui.englishSourceFilter === "全部" ? "全部來源" : escapeHtml(englishSourceCatalog.find((source) => source.id === ui.englishSourceFilter)?.shortName || "來源")}</p>
      </div>

      <div class="article-stack" aria-live="polite">
        ${visible.length ? visible.map(renderIndexRow).join("") : `
          <div class="empty-state english-empty">
            <span class="empty-glyph">Aa</span>
            <h2>這座書架暫時沒有這一類</h2>
            <p>可以切換分類，或返回全部來源。</p>
            <button class="secondary-button" type="button" data-english-source="全部" data-english-category="全部">查看全部文章</button>
          </div>`}
      </div>

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
    html += `<button type="button" class="${classes}" data-english-word="${escapeHtml(word)}" data-article-id="${articleId}" data-paragraph-index="${paragraphIndex}" data-word-offset="${offset}" aria-label="查詢 ${escapeHtml(word)} 的意思">${isDropCap ? `<span class="reader-dropcap" aria-hidden="true">${escapeHtml(word[0])}</span><span>${escapeHtml(word.slice(1))}</span>` : escapeHtml(word)}</button>`;
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
    <section class="reader-lookup-hint" aria-label="英文點詞提示">
      <span class="lookup-hint-mark" aria-hidden="true">Aa</span>
      <p class="eyebrow">READ · TAP · KEEP</p>
      <h2>點一下，<br>別離開這一頁。</h2>
      <p>點任意英文詞查看中文釋義與常見用法；未收錄的詞也可保存到詞庫。拖選文字可保存 phrase 或 sentence。</p>
      <small>${savedCount ? `本篇已保存 ${savedCount} 個詞條` : "詞義和閱讀記錄只保存在本機"}</small>
    </section>`;
}

function renderEnglishLookupPanel(article) {
  const item = ui.selectedEnglishItem || ui.selectedText;
  if (!item) return renderEnglishLookupHint(article);

  const text = item.text.trim();
  const saved = appStore.getState().savedItems.some((savedItem) => savedItem.id === englishItemId(text));
  const type = item.type || (text.includes(" ") ? "phrase" : "word");
  const typeLabel = type.replaceAll("-", " ").toUpperCase();
  const meta = [item.partOfSpeech, item.lemma && item.lemma.toLowerCase() !== text.toLowerCase() ? `原形 ${item.lemma}` : ""].filter(Boolean).join(" · ");
  const commonUses = Array.isArray(item.commonUses) ? item.commonUses.slice(0, 3) : [];
  const commonUseEmpty = type === "word"
    ? "這個詞的常見搭配尚未收錄。"
    : "這個條目本身是固定搭配，建議整組記憶。";

  return `
    <section class="english-lookup-card" data-english-lookup-card tabindex="-1" aria-live="polite" aria-label="${escapeHtml(text)} 詞義">
      <header class="lookup-card-header">
        <p class="eyebrow">${escapeHtml(typeLabel)}</p>
        <button class="icon-button lookup-close" type="button" data-close-english-sheet aria-label="關閉詞義卡">${icon("close")}</button>
      </header>
      <div class="lookup-word-line">
        <div>
          <h2>${escapeHtml(text)}</h2>
          ${item.pronunciation ? `<p class="pronunciation">${escapeHtml(item.pronunciation)}</p>` : ""}
          ${meta ? `<p class="lookup-meta">${escapeHtml(meta)}</p>` : ""}
        </div>
        <button class="lookup-speak" type="button" data-speak-english="term" aria-label="朗讀 ${escapeHtml(text)}">${icon("headphones")}<span>聽</span></button>
      </div>
      <div class="lookup-meaning">
        <small>中文</small>
        <p>${escapeHtml(item.meaning || "這個詞尚未收錄本地中文釋義；仍可保存到詞庫。")}</p>
      </div>
      <section class="lookup-common-uses" aria-label="常見用法">
        <small>常見用法</small>
        ${commonUses.length ? `
          <ul>
            ${commonUses.map((use) => `<li><span lang="en">${escapeHtml(use.pattern)}</span><em lang="zh-Hant">${escapeHtml(use.meaning)}</em></li>`).join("")}
          </ul>` : `<p>${escapeHtml(commonUseEmpty)}</p>`}
      </section>
      ${item.definition ? `<div class="lookup-definition"><small>IN ENGLISH</small><p>${escapeHtml(item.definition)}</p></div>` : ""}
      <button class="primary-button lookup-save" type="button" data-save-english ${saved ? "disabled" : ""}>${saved ? `${icon("check")} 已加入我的詞庫` : "加入我的詞庫"}</button>
    </section>`;
}

function renderArticleReader(id) {
  const article = findEnglishArticle(id);
  const state = appStore.getState();
  const progress = state.readingProgress[article.id] || 0;
  const preferences = state.preferences;
  const noteKey = `article:${article.id}`;
  const note = state.notes[noteKey]?.content || "";
  const noteOpen = ui.notePanel === noteKey;

  return `
    <article class="article-reader page-enter ${preferences.englishDark ? "is-dark" : ""}" style="--reader-scale:${preferences.englishFontScale}; --reader-leading:${preferences.englishLineHeight}">
      <header class="reader-toolbar article-toolbar">
        <button class="back-button" type="button" data-route="english">${icon("back")} English</button>
        <div class="reader-actions">
          <button class="text-control" type="button" data-reader-font="-0.08" aria-label="縮小字體">A−</button>
          <button class="text-control" type="button" data-reader-font="0.08" aria-label="放大字體">A+</button>
          <button class="text-control leading-control" type="button" data-reader-leading aria-label="調整行距">行距</button>
          <button class="quiet-button ${preferences.englishDark ? "is-active" : ""}" type="button" data-reader-dark aria-pressed="${preferences.englishDark}">夜讀</button>
          <button class="icon-button" type="button" data-toggle-note="${noteKey}" aria-label="${noteOpen ? "關閉筆記" : "打開筆記"}">${icon("note")}</button>
          ${favoriteButton(`article:${article.id}`, article.title)}
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
            <p>${escapeHtml(article.source)} · ${article.minutes} min read</p>
            <h1>${escapeHtml(article.title)}</h1>
            <h2>${escapeHtml(article.deck)}</h2>
            ${article.sectionTitle ? `<p class="article-section-title">站內章節 · ${escapeHtml(article.sectionTitle)}</p>` : ""}
            ${article.sourceUrl ? `
              <aside class="article-source-note">
                <span>${article.contentScope === "chapter" ? "首章純文字" : "官方正文"}</span>
                <p><strong>${escapeHtml(article.attribution || article.source)}</strong>${article.contentNote ? ` · ${escapeHtml(article.contentNote)}` : ""}</p>
                <a href="${safeExternalHref(article.fullTextUrl || article.sourceUrl)}" target="_blank" rel="noreferrer">${article.contentScope === "chapter" ? "查看完整版本與出處" : "查看原始頁面與出處"} ${icon("external")}</a>
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
              <div class="aside-title"><span>Article note</span><small>只儲存在本機</small></div>
              <textarea data-note-input="${noteKey}" placeholder="What stayed with you?">${escapeHtml(note)}</textarea>
              <button class="primary-button compact" type="button" data-save-note="${noteKey}">保存筆記</button>
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

function renderAboutPanel() {
  const openWorks = poems.filter((poem) => poem.isOpenCorpus).length;
  const kindCount = (kind) => poems.filter((poem) => poem.kind === kind).length;
  const lexiconCount = cantoneseLexiconState.entryCount || 62_274;
  const characterCount = cantoneseLexiconState.characterEntryCount || 26_983;
  const importedEnglishCount = englishDiscoveries.length;
  const localCantoneseCount = episodes.filter((episode) => episode.sourceId === "local").length;

  return `
    <section class="about-panel" aria-labelledby="about-title">
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
            <p>${poems.length} 篇本地內容，包括 ${kindCount("詩")} 首詩、${kindCount("詞")} 首詞與 ${kindCount("古文")} 篇古文；其中 ${openWorks} 篇來自固定版本的 chinese-poetry 開放資料。</p>
            <dl>
              <div><dt>收錄</dt><dd>唐詩三百首 · 宋詞三百首 · 古文觀止</dd></div>
              <div><dt>授權</dt><dd>MIT</dd></div>
              <div><dt>邊界</dt><dd>開放條目只收錄古典原文，不混入來源不明的現代譯註</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://github.com/chinese-poetry/chinese-poetry" target="_blank" rel="noreferrer">查看資料庫</a>
              <a href="https://github.com/chinese-poetry/chinese-poetry/blob/master/LICENSE" target="_blank" rel="noreferrer">MIT 授權</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-cantonese-content">
          <span class="about-source-mark" aria-hidden="true">聲</span>
          <div class="about-source-copy">
            <p class="eyebrow">Cantonese listening shelf</p>
            <h3>香港口語與分級故事</h3>
            <p>${cantoneseSourceSnapshot.authenticSampleCount} 段 HKCanCor 真人錄音與標注逐字稿保存在本機；另收錄 ${cantoneseSourceSnapshot.importedStoryCount} 篇冚唪唥粵文故事，平均分布在 Level 1–7。</p>
            <dl>
              <div><dt>HKCanCor</dt><dd>1997–1998 香港自然對話／電台樣本 · 原有粵拼 · CC BY 4.0</dd></div>
              <div><dt>冚唪唥</dt><dd>${cantoneseSourceSnapshot.catalogCount} 篇公開目錄中，匯入 ${cantoneseSourceSnapshot.importedStoryCount} 篇有正文、署名與原聲入口的故事</dd></div>
              <div><dt>教材邊界</dt><dd>香港教育局與出版社教材不整套複製；只接受使用者有權使用的個人檔案</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://github.com/fcbond/hkcancor" target="_blank" rel="noreferrer">HKCanCor</a>
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
            <p class="eyebrow">Cantonese pronunciation</p>
            <h3>粵拼候選讀音</h3>
            <p>${lexiconCount.toLocaleString("en-US")} 個粵典本地詞條用於點詞查音；另以 ${characterCount.toLocaleString("en-US")} 個 Rime Cantonese 單字條目補全古文逐字粵拼。</p>
            <dl>
              <div><dt>收錄</dt><dd>詞形候選讀音 · 古文單字候選讀音</dd></div>
              <div><dt>授權</dt><dd>Public domain · CC BY 4.0</dd></div>
              <div><dt>邊界</dt><dd>古文預設顯示首個候選；不複製粵典完整釋義</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://words.hk/faiman/analysis/" target="_blank" rel="noreferrer">粵典開放詞表</a>
              <a href="https://words.hk/" target="_blank" rel="noreferrer">前往粵典</a>
              <a href="https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/jyut6ping3.chars.dict.yaml" target="_blank" rel="noreferrer">Rime 單字表</a>
              <a href="https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/LICENSE-CC-BY" target="_blank" rel="noreferrer">CC BY 4.0</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-english">
          <span class="about-source-mark" aria-hidden="true">EN</span>
          <div class="about-source-copy">
            <p class="eyebrow">English source shelf</p>
            <h3>英文來源與分類</h3>
            <p>${importedEnglishCount} 篇可站內閱讀的正文來自 6 個官方訂閱源，涵蓋語言、文化、科學與文學；另有 ${articles.length} 篇 Leafbound 精讀稿。</p>
            <dl>
              <div><dt>VOA</dt><dd>Learning English · 自製文章全文；通訊社材料排除</dd></div>
              <div><dt>NASA</dt><dd>Technology · 官方正文純文字</dd></div>
              <div><dt>Standard</dt><dd>New Releases · 公共領域作品首章</dd></div>
              <div><dt>邊界</dt><dd>不複製圖片、標誌、廣告、腳本或標示的第三方材料</dd></div>
            </dl>
            <div class="about-source-links">
              <a href="https://learningenglish.voanews.com/rssfeeds" target="_blank" rel="noreferrer">VOA RSS</a>
              <a href="https://www.nasa.gov/rss-feeds/" target="_blank" rel="noreferrer">NASA RSS</a>
              <a href="https://standardebooks.org/feeds" target="_blank" rel="noreferrer">Standard Ebooks feeds</a>
              <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">查看授權邊界</a>
            </div>
          </div>
        </article>

        <article class="about-source-card is-originals">
          <span class="about-source-mark" aria-hidden="true">拾</span>
          <div class="about-source-copy">
            <p class="eyebrow">Leafbound originals</p>
            <h3>編輯示範內容</h3>
            <p>目前的 ${articles.length} 篇 English 精讀稿、${localCantoneseCount} 篇粵語練習與 6 篇精修古典內容均為 Leafbound 本地示範，用來驗證閱讀、收藏與筆記流程。</p>
            <dl>
              <div><dt>English</dt><dd>本地精讀稿與清洗後的公開來源正文分開標示</dd></div>
              <div><dt>粵語</dt><dd>本地練習與 HKCanCor 真人錄音、冚唪唥分級故事分開標示</dd></div>
            </dl>
          </div>
        </article>
      </div>

      <section class="about-data-note">
        <span aria-hidden="true">本</span>
        <div><h3>資料保存在目前瀏覽器</h3><p>收藏、筆記、閱讀與播放進度不需要帳戶，也不會自動傳送到外部服務。清除瀏覽器資料前，建議先使用上方的「匯出備份」。</p></div>
      </section>

      <footer class="about-footer">
        <span>Leafbound · 拾頁 · Personal Language Library</span>
        <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">完整第三方資料與授權說明</a>
      </footer>
    </section>`;
}

function renderLibrary() {
  const state = appStore.getState();
  const allItems = buildLibraryItems();
  const viewingAbout = ui.libraryFilter === "about";
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
    ["notes", "筆記"],
    ["about", "關於"]
  ];

  return `
    <section class="library-view page-enter">
      <header class="library-hero">
        <div>
          <p class="eyebrow">Personal Library</p>
          <h1>我的 Leafbound</h1>
          <p>收藏不是終點。這裡保留你想再次遇見的句子、聲音和想法。</p>
        </div>
        <div class="library-count">
          <strong>${allItems.length}</strong>
          <span>saved pieces</span>
        </div>
      </header>

      <div class="privacy-note">
        <span>${icon("bookmark")}</span>
        <p><strong>只屬於這部裝置。</strong> 所有收藏、筆記和進度目前只保存在瀏覽器，不會傳送到外部服務。</p>
        <button class="quiet-button" type="button" data-export-data>匯出備份</button>
      </div>

      <div class="library-tabs" role="tablist" aria-label="Library 分類">
        ${filters.map(([id, label]) => `
          <button type="button" role="tab" class="${ui.libraryFilter === id ? "is-active" : ""}" data-library-filter="${id}" aria-selected="${ui.libraryFilter === id}">${label}</button>`).join("")}
      </div>

      <div class="${viewingAbout ? "about-library-content" : "library-list"}">
        ${viewingAbout ? renderAboutPanel() : visible.length ? visible.map((item) => `
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

      ${viewingAbout ? "" : `<section class="language-shelf">
        <div><span class="eyebrow">語言庫</span><h2>目前語言</h2></div>
        <div class="language-list"><span>粵語 <small>Jyutping · Hong Kong</small></span><span>English <small>Latin · Global</small></span><button type="button" disabled title="第二階段開放">＋ 新增語言 <small>P1</small></button></div>
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

function renderSearchOverlay() {
  if (!ui.searchOpen) return "";
  const results = searchResults(ui.searchQuery);
  return `
    <div class="modal-backdrop search-backdrop" data-close-search>
      <section class="search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title" data-modal-panel>
        <header>
          <div><p class="eyebrow">全域搜尋</p><h2 id="search-title">找回一頁</h2></div>
          <button class="icon-button" type="button" data-close-search aria-label="關閉搜尋">${icon("close")}</button>
        </header>
        <label class="large-search">
          ${icon("search")}
          <span class="sr-only">搜尋詩、詞、古文、Episode、文章與 Library</span>
          <input type="search" data-global-search value="${escapeHtml(ui.searchQuery)}" placeholder="作者、原文、phrase 或聲音……" autocomplete="off" />
        </label>
        <p class="search-count">${ui.searchQuery ? `找到 ${results.length} 項` : "最近打開"}</p>
        <div class="search-results">
          ${results.length ? results.map((result) => `
            <button type="button" class="search-result" data-route="${result.route[0]}" ${result.route[1] ? `data-route-id="${result.route[1]}"` : ""}>
              <span class="result-module module-${result.module}">${result.module === "poetry" ? result.badge || "詩" : result.module === "cantonese" ? "粵" : "EN"}</span>
              <span><small>${escapeHtml(result.kicker)}</small><strong>${escapeHtml(result.title)}</strong><em>${escapeHtml(result.detail)}</em></span>
              ${icon("arrow")}
            </button>`).join("") : `
            <div class="empty-search"><p>沒有找到「${escapeHtml(ui.searchQuery)}」</p><span>試試更短的詞，或搜尋詩人與文章標題。</span></div>`}
        </div>
        <footer><kbd>Esc</kbd> 關閉 <span>·</span> 所有結果都來自本機內容</footer>
      </section>
    </div>`;
}

function renderTermSheet() {
  if (!ui.selectedTerm) return "";
  const term = getCantoneseTermData(ui.selectedTerm, cantoneseTerms);
  if (!term) return "";
  const id = `cantonese:${term.text}`;
  const saved = appStore.getState().savedItems.some((item) => item.id === id);
  return `
    <div class="modal-backdrop sheet-backdrop" data-close-sheet>
      <section class="word-sheet" role="dialog" aria-modal="true" aria-labelledby="term-title" data-modal-panel>
        <button class="icon-button sheet-close" type="button" data-close-sheet aria-label="關閉詞語解釋">${icon("close")}</button>
        <p class="eyebrow">${term.dictionaryOnly ? `${escapeHtml(term.type)} · 讀音` : "Transcript phrase"}</p>
        <h2 id="term-title">${escapeHtml(term.text)}</h2>
        <p class="term-jyutping" lang="yue-Latn">${escapeHtml(term.jyutping)}</p>
        <dl>${term.dictionaryOnly
          ? `<div><dt>範圍</dt><dd>${escapeHtml(term.mandarin)}</dd></div><div><dt>English</dt><dd>${escapeHtml(term.english)}</dd></div>`
          : `<div><dt>普通話</dt><dd>${escapeHtml(term.mandarin)}</dd></div><div><dt>English</dt><dd>${escapeHtml(term.english)}</dd></div>`}
        </dl>
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
  const proseJyutpingVisible = poem.kind === "古文"
    && state.preferences.showJyutping
    && cantoneseLexiconState.status === "ready";
  return `
    <section class="immersive-reader classical-font-${typography.font} ${poem.kind === "古文" ? "is-prose" : ""} ${proseJyutpingVisible ? "has-jyutping" : ""}"
      style="--classical-scale:${typography.scale}; --classical-leading:${typography.leading}" role="dialog" aria-modal="true" aria-labelledby="immersive-title">
      <button class="immersive-close" type="button" data-close-immersive aria-label="離開沉浸閱讀">${icon("close")}<span>離開沉浸</span></button>
      <div class="immersive-title"><p>${escapeHtml(poem.poet)} · ${escapeHtml(poem.dynasty)}</p><h2 id="immersive-title">${escapeHtml(poem.title)}</h2></div>
      <div class="immersive-lines" lang="zh-Hant">${poem.lines.map((line) => `<p>${poem.kind === "古文" ? renderProseText(line.text, proseJyutpingVisible, false) : escapeHtml(line.text)}</p>`).join("")}</div>
      <span class="immersive-seal" aria-hidden="true">讀</span>
    </section>`;
}

function renderOverlays() {
  return `${renderSearchOverlay()}${renderTermSheet()}${renderImmersive()}`;
}

function render() {
  const route = parseRoute();
  recordRouteVisit(route);
  app.innerHTML = renderShell(route);
  document.body.classList.toggle("modal-open", Boolean(ui.searchOpen || ui.selectedTerm || ui.immersivePoemId));
  afterRender(route);
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
        appStore.update((state) => setProgressInState(state, "reading", articleId, progress), false);
        document.querySelector("[data-reader-progress-copy]")?.replaceChildren(document.createTextNode(`${Math.round(progress)}%`));
        const bar = document.querySelector("[data-reader-progress-bar]");
        if (bar) bar.style.width = `${progress}%`;
      }, 120);
    });
  }

  if (route.page === "cantonese" && route.id) syncPlayerDom();

  const needsCantoneseLexicon = route.page === "cantonese" || (route.page === "poetry" && Boolean(route.id));
  if (needsCantoneseLexicon && cantoneseLexiconState.status === "idle") {
    loadCantoneseLexicon().then(() => render()).catch(() => render());
  }
}

function toggleFavorite(key) {
  const wasFavorite = appStore.getState().favorites.includes(key);
  appStore.replace(toggleFavoriteInState(appStore.getState(), key));
  announce(wasFavorite ? "已取消收藏" : "已加入收藏");
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

function togglePoetryLine(reference) {
  const separator = reference.lastIndexOf(":");
  const poemId = reference.slice(0, separator);
  const lineIndex = Number(reference.slice(separator + 1));
  const poem = poems.find((candidate) => candidate.id === poemId);
  const line = poem?.lines[lineIndex];
  if (!poem || !line) return;

  const id = poetryLineId(poem.id, lineIndex);
  const alreadySaved = appStore.getState().savedItems.some((item) => item.id === id);
  const itemType = poem.kind === "古文" ? "收藏古文段落" : poem.kind === "詞" ? "收藏詞句" : "收藏詩句";
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
    meaning: `${term.mandarin} · ${term.english}`,
    source,
    sourceUrl: term.sourceUrl || "",
    sourceLicense: term.sourceLicense || "",
    tags: term.dictionaryOnly ? ["粵典", "讀音"] : ["transcript"],
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
  appStore.update((state) => setProgressInState(state, "reading", articleId, progress), false);
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
  appStore.update((state) => setProgressInState(state, "playback", player.episodeId, player.currentTime), false);
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

function exportData() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), app: "Leafbound", data: appStore.getState() }, null, 2);
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

app.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton && !routeButton.disabled) {
    ui.searchOpen = false;
    ui.selectedTerm = null;
    ui.selectedEnglishItem = null;
    ui.selectedText = null;
    ui.classicalTypographyOpen = false;
    routeTo(routeButton.dataset.route, routeButton.dataset.routeId || null);
    return;
  }

  const favorite = event.target.closest("[data-toggle-favorite]");
  if (favorite) return toggleFavorite(favorite.dataset.toggleFavorite);

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
    appStore.update((state) => {
      state.preferences.classicalFont = "song";
      state.preferences.classicalFontScale = 1;
      state.preferences.classicalLineHeight = 1;
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
    render();
    return;
  }

  const cantoneseLevel = event.target.closest("[data-cantonese-level]");
  if (cantoneseLevel) {
    ui.cantoneseLevel = cantoneseLevel.dataset.cantoneseLevel;
    if (ui.sourceFilter !== "全部" && ui.sourceFilter !== "hbl") ui.sourceFilter = "hbl";
    render();
    return;
  }

  const englishSource = event.target.closest("[data-english-source]");
  if (englishSource) {
    ui.englishSourceFilter = englishSource.dataset.englishSource;
    if (englishSource.hasAttribute("data-english-category")) ui.englishCategory = englishSource.dataset.englishCategory;
    render();
    return;
  }
  const englishCategory = event.target.closest("[data-english-category]");
  if (englishCategory) {
    ui.englishCategory = englishCategory.dataset.englishCategory;
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
    ui.selectedTerm = term.dataset.term || term.dataset.dictionaryTerm;
    render();
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
    ui.selectedEnglishItem = lookupEnglishWord({
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
    appStore.update((state) => {
      state.preferences.englishFontScale = Math.max(0.84, Math.min(1.32, state.preferences.englishFontScale + Number(fontButton.dataset.readerFont)));
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

  const libraryFilter = event.target.closest("[data-library-filter]");
  if (libraryFilter) {
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
      ui.selectedEnglishItem = lookupEnglishWord({ word: text, articleId, paragraph, paragraphIndex, offset });
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
    } else return;
    render();
  }
});

window.addEventListener("hashchange", () => {
  const route = parseRoute();
  if (player.isPlaying && (route.page !== "cantonese" || route.id !== player.episodeId)) stopPlayback(false);
  ui.selectedEnglishItem = null;
  ui.selectedText = null;
  ui.notePanel = null;
  ui.classicalTypographyOpen = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
});

window.addEventListener("beforeunload", persistPlayerProgress);
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
