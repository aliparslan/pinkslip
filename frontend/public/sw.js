const VERSION =
  new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `pinkslip-${VERSION}`;
const APP_SHELL = ["/", "/index.html"];

function notifyClients(type, payload = {}) {
  return clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windowClients) =>
      Promise.all(
        windowClients.map((client) => client.postMessage({ type, ...payload }))
      )
    );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
          return response;
        })
        .catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "pinkslip", body: "New jobs available", data: { url: "/" } };

  try {
    data = event.data.json();
  } catch (e) {
    // Use defaults
  }

  const url = data.data?.url ?? "/";

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: url,
        data: data.data,
      }),
      notifyClients("pinkslip:push", { url }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? event.notification.tag ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            await client.focus();
            await client.navigate(self.location.origin + "/#" + url);
            client.postMessage({ type: "pinkslip:notification-opened", url });
            return;
          }
        }
        return clients.openWindow(self.location.origin + "/#" + url);
      })
  );
});
