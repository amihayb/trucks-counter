const CACHE_NAME = "trucks-log-v2.8";
const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./images/whatsapp.png",
    "./images/icon-192.png",
    "./images/icon-512.png"
];

/* =========================================================
   INSTALL: Cache all necessary files
========================================================= */
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Force cache reload
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

/* =========================================================
   ACTIVATE: Clean up old caches
========================================================= */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log("Removing old cache:", key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

/* =========================================================
   FETCH: Network First, Fallback to Cache
   (This strategy helps see updates faster)
========================================================= */
self.addEventListener("fetch", (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});