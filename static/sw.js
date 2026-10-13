"use strict";
// Bump this version when changing the cache layout. Updates wait for existing tabs to close.
const CACHE_PREFIX = "boring-lab-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v4";
const STATIC_PATHS = new Set([
  "/",
  "/reaction.html",
  "/reaction-online.html",
  "/password-online.html",
  "/puzzle-online.html",
  "/word-online.html",
  "/harmony-online.html",
  "/land-online.html",
  "/light-online.html",
  "/wheel.html",
  "/card.html",
  "/question.html",
  "/fun.html",
  "/truth.html",
  "/pet.html",
  "/planet.html",
  "/book.html",
  "/doodle.html",
  "/smash.html",
  "/tug.html",
  "/tug-online.html",
  "/achievements.html",
  "/luggage.html",
  "/offline.html",
  "/manifest.json",
  "/static/style.css",
  "/static/main.js",
  "/static/reaction.js",
  "/static/reaction-online.js",
  "/static/reaction-online.css",
  "/static/password-online.js",
  "/static/password-online.css",
  "/static/puzzle-online.js",
  "/static/puzzle-online.css",
  "/static/word-online.js",
  "/static/word-online.css",
  "/static/harmony-online.js",
  "/static/harmony-online.css",
  "/static/land-online.js",
  "/static/land-online.css",
  "/static/light-online.js",
  "/static/light-online.css",
  "/static/wheel.js",
  "/static/wheel-presets.js",
  "/static/wheel.css",
  "/static/random.js",
  "/static/truth.js",
  "/static/pet.js",
  "/static/pet.css",
  "/static/planet.js",
  "/static/planet.css",
  "/static/fun.js",
  "/static/fun.css",
  "/static/book.js",
  "/static/book.css",
  "/static/achievements.js",
  "/static/achievements.css",
  "/static/cards.js",
  "/static/cards.css",
  "/static/doodle.js",
  "/static/doodle-presets.js",
  "/static/doodle-toy.js",
  "/static/doodle-shelf.js",
  "/static/doodle.css",
  "/static/smash.js",
  "/static/smash.css",
  "/static/tug.js",
  "/static/tug.css",
  "/static/tug-online.js",
  "/static/tug-online.css",
  "/static/luggage.js",
  "/static/luggage-schema.js",
  "/static/luggage.css",
  "/static/question.css",
  "/static/pwa.js",
  "/static/pwa.css",
  "/static/themes.js",
  "/static/themes.css",
  "/static/app-icon.svg",
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/static/icon-maskable-512.png",
  "/static/apple-touch-icon.png",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([...STATIC_PATHS].map((path) => new Request(path, { cache: "reload" }))),
      ),
  );
  // No skipWaiting: a new worker never interrupts an active match or reloads a page.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
function staticPath(path) {
  if (path === "/index.html") path = "/";
  if (path.startsWith("/static/") && path.endsWith(".html")) {
    const page = "/" + path.slice(8);
    path = page === "/index.html" ? "/" : page;
  }
  return STATIC_PATHS.has(path) ? path : null;
}
async function cached(path) {
  try {
    return await (await caches.open(CACHE_NAME)).match(path);
  } catch {
    return undefined;
  }
}
async function networkFirst(request, path) {
  try {
    const response = await fetch(request);
    if (path && response.ok && response.type === "basic" && !response.redirected) {
      try {
        await (await caches.open(CACHE_NAME)).put(path, response.clone());
      } catch {}
    }
    if (response.status >= 500 && path) return (await cached(path)) || response;
    return response;
  } catch {
    const saved = path && (await cached(path));
    if (saved) return saved;
    if (request.mode === "navigate") {
      const fallback = await cached("/offline.html");
      if (fallback) return fallback;
    }
    return Response.error();
  }
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Room APIs, random draws, health probes and realtime connections always use the network.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws/") ||
    url.pathname === "/healthz"
  )
    return;
  const path = staticPath(url.pathname);
  if (!path && request.mode !== "navigate") return;
  event.respondWith(networkFirst(request, path));
});
