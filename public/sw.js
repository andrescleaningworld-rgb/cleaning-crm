const CACHE_NAME = "cleaning-world-shell-v4";
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

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
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

  const isNavigationRequest =
    event.request.mode === "navigate" || event.request.destination === "document";

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

  // For other static assets: cache first, then network
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