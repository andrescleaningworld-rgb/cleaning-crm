const CACHE_NAME = "cleaning-world-shell-v1";

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  // Cleaning World needs live data from Google Sheets / Apps Script.
  // No offline data entry for now.
  event.respondWith(fetch(event.request));
});