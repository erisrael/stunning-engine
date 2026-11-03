// Service worker: shows push notifications and opens the right page when one is tapped. Incoming calls show a
// notification that stays until answered, declined or replaced by "Missed call" (same tag).
// Also keeps a small offline page, shown when a page cannot be opened because there is no network (Phase 5b).
const OFFLINE = "myseed-offline-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE).then((c) => c.addAll(["/offline.html", "/brand/myseed-logo.svg"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("myseed-offline-") && k !== OFFLINE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);
// Only page loads: when the network fails, the offline page shows instead of the browser's error. Nothing else is
// cached, so people always see current data.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Myseed", body: event.data ? event.data.text() : "" };
  }
  const call = data.call || null;
  event.waitUntil(
    self.registration.showNotification(data.title || "Myseed", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: "/brand/myseed-logo.svg",
      badge: "/brand/myseed-logo.svg",
      requireInteraction: !!call,
      vibrate: call ? [500, 300, 500, 300, 500, 300, 500, 300, 500] : undefined,
      actions: call
        ? [
            { action: "answer", title: "Answer" },
            { action: "decline", title: "Decline" },
          ]
        : undefined,
      data: { link: data.link || "/dashboard", call },
    }),
  );
});

function openLink(link) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin && "focus" in w) {
        w.navigate(link);
        return w.focus();
      }
    }
    return self.clients.openWindow(link);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (data.call && event.action === "decline") {
    event.waitUntil(
      fetch("/api/calls", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "decline", callId: data.call }) }).catch(() => {}),
    );
    return;
  }
  // Opening the app shows the incoming call screen; "Answer" also answers it there.
  const link = new URL(data.link || "/dashboard", self.location.origin);
  if (data.call && event.action === "answer") link.searchParams.set("answer", data.call);
  event.waitUntil(openLink(link.href));
});
