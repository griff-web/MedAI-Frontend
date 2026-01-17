// ========================
// MedAI Service Worker
// ========================

const CACHE_NAME = "medai-cache-v1";
const OFFLINE_URL = "offline.html"; // create this in the same folder
const ASSETS_TO_CACHE = [
  "index.html",
  "login.html",
  "reg.html",
  "dashboard.html", // your main dashboard page
  "auth.css",
  "dash.css",
  "auth.js",
  "dash.js",
  "manifest.json",
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdQRHGEmi5WbR1z9s2efKq33kxiId0ir2_dg&s"
];

// ========================
// Install Event - Cache App Shell
// ========================
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[Service Worker] Caching assets...");
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// ========================
// Activate Event - Cleanup old caches
// ========================
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating...");
  event.waitUntil(
    caches.keys().then((keys) => 
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ========================
// Fetch Event - Serve cache first
// ========================
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request)
          .then((networkResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
              // Only cache same-folder requests
              if (request.url.startsWith(self.location.origin)) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            });
          })
          .catch(() => {
            // Offline fallback for HTML pages
            if (request.headers.get("accept")?.includes("text/html")) {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});
