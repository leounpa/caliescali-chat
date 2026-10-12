/* El Parche de Cali · Entrada estilo DaleChat */
function setCookie(e, t, n) {
  var i = new Date(); i.setTime(i.getTime() + 24 * n * 60 * 60 * 1e3);
  var o = "expires=" + i.toUTCString();
  var seg = "; " + o + "; path=/; SameSite=Lax; Secure";
  document.cookie = e + "=" + encodeURIComponent(t) + seg;
}
function getCookie(e) {
  for (var t = e + "=", n = document.cookie.split(";"), i = 0; i < n.length; i++) {
    for (var o = n[i]; " " == o.charAt(0);) o = o.substring(1);
    if (0 == o.indexOf(t)) return decodeURIComponent(o.substring(t.length, o.length));
  }
  return "";
}
var NICK_RE = /^[A-Za-z0-9_.\-\{\}\[\]\|]+$/;
function handleForm() {
  var e = document.getElementById("nick").value.trim();
  var t = document.getElementById("genero").value;
  var n = document.getElementById("form-error");
  var r = document.getElementById("chat-form");
  var o = document.getElementById("tnc").checked;
  if (void 0 === e || 0 === e.length) { n.style.display = "block"; n.innerHTML = "Ingrese su apodo"; return !1; }
  if (!NICK_RE.test(e)) { n.style.display = "block"; n.innerHTML = "El apodo contiene caracteres no permitidos. Usa letras, números y _ . - { } [ ] |"; return !1; }
  if (!o) { n.style.display = "block"; n.innerHTML = "Por favor, acepte nuestros terminos y politicas."; return !1; }
  try { localStorage.setItem("parcheGenero", t); } catch (err) {}
  var ch = document.getElementById("chat-select");
  var chats = ch ? ch.value : "chat1";
  var reg = document.getElementById("registered");
  var isReg = reg ? reg.checked : false;
  var passEl = document.getElementById("pass");
  var pass = passEl ? passEl.value : "";
  if (isReg && (!pass || pass.length < 4)) { n.style.display = "block"; n.innerHTML = "Ingresa tu contraseña de registrado (mín. 4)."; return !1; }
  var d = document.getElementById("remember_me").checked;
  if (d) {
    setCookie("nick", e, 1e3); setCookie("genero", t, 1e3);
    setCookie("chats", chats, 1e3); setCookie("wPass", isReg ? "true" : "", 1e3);
    setCookie("idNC", document.getElementById("idNC").value, 1e3);
  } else {
    ["nick", "genero", "chats", "wPass", "idNC"].forEach(function (k) {
      document.cookie = k + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax";
    });
  }
  var a = "";
  "Hombre" == t && (a = "img/avatar-hombre.png"), "Mujer" == t && (a = "img/avatar-mujer.png");
  function hidden(name, value) {
    var c = document.createElement("input"); c.name = name; c.type = "hidden"; c.value = value; r.appendChild(c);
  }
  hidden("icon", a);
  hidden("isHot", "no");
  hidden("chats", chats);
  hidden("wPass", isReg ? "true" : "false");
  hidden("autoConnect", "true");
  if (isReg) hidden("pass", pass);
  return true;
}
document.addEventListener("DOMContentLoaded", function () {
  var e = document.getElementById("navTouch");
  e && e.addEventListener("click", function () {
    var t = e.getAttribute("data-target"), n = document.getElementById(t);
    e.classList.toggle("is-active"), n.classList.toggle("is-active");
  });
  var reg = document.getElementById("registered");
  var pf = document.getElementById("pass_field");
  function syncPass() { if (pf) pf.style.display = (reg && reg.checked) ? "block" : "none"; }
  if (reg) reg.addEventListener("change", syncPass);
  syncPass();
  var t = getCookie("nick"), n = getCookie("genero"), ch = getCookie("chats"), w = getCookie("wPass");
  document.getElementById("chat-form").onsubmit = handleForm;
  if (void 0 !== t && t.length > 0) { document.getElementById("nick").value = t; document.getElementById("remember_me").checked = !0; }
  if (void 0 !== n && n.length > 0) { document.getElementById("genero").value = n; }
  if (ch && document.getElementById("chat-select")) { document.getElementById("chat-select").value = ch; }
  if (w === "true" && reg) { reg.checked = true; syncPass(); }
  document.querySelectorAll(".bd-link").forEach(function (a) {
    a.addEventListener("click", function () {
      var s = a.getAttribute("data-idnc");
      if (s) {
        document.getElementById("idNC").value = s;
        var sala = a.getAttribute("data-sala");
        if (sala) document.getElementById("chats-hidden").value = sala;
      }
    });
  });
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("sw.js"); } catch (err) {} }
});
