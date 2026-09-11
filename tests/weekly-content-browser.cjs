const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const { weeklyContentRelease: release } = await import("../src/content-release.js");
  const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
  const executablePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({ executablePath, headless: true });
  const errors = [];
  const output = path.resolve("artifacts/weekly-content");
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      for (const language of ["cantonese", "english"]) {
        await page.goto(`${baseUrl}/#${language}`, { waitUntil: "networkidle" });
        const panel = page.locator(`[data-weekly-release="${language}"]`);
        await panel.waitFor();
        assert.match(await panel.locator(".weekly-release-count").innerText(), new RegExp(`^${release[language].count}\\s*/\\s*20$`));
        await panel.locator("summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(await panel.getAttribute("open"), "");
        assert.equal(await panel.locator("li a").count(), release[language].count);
        const ids = await panel.locator("li a").evaluateAll((links) => links.map((link) => link.getAttribute("href").split("/")[1]));
        assert.deepEqual(ids, release[language].articleIds);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${language} overflow at ${width}px`);
        await panel.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 105, behavior: "instant" }));
        await page.screenshot({ path: path.join(output, `${language}-${width}.png`) });
        if (release[language].count) {
          await panel.locator("li a").first().click();
          await page.locator(language === "english" ? ".article-reader" : ".transcript-panel").waitFor();
          assert.ok(page.url().endsWith(`#${language}/${release[language].articleIds[0]}`));
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ desktop: "passed", mobile: "passed", articleLinks: "passed", keyboard: "passed", errors }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
