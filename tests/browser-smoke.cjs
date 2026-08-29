const fs = require("node:fs");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is required for the browser smoke check.");
  process.exit(1);
}

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || "artifacts");
const browserCandidates = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
fs.mkdirSync(artifactDir, { recursive: true });

async function readPersonalState(page) {
  await page.waitForTimeout(40);
  return page.evaluate(async () => {
    const local = JSON.parse(localStorage.getItem("leafbound.personal-library.v1") || "null");
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("leafbound-personal-v1", 1);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const record = await new Promise((resolve, reject) => {
      const transaction = database.transaction("personal-state", "readonly");
      const request = transaction.objectStore("personal-state").get("current");
      request.addEventListener("success", () => resolve(request.result || {}), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    database.close();
    return { ...record, preferences: local?.preferences || record.preferences || {} };
  });
}

async function markDailySelectionsSeen(page, selection) {
  await page.evaluate(async (values) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("leafbound-personal-v1", 1);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction("personal-state", "readwrite");
    const store = transaction.objectStore("personal-state");
    const state = await new Promise((resolve, reject) => {
      const request = store.get("current");
      request.addEventListener("success", () => resolve(request.result || {}), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    state.contentActivity ||= {};
    for (const [kind, id] of Object.entries(values)) {
      state.contentActivity[`${kind}:${id}`] = {
        maxProgress: 50,
        status: "seen",
        seenAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z"
      };
    }
    store.put(state, "current");
    await new Promise((resolve, reject) => {
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, selection);
}

async function revealAll(page, selector) {
  while (await page.locator(selector).count()) {
    await page.locator(selector).click();
  }
}

async function auditClassicalRuby(page, tokenSelector) {
  return page.locator(".poem-reading-column").evaluate((node, selector) => {
    const parallelSources = [...node.querySelectorAll(".classical-reading-source")];
    const sourceRoots = parallelSources.length
      ? parallelSources
      : [...node.querySelectorAll(".full-poem, .prose-work")];
    const sourceText = sourceRoots.map((root) => root.textContent || "").join("");
    const rubies = [...node.querySelectorAll(selector)];
    return {
      han: (sourceText.match(/\p{Script=Han}/gu) || []).length,
      rubies: rubies.length,
      allSingleHan: rubies.every((ruby) => /^\p{Script=Han}$/u.test(ruby.querySelector("span")?.textContent || "")),
      allAnnotated: rubies.every((ruby) => Boolean(ruby.querySelector("rt")?.textContent.trim())),
      allAnnotatedAbove: rubies.every((ruby) => {
        const base = ruby.querySelector("span")?.getBoundingClientRect();
        const annotation = ruby.querySelector("rt")?.getBoundingClientRect();
        return Boolean(base && annotation && annotation.top + annotation.height / 2 < base.top + base.height / 2);
      }),
      legacyTracks: node.querySelectorAll(".verse-jyutping, .prose-jyutping").length
    };
  }, tokenSelector);
}

const responsiveRoutes = [
  "#today",
  "#poetry",
  "#poetry/mountain-autumn",
  "#poetry/open-guwen-87c7a29cd59b3c40239e",
  "#language",
  "#cantonese",
  "#cantonese/city-rain",
  "#cantonese/spice-vf19b-written-code-switching",
  "#english",
  "#english/quiet-noticing",
  "#library"
];

async function auditViewport(browser, spec) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    hasTouch: spec.touch,
    isMobile: spec.touch,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });

  const overflows = {};
  let primaryMetrics = null;
  for (const route of responsiveRoutes) {
    await page.goto(`${baseUrl}/${route}`, { waitUntil: "networkidle" });
    overflows[route] = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));

    if (route === spec.route) {
      primaryMetrics = await page.evaluate(() => {
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        const navButtons = [...document.querySelectorAll(".bottom-nav button")]
          .filter((element) => element.getClientRects().length)
          .map((element) => element.getBoundingClientRect());
        const main = document.querySelector(".main-content")?.getBoundingClientRect();
        const targetSelector = [
          ".bottom-nav button",
          ".search-trigger",
          ".icon-button",
          ".quiet-button",
          ".secondary-button",
          ".primary-button",
          ".text-control",
          ".text-link",
          ".back-button",
          ".facet-tab",
          ".filter-chip",
          ".source-chip",
          ".clear-filter-link",
          ".english-source-reset",
          ".english-category-tabs button",
          ".library-tabs button",
          ".library-utility-row",
          ".settings-segmented button",
          ".settings-stepper button",
          ".settings-switch",
          ".mode-switch button",
          ".classical-reading-tabs button",
          ".classical-reading-unit",
          ".voice-edge-link",
          ".voice-settings-link",
          ".voice-refresh-button",
          ".reveal-line",
          ".poem-thread-mobile",
          ".reading-state-toggle"
        ].join(",");
        const targetHeights = [...document.querySelectorAll(targetSelector)]
          .filter((element) => element.getClientRects().length && !element.disabled)
          .map((element) => Math.round(element.getBoundingClientRect().height));
        return {
          navOrientation: nav?.height > nav?.width ? "vertical" : "horizontal",
          navRect: nav && {
            left: Math.round(nav.left),
            top: Math.round(nav.top),
            right: Math.round(innerWidth - nav.right),
            bottom: Math.round(innerHeight - nav.bottom),
            width: Math.round(nav.width),
            height: Math.round(nav.height)
          },
          navButtonCount: navButtons.length,
          navFullyVisible: navButtons.every((rect) => (
            rect.left >= -1
            && rect.top >= -1
            && rect.right <= innerWidth + 1
            && rect.bottom <= innerHeight + 1
          )),
          navClearsMain: !nav || !main || nav.height <= nav.width || nav.right <= main.left + 1,
          mainGutters: main && {
            left: Math.round(main.left),
            right: Math.round(innerWidth - main.right)
          },
          touchControlMinHeight: targetHeights.length ? Math.min(...targetHeights) : null
        };
      });
      await page.screenshot({
        path: path.join(artifactDir, `responsive-${spec.name}.png`),
        fullPage: false
      });
    }
  }

  await context.close();
  return {
    ...primaryMetrics,
    maxOverflow: Math.max(...Object.values(overflows)),
    overflows
  };
}

async function auditReadingStatus(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/#today`, { waitUntil: "networkidle" });
  const before = await page.locator(".today-view").evaluate((node) => ({
    poem: node.querySelector("[data-daily-poem]")?.dataset.dailyPoem,
    article: node.querySelector("[data-daily-article]")?.dataset.dailyArticle,
    episode: node.querySelector("[data-daily-episode]")?.dataset.dailyEpisode
  }));
  await markDailySelectionsSeen(page, before);
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.locator(".today-view").evaluate((node) => ({
    poem: node.querySelector("[data-daily-poem]")?.dataset.dailyPoem,
    article: node.querySelector("[data-daily-article]")?.dataset.dailyArticle,
    episode: node.querySelector("[data-daily-episode]")?.dataset.dailyEpisode
  }));

  await page.goto(`${baseUrl}/#english/quiet-noticing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  await page.locator("[data-reader-scroll]").evaluate((node) => {
    node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.62;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const article = (await readPersonalState(page)).contentActivity["article:quiet-noticing"];
  const articlePressed = await page.locator('[data-content-status-key="article:quiet-noticing"]').getAttribute("aria-pressed");
  await page.goto(`${baseUrl}/#english`, { waitUntil: "networkidle" });
  const articleRow = page.locator(".article-row", { has: page.locator('[data-route-id="quiet-noticing"]') });
  const articleMarked = await articleRow.locator(".article-status").textContent();
  await page.screenshot({ path: path.join(artifactDir, "reading-status-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifactDir, "reading-status-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/#english/quiet-noticing`, { waitUntil: "networkidle" });
  await page.locator('[data-content-status-key="article:quiet-noticing"]').click();
  const articleResetState = await readPersonalState(page);
  const articleReset = (articleResetState.contentActivity["article:quiet-noticing"]?.maxProgress || 0) < 50
    && articleResetState.readingProgress["quiet-noticing"] === 0;

  const proseId = "open-guwen-f6f950bb029e161d839c";
  await page.goto(`${baseUrl}/#poetry/${proseId}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-lexicon-status="ready"]');
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.72));
  await page.waitForTimeout(250);
  const poem = (await readPersonalState(page)).contentActivity[`poem:${proseId}`];
  const poemPressed = await page.locator(`[data-content-status-key="poem:${proseId}"]`).getAttribute("aria-pressed");
  await page.locator(`[data-content-status-key="poem:${proseId}"]`).click();
  const poemReset = ((await readPersonalState(page)).contentActivity[`poem:${proseId}`]?.maxProgress || 0) < 50;

  const episodeId = "hkcancor-m";
  await page.goto(`${baseUrl}/#cantonese/${episodeId}`, { waitUntil: "networkidle" });
  await page.locator("[data-player-seek]").evaluate((node) => {
    node.value = String(Number(node.max) * 0.62);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const episode = (await readPersonalState(page)).contentActivity["episode:hkcancor-m"];
  const episodePressed = await page.locator(`[data-content-status-key="episode:${episodeId}"]`).getAttribute("aria-pressed");
  await page.locator(`[data-content-status-key="episode:${episodeId}"]`).click();
  const episodeResetState = await readPersonalState(page);
  const episodeReset = (episodeResetState.contentActivity["episode:hkcancor-m"]?.maxProgress || 0) < 50
    && episodeResetState.playbackProgress["hkcancor-m"] === 0;

  await context.close();
  return {
    dailySkipped: before.poem !== after.poem && before.article !== after.article && before.episode !== after.episode,
    article: { status: article?.status, progress: article?.maxProgress, pressed: articlePressed, marked: articleMarked, reset: articleReset },
    poem: { status: poem?.status, progress: poem?.maxProgress, pressed: poemPressed, reset: poemReset },
    episode: { status: episode?.status, progress: episode?.maxProgress, pressed: episodePressed, reset: episodeReset }
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const rubies = [...document.querySelectorAll(".daily-poem .daily-quote-jyutping-token")];
    return rubies.length >= 1 && rubies.every((ruby) => ruby.querySelector("rt")?.textContent.trim().length > 0);
  }, undefined, { timeout: 10000 });
  const result = {
    title: await page.title(),
    navItems: await page.locator(".nav-item").count(),
    todayHeading: await page.locator("h1").first().textContent()
  };
  result.todayDaily = await page.locator(".today-view").evaluate((node) => ({
    key: node.dataset.dailyKey,
    poem: node.querySelector("[data-daily-poem]")?.dataset.dailyPoem,
    article: node.querySelector("[data-daily-article]")?.dataset.dailyArticle,
    episode: node.querySelector("[data-daily-episode]")?.dataset.dailyEpisode
  }));
  result.todayDailyStored = (await readPersonalState(page)).dailySelections?.[result.todayDaily.key] || null;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const rubies = [...document.querySelectorAll(".daily-poem .daily-quote-jyutping-token")];
    return rubies.length >= 1 && rubies.every((ruby) => ruby.querySelector("rt")?.textContent.trim().length > 0);
  }, undefined, { timeout: 10000 });
  result.todayDailyAfterReload = await page.locator(".today-view").evaluate((node) => ({
    poem: node.querySelector("[data-daily-poem]")?.dataset.dailyPoem,
    article: node.querySelector("[data-daily-article]")?.dataset.dailyArticle,
    episode: node.querySelector("[data-daily-episode]")?.dataset.dailyEpisode
  }));
  result.todayPoemFeature = await page.locator(".daily-poem").evaluate((node) => ({
    quote: node.querySelector("[data-daily-poem-quote]")?.getAttribute("aria-label") || "",
    title: node.querySelector("[data-daily-poem-title]")?.textContent.trim() || "",
    quoteElements: node.querySelectorAll("[data-daily-poem-quote]").length,
    han: (node.querySelector("[data-daily-poem-quote]")?.getAttribute("aria-label")?.match(/\p{Script=Han}/gu) || []).length,
    rubies: node.querySelectorAll(".daily-quote-jyutping-token").length,
    legacyJyutpingTracks: node.querySelectorAll(".featured-quote-pronunciation").length,
    allAnnotatedAbove: [...node.querySelectorAll(".daily-quote-jyutping-token")].every((ruby) => {
      const base = ruby.querySelector("span")?.getBoundingClientRect();
      const annotation = ruby.querySelector("rt")?.getBoundingClientRect();
      return Boolean(base && annotation && annotation.top + annotation.height / 2 < base.top + base.height / 2);
    })
  }));
  result.todayShelfHeading = await page.locator(".shelf-heading .eyebrow").textContent();
  result.todayShelfCopy = await page.locator(".shelf-heading p").last().textContent();
  await page.screenshot({ path: path.join(artifactDir, "home-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "詩詞", exact: true }).click();
  result.poems = await page.locator(".poem-row").count();
  result.poetryTotal = await page.locator(".result-heading span").first().textContent();
  result.poetryKinds = await page.locator("[data-poetry-kind]").count();
  result.poetrySourceNoticeCount = await page.locator(".open-corpus-note").count();
  result.firstPoemQuote = await page.locator(".poem-row-quote").first().textContent();
  result.firstPoemTitle = await page.locator(".poem-row-work-title").first().textContent();
  await page.screenshot({ path: path.join(artifactDir, "poetry-list-desktop.png"), fullPage: true });
  await page.locator("[data-load-more-poetry]").click();
  result.expandedPoems = await page.locator(".poem-row").count();

  result.kindTotals = {};
  for (const kind of ["詩", "詞", "曲", "古文"]) {
    await page.locator(`[data-poetry-kind="${kind}"]`).click();
    result.kindTotals[kind] = await page.locator(".result-heading span").first().textContent();
  }
  await page.locator('[data-poetry-kind="詞"]').click();
  result.ciFacetLabels = await page.locator(".facet-tab").allTextContents();
  await page.getByRole("tab", { name: "按詞牌" }).click();
  result.ciTuneChipLabels = await page.locator(".filter-chips .filter-chip").evaluateAll((chips) => (
    chips.slice(0, 5).map((chip) => chip.textContent.trim())
  ));
  result.ciGenericTuneChips = await page.locator(".filter-chips .filter-chip").filter({ hasText: /^詞$/ }).count();
  await page.locator(".filter-chips").getByRole("button", { name: "浣溪沙", exact: true }).click();
  result.ciTuneFilterLabel = await page.locator(".active-filter-list small").textContent();
  result.ciTuneFilterTotal = await page.locator(".result-heading span").first().textContent();
  await page.screenshot({ path: path.join(artifactDir, "poetry-ci-taxonomy-desktop.png"), fullPage: true });
  await page.locator('[data-poetry-kind="古文"]').click();
  await page.locator("[data-poetry-search]").fill("鄭伯克段於鄢");
  result.guwenSearchCount = await page.locator(".poem-row").count();
  await page.locator(".poem-row").filter({ hasText: "《鄭伯克段於鄢》" }).first().locator(".poem-row-main").click();
  await page.waitForSelector('[data-lexicon-status="ready"]');
  result.guwenTitle = await page.locator(".poem-title-block h1").textContent();
  result.guwenParagraphs = await page.locator(".prose-paragraph").count();
  result.guwenSource = await page.locator(".poem-source-card").textContent();
  result.guwenJyutpingToggle = await page.locator("[data-toggle-jyutping]").count();
  result.guwenJyutpingTokens = await page.locator(".prose-jyutping-token rt").count();
  result.guwenRubyAudit = await auditClassicalRuby(page, ".prose-jyutping-token");
  result.guwenRareJyutping = await page.locator('[data-dictionary-term="寤"] rt').first().textContent();
  await page.locator('[data-dictionary-term="寤"]').first().click();
  result.guwenRareSource = await page.locator(".word-sheet-source").textContent();
  await page.locator(".sheet-close").click();
  result.guwenTypographyToggle = await page.locator("[data-toggle-classical-typography]").count();
  result.guwenTypographyBefore = await page.locator(".prose-paragraph p").first().evaluate((node) => ({
    fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight)
  }));
  await page.getByRole("button", { name: "打開閱讀排版" }).click();
  result.guwenTypographyPanel = await page.locator("#classical-typography-panel").isVisible();
  result.guwenTypographyControls = {
    fonts: await page.locator("[data-classical-font]").count(),
    sizes: await page.locator("[data-classical-size], [data-classical-size-reset]").count(),
    leading: await page.locator("[data-classical-leading]").count()
  };
  await page.locator('[data-classical-font="kai"]').click();
  await page.locator('[data-classical-size="0.08"]').click();
  await page.locator('[data-classical-leading="1.16"]').click();
  result.guwenTypographyAfter = await page.locator(".prose-paragraph p").first().evaluate((node) => ({
    fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    usesKaiClass: Boolean(node.closest(".classical-font-kai"))
  }));
  const guwenTypographyState = await readPersonalState(page);
  result.guwenTypographySaved = {
    font: guwenTypographyState.preferences.classicalFont,
    scale: guwenTypographyState.preferences.classicalFontScale,
    leading: guwenTypographyState.preferences.classicalLineHeight
  };
  await page.screenshot({ path: path.join(artifactDir, "guwen-typography-desktop.png"), fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-lexicon-status="ready"]');
  result.guwenTypographyPersisted = await page.locator(".poem-reader").evaluate((node) => ({
    usesKaiClass: node.classList.contains("classical-font-kai"),
    scale: node.style.getPropertyValue("--classical-scale"),
    leading: node.style.getPropertyValue("--classical-leading")
  }));
  await page.getByRole("button", { name: "進入沉浸閱讀" }).click();
  result.guwenTypographyImmersive = await page.locator(".immersive-reader").evaluate((node) => ({
    usesKaiClass: node.classList.contains("classical-font-kai"),
    scale: node.style.getPropertyValue("--classical-scale"),
    leading: node.style.getPropertyValue("--classical-leading")
  }));
  await page.getByRole("button", { name: "離開沉浸閱讀" }).click();
  await page.getByRole("button", { name: "打開閱讀排版" }).click();
  await page.locator("[data-classical-typography-reset]").click();
  result.guwenTypographyReset = await page.locator(".poem-reader").evaluate((node) => ({
    usesSongClass: node.classList.contains("classical-font-song"),
    scale: node.style.getPropertyValue("--classical-scale"),
    leading: node.style.getPropertyValue("--classical-leading")
  }));
  await page.getByRole("button", { name: "關閉閱讀排版" }).click();
  await page.locator("[data-toggle-jyutping]").click();
  result.guwenJyutpingAfterHide = await page.locator(".prose-jyutping-token rt").count();
  await page.locator("[data-toggle-jyutping]").click();
  result.guwenDictionaryTerms = await page.locator(".prose-work .poem-term-button").count();
  result.guwenThreadLabel = await page.locator(".poem-thread-trigger span").textContent();
  await page.locator(".prose-save").first().click();
  result.savedGuwenParagraph = await page.locator(".prose-save").first().getAttribute("aria-pressed");
  await page.getByRole("button", { name: "進入沉浸閱讀" }).click();
  result.guwenImmersive = await page.locator(".immersive-reader.is-prose").isVisible();
  result.guwenImmersiveJyutping = await page.locator(".immersive-reader.is-prose .prose-jyutping-token rt").count();
  await page.getByRole("button", { name: "離開沉浸閱讀" }).click();
  await page.screenshot({ path: path.join(artifactDir, "guwen-reader-desktop.png"), fullPage: true });

  await page.locator('.back-button[data-route="poetry"]').click();
  await page.locator('[data-poetry-kind="詩"]').click();
  await page.getByRole("button", { name: "唐", exact: true }).click();
  await page.getByRole("tab", { name: "按作者" }).click();
  await page.getByRole("button", { name: "王維", exact: true }).click();
  result.combinedFilterCount = await page.locator(".poem-row").count();
  result.activeFilterCount = await page.locator(".active-filter-list button").count();
  await page.locator(".poem-row-main").first().click();
  result.poemTitle = await page.locator(".poem-title-block h1").textContent();
  await page.locator(".poem-thread-trigger").click();
  result.poemThreadVisible = await page.locator(".poem-thread-panel").isVisible();
  result.relatedPoems = await page.locator(".related-reading > button").count();
  await page.locator("[data-save-poetry-line]").first().click();
  result.savedPoetryLine = await page.locator("[data-save-poetry-line]").first().getAttribute("aria-pressed");
  await page.locator('.poem-thread-panel [data-poetry-link-value="山水"]').click();
  result.relationshipFilterCount = await page.locator(".active-filter-list button").count();
  await page.screenshot({ path: path.join(artifactDir, "poetry-filter-desktop.png"), fullPage: true });
  await page.locator(".poem-row-main").first().click();
  await page.locator(".poem-thread-trigger").click();
  await page.screenshot({ path: path.join(artifactDir, "poem-reader-desktop.png"), fullPage: true });
  result.poemRubyAudit = await auditClassicalRuby(page, ".verse-jyutping-token");
  const jyutpingBefore = await page.locator(".verse-jyutping-token rt").count();
  await page.locator("[data-toggle-jyutping]").click();
  result.jyutpingToggle = [jyutpingBefore, await page.locator(".verse-jyutping-token rt").count()];
  await page.locator("[data-toggle-jyutping]").click();
  await page.getByRole("button", { name: "打開筆記" }).click();
  await page.locator("[data-note-input]").fill("雨後的清氣，讓畫面有了聲音。");
  await page.getByRole("button", { name: "保存筆記" }).click();
  result.noteSaved = await page.locator("[data-note-input]").inputValue();
  await page.getByRole("button", { name: /收藏山居秋暝|取消收藏山居秋暝/ }).click();
  await page.getByRole("button", { name: "進入沉浸閱讀" }).click();
  result.immersive = await page.locator(".immersive-reader").isVisible();
  result.immersivePoemRubyTokens = await page.locator(".immersive-reader .verse-jyutping-token rt").count();
  await page.getByRole("button", { name: "離開沉浸閱讀" }).click();

  await page.locator('.back-button[data-route="poetry"]').click();
  await page.locator("[data-clear-poetry]").first().click();
  await page.locator("[data-poetry-search]").fill("登幽州臺歌");
  result.openPoemSearchCount = await page.locator(".poem-row").count();
  await page.locator(".poem-row-main").first().click();
  await page.waitForSelector('[data-lexicon-status="ready"]');
  result.openPoemSource = await page.locator(".poem-source-card").textContent();
  result.openPoemDetails = await page.locator(".reader-detail").count();
  result.openPoemTranslationStatus = await page.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.openPoemOriginalModeSelected = await page.locator('[data-classical-reading-mode="original"]').getAttribute("aria-selected");
  result.openPoemDictionaryTerms = await page.locator(".poem-term-button").count();
  result.openPoemAutoJyutpingLines = await page.locator('[data-verse-jyutping="auto"]').count();
  result.openPoemFirstJyutping = (await page.locator('[data-verse-jyutping="auto"]').first().locator("rt").allTextContents()).join(" ");
  result.openPoemRubyAudit = await auditClassicalRuby(page, ".verse-jyutping-token");
  result.openPoemJyutpingCoverage = await page.locator(".pronunciation-note strong").textContent();
  await page.screenshot({ path: path.join(artifactDir, "poem-open-corpus-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "隱藏粵拼" }).click();
  result.openPoemJyutpingHidden = await page.locator("[data-verse-jyutping]").count();
  await page.getByRole("button", { name: "顯示粵拼" }).click();
  result.openPoemJyutpingRestored = await page.locator('[data-verse-jyutping="auto"]').count();
  await page.locator(".poem-term-button").first().click();
  result.openPoemTermPronunciation = await page.locator(".term-jyutping").textContent();
  result.openPoemTermSourceLink = await page.locator(".word-sheet-source a").count();
  await page.screenshot({ path: path.join(artifactDir, "poem-word-sheet-desktop.png"), fullPage: true });
  await page.locator(".sheet-close").click();
  await page.goto(`${baseUrl}/#poetry/open-song-ci-02b68e8ec18766c3eb55`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-lexicon-status="ready"]');
  result.moeDefinitionTermCount = await page.locator('[data-dictionary-term="闌干"]').count();
  await page.locator('[data-dictionary-term="闌干"]').first().click();
  await page.waitForSelector(".definition-source");
  result.moeDefinitionText = await page.locator(".term-definition-list").textContent();
  result.moeDefinitionLabels = await page.locator(".word-sheet dt").allTextContents();
  result.moeDefinitionPronunciation = await page.locator(".term-jyutping").textContent();
  result.moeDefinitionSource = await page.locator(".definition-source").textContent();
  result.moeDefinitionEnglishRows = await page.locator(".word-sheet dt", { hasText: "English" }).count();
  await page.screenshot({ path: path.join(artifactDir, "poem-word-sheet-chinese-definition-desktop.png") });
  await page.locator(".sheet-close").click();
  await page.goto(`${baseUrl}/#poetry/open-yuanqu-94a25e7d597cece17e04`, { waitUntil: "networkidle" });
  await page.waitForSelector(".verse-jyutping-token rt");
  result.yuanquRubyAudit = await auditClassicalRuby(page, ".verse-jyutping-token");
  result.yuanquOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(artifactDir, "yuanqu-inline-jyutping-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#poetry/open-yuanqu-9493c1fa7adc30eea82a`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-translation-review-status="reviewed"]');
  await page.waitForSelector(".classical-reading-translation");
  result.requestedYuanquTranslationStatus = await page.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.requestedYuanquTranslationReview = await page.locator("[data-translation-review-status]").textContent();
  result.requestedYuanquTranslationUnits = await page.locator(".classical-reading-unit").count();
  result.requestedYuanquTranslationAlignment = await page.locator(".classical-reading-unit").first().getAttribute("data-classical-alignment");
  result.requestedYuanquTranslationParagraphs = await page.locator(".classical-reading-translation > p:not(.classical-reading-alignment-note)").count();
  result.requestedYuanquTranslationText = await page.locator(".classical-reading-translation").textContent();
  result.requestedYuanquLegacyTranslationPanels = await page.locator(".reader-detail.is-translation").count();
  result.requestedYuanquTranslationOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(artifactDir, "yuanqu-modern-translation-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#poetry/open-yuanqu-00055d04559d354ff34c`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-translation-review-status="pending-review"]', { timeout: 5000 });
  await page.waitForSelector(".classical-reading-translation");
  result.generatedYuanquTranslationStatus = await page.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.generatedYuanquTranslationReview = await page.locator("[data-translation-review-status]").textContent();
  result.generatedYuanquTranslationParagraphs = await page.locator(".classical-reading-translation > p:not(.classical-reading-alignment-note)").count();
  result.generatedYuanquTranslationAlignmentNotes = await page.locator(".classical-reading-alignment-note").count();
  result.generatedYuanquLegacyTranslationPanels = await page.locator(".reader-detail.is-translation").count();
  result.generatedYuanquTranslationOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(artifactDir, "yuanqu-ai-translation-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#poetry/open-guwen-87c7a29cd59b3c40239e`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-translation-review-status="reviewed"]');
  await page.waitForSelector(".classical-reading-translation");
  result.guwenTranslationStatus = await page.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.guwenTranslationReview = await page.locator("[data-translation-review-status]").textContent();
  result.guwenTranslationUnits = await page.locator(".classical-reading-unit").count();
  result.guwenTranslationParagraphs = await page.locator(".classical-reading-translation > p:not(.classical-reading-alignment-note)").count();
  result.guwenTranslationAlignmentNotes = await page.locator(".classical-reading-alignment-note").count();
  result.guwenTranslationText = await page.locator(".classical-reading-flow").textContent();
  result.guwenLegacyTranslationPanels = await page.locator(".reader-detail.is-translation").count();
  const firstReadingUnit = page.locator("[data-classical-reading-unit]").first();
  await firstReadingUnit.focus();
  await firstReadingUnit.press("Enter");
  result.guwenFocusedReadingUnits = await page.locator("[data-classical-reading-unit].is-focused").count();
  result.guwenMutedReadingUnits = await page.locator("[data-classical-reading-unit].is-muted").count();
  await firstReadingUnit.press("Enter");
  result.guwenClearedReadingFocus = await page.locator("[data-classical-reading-unit].is-focused, [data-classical-reading-unit].is-muted").count();
  await page.locator('[data-classical-reading-mode="translation"]').click();
  await page.waitForSelector(".classical-translation-only");
  result.guwenTranslationModeParagraphs = await page.locator(".classical-translation-only > p").count();
  result.guwenTranslationModeSourceBodies = await page.locator(".classical-translation-only .prose-work, .classical-translation-only .full-poem").count();
  result.guwenStoredReadingMode = (await readPersonalState(page)).preferences.classicalReadingMode;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-classical-reading-mode="translation"][aria-selected="true"]');
  result.guwenReadingModePersisted = await page.locator('[data-classical-reading-mode="translation"]').getAttribute("aria-selected");
  await page.locator('[data-classical-reading-mode="original"]').click();
  result.guwenOriginalModeSourceBodies = await page.locator(".prose-work, .full-poem").count();
  result.guwenOriginalModeTranslations = await page.locator(".classical-reading-translation, .classical-translation-only").count();
  await page.locator('[data-classical-reading-mode="parallel"]').click();
  await page.waitForSelector(".classical-reading-unit");
  result.guwenParallelModeSelected = await page.locator('[data-classical-reading-mode="parallel"]').getAttribute("aria-selected");
  result.guwenTranslationOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(artifactDir, "guwen-modern-translation-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("button", { name: "進入粵語", exact: true }).click();
  result.cantoneseLexiconNoticeCount = await page.locator(".cantonese-lexicon-note").count();
  result.cantoneseSources = await page.locator(".cantonese-source-card").count();
  result.cantoneseLevels = await page.locator("[data-cantonese-level]").count();
  result.cantoneseLevelLabels = await page.locator(".cantonese-level-ladder strong").allTextContents();
  result.cantoneseLevelRanges = await page.locator(".cantonese-level-ladder span").allTextContents();
  result.cantoneseLevelNote = await page.locator(".cantonese-level-note").textContent();
  result.cantoneseInitialRows = await page.locator(".episode-row").count();
  result.cantoneseLoadMoreControl = await page.locator("[data-load-more-cantonese]").count();
  await page.screenshot({ path: path.join(artifactDir, "cantonese-index-desktop.png"), fullPage: true });
  await page.locator("[data-load-more-cantonese]").click();
  result.cantoneseExpandedRows = await page.locator(".episode-row").count();
  result.cantoneseSessionLimit = await page.evaluate(() => JSON.parse(sessionStorage.getItem("leafbound.collection-view.v1")).routes.cantonese.limit);
  await revealAll(page, "[data-load-more-cantonese]");
  result.cantoneseLearningMarks = await page.locator(".episode-row.is-hbl .episode-art b").evaluateAll((nodes) => [...new Set(nodes.map((node) => node.textContent))]);
  result.cantoneseSourceLevelRows = await page.locator(".episode-row.is-hbl .episode-copy small", { hasText: "原站 HBL L" }).count();
  result.cantoneseShelfText = await page.locator(".cantonese-source-shelf").textContent();
  result.episodes = await page.locator(".episode-row").count();
  await page.locator('[data-cantonese-level="start"]').click();
  await revealAll(page, "[data-load-more-cantonese]");
  result.cantoneseStartEpisodes = await page.locator(".episode-row").count();
  await page.locator('[data-cantonese-level="daily"]').click();
  await revealAll(page, "[data-load-more-cantonese]");
  result.cantoneseDailyEpisodes = await page.locator(".episode-row").count();
  await page.locator('[data-cantonese-level="advance"]').click();
  await revealAll(page, "[data-load-more-cantonese]");
  result.cantoneseAdvanceEpisodes = await page.locator(".episode-row").count();
  await page.locator('[data-cantonese-level="全部"]').click();
  await page.locator('[data-source-filter="全部"]').click();
  await page.goto(`${baseUrl}/#cantonese/hkcancor-d1`, { waitUntil: "networkidle" });
  result.cantoneseInterviewScope = await page.locator(".transcript-scope-note").textContent();
  result.cantoneseInterviewRoles = await page.locator(".transcript-speaker small").allTextContents();
  result.cantoneseInterviewSpeakers = await page.locator(".transcript-speaker strong").allTextContents();
  result.cantoneseInterviewQuestionMarks = await page.locator(".is-speaker-question .transcript-speaker > span", { hasText: "問" }).count();
  result.cantoneseInterviewAnswerMarks = await page.locator(".is-speaker-answer .transcript-speaker > span", { hasText: "答" }).count();
  await page.waitForFunction(() => document.querySelector("[data-cantonese-voice-status]")?.dataset.cantoneseVoiceStatus !== "checking", undefined, { timeout: 3500 });
  result.cantoneseVoiceStatus = await page.locator("[data-cantonese-voice-status]").first().getAttribute("data-cantonese-voice-status");
  result.cantoneseAudioKind = await page.locator("[data-cantonese-audio-kind]").getAttribute("data-cantonese-audio-kind");
  result.playbackAdvanced = false;
  result.fallbackBlocked = false;
  if (result.cantoneseAudioKind === "local") {
    const timeBefore = await page.locator("[data-player-time]").textContent();
    await page.getByRole("button", { name: "播放真人粵語原聲" }).click();
    await page.waitForFunction((before) => document.querySelector("[data-player-time]")?.textContent !== before, timeBefore, { timeout: 7000 });
    const timeAfter = await page.locator("[data-player-time]").textContent();
    await page.getByRole("button", { name: "暫停" }).click();
    result.playbackAdvanced = timeBefore !== timeAfter;
  } else if (result.cantoneseVoiceStatus === "available") {
    const timeBefore = await page.locator("[data-player-time]").textContent();
    await page.getByRole("button", { name: "播放粵語合成朗讀" }).click();
    await page.waitForTimeout(1200);
    const timeAfter = await page.locator("[data-player-time]").textContent();
    await page.getByRole("button", { name: "暫停" }).click();
    result.playbackAdvanced = timeBefore !== timeAfter;
  } else {
    result.fallbackBlocked = await page.locator("[data-toggle-playback]").count() === 0;
  }
  await page.getByRole("button", { name: "按需" }).click();
  result.hiddenTranscriptLines = await page.locator(".reveal-line").count();
  await page.getByRole("button", { name: "全文" }).click();
  await page.screenshot({ path: path.join(artifactDir, "cantonese-player-desktop.png"), fullPage: true });
  result.dynamicTranscriptTerms = await page.locator("[data-dictionary-term]").count();
  await page.locator("[data-dictionary-term]").first().click();
  result.dynamicTermSourceLink = await page.locator(".word-sheet-source a").count();
  await page.screenshot({ path: path.join(artifactDir, "cantonese-word-sheet-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "加入粵語詞庫" }).click();
  await page.goto(`${baseUrl}/#cantonese/spice-vf19b-written-code-switching`, { waitUntil: "networkidle" });
  result.spiceInterviewScope = await page.locator(".transcript-scope-note").textContent();
  result.spiceInterviewRoles = await page.locator(".transcript-speaker small").allTextContents();
  result.spiceInterviewSpeakers = await page.locator(".transcript-speaker strong").allTextContents();
  result.spiceSourceReferenceCount = await page.locator(".source-recording-reference").count();
  result.spiceSourceReferenceText = await page.locator(".source-recording-reference").textContent();
  result.spiceSourceReferenceLink = await page.locator(".source-recording-reference a").getAttribute("href");
  result.spiceAudioKind = await page.locator("[data-cantonese-audio-kind]").getAttribute("data-cantonese-audio-kind");
  result.spiceInterviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(artifactDir, "cantonese-spice-interview-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#cantonese/hbl-flowers-of-one-garden`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-segment-jyutping="auto"]');
  result.hblJyutpingLines = await page.locator('[data-segment-jyutping="auto"]').count();
  result.hblFirstJyutping = await page.locator('[data-segment-jyutping="auto"]').first().textContent();
  result.hblRubyTokens = await page.locator('[data-transcript-ruby="auto"] rt').count();
  result.hblLegacyJyutpingTracks = await page.locator(".segment-jyutping").count();
  result.hblRubyOverBase = await page.locator('[data-transcript-ruby="auto"]').first().evaluate((ruby) => {
    const base = ruby.querySelector("span")?.getBoundingClientRect();
    const annotation = ruby.querySelector("rt")?.getBoundingClientRect();
    return Boolean(base && annotation && annotation.top + annotation.height / 2 < base.top + base.height / 2);
  });
  result.hblJyutpingNote = await page.locator(".transcript-pronunciation-note").textContent();
  await page.getByRole("button", { name: "隱藏逐字稿粵拼" }).click();
  result.hblJyutpingHidden = await page.locator("[data-segment-jyutping]").count();
  await page.getByRole("button", { name: "顯示逐字稿粵拼" }).click();
  result.hblJyutpingRestored = await page.locator('[data-segment-jyutping="auto"]').count();
  await page.screenshot({ path: path.join(artifactDir, "cantonese-hbl-jyutping-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#cantonese/hbl-the-treasure-of-varsha`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-transcript-ruby="auto"] rt');
  result.longHblRubyTokens = await page.locator('[data-transcript-ruby="auto"] rt').count();
  result.longHblLegacyJyutpingTracks = await page.locator(".segment-jyutping").count();
  await page.screenshot({ path: path.join(artifactDir, "cantonese-treasure-inline-jyutping-desktop.png"), fullPage: true });
  await page.goto(`${baseUrl}/#cantonese/city-rain`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "全文" }).click();
  await page.locator("[data-term]").first().click();
  await page.getByRole("button", { name: "加入粵語詞庫" }).click();

  await page.getByRole("button", { name: "Language", exact: true }).click();
  result.languageHubPortals = await page.locator(".language-portal").count();
  result.languageHubCurrentNav = (await page.locator('.nav-item[aria-current="page"]').textContent()).trim();
  await page.screenshot({ path: path.join(artifactDir, "language-hub-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Open English", exact: true }).click();
  result.englishMethodNoteCount = await page.locator(".english-method-note").count();
  result.englishInitialRows = await page.locator(".article-row").count();
  result.englishLoadMoreControl = await page.locator("[data-load-more-english]").count();
  await page.locator("[data-load-more-english]").click();
  result.englishExpandedRows = await page.locator(".article-row").count();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(250);
  result.englishScrollBeforeReload = await page.evaluate(() => window.scrollY);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  result.englishRowsAfterReload = await page.locator(".article-row").count();
  result.englishScrollAfterReload = await page.evaluate(() => window.scrollY);
  result.englishSessionView = await page.evaluate(() => JSON.parse(sessionStorage.getItem("leafbound.collection-view.v1")).routes.english);
  result.englishSources = await page.locator("[data-english-source]:not(.english-source-reset)").count();
  result.englishNewsDesks = await page.locator(".english-news-desk").count();
  result.englishNewsDeskNames = (await page.locator(".english-news-desk strong").allTextContents()).join("|");
  result.englishNewsDeskTargets = await page.locator('.english-news-desk[target="_blank"]').count();
  result.englishNewsBoundary = await page.locator(".english-news-disclaimer").textContent();
  result.englishIndexHanText = await page.locator(".app-shell").evaluate((node) => (node.innerText.match(/[\u3400-\u9fff]/gu) || []).join(""));
  result.englishCategories = await page.locator("[data-english-category]").count();
  await revealAll(page, "[data-load-more-english]");
  result.englishImportedRows = await page.locator('.article-row.is-internal:not([data-english-source-row="local"])').count();
  result.englishExternalRows = await page.locator(".article-row.is-external").count();
  result.englishExternalTargets = await page.locator('.article-row.is-external a[target="_blank"]').count();
  await page.locator('[data-english-source="nasa"]').click();
  result.englishNasaRows = await page.locator(".article-row").count();
  await page.locator('.article-row.is-internal .article-main').first().click();
  result.importedEnglishParagraphs = await page.locator(".article-body p").count();
  result.importedEnglishSourceNote = await page.locator(".article-source-note").textContent();
  result.importedEnglishSourceLink = await page.locator('.article-source-note a[target="_blank"]').count();
  result.importedEnglishHanText = await page.locator(".app-shell").evaluate((node) => (node.innerText.match(/[\u3400-\u9fff]/gu) || []).join(""));
  await page.screenshot({ path: path.join(artifactDir, "english-imported-reader-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Language", exact: true }).first().click();
  await page.getByRole("button", { name: "Open English", exact: true }).click();
  await page.locator('[data-english-source="standard-ebooks"]').click();
  result.englishStandardRows = await page.locator(".article-row").count();
  await page.locator('[data-english-source="global-voices"]').click();
  result.englishGlobalVoicesRows = await page.locator(".article-row").count();
  await page.locator('[data-english-source="全部"]').click();
  await page.locator('[data-english-category="語言"]').click();
  result.englishLanguageRows = await page.locator(".article-row").count();
  await page.locator('[data-english-category="全部"]').click();
  await page.screenshot({ path: path.join(artifactDir, "english-index-desktop.png"), fullPage: true });
  await page.locator('[data-english-source-row="local"] .article-main').first().click();
  await page.screenshot({ path: path.join(artifactDir, "english-reader-empty-desktop.png"), fullPage: true });
  result.englishReaderHanText = await page.locator(".app-shell").evaluate((node) => (node.innerText.match(/[\u3400-\u9fff]/gu) || []).join(""));
  await page.locator('[data-english-word="headline"]').click();
  result.englishHeadlineUses = (await page.locator(".lookup-common-uses li").allTextContents()).join(" · ");
  result.englishOriginalSentenceSections = await page.locator(".lookup-context").count();
  await page.getByRole("button", { name: "Night" }).click();
  await page.waitForSelector(".article-reader.is-dark");
  await page.locator('[data-english-word="headline"]').click();
  result.englishNightSurfaces = await page.evaluate(() => {
    const alphaOf = (value) => {
      if (!value || value === "transparent") return 0;
      if (!value.startsWith("rgba")) return 1;
      const parts = value.match(/[\d.]+/g) || [];
      return Number(parts[3] ?? 1);
    };
    const surface = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return { background: style.backgroundColor, alpha: alphaOf(style.backgroundColor) };
    };
    return {
      reader: surface(".article-reader"),
      lookup: surface(".english-lookup-card"),
      topbar: surface(".topbar"),
      navigation: surface(".bottom-nav"),
      lookupBackdrop: getComputedStyle(document.querySelector(".english-lookup-card")).backdropFilter
    };
  });
  await page.screenshot({ path: path.join(artifactDir, "english-reader-night-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Open note" }).click();
  await page.waitForSelector(".article-note-panel");
  result.englishNightSurfaces.note = await page.locator(".article-note-panel").evaluate((node) => {
    const value = getComputedStyle(node).backgroundColor;
    const parts = value.startsWith("rgba") ? value.match(/[\d.]+/g) || [] : [];
    return { background: value, alpha: value === "transparent" ? 0 : value.startsWith("rgba") ? Number(parts[3] ?? 1) : 1 };
  });
  await page.screenshot({ path: path.join(artifactDir, "english-reader-night-note-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Close note" }).click();
  await page.getByRole("button", { name: "Night" }).click();
  await page.waitForSelector(".article-reader:not(.is-dark)");
  await page.locator('[data-english-word="imperceptibly"]').click();
  result.englishLookupMeaning = await page.locator(".lookup-meaning p").textContent();
  result.englishCommonUses = (await page.locator(".lookup-common-uses li").allTextContents()).join(" · ");
  result.englishPronunciationControl = await page.locator('[data-speak-english="term"]').count();
  await page.screenshot({ path: path.join(artifactDir, "english-reader-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Add to vocabulary" }).click();
  result.savedEnglishWordMarked = await page.locator('[data-english-word="imperceptibly"]').getAttribute("class");
  await page.locator(".phrase-mark").first().click();
  await page.getByRole("button", { name: "Add to vocabulary" }).click();

  await page.goto(`${baseUrl}/#english/phrases-carry`, { waitUntil: "networkidle" });
  await page.locator('[data-english-word="encounters"]').click();
  result.englishOpenDictionaryMeaning = await page.locator(".lookup-meaning p").textContent();
  result.englishOpenDictionaryMeta = await page.locator(".lookup-meta").textContent();
  result.englishOpenDictionaryUses = (await page.locator(".lookup-common-uses li").allTextContents()).join(" · ");
  result.englishOpenDictionaryDefinition = await page.locator(".lookup-definition p").textContent();
  result.englishOpenDictionaryExamples = (await page.locator(".lookup-examples li").allTextContents()).join(" · ");
  result.englishOpenDictionaryExampleCount = await page.locator(".lookup-examples li").count();
  result.englishLegacySenseDisclosure = await page.locator(".lookup-dictionary-senses").count();
  await page.screenshot({ path: path.join(artifactDir, "english-open-dictionary-desktop.png"), fullPage: true });

  await page.goto(`${baseUrl}/#english/upper-deck`, { waitUntil: "networkidle" });
  await page.locator('[data-english-word="gives"]').click();
  result.englishGivesMeaning = await page.locator('[data-lookup-section="chinese"] p').textContent();
  result.englishGivesDefinition = await page.locator('[data-lookup-section="english"] p').textContent();
  result.englishGivesUses = (await page.locator('[data-lookup-section="usage"] li').allTextContents()).join(" · ");
  result.englishGivesPronunciation = await page.locator("[data-lookup-pronunciation]").textContent();
  result.englishGivesMeta = await page.locator(".lookup-meta").textContent();
  result.englishGivesExamples = (await page.locator('[data-lookup-section="examples"] li').allTextContents()).join(" · ");
  result.englishGivesSectionOrder = await page.locator("[data-lookup-section]").evaluateAll((nodes) => nodes.map((node) => node.dataset.lookupSection));
  result.englishGivesLegacyExampleLabels = await page.getByText("詞典例句", { exact: true }).count();
  await page.screenshot({ path: path.join(artifactDir, "english-gives-lookup-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Library", exact: true }).click();
  result.libraryItems = await page.locator(".library-item").count();
  result.libraryDashboard = {
    nextCards: await page.locator(".library-next-card").count(),
    weekDays: await page.locator(".library-week .library-day").count(),
    quests: await page.locator(".library-quest").count(),
    shelves: await page.locator(".library-shelf").count(),
    progress: await page.locator(".library-next-progress").getAttribute("aria-valuenow"),
    streak: await page.locator(".library-streak-seal strong").textContent()
  };
  result.libraryLanguageListCount = await page.locator(".language-list").count();
  result.savedPoetryQuotes = await page.locator(".library-item", { hasText: "空山新雨後" }).count();
  result.libraryContentTabs = await page.locator('.library-tabs [role="tab"]').count();
  result.libraryAboutTabCount = await page.getByRole("tab", { name: "關於" }).count();
  result.libraryUtilityRows = await page.locator(".library-utility-row").count();
  await page.screenshot({ path: path.join(artifactDir, "library-desktop.png"), fullPage: true });
  await page.locator('[data-library-panel="about"]').click();
  result.aboutVisible = await page.locator(".about-panel").isVisible();
  result.aboutSourceText = await page.locator(".about-panel").textContent();
  result.aboutSourceLinks = await page.locator(".about-source-links a").count();
  await page.screenshot({ path: path.join(artifactDir, "library-about-desktop.png"), fullPage: true });

  await page.locator('[data-library-panel="about"]').click();
  result.libraryItemsAfterAboutClose = await page.locator(".library-item").count();
  await page.locator('[data-library-panel="settings"]').click();
  result.settingsVisible = await page.locator(".settings-panel").isVisible();
  result.settingsGroups = await page.locator(".settings-group").count();
  result.settingsLanguageGroup = await page.locator(".settings-language-group").isVisible();
  result.settingsStorageStatus = await page.locator(".settings-local-note").getAttribute("data-storage-status");
  await page.locator('[data-setting-toggle="englishDark"]').click();
  await page.locator('[data-english-leading="2"]').click();
  await page.locator('[data-speed="1.5"]').click();
  result.preferenceCookie = await page.evaluate(() => document.cookie.includes("leafbound_preferences_v1="));
  const persistedPersonalState = await readPersonalState(page);
  result.personalStateFields = ["favorites", "savedItems", "notes", "readingProgress", "playbackProgress", "contentActivity", "dailySelections", "history", "preferences"]
    .filter((key) => Object.hasOwn(persistedPersonalState, key));
  await page.screenshot({ path: path.join(artifactDir, "library-settings-desktop.png"), fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-library-panel="settings"]').click();
  result.settingsPersisted = {
    englishDark: await page.locator('[data-setting-toggle="englishDark"]').getAttribute("aria-checked"),
    englishLeading: await page.locator('[data-english-leading="2"]').getAttribute("aria-pressed"),
    playbackSpeed: await page.locator('[data-speed="1.5"]').getAttribute("aria-pressed")
  };
  await page.locator("[data-reset-settings]").click();
  result.settingsReset = {
    englishDark: await page.locator('[data-setting-toggle="englishDark"]').getAttribute("aria-checked"),
    englishLeading: await page.locator('[data-english-leading="1.78"]').getAttribute("aria-pressed"),
    playbackSpeed: await page.locator('[data-speed="1"]').getAttribute("aria-pressed")
  };
  await page.locator('[data-library-panel="settings"]').click();
  result.persistedLibraryItems = await page.locator(".library-item").count();
  result.persistedNote = await page.getByRole("tab", { name: "筆記" }).click().then(async () => page.locator(".library-item").count());

  await page.getByRole("button", { name: "搜尋所有內容" }).click();
  await page.locator("[data-global-search]").fill("雨");
  result.searchResults = await page.locator(".search-result").count();
  await page.getByRole("button", { name: "關閉搜尋" }).click();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.emulateMedia({ reducedMotion: "reduce" });
  await mobile.goto(`${baseUrl}/#today`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: path.join(artifactDir, "home-mobile.png"), fullPage: true });
  result.mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.goto(`${baseUrl}/#language`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: path.join(artifactDir, "language-hub-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#poetry`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: path.join(artifactDir, "poetry-list-mobile.png"), fullPage: true });
  await mobile.locator('[data-poetry-kind="古文"]').click();
  await mobile.locator("[data-poetry-search]").fill("鄭伯克段於鄢");
  await mobile.locator(".poem-row").filter({ hasText: "《鄭伯克段於鄢》" }).first().locator(".poem-row-main").click();
  await mobile.waitForSelector(".prose-jyutping-token rt");
  result.mobileGuwenJyutpingTokens = await mobile.locator(".prose-jyutping-token rt").count();
  result.mobileGuwenRubyAudit = await auditClassicalRuby(mobile, ".prose-jyutping-token");
  await mobile.getByRole("button", { name: "打開閱讀排版" }).click();
  result.mobileGuwenTypographyVisible = await mobile.locator("#classical-typography-panel").isVisible();
  result.mobileGuwenTypographyPanelOverflow = await mobile.locator("#classical-typography-panel").evaluate((node) => node.scrollWidth - node.clientWidth);
  result.mobileGuwenTypographyOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "guwen-typography-mobile.png") });
  await mobile.getByRole("button", { name: "關閉閱讀排版" }).click();
  await mobile.screenshot({ path: path.join(artifactDir, "guwen-reader-mobile.png"), fullPage: true });
  result.mobileGuwenOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.goto(`${baseUrl}/#cantonese/hbl-flowers-of-one-garden`, { waitUntil: "networkidle" });
  await mobile.waitForSelector('[data-segment-jyutping="auto"]');
  result.mobileHblJyutpingLines = await mobile.locator('[data-segment-jyutping="auto"]').count();
  result.mobileHblRubyTokens = await mobile.locator('[data-transcript-ruby="auto"] rt').count();
  result.mobileHblJyutpingOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "cantonese-hbl-jyutping-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#cantonese/hkcancor-d1`, { waitUntil: "networkidle" });
  await mobile.waitForSelector(".transcript-speaker");
  result.mobileCantoneseInterviewOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileCantoneseInterviewRoles = await mobile.locator(".transcript-speaker small").allTextContents();
  result.mobileCantoneseInterviewScope = await mobile.locator(".transcript-scope-note").textContent();
  await mobile.screenshot({ path: path.join(artifactDir, "cantonese-interview-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#cantonese`, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => document.querySelector("[data-cantonese-voice-status]")?.dataset.cantoneseVoiceStatus !== "checking", undefined, { timeout: 3500 });
  await mobile.screenshot({ path: path.join(artifactDir, "cantonese-feed-mobile.png"), fullPage: true });
  result.mobileCantoneseOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileCantoneseLevelOverflow = await mobile.locator(".cantonese-level-ladder").evaluate((node) => node.scrollWidth - node.clientWidth);
  result.mobileCantoneseLevelNote = await mobile.locator(".cantonese-level-note").textContent();
  await mobile.goto(`${baseUrl}/#poetry/mountain-autumn`, { waitUntil: "networkidle" });
  await mobile.waitForSelector(".verse-jyutping-token rt");
  result.mobilePoemRubyAudit = await auditClassicalRuby(mobile, ".verse-jyutping-token");
  await mobile.locator(".poem-thread-mobile").click();
  await mobile.screenshot({ path: path.join(artifactDir, "poem-reader-mobile.png") });
  result.mobilePoemOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.goto(`${baseUrl}/#poetry/open-song-ci-02b68e8ec18766c3eb55`, { waitUntil: "networkidle" });
  await mobile.waitForSelector('[data-dictionary-term="闌干"]');
  await mobile.locator('[data-dictionary-term="闌干"]').first().click();
  await mobile.waitForSelector(".definition-source");
  result.mobileMoeDefinitionOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileMoeDefinitionSheetOverflow = await mobile.locator(".word-sheet").evaluate((node) => node.scrollWidth - node.clientWidth);
  result.mobileMoeDefinitionEnglishRows = await mobile.locator(".word-sheet dt", { hasText: "English" }).count();
  await mobile.screenshot({ path: path.join(artifactDir, "poem-word-sheet-chinese-definition-mobile.png") });
  await mobile.locator(".sheet-close").click();
  await mobile.goto(`${baseUrl}/#poetry/open-yuanqu-94a25e7d597cece17e04`, { waitUntil: "networkidle" });
  await mobile.waitForSelector(".verse-jyutping-token rt");
  result.mobileYuanquRubyAudit = await auditClassicalRuby(mobile, ".verse-jyutping-token");
  result.mobileYuanquOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "yuanqu-inline-jyutping-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#poetry/open-yuanqu-9493c1fa7adc30eea82a`, { waitUntil: "networkidle" });
  await mobile.waitForSelector('[data-translation-review-status="reviewed"]');
  await mobile.waitForSelector(".classical-reading-translation");
  result.mobileRequestedYuanquTranslationParagraphs = await mobile.locator(".classical-reading-translation > p:not(.classical-reading-alignment-note)").count();
  result.mobileRequestedYuanquTranslationStatus = await mobile.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.mobileRequestedYuanquLegacyTranslationPanels = await mobile.locator(".reader-detail.is-translation").count();
  result.mobileRequestedYuanquTranslationOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "yuanqu-modern-translation-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#poetry/open-guwen-87c7a29cd59b3c40239e`, { waitUntil: "networkidle" });
  await mobile.waitForSelector('[data-translation-review-status="reviewed"]');
  await mobile.waitForSelector(".classical-reading-translation");
  result.mobileGuwenTranslationParagraphs = await mobile.locator(".classical-reading-translation > p:not(.classical-reading-alignment-note)").count();
  result.mobileGuwenTranslationStatus = await mobile.locator("[data-translation-review-status]").getAttribute("data-translation-review-status");
  result.mobileGuwenLegacyTranslationPanels = await mobile.locator(".reader-detail.is-translation").count();
  result.mobileGuwenInlineReaderOverflow = await mobile.locator(".classical-reading-flow").evaluate((node) => node.scrollWidth - node.clientWidth);
  result.mobileGuwenTranslationOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "guwen-modern-translation-mobile.png"), fullPage: true });
  await mobile.goto(`${baseUrl}/#english/quiet-noticing`, { waitUntil: "networkidle" });
  await mobile.locator('[data-english-word="imperceptibly"]').click();
  result.mobileEnglishLookupVisible = await mobile.locator(".english-lookup-card").isVisible();
  result.mobileEnglishOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "english-reader-mobile.png") });
  await mobile.goto(`${baseUrl}/#english/phrases-carry`, { waitUntil: "networkidle" });
  await mobile.locator('[data-english-word="encounters"]').click();
  result.mobileOpenDictionaryMeaning = await mobile.locator(".lookup-meaning p").textContent();
  result.mobileOpenDictionaryOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "english-open-dictionary-mobile.png") });
  await mobile.goto(`${baseUrl}/#english`, { waitUntil: "networkidle" });
  result.mobileEnglishIndexOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileEnglishIndexHanText = await mobile.locator(".app-shell").evaluate((node) => (node.innerText.match(/[\u3400-\u9fff]/gu) || []).join(""));
  result.mobileEnglishSources = await mobile.locator(".english-source-card").count();
  result.mobileEnglishNewsDesks = await mobile.locator(".english-news-desk").count();
  await mobile.screenshot({ path: path.join(artifactDir, "english-index-mobile.png"), fullPage: true });
  await mobile.locator('[data-english-source="nasa"]').click();
  await mobile.locator('.article-row.is-internal .article-main').first().click();
  result.mobileImportedEnglishOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileImportedSourceNote = await mobile.locator(".article-source-note").isVisible();
  await mobile.screenshot({ path: path.join(artifactDir, "english-imported-reader-mobile.png") });
  await mobile.goto(`${baseUrl}/#library`, { waitUntil: "networkidle" });
  result.mobileLibraryLanguageListCount = await mobile.locator(".language-list").count();
  await mobile.screenshot({ path: path.join(artifactDir, "library-mobile.png"), fullPage: true });
  await mobile.locator('[data-library-panel="about"]').click();
  result.mobileAboutOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mobile.screenshot({ path: path.join(artifactDir, "library-about-mobile.png"), fullPage: true });
  await mobile.locator('[data-library-panel="about"]').click();
  await mobile.locator('[data-library-panel="settings"]').click();
  result.mobileSettingsOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  result.mobileSettingsControls = await mobile.locator(".settings-group").count();
  result.mobileSettingsLanguageGroup = await mobile.locator(".settings-language-group").isVisible();
  await mobile.screenshot({ path: path.join(artifactDir, "library-settings-mobile.png"), fullPage: true });
  result.readingStatus = await auditReadingStatus(browser);
  result.responsive = {};
  for (const spec of [
    { name: "phone-narrow", width: 320, height: 568, route: "#poetry", touch: true },
    { name: "phone-portrait", width: 390, height: 844, route: "#english/quiet-noticing", touch: true },
    { name: "phone-landscape", width: 667, height: 375, route: "#today", touch: true },
    { name: "phone-wide-landscape", width: 844, height: 390, route: "#english/quiet-noticing", touch: true },
    { name: "tablet-portrait", width: 820, height: 1180, route: "#english", touch: true },
    { name: "tablet-landscape", width: 1024, height: 768, route: "#cantonese/city-rain", touch: true },
    { name: "desktop", width: 1440, height: 1000, route: "#today", touch: false }
  ]) {
    result.responsive[spec.name] = await auditViewport(browser, spec);
  }
  result.errors = errors;

  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  if (errors.length
    || result.navItems !== 4
    || result.languageHubPortals !== 2
    || result.languageHubCurrentNav !== "Language"
    || !/^\d{4}-\d{2}-\d{2}$/.test(result.todayDaily.key)
    || !result.todayDaily.poem
    || !result.todayDaily.article
    || !result.todayDaily.episode
    || !result.todayDailyStored
    || result.todayDailyStored.poem !== result.todayDaily.poem
    || result.todayDailyStored.article !== result.todayDaily.article
    || result.todayDailyStored.episode !== result.todayDaily.episode
    || result.todayDailyAfterReload.poem !== result.todayDaily.poem
    || result.todayDailyAfterReload.article !== result.todayDaily.article
    || result.todayDailyAfterReload.episode !== result.todayDaily.episode
    || !result.todayPoemFeature.quote
    || !/^《.+》$/u.test(result.todayPoemFeature.title)
    || result.todayPoemFeature.quote === result.todayPoemFeature.title.replace(/[《》]/gu, "")
    || result.todayPoemFeature.quoteElements !== 1
    || result.todayPoemFeature.rubies !== result.todayPoemFeature.han
    || result.todayPoemFeature.legacyJyutpingTracks !== 0
    || !result.todayPoemFeature.allAnnotatedAbove
    || result.todayShelfHeading !== "今日選讀 · 選聽"
    || !result.todayShelfCopy.includes("每天按本地日期更換")
    || result.poems !== 24
    || result.poetryTotal !== "17373 篇"
    || result.poetryKinds !== 5
    || result.poetrySourceNoticeCount !== 0
    || result.expandedPoems !== 48
    || result.kindTotals["詩"] !== "3566 首"
    || result.kindTotals["詞"] !== "2449 首"
    || result.kindTotals["曲"] !== "10906 首"
    || result.kindTotals["古文"] !== "452 篇"
    || result.ciFacetLabels.join("|") !== "按朝代|按作者|按詞牌|按主題"
    || result.ciTuneChipLabels[0] !== "全部"
    || result.ciTuneChipLabels[1] !== "浣溪沙"
    || result.ciGenericTuneChips !== 0
    || result.ciTuneFilterLabel !== "詞牌"
    || result.ciTuneFilterTotal !== "100 首"
    || result.guwenSearchCount < 1
    || result.guwenTitle !== "鄭伯克段於鄢"
    || result.guwenParagraphs < 2
    || !result.guwenSource.includes("古文觀止")
    || !result.guwenSource.includes("《左傳》")
    || result.guwenJyutpingToggle !== 1
    || result.guwenJyutpingTokens < 100
    || result.guwenRubyAudit.rubies !== result.guwenRubyAudit.han
    || !result.guwenRubyAudit.allSingleHan
    || !result.guwenRubyAudit.allAnnotated
    || !result.guwenRubyAudit.allAnnotatedAbove
    || result.guwenRubyAudit.legacyTracks !== 0
    || !result.guwenRareJyutping
    || !result.guwenRareSource.includes("Rime Cantonese")
    || result.guwenTypographyToggle !== 1
    || !result.guwenTypographyPanel
    || result.guwenTypographyControls.fonts !== 3
    || result.guwenTypographyControls.sizes !== 3
    || result.guwenTypographyControls.leading !== 3
    || result.guwenTypographyAfter.fontSize <= result.guwenTypographyBefore.fontSize
    || result.guwenTypographyAfter.lineHeight <= result.guwenTypographyBefore.lineHeight
    || !result.guwenTypographyAfter.usesKaiClass
    || result.guwenTypographySaved.font !== "kai"
    || result.guwenTypographySaved.scale !== 1.08
    || result.guwenTypographySaved.leading !== 1.16
    || !result.guwenTypographyPersisted.usesKaiClass
    || result.guwenTypographyPersisted.scale !== "1.08"
    || result.guwenTypographyPersisted.leading !== "1.16"
    || !result.guwenTypographyImmersive.usesKaiClass
    || result.guwenTypographyImmersive.scale !== "1.08"
    || result.guwenTypographyImmersive.leading !== "1.16"
    || !result.guwenTypographyReset.usesSongClass
    || result.guwenTypographyReset.scale !== "1"
    || result.guwenTypographyReset.leading !== "1"
    || result.guwenJyutpingAfterHide !== 0
    || result.guwenDictionaryTerms < 1
    || result.guwenThreadLabel !== "文脈"
    || result.savedGuwenParagraph !== "true"
    || !result.guwenImmersive
    || result.guwenImmersiveJyutping < 100
    || result.firstPoemQuote !== "明月松間照，清泉石上流"
    || result.firstPoemTitle !== "《山居秋暝》"
    || result.combinedFilterCount < 1
    || result.activeFilterCount !== 2
    || result.relationshipFilterCount !== 1
    || !result.poemThreadVisible
    || result.relatedPoems !== 3
    || result.savedPoetryLine !== "true"
    || result.savedPoetryQuotes !== 1
    || result.poemRubyAudit.rubies !== result.poemRubyAudit.han
    || !result.poemRubyAudit.allSingleHan
    || !result.poemRubyAudit.allAnnotated
    || !result.poemRubyAudit.allAnnotatedAbove
    || result.poemRubyAudit.legacyTracks !== 0
    || result.jyutpingToggle[0] < 1
    || result.jyutpingToggle[1] !== 0
    || result.immersivePoemRubyTokens < 1
    || result.openPoemSearchCount !== 1
    || !result.openPoemSource.includes("唐詩三百首")
    || result.openPoemDetails !== 0
    || result.openPoemTranslationStatus !== "missing"
    || result.openPoemOriginalModeSelected !== "true"
    || result.openPoemDictionaryTerms < 1
    || result.openPoemAutoJyutpingLines < 1
    || !result.openPoemFirstJyutping
    || result.openPoemRubyAudit.rubies !== result.openPoemRubyAudit.han
    || !result.openPoemRubyAudit.allSingleHan
    || !result.openPoemRubyAudit.allAnnotated
    || !result.openPoemRubyAudit.allAnnotatedAbove
    || result.openPoemRubyAudit.legacyTracks !== 0
    || !result.openPoemJyutpingCoverage.includes("全文粵拼")
    || result.openPoemJyutpingHidden !== 0
    || result.openPoemJyutpingRestored !== result.openPoemAutoJyutpingLines
    || !result.openPoemTermPronunciation
    || result.openPoemTermSourceLink < 1
    || result.moeDefinitionTermCount < 1
    || !result.moeDefinitionText.includes("竹木或金屬條編成的柵欄")
    || !result.moeDefinitionText.includes("星光橫斜參差的樣子")
    || result.moeDefinitionLabels[0] !== "中文釋義"
    || !result.moeDefinitionLabels.includes("讀音說明")
    || result.moeDefinitionPronunciation !== "laan4 gon1"
    || !result.moeDefinitionSource.includes("中華民國教育部")
    || !result.moeDefinitionSource.includes("內容未改寫")
    || result.moeDefinitionEnglishRows !== 0
    || result.yuanquRubyAudit.rubies !== result.yuanquRubyAudit.han
    || !result.yuanquRubyAudit.allSingleHan
    || !result.yuanquRubyAudit.allAnnotated
    || !result.yuanquRubyAudit.allAnnotatedAbove
    || result.yuanquRubyAudit.legacyTracks !== 0
    || result.yuanquOverflow !== 0
    || result.requestedYuanquTranslationStatus !== "reviewed"
    || !result.requestedYuanquTranslationReview.includes("人工已校")
    || result.requestedYuanquTranslationUnits !== 1
    || result.requestedYuanquTranslationAlignment !== "whole-work"
    || result.requestedYuanquTranslationParagraphs !== 1
    || !result.requestedYuanquTranslationText.includes("哪裏懂得兒女婚聘、締結秦晉之好")
    || result.requestedYuanquLegacyTranslationPanels !== 0
    || result.requestedYuanquTranslationOverflow !== 0
      || result.generatedYuanquTranslationStatus !== "pending-review"
      || !result.generatedYuanquTranslationReview.includes("初步可用")
    || result.generatedYuanquTranslationParagraphs < 10
    || result.generatedYuanquTranslationAlignmentNotes < 1
    || result.generatedYuanquLegacyTranslationPanels !== 0
    || result.generatedYuanquTranslationOverflow !== 0
    || result.guwenTranslationStatus !== "reviewed"
    || !result.guwenTranslationReview.includes("人工已校")
    || result.guwenTranslationUnits !== 3
    || result.guwenTranslationParagraphs !== 4
    || result.guwenTranslationAlignmentNotes !== 3
    || !result.guwenTranslationText.includes("大軍逼近許都")
    || result.guwenLegacyTranslationPanels !== 0
    || result.guwenFocusedReadingUnits !== 1
    || result.guwenMutedReadingUnits !== 2
    || result.guwenClearedReadingFocus !== 0
    || result.guwenTranslationModeParagraphs !== 4
    || result.guwenTranslationModeSourceBodies !== 0
    || result.guwenStoredReadingMode !== "translation"
    || result.guwenReadingModePersisted !== "true"
    || result.guwenOriginalModeSourceBodies < 1
    || result.guwenOriginalModeTranslations !== 0
    || result.guwenParallelModeSelected !== "true"
    || result.guwenTranslationOverflow !== 0
    || result.cantoneseLexiconNoticeCount !== 0
    || result.cantoneseSources !== 4
    || result.cantoneseLevels !== 4
    || result.cantoneseLevelLabels.join("|") !== "全部|起步|日常|進階"
    || result.cantoneseLevelRanges.join("|") !== "全部故事|路徑 01|路徑 02|路徑 03"
    || !result.cantoneseLevelNote.includes("詞頻與用法")
    || !result.cantoneseLevelNote.includes("不等同 CEFR")
    || result.cantoneseInitialRows !== 24
    || result.cantoneseLoadMoreControl !== 1
    || result.cantoneseExpandedRows !== 48
    || result.cantoneseSessionLimit !== 48
    || result.cantoneseLearningMarks.join("|") !== "起|常|進"
    || result.cantoneseSourceLevelRows !== 149
    || result.cantoneseStartEpisodes !== 44
    || result.cantoneseDailyEpisodes !== 48
    || result.cantoneseAdvanceEpisodes !== 57
    || !result.cantoneseShelfText.includes("208")
    || !result.cantoneseShelfText.includes("口述訪談")
    || result.episodes < 150
    || !result.cantoneseInterviewScope.includes("雙方文稿")
    || !result.cantoneseInterviewRoles.includes("提問者")
    || !result.cantoneseInterviewRoles.includes("受訪者")
    || !result.cantoneseInterviewSpeakers.includes("H")
    || !result.cantoneseInterviewSpeakers.includes("L")
    || result.cantoneseInterviewQuestionMarks < 1
    || result.cantoneseInterviewAnswerMarks < 1
    || result.dynamicTranscriptTerms < 1
    || result.dynamicTermSourceLink < 1
    || !result.spiceInterviewScope.includes("單方對齊稿")
    || result.spiceInterviewRoles.length < 1
    || result.spiceInterviewRoles.some((role) => role !== "受訪者")
    || !result.spiceInterviewSpeakers.every((speaker) => speaker === "VF19B")
    || result.spiceSourceReferenceCount !== 1
    || !result.spiceSourceReferenceText.includes("官方原聲保留在 SpiCE")
    || result.spiceSourceReferenceLink !== "https://doi.org/10.5683/SP2/MJOXP3"
    || result.spiceAudioKind !== "source-reference"
    || result.spiceInterviewOverflow !== 0
    || result.hblJyutpingLines < 2
    || !/\d/.test(result.hblFirstJyutping)
    || result.hblRubyTokens < 20
    || result.hblLegacyJyutpingTracks !== 0
    || !result.hblRubyOverBase
    || !result.hblJyutpingNote.includes("全文粵拼")
    || result.hblJyutpingHidden !== 0
    || result.hblJyutpingRestored !== result.hblJyutpingLines
    || result.longHblRubyTokens < 500
    || result.longHblLegacyJyutpingTracks !== 0
    || result.mobileOverflow !== 0
    || result.mobileCantoneseOverflow !== 0
    || result.mobileCantoneseLevelOverflow !== 0
    || !result.mobileCantoneseLevelNote.includes("不等同 CEFR")
    || result.mobileHblJyutpingLines < 2
    || result.mobileHblRubyTokens < 20
    || result.mobileHblJyutpingOverflow !== 0
    || result.mobileCantoneseInterviewOverflow !== 0
    || !result.mobileCantoneseInterviewRoles.includes("提問者")
    || !result.mobileCantoneseInterviewRoles.includes("受訪者")
    || !result.mobileCantoneseInterviewScope.includes("雙方文稿")
    || result.mobilePoemOverflow !== 0
    || result.mobilePoemRubyAudit.rubies !== result.mobilePoemRubyAudit.han
    || !result.mobilePoemRubyAudit.allSingleHan
    || !result.mobilePoemRubyAudit.allAnnotated
    || !result.mobilePoemRubyAudit.allAnnotatedAbove
    || result.mobilePoemRubyAudit.legacyTracks !== 0
    || result.mobileMoeDefinitionOverflow !== 0
    || result.mobileMoeDefinitionSheetOverflow !== 0
    || result.mobileMoeDefinitionEnglishRows !== 0
    || result.mobileYuanquRubyAudit.rubies !== result.mobileYuanquRubyAudit.han
    || !result.mobileYuanquRubyAudit.allSingleHan
    || !result.mobileYuanquRubyAudit.allAnnotated
    || !result.mobileYuanquRubyAudit.allAnnotatedAbove
    || result.mobileYuanquRubyAudit.legacyTracks !== 0
    || result.mobileYuanquOverflow !== 0
    || result.mobileRequestedYuanquTranslationParagraphs !== 1
    || result.mobileRequestedYuanquTranslationStatus !== "reviewed"
    || result.mobileRequestedYuanquLegacyTranslationPanels !== 0
    || result.mobileRequestedYuanquTranslationOverflow !== 0
    || result.mobileGuwenTranslationParagraphs !== 4
    || result.mobileGuwenTranslationStatus !== "reviewed"
    || result.mobileGuwenLegacyTranslationPanels !== 0
    || result.mobileGuwenInlineReaderOverflow !== 0
    || result.mobileGuwenTranslationOverflow !== 0
    || result.mobileGuwenOverflow !== 0
    || result.mobileGuwenJyutpingTokens < 100
    || result.mobileGuwenRubyAudit.rubies !== result.mobileGuwenRubyAudit.han
    || !result.mobileGuwenRubyAudit.allSingleHan
    || !result.mobileGuwenRubyAudit.allAnnotated
    || !result.mobileGuwenRubyAudit.allAnnotatedAbove
    || result.mobileGuwenRubyAudit.legacyTracks !== 0
    || !result.mobileGuwenTypographyVisible
    || result.mobileGuwenTypographyPanelOverflow !== 0
    || result.mobileGuwenTypographyOverflow !== 0
    || result.mobileEnglishOverflow !== 0
    || result.mobileOpenDictionaryOverflow !== 0
    || !/遇見|相遇|碰到|遭遇/.test(result.mobileOpenDictionaryMeaning)
    || result.mobileEnglishIndexOverflow !== 0
    || result.mobileImportedEnglishOverflow !== 0
    || result.mobileEnglishSources !== 5
    || result.mobileEnglishNewsDesks !== 7
    || result.mobileEnglishIndexHanText !== ""
    || !result.mobileImportedSourceNote
    || !result.mobileEnglishLookupVisible
    || result.englishSources !== 5
    || result.englishNewsDesks !== 7
    || result.englishInitialRows !== 24
    || result.englishLoadMoreControl !== 1
    || result.englishExpandedRows !== 48
    || result.englishRowsAfterReload !== 48
    || result.englishScrollBeforeReload < 800
    || result.englishScrollAfterReload < 800
    || result.englishSessionView.limit !== 48
    || result.englishSessionView.sourceFilter !== "全部"
    || result.englishSessionView.category !== "全部"
    || !["AP", "Reuters", "Guardian", "CNN", "RFI", "Economist", "Open Newswire"].every((source) => result.englishNewsDeskNames.split("|").includes(source))
    || result.englishNewsDeskTargets !== 7
    || !result.englishNewsBoundary.includes("never copies unlicensed full text")
    || result.englishIndexHanText !== ""
    || result.englishReaderHanText !== ""
    || result.importedEnglishHanText !== ""
    || result.englishMethodNoteCount !== 0
    || result.englishCategories !== 6
    || result.englishImportedRows < 50
    || result.englishExternalRows !== 0
    || result.englishExternalTargets !== 0
    || result.englishNasaRows < 8
    || result.englishStandardRows < 10
    || result.englishGlobalVoicesRows < 10
    || result.englishLanguageRows < 10
    || result.importedEnglishParagraphs < 3
    || !result.importedEnglishSourceNote.includes("NASA")
    || result.importedEnglishSourceLink !== 1
    || result.englishLookupMeaning !== "難以察覺地"
    || !result.englishHeadlineUses.includes("make the headlines")
    || result.englishOriginalSentenceSections !== 0
    || result.englishNightSurfaces.reader.alpha !== 1
    || result.englishNightSurfaces.lookup.alpha !== 1
    || result.englishNightSurfaces.note.alpha !== 1
    || result.englishNightSurfaces.topbar.alpha !== 1
    || result.englishNightSurfaces.navigation.alpha !== 1
    || result.englishNightSurfaces.lookupBackdrop !== "none"
    || !result.englishCommonUses.includes("almost imperceptibly")
    || result.englishPronunciationControl !== 1
    || !result.savedEnglishWordMarked.includes("is-saved")
    || !/遇見|相遇|碰到|遭遇/.test(result.englishOpenDictionaryMeaning)
    || !result.englishOpenDictionaryMeta.includes("lemma encounter")
    || !result.englishOpenDictionaryUses.includes("encounter difficulties")
    || !result.englishOpenDictionaryDefinition.includes("meet or experience")
    || result.englishOpenDictionaryExampleCount < 1
    || result.englishLegacySenseDisclosure !== 0
    || result.englishGivesMeaning !== "給；給予；提供；使某人獲得或感受到"
    || !result.englishGivesDefinition.includes("hand something to someone")
    || !result.englishGivesUses.includes("give someone something")
    || !result.englishGivesUses.includes("give directions / advice")
    || result.englishGivesPronunciation !== "/ɡɪvz/"
    || !result.englishGivesMeta.includes("lemma give")
    || !result.englishGivesExamples.includes("Could you give me a few minutes?")
    || result.englishGivesSectionOrder.join("|") !== "chinese|english|usage|examples"
    || result.englishGivesLegacyExampleLabels !== 0
    || result.libraryDashboard.nextCards !== 1
    || result.libraryDashboard.weekDays !== 7
    || result.libraryDashboard.quests !== 3
    || result.libraryDashboard.shelves !== 3
    || !/^\d+$/.test(result.libraryDashboard.progress || "")
    || !/^\d+$/.test((result.libraryDashboard.streak || "").trim())
    || result.libraryContentTabs !== 5
    || result.libraryAboutTabCount !== 0
    || result.libraryUtilityRows !== 2
    || result.libraryLanguageListCount !== 0
    || result.libraryItemsAfterAboutClose !== result.libraryItems
    || !result.aboutVisible
    || !result.aboutSourceText.includes("宋詞三百首")
    || !result.aboutSourceText.includes("全唐詩選")
    || !result.aboutSourceText.includes("全宋詞選")
    || !result.aboutSourceText.includes("千家詩")
    || !result.aboutSourceText.includes("蒙學原典")
    || !result.aboutSourceText.includes("古文觀止")
    || !result.aboutSourceText.includes("詩經")
    || !result.aboutSourceText.includes("元曲")
    || !result.aboutSourceText.includes("四書")
    || !result.aboutSourceText.includes("62,274")
    || !result.aboutSourceText.includes("26,983")
    || !result.aboutSourceText.includes("38,450")
    || !result.aboutSourceText.includes("教育部辭典")
    || !result.aboutSourceText.includes("Rime Cantonese")
    || !result.aboutSourceText.includes("7 個官方訂閱源")
    || !result.aboutSourceText.includes("Standard Ebooks")
    || !result.aboutSourceText.includes("HKCanCor")
    || !result.aboutSourceText.includes("SpiCE")
    || !result.aboutSourceText.includes("AI 分片")
    || !/匯入 \d+ 篇有正文、署名與原聲入口的故事/.test(result.aboutSourceText)
    || !result.aboutSourceText.includes("208 篇")
    || !result.aboutSourceText.includes("Chinese Open Wordnet")
    || !result.aboutSourceText.includes("FreeDict")
    || !/\d{1,3}(?:,\d{3})* 個詞形/.test(result.aboutSourceText)
    || result.aboutSourceLinks !== 23
    || !result.settingsVisible
    || result.settingsGroups !== 5
    || !result.settingsLanguageGroup
    || result.settingsStorageStatus !== "remembered"
    || result.preferenceCookie
    || result.personalStateFields.length !== 9
    || result.settingsPersisted.englishDark !== "true"
    || result.settingsPersisted.englishLeading !== "true"
    || result.settingsPersisted.playbackSpeed !== "true"
    || result.settingsReset.englishDark !== "false"
    || result.settingsReset.englishLeading !== "true"
    || result.settingsReset.playbackSpeed !== "true"
    || result.persistedLibraryItems < 5
    || (result.cantoneseAudioKind === "local" ? !result.playbackAdvanced : result.cantoneseVoiceStatus === "available" ? !result.playbackAdvanced : !result.fallbackBlocked)
    || result.searchResults < 1
    || result.mobileLibraryLanguageListCount !== 0
    || result.mobileAboutOverflow !== 0
    || result.mobileSettingsOverflow !== 0
    || result.mobileSettingsControls !== 5
    || !result.mobileSettingsLanguageGroup
    || !result.readingStatus.dailySkipped
    || result.readingStatus.article.status !== "seen"
    || result.readingStatus.article.progress < 50
    || result.readingStatus.article.pressed !== "true"
    || !result.readingStatus.article.marked.includes("read")
    || !result.readingStatus.article.reset
    || result.readingStatus.poem.status !== "seen"
    || result.readingStatus.poem.progress < 50
    || result.readingStatus.poem.pressed !== "true"
    || !result.readingStatus.poem.reset
    || result.readingStatus.episode.status !== "seen"
    || result.readingStatus.episode.progress < 50
    || result.readingStatus.episode.pressed !== "true"
    || !result.readingStatus.episode.reset
    || Object.values(result.responsive).some((viewport) => (
      viewport.maxOverflow !== 0
      || viewport.navButtonCount !== 4
      || !viewport.navFullyVisible
      || !viewport.navClearsMain
    ))
    || result.responsive["phone-narrow"].navOrientation !== "horizontal"
    || result.responsive["phone-narrow"].navRect.width !== 320
    || result.responsive["phone-narrow"].navRect.bottom !== 0
    || result.responsive["phone-narrow"].touchControlMinHeight < 44
    || result.responsive["phone-portrait"].navOrientation !== "horizontal"
    || result.responsive["phone-portrait"].touchControlMinHeight < 44
    || result.responsive["phone-landscape"].navOrientation !== "vertical"
    || result.responsive["phone-landscape"].touchControlMinHeight < 44
    || result.responsive["phone-wide-landscape"].navOrientation !== "vertical"
    || result.responsive["phone-wide-landscape"].touchControlMinHeight < 44
    || result.responsive["tablet-portrait"].navOrientation !== "horizontal"
    || result.responsive["tablet-portrait"].touchControlMinHeight < 44
    || result.responsive["tablet-landscape"].navOrientation !== "vertical"
    || result.responsive["tablet-landscape"].touchControlMinHeight < 44
    || result.responsive.desktop.navOrientation !== "vertical") {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
