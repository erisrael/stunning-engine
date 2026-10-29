// Service worker: shows push notifications and opens the right page when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Myseed", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Myseed", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: "/brand/myseed-logo.svg",
      badge: "/brand/myseed-logo.svg",
      data: { link: data.link || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = new URL((event.notification.data && event.notification.data.link) || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(link);
          return w.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
