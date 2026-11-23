const CACHE_NAME = "sigap-shell-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/internal/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".png") || url.pathname.endsWith(".svg"))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "SIGAP", body: "Ada pembaruan tiket." };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    // Keep the default notification.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url ?? "/";
  let target = "/";
  try {
    const parsed = new URL(rawTarget, self.location.origin);
    if (parsed.origin === self.location.origin) {
      target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    target = "/";
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.focus();
        return existing.navigate(target);
      }
      return self.clients.openWindow(target);
    })
  );
});
