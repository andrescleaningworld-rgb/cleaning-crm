// Service worker for the Team Hub PWA only — registered with { scope:
// "/team-hub/" } by app/team-hub/TeamHubServiceWorkerRegister.tsx, so it
// never controls the main admin app (which keeps using /sw.js at scope
// "/" — see app/components/ServiceWorkerRegister.tsx, untouched). When both
// are registered, the browser picks whichever has the longer matching
// scope for a given URL, so /team-hub/* pages are controlled by this one.
//
// No offline caching yet — Phase 1 only needs a controlling service worker
// to satisfy installability criteria (manifest + SW with a fetch handler).
// Every request is passed straight through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
