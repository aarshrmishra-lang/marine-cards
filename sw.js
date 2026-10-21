/* Offline support: keeps the app and the card-reading engine on the device. */
const VERSION = "v1.2.1";
const APP_CACHE = "marine-cards-app-" + VERSION;
const ENGINE_CACHE = "marine-cards-engine-5.1.1";

const APP_FILES = [
  "./", "./index.html", "./app.js", "./parse.js", "./qr.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
  "./lang/eng.traineddata.gz"
];
const ENGINE_FILES = [
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_FILES.map(u => new Request(u, { cache: "reload" })));
    // The engine is large and comes from a CDN: fetch it in the background, never fail install over it.
    const engine = await caches.open(ENGINE_CACHE);
    await Promise.all(ENGINE_FILES.map(async url => {
      try {
        if (await engine.match(url)) return;
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await engine.put(url, res);
      } catch (e) { /* will be fetched on first scan */ }
    }));
    await self.skipWaiting();   // apply updates straight away
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("marine-cards-") && k !== APP_CACHE && k !== ENGINE_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Card-reading engine: cache first, then network (and keep a copy).
  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith((async () => {
      const cache = await caches.open(ENGINE_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req.url, { mode: "cors" });
      if (res.ok) cache.put(req.url, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages: network first so updates arrive, fall back to the cached app when offline.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        const cache = await caches.open(APP_CACHE);
        cache.put("./index.html", res.clone());
        return res;
      } catch (e) {
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  // Card-reading data: cache first (large, rarely changes).
  if (url.pathname.includes("/lang/") || url.pathname.includes("/icons/")) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") (await caches.open(APP_CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // App code: newest version when online, cached copy when offline.
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok && res.type === "basic") (await caches.open(APP_CACHE)).put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
