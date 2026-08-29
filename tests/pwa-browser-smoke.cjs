const fs = require("node:fs");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is required for the PWA browser smoke check.");
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
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/#library`, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.reload({ waitUntil: "networkidle" });

  const result = await page.evaluate(async () => {
    const envelope = JSON.parse(localStorage.getItem("leafbound.personal-library.v1") || "null");
    const personal = await new Promise((resolve, reject) => {
      const request = indexedDB.open("leafbound-personal-v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("personal-state", "readonly");
        const read = transaction.objectStore("personal-state").get("current");
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result);
      };
    });
    await fetch("./assets/audio/cantonese/hkcancor-d1.mp3", { headers: { Range: "bytes=0-32" } });
    const cacheNames = await caches.keys();
    const cachedUrls = (await Promise.all(cacheNames.map(async (name) => (
      (await caches.open(name)).keys()
    )))).flat().map((request) => request.url);
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      cacheNames,
      audioWasCached: cachedUrls.some((url) => url.includes("/assets/audio/")),
      localStorageHasOnlyPreferences: envelope?.persistence?.backend === "indexeddb"
        && !Object.hasOwn(envelope, "favorites"),
      indexedDbHasPersonalState: Array.isArray(personal?.favorites)
        && typeof personal?.notes === "object"
        && typeof personal?.history === "object"
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.controlled
    || !result.cacheNames.some((name) => name.startsWith("leafbound-local-shell-"))
    || result.audioWasCached
    || !result.localStorageHasOnlyPreferences
    || !result.indexedDbHasPersonalState) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

