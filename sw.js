// 只快取同源檔案；不攔截外部請求（YouTube 連結由瀏覽器直接開）。
const CACHE = "ted-koubei-37d8a965";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./data.json", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("ted-koubei-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put("./index.html", c)); return res; })
      .catch(() => caches.match("./index.html", { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
    return res;
  })));
});
