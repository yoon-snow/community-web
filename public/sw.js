/* Private-first service worker: no runtime HTML/API/image caching. */
const CACHE = "spotlight-static-v4";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/offline.html", "/icon-192.png"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("spotlight-static-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (["/offline.html", "/icon-192.png"].includes(url.pathname))
    event.respondWith(
      caches.match(event.request).then((c) => c || fetch(event.request)),
    );
});
self.addEventListener("push", (event) => {
  let data = {
    title: "SpotLight",
    body: "새 알림이 있습니다.",
    href: "/notifications",
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  let target = "/notifications";
  try {
    const u = new URL(data.href, self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search;
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.id || undefined,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { href: target },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data?.href || "/notifications"),
  );
});
