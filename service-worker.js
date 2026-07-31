var CACHE_NAME = "vital-record-notebook-v18";
var APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=18",
  "./app.js?v=16",
  "./manifest.webmanifest",
  "./app-icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        APP_FILES.map(function (file) {
          // ブラウザの保存済みファイルではなく、必ず最新版を取得します。
          return fetch(new Request(file, { cache: "reload" })).then(function (response) {
            return cache.put(file, response);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  var request = event.request.mode === "navigate"
    ? new Request(event.request.url, { cache: "reload" })
    : event.request;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (response) {
          return response || caches.match("./index.html");
        });
      })
  );
});
