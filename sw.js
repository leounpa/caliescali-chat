/* El Parche de Cali · Service Worker */
var CACHE = "parche-v1";
var BASE = ["index.html", "salas.html", "chat.html", "css/estilo.css", "js/chat.js", "js/entrada.js", "img/favicon.svg"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.pathname.indexOf("/api/") !== -1 || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
