/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { immutable, assets, prerendered } from "$app/manifest";
import { version } from "$app/env";

declare const self: ServiceWorkerGlobalScope;

const RETIRED_NAVIGATION_CACHES = new Set(["web-navigation-v1"]);
const LEGACY_CACHE_PREFIX = "pinkslip-";
const DEFAULT_TARGET = "/";
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/notification-badge.svg";

const navigationDenylist = [
  /^\/api(?:\/|$)/,
  /^\/auth\/email\/verify(?:\/|$)/,
  /^\/\.well-known\/apple-app-site-association$/,
  /^\/apple-app-site-association$/,
  /^\/legal\.css$/,
  /^\/privacy(?:\/|$)/,
  /^\/support(?:\/|$)/,
];

cleanupOutdatedCaches();
clientsClaim();

self.addEventListener("install", (event) => {
  // A deployed web release should replace the shell without waiting for every
  // existing tab to close. The client reloads once this worker takes control.
  event.waitUntil(self.skipWaiting());
});

registerRoute(new NavigationRoute(
  async (options) => {
    if (options.request.method !== "GET" || options.url.origin !== self.location.origin) {
      return fetch(options.request);
    }
    try {
      // HTML is deliberately network-only while online. Revisioned JS, CSS,
      // and fonts remain precached; retaining a second HTML cache is what let
      // an old shell survive a successful service-worker update.
      return await fetch(new Request(options.request, { cache: "no-store" }));
    } catch {
      return await matchPrecache("/index.html")
        ?? await matchPrecache("/")
        ?? Response.error();
    }
  },
  { denylist: navigationDenylist },
));

// Route order is significant in Workbox. Register navigation first so a
// precached directory index cannot answer `/` before the network-only shell
// policy gets a chance; the same precache remains available to the fallback.
// Kit supplies the client manifest. Keep costly document engines on demand,
// and retain the static adapter's fallback for offline deep links.
const cacheable = (path: string) =>
  /\.(?:html|js|css|woff2|png|svg|json)$/.test(path)
  && !/(?:typst-compiler|pdf-|pdf\.worker|resume-document\.worker)/.test(path);
precacheAndRoute([
  ...immutable.filter(({ path }) => cacheable(path)).map(({ path }) => ({ url: path, revision: null })),
  ...assets.filter(({ path }) => cacheable(path)).map(({ path }) => ({ url: path, revision: version })),
  ...prerendered.map(({ path }) => ({ url: path, revision: version })),
  { url: "/index.html", revision: version },
]);

function cleanAppTarget(rawTarget: unknown): string {
  if (typeof rawTarget !== "string" || !rawTarget.startsWith("/")) {
    return DEFAULT_TARGET;
  }

  try {
    const parsed = new URL(rawTarget, self.location.origin);
    if (parsed.origin !== self.location.origin) return DEFAULT_TARGET;

    // Push payloads from older deployments used hash routes. Normalize them at
    // the worker boundary so notification clicks always open canonical URLs.
    if (parsed.pathname === "/" && parsed.hash.startsWith("#/")) {
      const legacy = new URL(parsed.hash.slice(1), self.location.origin);
      return `${legacy.pathname}${legacy.search}`;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return DEFAULT_TARGET;
  }
}

function pushJobIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const candidate = (data as { job_ids?: unknown }).job_ids;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((id): id is string => typeof id === "string");
}

async function notifyClients(
  type: "pinkslip:push" | "pinkslip:notification-opened",
  payload: Record<string, unknown>,
): Promise<void> {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windowClients) client.postMessage({ type, ...payload });
}

self.addEventListener("message", (event) => {
  if ((event.data as { type?: unknown } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => (
          key.startsWith(LEGACY_CACHE_PREFIX)
          || RETIRED_NAVIGATION_CACHES.has(key)
        ))
        .map((key) => caches.delete(key)),
    );
  })());
});

self.addEventListener("push", (event) => {
  let payload: {
    title?: unknown;
    body?: unknown;
    data?: unknown;
  } = {};

  try {
    payload = event.data?.json() ?? {};
  } catch {
    // A malformed payload still produces a useful generic notification.
  }

  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : {};
  const targetUrl = cleanAppTarget(data.url);
  const jobIds = pushJobIds(data);
  const title = typeof payload.title === "string" ? payload.title : "Pinkslip";
  const body = typeof payload.body === "string" ? payload.body : "New jobs available";

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      tag: targetUrl,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: { ...data, url: targetUrl, job_ids: jobIds },
    }),
    // Deliberately omit `url`: foreground push refreshes data and badges but
    // must never be interpreted by legacy clients as a navigation request.
    notifyClients("pinkslip:push", { targetUrl, jobIds }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData = event.notification.data;
  const targetUrl = cleanAppTarget(
    notificationData?.url ?? event.notification.tag ?? DEFAULT_TARGET,
  );
  const jobIds = pushJobIds(notificationData);

  event.waitUntil((async () => {
    if (jobIds.length > 0) {
      await fetch("/api/v2/push/opened", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_ids: jobIds }),
      }).catch(() => undefined);
    }

    const target = new URL(targetUrl, self.location.origin).href;
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    const currentClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (currentClient) {
      const navigatedClient = await currentClient.navigate(target);
      await (navigatedClient ?? currentClient).focus();
      (navigatedClient ?? currentClient).postMessage({
        type: "pinkslip:notification-opened",
        url: targetUrl,
        jobIds,
      });
      return;
    }

    await self.clients.openWindow(target);
  })());
});
