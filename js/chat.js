/* ===== El Parche de Cali · cliente de chat ===== */
(function () {
  "use strict";

  var PARAMS = new URLSearchParams(location.search);
  var NICK = (PARAMS.get("nick") || localStorage.getItem("parcheNick") || "").trim().slice(0, 24);
  var SALA = (PARAMS.get("sala") || localStorage.getItem("parcheSala") || "cali").trim();

  var servidor = (function () {
    var config = (window.PARCHE_CONFIG || {});
    if (config.wsUrl) return config.wsUrl;
    var proto = (location.protocol === "https:") ? "wss:" : "ws:";
    return proto + "//" + location.host + "/ws";
  })();

  var colores = ["#e3222a", "#007a4d", "#1a4fd8", "#c000a0", "#b45309", "#0e7490", "#7c3aed", "#db2777"];
  var mapaColor = {};
  var socket = null;
  var conectado = false;
  var usuarios = [];

  var $ = function (id) { return document.getElementById(id); };
  var mensajes = $("mensajes");
  var listaUsuarios = $("lista-usuarios");
  var input = $("mensaje-input");
  var btnEnviar = $("btn-enviar");
  var chip = $("chip-conectados");
  var form = $("form-mensaje");

  if (!NICK) { location.href = "index.html"; return; }
  $("sala-titulo").textContent = "#" + SALA;
  document.title = "#" + SALA + " · El Parche de Cali";

  function esc(t) {
    return t.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function colorDe(nick) {
    if (!mapaColor[nick]) {
      mapaColor[nick] = colores[Object.keys(mapaColor).length % colores.length];
    }
    return mapaColor[nick];
  }

  function hora() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function anadirMensaje(tipo, nick, texto) {
    var div = document.createElement("div");
    div.className = "mensaje";
    if (tipo === "sistema") {
      div.className = "mensaje sistema";
      div.textContent = texto;
    } else {
      var n = document.createElement("span");
      n.className = "nick";
      n.textContent = nick;
      n.style.color = colorDe(nick);
      var t = document.createElement("span");
      t.className = "texto";
      t.innerHTML = esc(texto).replace(/\n/g, "<br>");
      div.appendChild(n);
      div.appendChild(t);
    }
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  function renderUsuarios() {
    listaUsuarios.innerHTML = "";
    if (!usuarios.length) {
      var li = document.createElement("li");
      li.className = "estado";
      li.textContent = "Nadie por ahora. ¡Sé el primero!";
      listaUsuarios.appendChild(li);
    } else {
      usuarios.slice().sort(function (a, b) { return a.localeCompare(b); }).forEach(function (u) {
        var li = document.createElement("li");
        var dot = document.createElement("span");
        dot.textContent = "● ";
        dot.style.color = colorDe(u);
        li.appendChild(dot);
        li.appendChild(document.createTextNode(u));
        listaUsuarios.appendChild(li);
      });
    }
    chip.textContent = "👥 " + usuarios.length + " conectado" + (usuarios.length === 1 ? "" : "s");
  }

  function enviar(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
  }

  function conectar() {
    anadirMensaje("sistema", null, "Conectando al Parche de Cali...");
    socket = new WebSocket(servidor);

    socket.addEventListener("open", function () {
      conectado = true;
      input.disabled = false;
      btnEnviar.disabled = false;
      input.focus();
      enviar({ t: "join", nick: NICK, sala: SALA });
    });

    socket.addEventListener("message", function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case "sys":
          anadirMensaje("sistema", null, m.texto);
          break;
        case "msg":
          anadirMensaje("msg", m.nick, m.texto);
          break;
        case "users":
          usuarios = m.lista || [];
          renderUsuarios();
          break;
      }
    });

    socket.addEventListener("close", function () {
      conectado = false;
      input.disabled = true;
      btnEnviar.disabled = true;
      anadirMensaje("sistema", null, "Se perdió la conexión. Reconectando en 3 segundos...");
      setTimeout(conectar, 3000);
    });

    socket.addEventListener("error", function () {
      anadirMensaje("sistema", null, "Error de conexión con el servidor.");
      socket.close();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var texto = input.value.trim();
    if (!texto || !conectado) return;
    enviar({ t: "msg", texto: texto });
    input.value = "";
    input.focus();
  });

  conectar();
})();
