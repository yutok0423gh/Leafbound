const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is required for the classical translation review check.");
  process.exit(1);
}

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
const browserCandidates = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
const artifactDirectory = path.join(__dirname, "..", "artifacts");

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const errors = [];
  fs.mkdirSync(artifactDirectory, { recursive: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push("Console: " + message.text());
    });
    page.on("pageerror", (error) => errors.push("Page: " + error.message));

    await page.goto(baseUrl + "/artifacts/classical-translation-review.html", { waitUntil: "networkidle" });
    assert.equal(await page.title(), "Leafbound · 古典今譯校樣台");
    assert.equal(await page.locator(".review-card").count(), 20, "the first page should render 20 cards");
    assert.match(await page.locator("#result-count").textContent(), /找到 100 篇/u);
    assert.equal(await page.locator("#metric-warning").textContent(), "44");
    assert.equal(await page.locator("#metric-usable").textContent(), "100");

    await page.locator('[data-scope="warning"]').click();
    assert.match(await page.locator("#result-count").textContent(), /找到 44 篇/u);
    await page.locator('[data-scope="all"]').click();
    await page.locator('[data-kind="詩"]').click();
    assert.match(await page.locator("#result-count").textContent(), /找到 25 篇/u);
    await page.locator('[data-kind="all"]').click();

    await page.locator("#show-resolved").click();
    assert.match(await page.locator("#result-count").textContent(), /找到 1 篇/u);
    assert.match(await page.locator(".review-card").textContent(), /已修正三處/u);
    assert.match(await page.locator(".review-card").textContent(), /錢鎛/u);
    await page.locator("[data-proof-id]").click();
    assert.ok(await page.locator(".proof.open").isVisible());
    assert.ok(await page.locator("mark").count() >= 6);
    await page.screenshot({
      path: path.join(artifactDirectory, "classical-translation-review-desktop.png"),
      fullPage: false
    });

    await page.locator('[data-triage-value="fix"]').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("leafbound.classical-translation-review.v1") || "{}"));
    assert.equal(saved["open-caocao-c6f2e325b4f071ea6066"].status, "fix");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#show-resolved").click();
    assert.ok(await page.locator('[data-triage-value="fix"]').evaluate((element) => element.classList.contains("active")));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    assert.equal(dimensions.scroll, dimensions.viewport, "mobile review page should not overflow horizontally");
    await page.screenshot({
      path: path.join(artifactDirectory, "classical-translation-review-mobile.png"),
      fullPage: false
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl + "/#poetry/open-caocao-c6f2e325b4f071ea6066", { waitUntil: "networkidle" });
    await page.locator('[data-translation-review-status="pending-review"]').waitFor();
    assert.match(await page.locator(".translation-review").textContent(), /初步可用/u);
    assert.match(await page.locator(".poem-reader-layout").textContent(), /初冬.*棕熊.*農具/us);
    assert.doesNotMatch(await page.locator(".poem-reader-layout").textContent(), /深冬|熊與豹|錢幣/u);

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      initial: 100,
      warningFilter: 44,
      kindFilter: 25,
      correctedDraftFilter: 1,
      readerStatus: "initially usable",
      localTriagePersistence: true,
      mobileOverflow: false,
      errors
    }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
