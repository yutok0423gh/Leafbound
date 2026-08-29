const assert = require("node:assert/strict");
const fs = require("node:fs");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is required for the collection pagination check.");
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

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const errors = [];

  try {
    const englishContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const english = await englishContext.newPage();
    english.on("console", (message) => {
      if (message.type() === "error") errors.push(`English console: ${message.text()}`);
    });
    english.on("pageerror", (error) => errors.push(`English page: ${error.message}`));

    await english.goto(`${baseUrl}/#english`, { waitUntil: "networkidle" });
    assert.equal(await english.locator(".article-row").count(), 24, "English should initially render 24 rows");
    assert.equal(await english.locator("[data-load-more-english]").count(), 1, "English should expose one load-more action");
    assert.match(await english.locator("[data-load-more-english]").getAttribute("aria-label"), /^Show 24 more/u);

    await english.locator("[data-load-more-english]").click();
    assert.equal(await english.locator(".article-row").count(), 48, "English should reveal the next 24 rows");
    assert.equal(
      await english.evaluate(() => document.activeElement?.closest("[data-english-row-index]")?.dataset.englishRowIndex),
      "24",
      "English should move focus to the first newly revealed row"
    );
    await english.evaluate(() => window.scrollTo(0, 1200));
    await english.waitForTimeout(250);
    const scrollBeforeReload = await english.evaluate(() => window.scrollY);
    assert.ok(scrollBeforeReload >= 1000, "English list should reach the requested scroll position");
    await english.reload({ waitUntil: "networkidle" });
    await english.waitForTimeout(150);
    assert.equal(await english.locator(".article-row").count(), 48, "English list limit should survive reload in the session");
    assert.ok(await english.evaluate(() => window.scrollY) >= 1000, "English scroll position should survive reload in the session");

    await english.locator('[data-english-source="nasa"]').click();
    await english.reload({ waitUntil: "networkidle" });
    assert.equal(await english.locator('[data-english-source="nasa"]').getAttribute("aria-pressed"), "true", "English source filter should survive reload");
    assert.ok(await english.locator(".article-row").count() <= 24, "A changed English filter should reset the list limit");
    await englishContext.close();

    const cantoneseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cantonese = await cantoneseContext.newPage();
    cantonese.on("console", (message) => {
      if (message.type() === "error") errors.push(`Cantonese console: ${message.text()}`);
    });
    cantonese.on("pageerror", (error) => errors.push(`Cantonese page: ${error.message}`));

    await cantonese.goto(`${baseUrl}/#cantonese`, { waitUntil: "networkidle" });
    assert.equal(await cantonese.locator(".episode-row").count(), 24, "Cantonese should initially render 24 rows");
    assert.equal(await cantonese.locator("[data-load-more-cantonese]").count(), 1, "Cantonese should expose one load-more action");
    assert.match(await cantonese.locator("[data-load-more-cantonese]").getAttribute("aria-label"), /^再顯示 24 篇/u);

    await cantonese.locator("[data-load-more-cantonese]").click();
    assert.equal(await cantonese.locator(".episode-row").count(), 48, "Cantonese should reveal the next 24 rows");
    assert.equal(
      await cantonese.evaluate(() => document.activeElement?.closest("[data-cantonese-row-index]")?.dataset.cantoneseRowIndex),
      "24",
      "Cantonese should move focus to the first newly revealed row"
    );
    await cantonese.locator('[data-cantonese-level="start"]').click();
    assert.equal(await cantonese.locator(".episode-row").count(), 24, "A changed Cantonese filter should reset the list limit");
    await cantonese.reload({ waitUntil: "networkidle" });
    assert.equal(await cantonese.locator('[data-cantonese-level="start"]').getAttribute("aria-pressed"), "true", "Cantonese level filter should survive reload");
    await cantonese.locator("[data-load-more-cantonese]").click();
    assert.equal(await cantonese.locator(".episode-row").count(), 44, "The final Cantonese batch should reveal only remaining rows");
    assert.equal(await cantonese.locator("[data-load-more-cantonese]").count(), 0, "Cantonese load-more action should disappear at the end");
    await cantoneseContext.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ english: "24 -> 48 and restored", cantonese: "24 -> 44 filtered", errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
