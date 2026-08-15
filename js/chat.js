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

  // Moderación
  var soyMod = false;

  // Video en vivo
  var videosPanel = $("videos-panel");
  var videosGrid = $("videos-grid");
  var videosCerrar = $("videos-cerrar");
  var btnCam = $("btn-cam");
  var btnFoto = $("btn-foto");
  var camaraActiva = false;
  var streamCamara = null;
  var videoLocal = null;
  var canvasOculto = null;
  var intervaloVideo = null;
  var videosRemotos = {};           // nick -> {video, img, canvas, ctx}
  var calidadVideo = 12;            // JPEG calidad

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
          var menu = document.createElement("button");
          menu.type = "button";
          menu.className = "btn-menu";
          menu.title = soyMod ? "Moderar" : "Reportar";
          menu.textContent = soyMod ? "🛡️" : "🚩";
          menu.addEventListener("click", function (e) {
            e.stopPropagation();
            preguntarMod(u);
          });
          li.appendChild(menu);
          li.addEventListener("click", function () { preguntarMod(u); });
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

  // ===== Filtro local de ofensivas (aviso) =====
  var OFENSIVAS_LOCAL = [
    "hijueputa", "malparido", "marica", "perra", "puta", "pendejo",
    "huevon", "guevon", "imbecil", "estupido", "idiota", "cabron",
    "zorra", "mierda", "carajo", "verga", "culo", "nazi", "retrasado"
  ];
  function normalizarLocal(t) {
    return t.toLowerCase()
      .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e")
      .replace(/[íìïî]/g, "i").replace(/[óòöô]/g, "o")
      .replace(/[úùüû]/g, "u").replace(/ñ/g, "n")
      .replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function tieneOfensivaLocal(texto) {
    var limpio = " " + normalizarLocal(texto) + " ";
    for (var i = 0; i < OFENSIVAS_LOCAL.length; i++) {
      if (limpio.indexOf(" " + OFENSIVAS_LOCAL[i] + " ") !== -1) return true;
    }
    return false;
  }

  // ===== Video en vivo =====
  function iniciarCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      anadirMensaje({ tipo: "sistema", texto: "Tu navegador no permite la cámara (usa Chrome, Edge o Safari reciente)." });
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } }, audio: false })
      .then(function (stream) {
        streamCamara = stream;
        camaraActiva = true;
        btnCam.textContent = "⏹";
        btnCam.title = "Apagar cámara";
        btnFoto.classList.remove("oculto");
        videoLocal = document.createElement("video");
        videoLocal.srcObject = stream;
        videoLocal.muted = true;
        videoLocal.playsInline = true;
        videoLocal.play();
        canvasOculto = document.createElement("canvas");
        canvasOculto.width = 320;
        canvasOculto.height = 240;
        enviar({ t: "videoOn" });
        anadirMensaje({ tipo: "sistema", texto: "🎥 Cámara en vivo activada." });
        intervaloVideo = setInterval(enviarFrame, 120);
        input.focus();
      })
      .catch(function (err) {
        anadirMensaje({ tipo: "sistema", texto: "No se pudo abrir la cámara: " + err.message + ". Verifica los permisos." });
      });
  }

  function apagarCamara() {
    if (intervaloVideo) { clearInterval(intervaloVideo); intervaloVideo = null; }
    if (streamCamara) {
      streamCamara.getTracks().forEach(function (t) { t.stop(); });
      streamCamara = null;
    }
    camaraActiva = false;
    btnCam.textContent = "🎥";
    btnCam.title = "Activar cámara en vivo";
    btnFoto.classList.add("oculto");
    if (videoLocal) { videoLocal.srcObject = null; videoLocal = null; }
    enviar({ t: "videoOff" });
    anadirMensaje({ tipo: "sistema", texto: "Cámara apagada." });
  }

  function enviarFrame() {
    if (!camaraActiva || !videoLocal || !canvasOculto) return;
    var ctx = canvasOculto.getContext("2d");
    ctx.drawImage(videoLocal, 0, 0, 320, 240);
    var datos = canvasOculto.toDataURL("image/jpeg", calidadVideo);
    enviar({ t: "videoFrame", datos: datos });
  }

  function tomarFoto() {
    if (!camaraActiva || !videoLocal || !canvasOculto) return;
    var ctx = canvasOculto.getContext("2d");
    ctx.drawImage(videoLocal, 0, 0, 320, 240);
    var datos = canvasOculto.toDataURL("image/jpeg", 0.9);
    var adj = { nombre: "foto-en-vivo.jpg", mime: "image/jpeg", datos: datos };
    if (privadoCon) {
      enviar({ t: "privArchivo", para: privadoCon, nombre: adj.nombre, mime: adj.mime, datos: adj.datos });
    } else {
      enviar({ t: "archivo", nombre: adj.nombre, mime: adj.mime, datos: adj.datos });
    }
    anadirMensaje({ tipo: "sistema", texto: "📸 Foto enviada." });
  }

  // ===== Render de videos remotos =====
  function renderVideos() {
    var claves = Object.keys(videosRemotos);
    if (!claves.length) { videosPanel.classList.add("oculto"); return; }
    videosPanel.classList.remove("oculto");
    videosGrid.innerHTML = "";
    claves.sort().forEach(function (nick) {
      var v = videosRemotos[nick];
      var wrap = document.createElement("div");
      wrap.className = "video-remoto";
      var et = document.createElement("span");
      et.className = "video-remoto-nick";
      et.textContent = "🎥 " + nick;
      wrap.appendChild(et);
      var img = document.createElement("img");
      img.alt = "video de " + nick;
      v.img = img;
      wrap.appendChild(img);
      videosGrid.appendChild(wrap);
    });
  }

  function agregarVideoRemoto(nick) {
    if (videosRemotos[nick]) return;
    videosRemotos[nick] = { img: null };
    renderVideos();
    if (!document.hidden) {
      try { new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch (e) {}
    }
  }

  function quitarVideoRemoto(nick) {
    delete videosRemotos[nick];
    renderVideos();
  }

  function actualizarFrameRemoto(nick, datos) {
    var v = videosRemotos[nick];
    if (!v || !v.img) return;
    v.img.src = datos;
  }

  // ===== Moderación (botones por usuario) =====
  function accionMod(u, accion, extra) {
    var msj = { t: "mod", para: u, accion: accion };
    if (extra) Object.keys(extra).forEach(function (k) { msj[k] = extra[k]; });
    enviar(msj);
  }

  function preguntarMod(u) {
    var opciones = [];
    if (soyMod) {
      opciones.push("🚫 Expulsar a " + u, "🔇 Silenciar (minutos)", "🚷 Banear (horas)", "🎖️ Dar permisos de moderador", "Cancelar");
    } else {
      opciones.push("🔒 Chat privado con " + u, "🚩 Reportar a " + u, "Cancelar");
    }
    var r = prompt("Acción con " + u + ":\n" + opciones.map(function (o, i) { return (i + 1) + ". " + o; }).join("\n"), "1");
    if (!r) return;
    var idx = parseInt(r, 10);
    if (soyMod) {
      if (idx === 1) accionMod(u, "kick");
      else if (idx === 2) {
        var mins = parseInt(prompt("Minutos de silencio:", "5"), 10);
        if (mins) accionMod(u, "mute", { minutos: mins });
      } else if (idx === 3) {
        var hrs = parseInt(prompt("Horas de baneo:", "2"), 10);
        if (hrs) accionMod(u, "ban", { horas: hrs });
      } else if (idx === 4) accionMod(u, "mod");
    } else {
      if (idx === 1) abrirPrivado(u);
      else if (idx === 2) {
        enviar({ t: "report", para: u });
        anadirMensaje({ tipo: "sistema", texto: "🚩 Reportaste a " + u + ". Los moderadores lo verán." });
      }
    }
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
        case "rol":
          soyMod = !!m.esMod;
          anadirMensaje({ tipo: "sistema", texto: soyMod ? "🛡️ Eres moderador del Parche. Puedes expulsar, silenciar y banear." : "Eres un usuario. Toca 🚩 para reportar contenido ofensivo." });
          break;
        case "videoOn":
          agregarVideoRemoto(m.de);
          break;
        case "videoOff":
          quitarVideoRemoto(m.de);
          break;
        case "videoFrame":
          actualizarFrameRemoto(m.de, m.datos);
          break;
        case "videoLista":
          (m.lista || []).forEach(function (n) { agregarVideoRemoto(n); });
          break;
        case "report":
          if (soyMod) anadirMensaje({ tipo: "sistema", texto: "🚩 " + m.de + " reportó a " + m.para + ". Toca el usuario y elige la acción." });
          break;
      }
    });

    socket.addEventListener("close", function (ev) {
      conectado = false;
      input.disabled = true;
      btnEnviar.disabled = true;
      if (camaraActiva) apagarCamara();
      var texto = "Se perdió la conexión. Reconectando en 3 segundos...";
      if (ev && ev.reason) texto = ev.reason + " Reconectando en 3 segundos...";
      anadirMensaje({ tipo: "sistema", texto: texto });
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
    if (!privadoCon && tieneOfensivaLocal(texto)) {
      anadirMensaje({ tipo: "sistema", texto: "🚫 Ese mensaje contiene lenguaje ofensivo. La sala es pública: expulsión si se repite. En privado sí puedes hablar libre." });
      input.value = "";
      input.focus();
      return;
    }
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

  btnCam.addEventListener("click", function () {
    if (camaraActiva) apagarCamara();
    else iniciarCamara();
  });
  btnFoto.addEventListener("click", tomarFoto);
  videosCerrar.addEventListener("click", function () {
    videosPanel.classList.add("oculto");
  });

  window.addEventListener("beforeunload", function () {
    if (camaraActiva) apagarCamara();
  });

  conectar();
})();
