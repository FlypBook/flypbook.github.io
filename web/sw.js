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
  // cache: "reload" skips the browser's own 10-minute cache, so a new release never saves old files.
  event.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
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
  if (["cdn.jsdelivr.net", "esm.sh", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
    event.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(res => { c.put(req, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // App files: always get the newest version when online (so a new look shows up right away);
  // fall back to the saved copy when offline or if the network takes longer than 3 seconds.
  event.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(req, { ignoreSearch: req.mode === "navigate" });
    const fresh = fetch(req, { cache: "no-cache" }).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
    if (!cached) return fresh;
    const slow = new Promise(r => setTimeout(() => r(cached), 3000));
    return Promise.race([fresh.catch(() => cached), slow]);
  }));
});
