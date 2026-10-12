/* El Parche de Cali · Cargador de anuncios $0. Solo carga redes si hay consent + ID. */
(function () {
  "use strict";
  function consent() {
    try { return localStorage.getItem("parcheCookies") === "aceptadas"; } catch (e) { return false; }
  }
  function load(src, attrs) {
    var s = document.createElement("script");
    s.src = src; s.async = true;
    if (attrs) Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
  }
  function showSlots() {
    document.querySelectorAll(".ad-slot").forEach(function (el) { el.style.display = "block"; });
  }
  document.addEventListener("DOMContentLoaded", function () {
    var cfg = window.PARCHE_ADS || {};
    // Donación: si hay URL, actívala
    document.querySelectorAll("[data-donate]").forEach(function (a) {
      if (cfg.donateUrl) { a.href = cfg.donateUrl; a.style.display = ""; }
      else { a.style.display = "none"; }
    });
    if (!consent()) return; // sin aceptar cookies no hay redes de terceros
    var any = false;
    try {
      if (cfg.monetagZoneId) {
        // Monetag multi-tag: vignette + push + in-page. Reemplaza ZONE por tu ID.
        load("https://alwingulla.com/88/tag.min.js", { "data-zone": cfg.monetagZoneId, "data-cfasync": "false" });
        any = true;
      }
      if (cfg.adsterraUrl) {
        // Adsterra Social Bar / Popunder: pega la URL exacta de tu panel
        load(cfg.adsterraUrl);
        any = true;
      }
      if (cfg.aadsId) {
        var slot = document.querySelector("[data-aads]");
        if (slot) {
          var f = document.createElement("iframe");
          f.setAttribute("data-aa", cfg.aadsId);
          f.src = "https://ad.a-ads.com/" + encodeURIComponent(cfg.aadsId) + "?size=320x100";
          f.style.cssText = "border:0;width:320px;max-width:100%;height:100px;overflow:hidden";
          slot.appendChild(f);
          any = true;
        }
      }
    } catch (e) {}
    if (any) showSlots();
  });
})();
