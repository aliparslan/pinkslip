// Web push for Pinkslip (port plan 4.8). Push and notification clicks only:
// no fetch handler and no caches, so the network always serves the app. The
// retired Svelte worker's URL (/sw.js) stays a kill switch.

const DEFAULT_TARGET = "/";
const ICON = "/icons/icon-192.png";
const BADGE = "/icons/notification-badge.svg";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only same-origin app paths; legacy hash routes (#/jobs/…) become real ones.
function cleanTarget(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return DEFAULT_TARGET;
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin !== self.location.origin) return DEFAULT_TARGET;
    if (url.pathname === "/" && url.hash.startsWith("#/")) {
      const legacy = new URL(url.hash.slice(1), self.location.origin);
      return `${legacy.pathname}${legacy.search}`;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_TARGET;
  }
}

function jobIds(data) {
  const ids = data && typeof data === "object" ? data.job_ids : undefined;
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

async function tellPages(message) {
  const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const page of pages) page.postMessage(message);
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload still shows a useful notification.
  }
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const target = cleanTarget(data.url);
  const ids = jobIds(data);
  event.waitUntil(Promise.all([
    self.registration.showNotification(typeof payload.title === "string" ? payload.title : "Pinkslip", {
      body: typeof payload.body === "string" ? payload.body : "New jobs available",
      tag: target,
      icon: ICON,
      badge: BADGE,
      data: { ...data, url: target, job_ids: ids },
    }),
    // Open pages refresh their lists; a push never navigates them.
    tellPages({ type: "pinkslip:push", jobIds: ids }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = cleanTarget(data.url || event.notification.tag);
  const ids = jobIds(data);
  event.waitUntil((async () => {
    if (ids.length > 0) {
      await fetch("/api/v2/push/opened", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_ids: ids }),
      }).catch(() => undefined);
    }
    const url = new URL(target, self.location.origin).href;
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const page = pages.find((client) => new URL(client.url).origin === self.location.origin);
    if (page) {
      const opened = (await page.navigate(url).catch(() => null)) || page;
      await opened.focus();
      return;
    }
    await self.clients.openWindow(url);
  })());
});
