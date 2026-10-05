/* CMD Academy service worker: makes the app work offline.
   The cache name changes on every build, so a new version replaces the old one. */
const CACHE = "cmd-academy-5c4326439d";
const FILES = ["./", "index.html", "manifest.webmanifest", "fonts/jetbrains-mono-latin-400-normal.woff2", "fonts/jetbrains-mono-latin-600-normal.woff2", "fonts/jetbrains-mono-latin-700-normal.woff2", "fonts/vazirmatn-arabic-400-normal.woff2", "fonts/vazirmatn-arabic-500-normal.woff2", "fonts/vazirmatn-arabic-700-normal.woff2", "fonts/vazirmatn-latin-400-normal.woff2", "fonts/vazirmatn-latin-500-normal.woff2", "fonts/vazirmatn-latin-700-normal.woff2", "icons/apple-touch-icon.png", "icons/favicon.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isPage = e.request.mode === "navigate";
  if (isPage) {
    // Online: get the newest version. Offline: use the saved copy.
    e.respondWith(
      fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("./", copy)); return r; })
        .catch(() => caches.match("./").then((r) => r || caches.match("index.html")))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
