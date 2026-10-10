// Kill switch for the retired Svelte site's service worker (port plan 3.4).
//
// The old worker at this URL precached the Svelte app shell and answered every
// navigation from that cache, so installed PWAs and old tabs would keep showing
// the old app. Browsers re-check this URL on navigation, bypassing the HTTP
// cache; when they find this version it installs, deletes every cache the old
// worker made, unregisters itself and reloads its open pages from the network.
//
// The React app registers no service worker. When web push arrives (4.8) it
// gets a new, push-only worker at a new URL; this file stays so stragglers
// still get cleaned up.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => undefined)));
  })());
});
