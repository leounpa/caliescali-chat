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

  // Chat privado
  var privadoCon = null;            // nick del privado activo o null
  var privados = {};                // nick -> {msgs:[], noLeidos:0}
  var privadoBorra = $("privado-barra");
  var privadoTitulo = $("privado-titulo");
  var privadoVolver = $("privado-volver");
  var btnUsuarios = $("btn-usuarios");
  var btnCerrarUsuarios = $("btn-cerrar-usuarios");
  var panelUsuarios = $("panel-usuarios");

  // Archivos
  var archivoInput = $("archivo-input");
  var adjuntoVista = $("adjunto-vista");
  var adjuntoNombre = $("adjunto-nombre");
  var adjuntoQuitar = $("adjunto-quitar");
  var archivoSeleccionado = null;   // {nombre, mime, datos(base64)}

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

  function soyYo(nick) { return nick === NICK; }

  // ===== Render de mensajes =====
  // msg: {tipo:"sistema"|"msg"|"archivo"|"priv"|"privArchivo",
  //       nick, texto, propio, privado, nombre, mime, datos}
  function anadirMensaje(msg) {
    var div = document.createElement("div");
    var texto = msg.texto || "";

    if (msg.tipo === "sistema") {
      div.className = "mensaje sistema";
      div.textContent = texto;
    } else {
      if (msg.privado) div.className = "mensaje privado";
      if (msg.propio) div.className += " propio";

      var n = document.createElement("span");
      n.className = "nick";
      n.textContent = msg.nick;
      n.style.color = colorDe(msg.nick);
      div.appendChild(n);

      if (msg.tipo === "archivo" || msg.tipo === "privArchivo") {
        var arch = document.createElement("div");
        arch.className = "archivo";
        var archivoSel = document.createElement("div");
        archivoSel.className = "archivo-sel";
        if (msg.datos && msg.datos.indexOf("image/") !== -1) {
          var img = document.createElement("a");
          img.href = msg.datos;
          img.target = "_blank";
          img.rel = "noopener";
          img.innerHTML = "<img src='" + esc(msg.datos) + "' alt='Foto'>";
          archivoSel.appendChild(img);
        } else if (msg.datos && msg.datos.indexOf("video/") !== -1) {
          var v = document.createElement("video");
          v.src = msg.datos;
          v.controls = true;
          v.preload = "metadata";
          archivoSel.appendChild(v);
        } else {
          var enlace = document.createElement("a");
          enlace.href = msg.datos;
          enlace.download = msg.nombre || "archivo";
          enlace.textContent = "⬇ " + (msg.nombre || "Descargar");
          archivoSel.appendChild(enlace);
        }
        arch.appendChild(archivoSel);
        var etiqueta = document.createElement("span");
        etiqueta.className = "archivo-nombre";
        etiqueta.textContent = msg.nombre || "";
        arch.appendChild(etiqueta);
        div.appendChild(arch);
      } else {
        var t = document.createElement("span");
        t.className = "texto";
        t.innerHTML = esc(texto).replace(/\n/g, "<br>");
        div.appendChild(t);
      }

      var time = document.createElement("span");
      time.className = "hora";
      time.textContent = hora();
      if (msg.privado) time.textContent = "🔒 " + hora();
      div.appendChild(time);
    }
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  // ===== Chat privado =====
  function privadoExiste(nick) {
    return privados[nick] && privados[nick].msgs && privados[nick].msgs.length > 0;
  }

  function abrirPrivado(nick) {
    if (!nick || nick === NICK) return;
    privadoCon = nick;
    if (!privados[nick]) privados[nick] = { msgs: [], noLeidos: 0 };
    privados[nick].noLeidos = 0;

    privadoBorra.classList.remove("oculto");
    privadoTitulo.textContent = "Privado con " + nick;
    document.body.classList.add("en-privado");

    // Limpiar y pintar solo esa conversación
    mensajes.innerHTML = "";
    var intro = document.createElement("div");
    intro.className = "mensaje sistema";
    intro.textContent = "🔒 Chat privado con " + nick + ". Solo ustedes dos ven estos mensajes.";
    mensajes.appendChild(intro);
    privados[nick].msgs.forEach(function (msg) { anadirMensaje(msg); });
    mensajes.scrollTop = mensajes.scrollHeight;
    cerrarUsuariosMovil();
    input.focus();
  }

  function cerrarPrivado() {
    privadoCon = null;
    privadoBorra.classList.add("oculto");
    document.body.classList.remove("en-privado");
    mensajes.innerHTML = "";
    var sis = document.createElement("div");
    sis.className = "mensaje sistema";
    sis.textContent = "Volviste a #" + SALA;
    mensajes.appendChild(sis);
    mensajes.scrollTop = mensajes.scrollHeight;
    input.focus();
  }

  function pintarMensajePrivado(msg) {
    var nick = msg.propio ? msg.de : msg.de;
    var destino = msg.propio ? msg.de : msg.de;
    var clave = destino;
    if (!privados[clave]) privados[clave] = { msgs: [], noLeidos: 0 };
    var obj = {
      tipo: msg.t === "privArchivo" ? "privArchivo" : "priv",
      nick: nick, texto: msg.texto || "",
      propio: !!msg.propio, privado: true,
      nombre: msg.nombre || "", mime: msg.mime || "", datos: msg.datos || ""
    };
    privados[clave].msgs.push(obj);
    if (privadoCon === clave) {
      anadirMensaje(obj);
    } else if (!msg.propio) {
      privados[clave].noLeidos++;
      pintarNoLeidos(clave);
      if (!document.hidden) {
        try { new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch (e) {}
      }
    }
  }

  function pintarNoLeidos(nick) {
    var lis = listaUsuarios.querySelectorAll("li");
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].getAttribute("data-nick") === nick) {
        var b = lis[i].querySelector(".no-leidos");
        if (b) b.textContent = privados[nick].noLeidos;
        break;
      }
    }
  }

  // ===== Usuarios =====
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
        li.setAttribute("data-nick", u);
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.style.color = colorDe(u);
        li.appendChild(dot);
        li.appendChild(document.createTextNode(u));
        if (u !== NICK) {
          var candado = document.createElement("button");
          candado.type = "button";
          candado.className = "btn-candado";
          candado.title = "Hablar en privado";
          candado.textContent = "🔒";
          candado.addEventListener("click", function (e) {
            e.stopPropagation();
            abrirPrivado(u);
          });
          li.appendChild(candado);
          li.addEventListener("click", function () { abrirPrivado(u); });
        } else {
          li.className += " yo";
        }
        if (privados[u] && privados[u].noLeidos > 0) {
          var b = document.createElement("span");
          b.className = "no-leidos";
          b.textContent = privados[u].noLeidos;
          li.appendChild(b);
        }
        listaUsuarios.appendChild(li);
      });
    }
    chip.textContent = "👥 " + usuarios.length + " conectado" + (usuarios.length === 1 ? "" : "s");
  }

  // ===== Móvil: panel de usuarios =====
  function abrirUsuariosMovil() { panelUsuarios.classList.add("abierto"); }
  function cerrarUsuariosMovil() { panelUsuarios.classList.remove("abierto"); }

  // ===== Archivos =====
  function leerArchivo(file, cb) {
    if (!file) return;
    var limite = 6 * 1024 * 1024; // 6 MB
    if (file.size > limite) {
      alert("El archivo es muy grande (máx. 6 MB), parce.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      cb({ nombre: file.name || "archivo", mime: file.type || "application/octet-stream", datos: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function mostrarAdjunto() {
    adjuntoNombre.textContent = archivoSeleccionado.nombre;
    adjuntoVista.classList.remove("oculto");
  }

  // ===== Conexión =====
  function enviar(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
  }

  function conectar() {
    anadirMensaje({ tipo: "sistema", texto: "Conectando al Parche de Cali..." });
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
          if (privadoCon) {
            var info = document.createElement("div");
            info.className = "mensaje sistema";
            info.textContent = m.texto;
            mensajes.appendChild(info);
            mensajes.scrollTop = mensajes.scrollHeight;
          } else {
            anadirMensaje({ tipo: "sistema", texto: m.texto });
          }
          break;
        case "msg":
          if (!privadoCon) anadirMensaje({ tipo: "msg", nick: m.nick, texto: m.texto });
          break;
        case "archivo":
          if (!privadoCon) anadirMensaje({
            tipo: "archivo", nick: m.de, texto: "",
            nombre: m.nombre, mime: m.mime, datos: m.datos
          });
          break;
        case "priv":
        case "privArchivo":
          pintarMensajePrivado(m);
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
      anadirMensaje({ tipo: "sistema", texto: "Se perdió la conexión. Reconectando en 3 segundos..." });
      setTimeout(conectar, 3000);
    });

    socket.addEventListener("error", function () {
      anadirMensaje({ tipo: "sistema", texto: "Error de conexión con el servidor." });
      socket.close();
    });
  }

  // ===== Eventos =====
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!conectado) return;
    if (archivoSeleccionado) {
      if (privadoCon) {
        enviar({ t: "privArchivo", para: privadoCon, nombre: archivoSeleccionado.nombre, mime: archivoSeleccionado.mime, datos: archivoSeleccionado.datos });
      } else {
        enviar({ t: "archivo", nombre: archivoSeleccionado.nombre, mime: archivoSeleccionado.mime, datos: archivoSeleccionado.datos });
      }
      archivoSeleccionado = null;
      adjuntoVista.classList.add("oculto");
      archivoInput.value = "";
      input.focus();
      return;
    }
    var texto = input.value.trim();
    if (!texto) return;
    if (privadoCon) {
      enviar({ t: "priv", para: privadoCon, texto: texto });
    } else {
      enviar({ t: "msg", texto: texto });
    }
    input.value = "";
    input.focus();
  });

  archivoInput.addEventListener("change", function () {
    var f = archivoInput.files && archivoInput.files[0];
    if (!f) return;
    leerArchivo(f, function (adj) {
      archivoSeleccionado = adj;
      mostrarAdjunto();
    });
  });

  adjuntoQuitar.addEventListener("click", function () {
    archivoSeleccionado = null;
    adjuntoVista.classList.add("oculto");
    archivoInput.value = "";
  });

  privadoVolver.addEventListener("click", cerrarPrivado);
  btnUsuarios.addEventListener("click", abrirUsuariosMovil);
  btnCerrarUsuarios.addEventListener("click", cerrarUsuariosMovil);

  conectar();
})();
