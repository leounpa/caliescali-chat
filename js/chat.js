/* ===== El Parche de Cali · Cliente AJAX ===== */
(function () {
  "use strict";

  var PARAMS = new URLSearchParams(location.search);
  var NICK = (PARAMS.get("nick") || localStorage.getItem("parcheNick") || "").trim().slice(0, 24);
  var SALA = (PARAMS.get("sala") || localStorage.getItem("parcheSala") || "cali").trim();
  var GENERO = (PARAMS.get("genero") || "").trim();
  var MI_AVATAR = "🙂";
  var MI_COLOR = "#007a4d";
  var TOKEN = null;
  var SOY_MOD = false;
  var MI_ROL = "nuevo";
  var MIS_PUNTOS = 0;

  var SALAS_TITULO = {
    cali:"#Cali · Principal", salsa:"#Salsa", rumba:"#Rumba",
    colombia:"#Colombia", general:"#General", amistad:"#Amistad"
  };

  var lastMsgId = 0;
  var lastPrivMsgId = 0;
  var polling = null;
  var userPolling = null;

  var $ = function(id) { return document.getElementById(id); };
  var mensajesEl = $("mensajes");
  var input = $("msg-input");
  var btnSend = $("btn-send");
  var form = $("msg-form");
  var chipUsers = $("chip-users");
  var listUsers = $("list-users");
  var panelUsers = $("panel-users");

  // Private chat
  var privadoCon = null;
  var privados = {};
  var privBar = $("priv-bar");
  var privTitle = $("priv-title");
  var privBack = $("priv-back");

  // Archivo
  var fileInput = $("file-input");
  var adjuntoBar = $("adjunto-bar");
  var adjuntoName = $("adjunto-name");
  var adjuntoRemove = $("adjunto-remove");
  var archivoSeleccionado = null;

  // Emoji
  var btnEmoji = $("btn-emoji");
  var emojiPanel = $("emoji-panel");

  if (!NICK) { location.href = "index.html"; return; }
  $("sala-label").textContent = SALAS_TITULO[SALA] || ("#" + SALA);
  document.title = (SALAS_TITULO[SALA] || ("#" + SALA)) + " · El Parche de Cali";

  // Guardar preferencias
  localStorage.setItem("parcheNick", NICK);
  localStorage.setItem("parcheSala", SALA);

  function esc(t) {
    return t.replace(/[&<>"']/g, function(c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }

  function hora() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // ===== API helpers =====
  function apiGet(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch(e) { cb(e, null); }
      }
    };
    xhr.send();
  }

  function apiPost(url, data, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch(e) { cb(e, null); }
      }
    };
    xhr.send(JSON.stringify(data));
  }

  // ===== Render de mensajes =====
  function anadirMensaje(msg) {
    var div = document.createElement("div");
    var texto = msg.texto || "";

    if (msg.tipo === "sys") {
      div.className = "mensaje sistema";
      div.textContent = texto;
    } else {
      div.className = "mensaje";
      if (msg.propio) div.className += " propio";

      var n = document.createElement("span");
      n.className = "nick";
      var av = document.createElement("span");
      av.className = "avatar-mini";
      av.textContent = msg.avatar || "🙂";
      n.appendChild(av);
      n.appendChild(document.createTextNode(msg.nick));
      n.style.color = msg.color || "#333";
      n.appendChild(crearBadge(msg.rol || "nuevo", msg.esMod));
      div.appendChild(n);

      if (msg.tipo === "archivo") {
        var arch = document.createElement("div");
        arch.className = "texto";
        if (msg.datos && msg.datos.indexOf("image/") !== -1) {
          arch.className += " archivo-img";
          var img = document.createElement("img");
          img.src = msg.datos;
          img.alt = msg.nombre || "Foto";
          arch.appendChild(img);
        } else if (msg.datos && msg.datos.indexOf("video/") !== -1) {
          arch.className += " archivo-vid";
          var v = document.createElement("video");
          v.src = msg.datos;
          v.controls = true;
          v.preload = "metadata";
          arch.appendChild(v);
        } else {
          var a = document.createElement("a");
          a.href = msg.datos;
          a.download = msg.nombre || "archivo";
          a.className = "archivo-link";
          a.textContent = "⬇ " + (msg.nombre || "Descargar");
          arch.appendChild(a);
        }
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

    mensajesEl.appendChild(div);
    mensajesEl.scrollTop = mensajesEl.scrollHeight;
  }

  function crearBadge(rol, esMod) {
    var span = document.createElement("span");
    var r = esMod ? "mod" : (rol || "nuevo");
    span.className = "badge badge-" + r;
    var labels = {nuevo:"Nuevo",activo:"Activo",veterano:"Veterano",leyenda:"Leyenda",mod:"Mod"};
    span.textContent = labels[r] || "Nuevo";
    return span;
  }

  // ===== Chat privado =====
  function abrirPrivado(nick) {
    if (!nick || nick === NICK) return;
    privadoCon = nick;
    if (!privados[nick]) privados[nick] = {msgs:[], lastId:0};
    lastPrivMsgId = privados[nick].lastId || 0;

    privBar.classList.remove("hidden");
    privTitle.textContent = "🔒 Privado con " + nick;

    mensajesEl.innerHTML = "";
    var intro = document.createElement("div");
    intro.className = "mensaje sistema";
    intro.textContent = "🔒 Chat privado con " + nick;
    mensajesEl.appendChild(intro);
    privados[nick].msgs.forEach(function(m) { anadirMensaje(m); });
    input.focus();
    cerrarUsuarios();
  }

  function cerrarPrivado() {
    privadoCon = null;
    lastPrivMsgId = 0;
    privBar.classList.add("hidden");
    mensajesEl.innerHTML = "";
    lastMsgId = 0;
    cargarMensajes();
    input.focus();
  }

  function pintarPrivMsg(msg) {
    var nick = msg.from;
    var key = [NICK, nick].sort().join("|");
    if (!privados[nick]) privados[nick] = {msgs:[], lastId:0};
    var obj = {
      tipo: msg.tipo === "archivo" ? "archivo" : "msg",
      nick: nick,
      texto: msg.texto || "",
      propio: msg.from === NICK,
      privado: true,
      nombre: msg.nombre || "",
      mime: msg.mime || "",
      datos: msg.datos || "",
      color: "#333",
      avatar: "🙂",
      rol: "nuevo"
    };
    privados[nick].msgs.push(obj);
    privados[nick].lastId = msg.id;

    if (privadoCon === nick) {
      anadirMensaje(obj);
      lastPrivMsgId = msg.id;
    } else if (msg.from !== NICK) {
      // Notificación sonora
      if (!document.hidden) {
        try { new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch(e) {}
      }
    }
  }

  // ===== Usuarios =====
  function renderUsuarios(lista) {
    listUsers.innerHTML = "";
    if (!lista.length) {
      var div = document.createElement("div");
      div.style.cssText = "padding:12px;color:#888;text-align:center";
      div.textContent = "Nadie por ahora. ¡Sé el primero!";
      listUsers.appendChild(div);
    } else {
      lista.sort(function(a,b) { return a.nick.localeCompare(b.nick); }).forEach(function(u) {
        var item = document.createElement("div");
        item.className = "usuario-item" + (u.nick === NICK ? " yo" : "");

        var dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = u.color || "#333";
        item.appendChild(dot);

        var nombre = document.createElement("span");
        nombre.className = "nombre";
        nombre.textContent = u.avatar + " " + u.nick;
        nombre.style.color = u.color || "#333";
        item.appendChild(nombre);

        item.appendChild(crearBadge(u.rol, u.esMod));

        if (privados[u.nick] && privados[u.nick].noLeidos > 0) {
          var badge = document.createElement("span");
          badge.className = "no-leidos";
          badge.textContent = privados[u.nick].noLeidos;
          item.appendChild(badge);
        }

        if (u.nick !== NICK) {
          item.addEventListener("click", function() {
            var acc = SOY_MOD
              ? prompt("Acción con " + u.nick + ":\n1. Expulsar\n2. Silenciar\n3. Banear\n4. Hacer moderador\n5. Chat privado", "5")
              : prompt("Acción con " + u.nick + ":\n1. Chat privado\n2. Reportar", "1");
            if (!acc) return;
            var idx = parseInt(acc, 10);
            if (SOY_MOD) {
              if (idx === 1) accionMod(u.nick, "kick");
              else if (idx === 2) {
                var mins = parseInt(prompt("Minutos de silencio:", "5"), 10);
                if (mins) accionMod(u.nick, "mute", {minutos:mins});
              } else if (idx === 3) {
                var hrs = parseInt(prompt("Horas de baneo:", "2"), 10);
                if (hrs) accionMod(u.nick, "ban", {horas:hrs});
              } else if (idx === 4) accionMod(u.nick, "mod");
              else if (idx === 5) abrirPrivado(u.nick);
            } else {
              if (idx === 1) abrirPrivado(u.nick);
            }
          });
        }

        listUsers.appendChild(item);
      });
    }
    chipUsers.textContent = "👥 " + lista.length + " conectado" + (lista.length === 1 ? "" : "s");
  }

  // ===== Moderación =====
  function accionMod(u, accion, extra) {
    var data = {para:u, accion:accion};
    if (extra) Object.keys(extra).forEach(function(k) { data[k] = extra[k]; });
    apiPost("/api/mod?token=" + TOKEN, data, function(err, res) {
      if (res && res.ok && res.texto) {
        anadirMensaje({tipo:"sys", texto:res.texto});
      }
    });
  }

  // ===== Móvil =====
  function cerrarUsuarios() { panelUsers.classList.remove("abierto"); }
  $("btn-toggle-users").addEventListener("click", function() {
    panelUsers.classList.toggle("abierto");
  });
  $("btn-close-users").addEventListener("click", cerrarUsuarios);

  // ===== Archivos =====
  fileInput.addEventListener("change", function() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { alert("Archivo muy grande (máx. 6 MB)."); return; }
    var reader = new FileReader();
    reader.onload = function() {
      archivoSeleccionado = {nombre:f.name||"archivo", mime:f.type||"application/octet-stream", datos:reader.result};
      adjuntoName.textContent = f.name;
      adjuntoBar.classList.remove("hidden");
    };
    reader.readAsDataURL(f);
  });

  adjuntoRemove.addEventListener("click", function() {
    archivoSeleccionado = null;
    adjuntoBar.classList.add("hidden");
    fileInput.value = "";
  });

  // ===== Cámara =====
  $("btn-camera").addEventListener("click", function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      anadirMensaje({tipo:"sys", texto:"Tu navegador no permite la cámara."});
      return;
    }
    navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:320},height:{ideal:240}},audio:false})
      .then(function(stream) {
        var video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.play();
        var canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        setTimeout(function() {
          var ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, 320, 240);
          stream.getTracks().forEach(function(t) { t.stop(); });
          var datos = canvas.toDataURL("image/jpeg", 0.85);
          archivoSeleccionado = {nombre:"foto-camara.jpg", mime:"image/jpeg", datos:datos};
          adjuntoName.textContent = "foto-camara.jpg";
          adjuntoBar.classList.remove("hidden");
          anadirMensaje({tipo:"sys", texto:"📸 Foto capturada. Presiona Enviar."});
        }, 1500);
      })
      .catch(function(err) {
        anadirMensaje({tipo:"sys", texto:"No se pudo abrir la cámara: " + err.message});
      });
  });

  // ===== Emoji =====
  var EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳","😢","😭","😡","🤔","😴","🤗","🙃","😜","🤙","👍","👎","👏","🙏","💪","🔥","❤️","💔","💯","🎶","💃","🕺","🌴","🍺","🍹","🥂","🎉","🎊","⭐","✨","🚀","😅","😇","🥰","😋","🤤","😈","👀","🫶","🙌","🤝","✌️","🤞","🖕","👋","💋","🐶","🐱","🦄","🐯","🌶️","🍕","🌮","⚽","🏆","🎁","🔒","💬","🤷"];
  EMOJIS.forEach(function(e) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-item";
    b.textContent = e;
    b.addEventListener("click", function() {
      input.value += e;
      input.focus();
      emojiPanel.classList.remove("abierto");
    });
    emojiPanel.appendChild(b);
  });
  btnEmoji.addEventListener("click", function() { emojiPanel.classList.toggle("abierto"); });

  // ===== Radio =====
  var radioAudio = $("radio-audio");
  var radioPlay = $("radio-play");
  var radioName = $("radio-name");
  var radioSelect = $("radio-select");
  var radioLista = [
    {nombre:"Radio El Sol", url:"https://us-b4-p-e-qg12-audio.cdn.mdstrm.com/live-audio-aw/632cb6ecaa9ace684913bf19/playlist.m3u8"},
    {nombre:"Rumba Stereo", url:"https://mdstrm.com/audio/632ce17ed1dcd7027f331209/live.m3u8"},
    {nombre:"Olímpica Stereo", url:"https://playerservices.streamtheworld.com/api/livestream-redirect/OLP_CALI.mp3"},
    {nombre:"Boom FM", url:"https://streamming.dobitsoluciones.com/livestream/1"},
    {nombre:"La X", url:"https://tupanel.info/stream/2digitalradioHDsslLIVE040"},
    {nombre:"Oxígeno", url:"https://mdstrm.com/audio/5fab0687bcd6c2389ee9480c/live.m3u8"},
    {nombre:"Los 40", url:"https://playerservices.streamtheworld.com/api/livestream-redirect/%20LOS40_COLOMBIA.mp3"},
    {nombre:"Radio Policía", url:"https://radio35.virtualtronics.com/proxy/radiopolicia964?mp=/stream"}
  ];
  radioAudio.src = radioLista[0].url;
  radioPlay.addEventListener("click", function() {
    if (radioAudio.paused) radioAudio.play().catch(function() {});
    else radioAudio.pause();
  });
  radioSelect.addEventListener("change", function() {
    var emi = radioLista[parseInt(radioSelect.value, 10) || 0];
    radioName.textContent = emi.nombre;
    radioAudio.src = emi.url;
    radioAudio.load();
    radioAudio.play().catch(function() {});
  });
  radioAudio.addEventListener("play", function() { radioPlay.textContent = "⏸"; });
  radioAudio.addEventListener("pause", function() { radioPlay.textContent = "▶"; });

  // ===== Polling de mensajes =====
  function cargarMensajes() {
    if (!TOKEN) return;
    apiGet("/api/messages?sala=" + encodeURIComponent(SALA) + "&since=" + lastMsgId + "&token=" + TOKEN, function(err, res) {
      if (err || !res || !res.messages) return;
      res.messages.forEach(function(m) {
        if (m.id > lastMsgId) lastMsgId = m.id;
        if (m.tipo === "sys") {
          anadirMensaje({tipo:"sys", texto:m.texto});
        } else if (m.tipo === "archivo") {
          anadirMensaje({tipo:"archivo", nick:m.nick, avatar:m.avatar, color:m.color, nombre:m.nombre, mime:m.mime, datos:m.datos, rol:m.rol, esMod:false});
        } else if (m.tipo === "msg") {
          anadirMensaje({tipo:"msg", nick:m.nick, avatar:m.avatar, color:m.color, texto:m.texto, rol:m.rol, esMod:false});
        }
      });
    });
  }

  function cargarPrivMensajes() {
    if (!TOKEN || !privadoCon) return;
    apiGet("/api/priv/messages?con=" + encodeURIComponent(privadoCon) + "&since=" + lastPrivMsgId + "&token=" + TOKEN, function(err, res) {
      if (err || !res || !res.messages) return;
      res.messages.forEach(function(m) {
        pintarPrivMsg(m);
      });
    });
  }

  function cargarUsuarios() {
    if (!TOKEN) return;
    apiGet("/api/users?sala=" + encodeURIComponent(SALA) + "&token=" + TOKEN, function(err, res) {
      if (err || !res || !res.users) return;
      renderUsuarios(res.users);
    });
  }

  function poll() {
    cargarMensajes();
    cargarPrivMensajes();
  }

  // ===== Join =====
  function join() {
    apiPost("/api/join", {nick:NICK, sala:SALA, avatar:MI_AVATAR, color:MI_COLOR}, function(err, res) {
      if (err || !res) {
        anadirMensaje({tipo:"sys", texto:"Error de conexión. Reintentando en 3s..."});
        setTimeout(join, 3000);
        return;
      }
      if (res.error) {
        anadirMensaje({tipo:"sys", texto:res.error});
        setTimeout(function() { location.href = "index.html"; }, 3000);
        return;
      }
      TOKEN = res.token;
      SOY_MOD = res.esMod;
      MI_ROL = res.rol;
      MIS_PUNTOS = res.puntos;
      input.disabled = false;
      btnSend.disabled = false;
      input.focus();

      anadirMensaje({tipo:"sys", texto:"Bienvenido a " + (SALAS_TITULO[SALA] || "#" + SALA) + ", " + NICK + ". Tu rango: " + res.rolLabel + " (" + res.puntos + " pts)"});

      if (SOY_MOD) {
        anadirMensaje({tipo:"sys", texto:"🛡️ Eres moderador. Toca un usuario para moderar."});
      }

      poll();
      cargarUsuarios();
      polling = setInterval(poll, 2000);
      userPolling = setInterval(cargarUsuarios, 3000);
    });
  }

  // ===== Enviar mensaje =====
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    if (!TOKEN) return;

    // Archivo
    if (archivoSeleccionado) {
      if (privadoCon) {
        apiPost("/api/privArchivo?token=" + TOKEN, {para:privadoCon, nombre:archivoSeleccionado.nombre, mime:archivoSeleccionado.mime, datos:archivoSeleccionado.datos}, function(err, res) {
          if (res && res.ok) {
            // Agregar localmente
            var obj = {tipo:"archivo", nick:NICK, texto:"", propio:true, privado:true, nombre:archivoSeleccionado.nombre, mime:archivoSeleccionado.mime, datos:archivoSeleccionado.datos, color:MI_COLOR, avatar:MI_AVATAR, rol:MI_ROL};
            privados[privadoCon].msgs.push(obj);
            anadirMensaje(obj);
          } else if (res && res.error) {
            anadirMensaje({tipo:"sys", texto:res.error});
          }
        });
      } else {
        apiPost("/api/messages?token=" + TOKEN, {nombre:archivoSeleccionado.nombre, mime:archivoSeleccionado.mime, datos:archivoSeleccionado.datos}, function(err, res) {
          if (res && res.error) anadirMensaje({tipo:"sys", texto:res.error});
        });
      }
      archivoSeleccionado = null;
      adjuntoBar.classList.add("hidden");
      fileInput.value = "";
      input.focus();
      return;
    }

    // Texto
    var texto = input.value.trim();
    if (!texto) return;

    if (privadoCon) {
      apiPost("/api/priv?token=" + TOKEN, {para:privadoCon, texto:texto}, function(err, res) {
        if (res && !res.error) {
          var obj = {tipo:"msg", nick:NICK, texto:texto, propio:true, privado:true, color:MI_COLOR, avatar:MI_AVATAR, rol:MI_ROL};
          privados[privadoCon].msgs.push(obj);
          anadirMensaje(obj);
        } else if (res && res.error) {
          anadirMensaje({tipo:"sys", texto:res.error});
        }
      });
    } else {
      apiPost("/api/messages?token=" + TOKEN, {texto:texto}, function(err, res) {
        if (res && res.error) {
          anadirMensaje({tipo:"sys", texto:res.error});
        }
      });
    }
    input.value = "";
    input.focus();
  });

  // ===== Eventos =====
  privBack.addEventListener("click", cerrarPrivado);

  window.addEventListener("beforeunload", function() {
    if (TOKEN) {
      apiPost("/api/leave", {token:TOKEN});
    }
  });

  // ===== Iniciar =====
  join();
})();
