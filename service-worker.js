const CACHE_PREFIX = "leafbound-local";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v1`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v1`;

// These are same-origin application files only. Audio is deliberately absent:
// Leafbound never copies or caches an external station/SoundCloud response, and
// local recordings remain ordinary user-requested media downloads.
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./assets/icons/leafbound-192.png",
  "./assets/icons/leafbound-512.png",
  "./src/app.js",
  "./src/pwa.js",
  "./src/data.js",
  "./src/open-poems-index.js",
  "./src/open-poem-loader.js",
  "./src/store.js",
  "./src/icons.js",
  "./src/english.js",
  "./src/open-english-dictionary-meta.js",
  "./src/open-english.js",
  "./src/open-cantonese.js",
  "./src/cantonese-interviews.js",
  "./src/classical-reading.js",
  "./src/classical-translations.js",
  "./src/open-classical-translations.js",
  "./src/cantonese-lexicon.js",
  "./src/cantonese-grading.js",
  "./src/voice.js",
  "./src/poetry-taxonomy.js",
  "./src/english-news-sources.js"
];

function scopedUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

function isCacheable(response) {
  return Boolean(response && response.ok && response.type === "basic");
}

function isMediaRequest(request, url) {
  return ["audio", "video"].includes(request.destination)
    || /\.(?:aac|flac|m4a|mp3|mp4|ogg|opus|wav|webm)$/i.test(url.pathname)
    || url.pathname.includes("/assets/audio/")
    || request.headers.has("range");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One optional generated corpus file must not prevent the offline shell
    // from installing; each same-origin asset is therefore committed alone.
    await Promise.allSettled(APP_SHELL.map((path) => cache.add(scopedUrl(path))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const currentCaches = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && !currentCaches.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isMediaRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (isCacheable(response)) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(scopedUrl("./index.html")))
          || caches.match(scopedUrl("./offline.html"));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const refresh = fetch(request).then(async (response) => {
      if (isCacheable(response)) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => undefined));
      return cached;
    }
    try {
      return await refresh;
    } catch {
      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
