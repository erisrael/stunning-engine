// Myseed Fun (the installed Fun mode): the app's code, styles, fonts and icons are kept on this device, so it opens
// fast and only small data travels (positions, scores, music lists). Pages and data always come from the server,
// so sign-in and updates stay current.
const CACHE = "myseed-fun-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("myseed-fun-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Built files never change under the same name: from the device first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/api/branding/favicon")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // The Fun page itself: from the network, the last copy when offline.
  if (req.mode === "navigate" && url.pathname === "/fun") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || new Response("Myseed Fun needs a connection to sign in.", { headers: { "Content-Type": "text/plain" } })),
    );
  }
});
