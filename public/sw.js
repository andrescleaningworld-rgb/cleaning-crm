// v5: page data is no longer cached. A new name makes every phone drop the old cache.
const CACHE_NAME = "cleaning-world-shell-v5";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/logo-CW-single-phone-optimized.png",
  "/cw-logo.jpg",
  // Add other critical static paths if needed
];

// Auth/login routes must never be served from or written to cache: they're
// hit by both full navigations and Next.js RSC prefetch fetches (which use
// mode "cors"/destination "" and don't count as isNavigationRequest below),
// and an aborted prefetch on those falling into the cache-first branch is
// what caused unhandled promise rejections in the fetch handler.
const AUTH_PATH_PREFIXES = ["/login", "/portal/login", "/customer-portal/login"];

function isAuthRoute(pathname) {
  return AUTH_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

const CREW_LINK_WAIT_MS = 4000;

async function crewLinkPage(event) {
  const cache = await caches.open(CACHE_NAME);
  const kept = await cache.match(event.request);
  const network = fetch(event.request).then((response) => {
    if (response && response.status === 200) cache.put(event.request, response.clone()).catch(() => undefined);
    return response;
  });
  if (!kept) return network.catch(() => Response.error());
  network.catch(() => undefined); // a later failure is fine: the kept copy was shown
  const slow = new Promise((resolve) => setTimeout(() => resolve(kept), CREW_LINK_WAIT_MS));
  return Promise.race([network.catch(() => kept), slow]);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    // One file at a time, and a file that fails is skipped: with addAll, one
    // missing file would stop this worker from installing and leave phones
    // on the old one.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);

  // For API routes to Google Script backend: always network (live data), but fall back to cache if offline
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Let the browser handle auth/login routes natively (no SW interception at
  // all), covering both real navigations and RSC prefetch requests.
  if (isAuthRoute(url.pathname)) {
    return;
  }

  // Only GETs are ever answered from the cache.
  if (event.request.method !== "GET") {
    return;
  }

  // Next.js page data (what a tap on a link inside the app fetches) must
  // always come fresh from the server. Serving it from the cache showed old
  // pages after a deploy, and a failed fetch made the tap do nothing.
  if (url.searchParams.has("_rsc") || event.request.headers.get("RSC") === "1") {
    return;
  }

  const isNavigationRequest =
    event.request.mode === "navigate" || event.request.destination === "document";

  // Crew Link pages (/porter/<code>): crews open them inside buildings with
  // almost no signal. Network first, but when a kept copy exists, a page
  // that takes longer than a few seconds gets the kept copy (the network
  // answer still refreshes it for next time). Its checklist data is kept by
  // the page itself (app/porter/[code]/page.tsx).
  if (isNavigationRequest && url.pathname.startsWith("/porter/")) {
    event.respondWith(crewLinkPage(event));
    return;
  }

  if (isNavigationRequest) {
    // Network-first for HTML/navigation so users always get the latest shell;
    // only fall back to cache when the network request fails (e.g. offline).
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (images, icons, the manifest) goes to the network as usual.
  if (!url.pathname.startsWith("/_next/static/")) {
    return;
  }

  // Next.js build files: their names change with every build, so cache first
  // is safe for them, and only for them.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for static
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});