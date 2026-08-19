/* ===== El Parche de Cali · Cliente AJAX ===== */
(function () {
  "use strict";

  function getCookie(e){for(var t=e+"=",n=document.cookie.split(";"),i=0;i<n.length;i++){for(var o=n[i];" "==o.charAt(0);)o=o.substring(1);if(0==o.indexOf(t))return o.substring(t.length,o.length)}return""}

  var PARAMS = new URLSearchParams(location.search);
  var NICK = (getCookie("nick") || PARAMS.get("nick") || localStorage.getItem("parcheNick") || "").trim().slice(0, 24);
  var SALA = (PARAMS.get("sala") || localStorage.getItem("parcheSala") || "cali").trim();
  var GENERO = (getCookie("genero") || PARAMS.get("genero") || localStorage.getItem("parcheGenero") || "").trim();
  var MI_AVATAR = localStorage.getItem("parcheAvatar") || "";
  var MI_COLOR = "#007a4d";
  var TOKEN = null;
  var SOY_MOD = false;
  var MI_ROL = "nuevo";
  var MIS_PUNTOS = 0;
  var MI_PAIS = "🌐";

  // Gender-based default avatar
  if (!MI_AVATAR) {
    MI_AVATAR = (GENERO === "Hombre") ? "👨" : (GENERO === "Mujer") ? "👩" : "🙂";
    localStorage.setItem("parcheAvatar", MI_AVATAR);
  }

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
  localStorage.setItem("parcheGenero", GENERO);

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
      av.style.cursor = "pointer";
      (function(pais) {
        av.addEventListener("click", function(e) {
          e.stopPropagation();
          showFlagAt(e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0), e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0), pais);
        });
      })(msg.pais || "🌐");
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
          (function() {
            var visible = false;
            function show() {
              arch.innerHTML = "";
              var img = document.createElement("img");
              img.src = msg.datos;
              img.alt = msg.nombre || "Foto";
              img.style.cursor = "pointer";
              img.addEventListener("click", hide);
              arch.appendChild(img);
              visible = true;
            }
            function hide() {
              arch.innerHTML = "";
              var ph = document.createElement("div");
              ph.className = "media-placeholder";
              ph.innerHTML = '<i class="fas fa-image"></i> Foto — toca para ver';
              ph.addEventListener("click", show);
              arch.appendChild(ph);
              visible = false;
            }
            var ph = document.createElement("div");
            ph.className = "media-placeholder";
            ph.innerHTML = '<i class="fas fa-image"></i> Foto — toca para ver';
            ph.addEventListener("click", show);
            arch.appendChild(ph);
          })();
        } else if (msg.datos && msg.datos.indexOf("video/") !== -1) {
          arch.className += " archivo-vid";
          (function() {
            var visible = false;
            function show() {
              arch.innerHTML = "";
              var v = document.createElement("video");
              v.src = msg.datos;
              v.controls = true;
              v.preload = "metadata";
              v.addEventListener("click", hide);
              arch.appendChild(v);
              v.play().catch(function() {});
              visible = true;
            }
            function hide() {
              arch.innerHTML = "";
              var ph = document.createElement("div");
              ph.className = "media-placeholder";
              ph.innerHTML = '<i class="fas fa-video"></i> Video — toca para ver';
              ph.addEventListener("click", show);
              arch.appendChild(ph);
              visible = false;
            }
            var ph = document.createElement("div");
            ph.className = "media-placeholder";
            ph.innerHTML = '<i class="fas fa-video"></i> Video — toca para ver';
            ph.addEventListener("click", show);
            arch.appendChild(ph);
          })();
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
    if (!privados[nick]) privados[nick] = {msgs:[], lastId:0, noLeidos:0};
    privados[nick].noLeidos = 0;
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
    renderPrivChips();
    cerrarUsuarios();
  }

  function cerrarPrivado() {
    privadoCon = null;
    lastPrivMsgId = 0;
    privBar.classList.add("hidden");
    mensajesEl.innerHTML = "";
    lastMsgId = 0;
    renderPrivChips();
    cargarMensajes();
    input.focus();
  }

  function eliminarPrivado(nick) {
    if (privadoCon === nick) cerrarPrivado();
    delete privados[nick];
    renderPrivChips();
  }

  function pintarPrivMsg(msg) {
    var nick = msg.from;
    var key = [NICK, nick].sort().join("|");
    if (!privados[nick]) privados[nick] = {msgs:[], lastId:0, noLeidos:0};
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
      privados[nick].noLeidos = (privados[nick].noLeidos || 0) + 1;
      renderPrivChips();
      if (!document.hidden) {
        try { new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch(e) {}
      }
    }
  }

  // ===== Priv chips bar =====
  var privChipsEl = $("priv-chips");

  var privBtnNotif = $("btn-priv-notif");
  var privTotalBadge = $("priv-total-badge");

  function renderPrivChips() {
    privChipsEl.innerHTML = "";
    var totalUnread = 0;
    Object.keys(privados).forEach(function(nick) {
      if (privados[nick].msgs.length === 0 && !privados[nick].noLeidos) return;
      var unread = privados[nick].noLeidos || 0;
      totalUnread += (privadoCon !== nick) ? unread : 0;
      var chip = document.createElement("span");
      chip.className = "priv-chip" + (privadoCon === nick ? " activo" : "");

      var label = document.createElement("span");
      label.textContent = "🔒 " + nick;
      label.addEventListener("click", function(e) {
        e.stopPropagation();
        privados[nick].noLeidos = 0;
        renderPrivChips();
        abrirPrivado(nick);
      });
      chip.appendChild(label);

      if (unread > 0 && privadoCon !== nick) {
        var badge = document.createElement("span");
        badge.className = "unread";
        badge.textContent = unread;
        chip.appendChild(badge);
      }

      var close = document.createElement("span");
      close.className = "close-priv";
      close.textContent = "✕";
      close.addEventListener("click", function(e) {
        e.stopPropagation();
        eliminarPrivado(nick);
      });
      chip.appendChild(close);

      privChipsEl.appendChild(chip);
    });

    privTotalBadge.textContent = totalUnread;
    if (totalUnread > 0) {
      privTotalBadge.classList.add("visible");
      privBtnNotif.style.display = "";
    } else {
      privTotalBadge.classList.remove("visible");
      privBtnNotif.style.display = "none";
    }
  }

  privBtnNotif.addEventListener("click", function() {
    var nicks = Object.keys(privados).filter(function(n) { return privados[n].noLeidos > 0; });
    if (nicks.length > 0) {
      nicks.sort(function(a,b) { return (privados[b].noLeidos||0) - (privados[a].noLeidos||0); });
      privados[nicks[0]].noLeidos = 0;
      renderPrivChips();
      abrirPrivado(nicks[0]);
    }
  });

  // ===== Settings =====
  var AVATARS = ["👨","👩","🙂","😎","🤠","🥳","😇","🤩","😈","💀","👻","🤖","👽","🦁","🐯","🦊","🐱","🐶","🦄","🐸","🐵","🙈","🙉","🙊","🦀","🦞","🌶️","🔥","⚡","🎃","🎸","⚽","🏀","🎯","🎲","🧩","🎨","✈️","🚀","🛸","💡","🔮","💎","🍀","🌴","🌻","🌺","🎵","🎶","🎤"];
  var settingsModal = $("settings-modal");
  var avatarGrid = $("avatar-grid");
  var settingsNick = $("settings-nick");
  var toggleDark = $("toggle-dark");
  var selectedAvatar = MI_AVATAR;
  var darkMode = localStorage.getItem("parcheDark") === "true";

  // Build avatar grid
  AVATARS.forEach(function(av) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-avatar-option" + (av === MI_AVATAR ? " selected" : "");
    btn.textContent = av;
    btn.addEventListener("click", function() {
      avatarGrid.querySelectorAll(".selected").forEach(function(el) { el.classList.remove("selected"); });
      btn.classList.add("selected");
      selectedAvatar = av;
    });
    avatarGrid.appendChild(btn);
  });

  settingsNick.value = NICK;

  if (darkMode) {
    toggleDark.classList.add("on");
    document.body.style.background = "#1a1a2e";
    document.body.style.color = "#e0e0e0";
  }

  $("btn-settings").addEventListener("click", function() {
    settingsNick.value = NICK;
    selectedAvatar = MI_AVATAR;
    avatarGrid.querySelectorAll(".selected").forEach(function(el) { el.classList.remove("selected"); });
    avatarGrid.querySelectorAll(".settings-avatar-option").forEach(function(btn) {
      if (btn.textContent === MI_AVATAR) btn.classList.add("selected");
    });
    settingsModal.classList.remove("hidden");
  });

  $("close-settings").addEventListener("click", function() {
    settingsModal.classList.add("hidden");
  });

  settingsModal.addEventListener("click", function(e) {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });

  toggleDark.addEventListener("click", function() {
    darkMode = !darkMode;
    toggleDark.classList.toggle("on", darkMode);
    localStorage.setItem("parcheDark", darkMode);
    if (darkMode) {
      document.body.style.background = "#1a1a2e";
      document.body.style.color = "#e0e0e0";
    } else {
      document.body.style.background = "";
      document.body.style.color = "";
    }
  });

  $("save-settings").addEventListener("click", function() {
    var newNick = settingsNick.value.trim();
    var data = {};
    if (selectedAvatar !== MI_AVATAR) data.avatar = selectedAvatar;
    if (newNick && newNick !== NICK) data.nick = newNick;
    if (Object.keys(data).length === 0) {
      settingsModal.classList.add("hidden");
      return;
    }
    apiPost("/api/settings?token=" + TOKEN, data, function(err, res) {
      if (res && res.ok) {
        if (res.changes && res.changes.nick) {
          NICK = res.changes.nick;
          localStorage.setItem("parcheNick", NICK);
          anadirMensaje({tipo:"sys", texto:"✅ Ahora te llamas " + NICK});
        }
        if (res.changes && res.changes.avatar) {
          MI_AVATAR = res.changes.avatar;
          localStorage.setItem("parcheAvatar", MI_AVATAR);
        }
        settingsModal.classList.add("hidden");
      } else if (res && res.error) {
        anadirMensaje({tipo:"sys", texto:"⚠️ " + res.error});
      }
    });
  });

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

        var avatarEl = document.createElement("span");
        avatarEl.className = "avatar-mini";
        avatarEl.textContent = u.avatar || "🙂";
        avatarEl.style.cursor = "pointer";
        (function(userNick, userPais) {
          avatarEl.addEventListener("click", function(e) {
            e.stopPropagation();
            showFlagAt(e.clientX || e.touches[0].clientX, e.clientY || e.touches[0].clientY, userPais);
          });
        })(u.nick, u.pais || "🌐");
        item.appendChild(avatarEl);

        var nombre = document.createElement("span");
        nombre.className = "nombre";
        nombre.textContent = u.nick;
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
            if (SOY_MOD) {
              var acc = prompt("Acción con " + u.nick + ":\n1. Expulsar\n2. Silenciar\n3. Banear\n4. Hacer moderador\n5. Chat privado", "5");
              if (!acc) return;
              var idx = parseInt(acc, 10);
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
              abrirPrivado(u.nick);
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
  mensajesEl.addEventListener("click", function() {
    if (panelUsers.classList.contains("abierto")) cerrarUsuarios();
  });

  // Fix mobile keyboard: scroll input into view when keyboard opens
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function() {
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        setTimeout(function() {
          document.activeElement.scrollIntoView({block:"end",behavior:"smooth"});
        }, 100);
      }
    });
  }

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
  var camModal = $("cam-modal");
  var camVideo = $("cam-video");
  var camCanvas = $("cam-canvas");
  var camCapture = $("cam-capture");
  var camCancel = $("cam-cancel");
  var camFlip = $("cam-flip");
  var camModePhoto = $("cam-mode-photo");
  var camModeVideo = $("cam-mode-video");
  var camStream = null;
  var camFacing = "user";
  var camMode = "photo"; // "photo" | "video"
  var camRecorder = null;
  var camChunks = [];

  function camStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      anadirMensaje({tipo:"sys", texto:"Tu navegador no permite la cámara."});
      return;
    }
    var constraints = {video:{facingMode:camFacing, width:{ideal:640}, height:{ideal:480}}, audio:false};
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        camStream = stream;
        camVideo.srcObject = stream;
        camModal.classList.remove("hidden");
        camUpdateMode();
      })
      .catch(function(err) {
        anadirMensaje({tipo:"sys", texto:"No se pudo abrir la cámara: " + err.message});
      });
  }

  function camStop() {
    if (camStream) {
      camStream.getTracks().forEach(function(t) { t.stop(); });
      camStream = null;
    }
    camVideo.srcObject = null;
    camModal.classList.add("hidden");
    camMode = "photo";
  }

  function camUpdateMode() {
    camModePhoto.classList.toggle("activo", camMode === "photo");
    camModeVideo.classList.toggle("activo", camMode === "video");
    camCapture.textContent = camMode === "photo" ? "●" : "🔴";
  }

  $("btn-camera").addEventListener("click", function() {
    camFacing = "user";
    camMode = "photo";
    camStart();
  });

  camCancel.addEventListener("click", camStop);

  camFlip.addEventListener("click", function() {
    camFacing = camFacing === "user" ? "environment" : "user";
    if (camStream) {
      camStream.getTracks().forEach(function(t) { t.stop(); });
    }
    camStart();
  });

  camModePhoto.addEventListener("click", function() {
    if (camMode === "photo") return;
    camMode = "photo";
    camUpdateMode();
  });

  camModeVideo.addEventListener("click", function() {
    if (camMode === "video") return;
    camMode = "video";
    camUpdateMode();
  });

  camCapture.addEventListener("click", function() {
    if (camMode === "photo") {
      camCanvas.width = camVideo.videoWidth || 640;
      camCanvas.height = camVideo.videoHeight || 480;
      var ctx = camCanvas.getContext("2d");
      ctx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);
      var datos = camCanvas.toDataURL("image/jpeg", 0.85);
      archivoSeleccionado = {nombre:"foto-camara.jpg", mime:"image/jpeg", datos:datos};
      adjuntoName.textContent = "foto-camara.jpg";
      adjuntoBar.classList.remove("hidden");
      camStop();
      anadirMensaje({tipo:"sys", texto:"📸 Foto capturada. Presiona Enviar."});
    } else {
      if (camRecorder && camRecorder.state === "recording") {
        camRecorder.stop();
        camCapture.textContent = "🔴";
        return;
      }
      camChunks = [];
      try {
        var mr = window.MediaRecorder || window.mozMediaRecorder || window.webkitMediaRecorder;
        if (!mr) { anadirMensaje({tipo:"sys", texto:"Tu navegador no graba video."}); return; }
        camRecorder = new mr(camStream);
        camRecorder.ondataavailable = function(e) { if (e.data.size > 0) camChunks.push(e.data); };
        camRecorder.onstop = function() {
          var blob = new Blob(camChunks, {type:"video/webm"});
          var reader = new FileReader();
          reader.onload = function() {
            archivoSeleccionado = {nombre:"video-camara.webm", mime:"video/webm", datos:reader.result};
            adjuntoName.textContent = "video-camara.webm";
            adjuntoBar.classList.remove("hidden");
            camStop();
            anadirMensaje({tipo:"sys", texto:"🎬 Video capturado. Presiona Enviar."});
          };
          reader.readAsDataURL(blob);
        };
        camRecorder.start();
        camCapture.textContent = "⏹";
      } catch(e) {
        anadirMensaje({tipo:"sys", texto:"Error al grabar: " + e.message});
      }
    }
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
          anadirMensaje({tipo:"archivo", nick:m.nick, avatar:m.avatar, color:m.color, nombre:m.nombre, mime:m.mime, datos:m.datos, rol:m.rol, esMod:false, pais:m.pais||"🌐"});
        } else if (m.tipo === "msg") {
          anadirMensaje({tipo:"msg", nick:m.nick, avatar:m.avatar, color:m.color, texto:m.texto, rol:m.rol, esMod:false, pais:m.pais||"🌐"});
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
    apiPost("/api/join", {nick:NICK, sala:SALA, avatar:MI_AVATAR, color:MI_COLOR, genero:GENERO}, function(err, res) {
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
      MI_PAIS = res.pais || "🌐";
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

  // ===== Sala switcher =====
  var salaSwitcher = $("sala-switcher");
  if (salaSwitcher) {
    Object.keys(SALAS_TITULO).forEach(function(key) {
      var btn = document.createElement("button");
      btn.textContent = SALAS_TITULO[key];
      btn.className = (key === SALA) ? "sala-active" : "";
      btn.addEventListener("click", function() {
        if (key === SALA || !TOKEN) return;
        apiPost("/api/switch?token=" + TOKEN, {sala:key}, function(err, res) {
          if (res && res.ok) {
            SALA = key;
            localStorage.setItem("parcheSala", SALA);
            $("sala-label").textContent = SALAS_TITULO[SALA] || ("#" + SALA);
            document.title = (SALAS_TITULO[SALA] || ("#" + SALA)) + " · El Parche de Cali";
            lastMsgId = 0;
            mensajesEl.innerHTML = "";
            salaSwitcher.querySelectorAll("button").forEach(function(b) { b.classList.remove("sala-active"); });
            btn.classList.add("sala-active");
            cargarMensajes();
            cargarUsuarios();
            anadirMensaje({tipo:"sys", texto:"➡️ Ahora estás en " + SALAS_TITULO[SALA]});
          } else if (res && res.error) {
            anadirMensaje({tipo:"sys", texto:res.error});
          }
        });
      });
      salaSwitcher.appendChild(btn);
    });
  }

  // ===== Flag popup on avatar click =====
  var flagPopup = $("flag-popup");
  var flagBig = $("flag-big");
  var flagCountry = $("flag-country");

  var COUNTRY_NAMES = {
    "🇨🇴":"Colombia","🇺🇸":"Estados Unidos","🇲🇽":"México","🇪🇸":"España","🇦🇷":"Argentina",
    "🇨🇱":"Chile","🇵🇪":"Perú","🇻🇪":"Venezuela","🇪🇨":"Ecuador","🇧🇷":"Brasil",
    "🇧🇴":"Bolivia","🇵🇾":"Paraguay","🇺🇾":"Uruguay","🇨🇷":"Costa Rica","🇵🇦":"Panamá",
    "🇭🇳":"Honduras","🇬🇹":"Guatemala","🇸🇻":"El Salvador","🇳🇮":"Nicaragua","🇨🇺":"Cuba",
    "🇩🇴":"República Dominicana","🇵🇷":"Puerto Rico","🇩🇪":"Alemania","🇫🇷":"Francia",
    "🇮🇹":"Italia","🇬🇧":"Reino Unido","🇨🇦":"Canadá","🇯🇵":"Japón","🇨🇳":"China",
    "🇰🇷":"Corea del Sur","🇮🇳":"India","🇦🇺":"Australia","🇿🇦":"Sudáfrica","🇳🇬":"Nigeria"
  };

  function showFlagAt(x, y, pais) {
    flagBig.textContent = pais || "🌐";
    flagCountry.textContent = COUNTRY_NAMES[pais] || "";
    flagPopup.style.display = "block";
    flagPopup.style.left = Math.min(x, window.innerWidth - 140) + "px";
    flagPopup.style.top = Math.max(0, y - 80) + "px";
  }

  document.addEventListener("click", function(e) {
    if (!flagPopup.contains(e.target)) {
      flagPopup.style.display = "none";
    }
  });

  // ===== Iniciar =====
  join();
})();
