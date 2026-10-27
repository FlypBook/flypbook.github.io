// FlypBook service worker: makes the app installable and open instantly.
// The deploy replaces BUILD with the commit id, so every release refreshes the cache.
const CACHE = "flypbook-BUILD";
const SHELL = [
  "./", "index.html", "styles.css", "config.js", "app.js", "narrator.js", "account.js",
  "backgrounds.js", "gameplay.js", "game3d.js", "game3d_more.js", "games_kit.js",
  "games_ride.js", "games_fp.js", "games_satisfy.js", "games_arcade.js",
  "manifest.json", "videos.json", "privacy.html", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Stories, accounts, and narration are always live; videos stream (ranges don't cache well).
  if (url.hostname.endsWith("supabase.co") || url.pathname.endsWith(".mp4")) return;
  // The 3D engine from the CDN never changes for a pinned version: cache it forever.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "esm.sh") {
    event.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(res => { c.put(req, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // App files: answer from cache instantly, refresh in the background.
  event.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(req, { ignoreSearch: req.mode === "navigate" });
    const fresh = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});
