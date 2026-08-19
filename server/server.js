/* ===== El Parche de Cali · Servidor REST ===== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUERTO = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "..");
const MAX_NICK = 24;
const MAX_MSG = 500;
const MAX_ARCHIVO = 6 * 1024 * 1024;
const MAX_MENSAJES = 15;
const MEDIA_EXPIRY_MS = 10 * 60 * 1000;
const LIMITE_SILENCIO = 10 * 60 * 1000;

const TIPOS = {
  "html": "text/html; charset=utf-8",
  "css": "text/css; charset=utf-8",
  "js": "application/javascript; charset=utf-8",
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "svg": "image/svg+xml",
  "ico": "image/x-icon",
  "webp": "image/webp",
  "json": "application/json",
  "woff": "font/woff",
  "woff2": "font/woff2"
};

const SALAS = { cali:"#Cali", salsa:"#Salsa", rumba:"#Rumba", colombia:"#Colombia", general:"#General", amistad:"#Amistad" };

// ===== Country flags from IP (free ip-api) =====
const countryCache = new Map();
function getCountryFlag(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return "🇨🇴";
  if (countryCache.has(ip)) return countryCache.get(ip);
  var flag = "🌐";
  try {
    const httpMod = require("http");
    const url = "http://ip-api.com/json/" + ip + "?fields=countryCode";
    const req2 = httpMod.get(url, {timeout:2000}, function(res2) {
      var d = "";
      res2.on("data", function(c) { d += c; });
      res2.on("end", function() {
        try {
          var j = JSON.parse(d);
          if (j.countryCode) {
            var cc = j.countryCode.toUpperCase();
            var f = String.fromCodePoint(...cc.split("").map(function(c){return 0x1F1E6+c.charCodeAt(0)-65}));
            countryCache.set(ip, f);
          }
        } catch(e) {}
      });
    });
    req2.on("error", function() {});
    req2.end();
  } catch(e) {}
  return flag;
}

// ===== Estado en memoria =====
let msgIdCounter = 0;
const mensajes = {};
Object.keys(SALAS).forEach(k => { mensajes[k] = []; });
const privados = {};
const usuarios = {};
const nickTokens = {};

// ===== Moderación =====
const MOD_ADMIN = (process.env.MOD_ADMIN || "").trim();
const mods = new Set();
const banes = new Map();
const mutes = new Map();
const historial = new Map();

// ===== Roles y puntos =====
const ROLES = {
  nuevo:    { nombre:"nuevo",    label:"Nuevo",    puntos:0,   color:"#3730a3" },
  activo:   { nombre:"activo",   label:"Activo",   puntos:10,  color:"#065f46" },
  veterano: { nombre:"veterano", label:"Veterano", puntos:50,  color:"#92400e" },
  leyenda:  { nombre:"leyenda",  label:"Leyenda",  puntos:200, color:"#9d174d" }
};
const PUNTOS_POR_MSG = 1;
const PUNTOS_POR_INTERVALO = 3;
const ARCHIVO_ROLES = path.join(__dirname, "roles.json");
let usuariosPuntos = {};

function cargarRoles() {
  try { if (fs.existsSync(ARCHIVO_ROLES)) usuariosPuntos = JSON.parse(fs.readFileSync(ARCHIVO_ROLES, "utf8")); } catch(e) { usuariosPuntos = {}; }
}
function guardarRoles() { try { fs.writeFileSync(ARCHIVO_ROLES, JSON.stringify(usuariosPuntos, null, 2)); } catch(e) {} }
cargarRoles();

function rolDe(nick) {
  const p = usuariosPuntos[nick];
  if (!p) return ROLES.nuevo;
  const pts = p.puntos || 0;
  if (pts >= 200) return ROLES.leyenda;
  if (pts >= 50) return ROLES.veterano;
  if (pts >= 10) return ROLES.activo;
  return ROLES.nuevo;
}

function sumarPuntos(nick, cantidad) {
  if (!usuariosPuntos[nick]) {
    usuariosPuntos[nick] = { puntos:0, mensajes:0, tiempoInicio:Date.now(), rolAnterior:"nuevo" };
  }
  const u = usuariosPuntos[nick];
  const rolViejo = rolDe(nick);
  u.puntos = (u.puntos || 0) + cantidad;
  if (cantidad === PUNTOS_POR_MSG) u.mensajes = (u.mensajes || 0) + 1;
  const rolNuevo = rolDe(nick);
  u.rolAnterior = rolNuevo.nombre;
  guardarRoles();
  return { rolViejo, rolNuevo, subio: rolViejo.nombre !== rolNuevo.nombre };
}

// ===== Filtro ofensivas =====
const OFENSIVAS = [
  "hijueputa","hijuepucha","malparido","malparida","marica","maricon",
  "perra","puta","puto","pendejo","pendeja","huevon","huevona",
  "guevon","guevona","imbecil","estupido","estupida","idiota",
  "cabron","cabrona","zorra","mierda","carajo","verga",
  "culo","culero","nazi","fascista","retrasado","mongol","negro",
  "judio","chino","gordo","feo","bobo","tonto","asqueroso"
];

function normalizar(t) {
  return t.toLowerCase()
    .replace(/[áàäâ]/g,"a").replace(/[éèëê]/g,"e")
    .replace(/[íìïî]/g,"i").replace(/[óòöô]/g,"o")
    .replace(/[úùüû]/g,"u").replace(/ñ/g,"n")
    .replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim();
}

function tieneOfensiva(t) {
  const l = " " + normalizar(t) + " ";
  return OFENSIVAS.some(p => l.includes(" " + p + " "));
}

function estaBaneado(nick) {
  const b = banes.get(nick);
  if (!b) return null;
  if (b.hasta <= Date.now()) { banes.delete(nick); return null; }
  return b;
}

function estaMuteado(nick) {
  const m = mutes.get(nick);
  if (!m) return false;
  if (m.hasta <= Date.now()) { mutes.delete(nick); return false; }
  return true;
}

function horasRestantes(ms) { return Math.max(0, Math.ceil((ms - Date.now()) / 3600000)); }

function registrarInfraccion(nick) {
  const h = historial.get(nick) || { expulsiones:0 };
  h.expulsiones = (h.expulsiones || 0) + 1;
  historial.set(nick, h);
  const horas = [0, 2, 4, 8, 24, 48];
  const idx = Math.min(h.expulsiones, horas.length) - 1;
  banes.set(nick, { hasta: Date.now() + horas[idx] * 3600000 });
  return h;
}

function esMod(nick) { return mods.has(nick) || nick === MOD_ADMIN; }

// ===== Utilidades =====
function generarToken() { return crypto.randomBytes(16).toString("hex"); }

function agregarMensaje(sala, data) {
  data.id = ++msgIdCounter;
  data.fecha = Date.now();
  if (!mensajes[sala]) mensajes[sala] = [];
  mensajes[sala].push(data);
  if (mensajes[sala].length > MAX_MENSAJES) mensajes[sala].shift();
  return data;
}

function usuariosEnSala(sala) {
  const lista = [];
  Object.keys(usuarios).forEach(function(token) {
    const u = usuarios[token];
    if (u.sala === sala) {
      const r = rolDe(u.nick);
      const pts = (usuariosPuntos[u.nick] || {}).puntos || 0;
      lista.push({ nick:u.nick, avatar:u.avatar, color:u.color, rol:r.nombre, rolLabel:r.label, puntos:pts, esMod:esMod(u.nick), pais:u.pais||"🌐" });
    }
  });
  return lista;
}

function buscarTokenPorNick(nick) {
  return nickTokens[nick] || null;
}

// ===== Utilidades HTTP =====
function jsonRes(res, code, obj) {
  res.writeHead(code, { "Content-Type":"application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    var body = "";
    req.on("data", function(chunk) {
      body += chunk;
      if (body.length > MAX_ARCHIVO + 1024) { req.destroy(); reject(new Error("too large")); }
    });
    req.on("end", function() { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
    req.on("error", function(e) { reject(e); });
  });
}

function leerQuery(url) {
  var params = {};
  var idx = url.indexOf("?");
  if (idx === -1) return params;
  var qs = url.slice(idx + 1).split("&");
  for (var i = 0; i < qs.length; i++) {
    var par = qs[i].split("=");
    if (par.length === 2) params[decodeURIComponent(par[0])] = decodeURIComponent(par[1]);
  }
  return params;
}

// ===== Servidor HTTP =====
var servidor = http.createServer(function(req, res) {
  var ruta = decodeURIComponent(req.url.split("?")[0]);
  if (ruta === "/") ruta = "/index.html";

  var params = leerQuery(req.url);

  // === API REST ===
  if (ruta.indexOf("/api/") === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // POST /api/join
    if (ruta === "/api/join" && req.method === "POST") {
      parseBody(req).then(function(b) {
        var nick = (b.nick || "").trim().slice(0, MAX_NICK);
        var sala = b.sala || "cali";
        var avatar = (b.avatar || "🙂").slice(0, 8);
        var color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#007a4d";
        var genero = (b.genero || "").trim();

        if (!nick || nick.length < 2) return jsonRes(res, 400, { error:"Apodo inválido (mín. 2 caracteres)." });
        if (!SALAS[sala]) return jsonRes(res, 400, { error:"Sala inválida." });

        var baneo = estaBaneado(nick);
        if (baneo) return jsonRes(res, 403, { error:"Estás expulsado. Vuelve en " + horasRestantes(baneo.hasta) + " hora(s)." });

        // Desconectar sesión anterior del mismo nick
        var tokenViejo = nickTokens[nick];
        if (tokenViejo && usuarios[tokenViejo]) {
          var viejo = usuarios[tokenViejo];
          agregarMensaje(viejo.sala, { tipo:"sys", texto:"👋 " + nick + " se reconectó", nick:"" });
          delete usuarios[tokenViejo];
        }

        // Detect country from IP
        var clientIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
        var pais = getCountryFlag(clientIp);

        var token = generarToken();
        usuarios[token] = { nick:nick, sala:sala, avatar:avatar, color:color, visto:Date.now(), genero:genero, pais:pais };
        nickTokens[nick] = token;

        if (!usuariosPuntos[nick]) {
          usuariosPuntos[nick] = { puntos:0, mensajes:0, tiempoInicio:Date.now(), rolAnterior:"nuevo" };
          guardarRoles();
        } else {
          usuariosPuntos[nick].tiempoInicio = Date.now();
          guardarRoles();
        }

        // Primer usuario es moderador
        if (mods.size === 0 && !esMod(nick)) {
          mods.add(nick);
        }

        agregarMensaje(sala, { tipo:"sys", texto:"🎉 " + nick + " entró al Parche de Cali", nick:"" });

        var miRol = rolDe(nick);
        jsonRes(res, 200, {
          token:token,
          nick:nick,
          sala:sala,
          rol:miRol.nombre,
          rolLabel:miRol.label,
          puntos:usuariosPuntos[nick].puntos,
          esMod:esMod(nick),
          genero:genero,
          pais:pais
        });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // GET /api/messages?sala=X&since=0&token=T
    if (ruta === "/api/messages" && req.method === "GET") {
      var token = params.token;
      var sala = params.sala || "cali";
      var since = parseInt(params.since || "0", 10);
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      usuarios[token].visto = Date.now();
      var msgs = mensajes[sala] || [];
      var filtrados = since ? msgs.filter(function(m) { return m.id > since; }) : msgs.slice(-50);
      jsonRes(res, 200, { messages:filtrados, lastId:msgIdCounter });
      return;
    }

    // POST /api/messages?token=T
    if (ruta === "/api/messages" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];

      if (estaMuteado(u.nick)) return jsonRes(res, 403, { error:"🔇 Estás silenciado." });

      parseBody(req).then(function(b) {
        // Archivo
        if (b.nombre && b.mime && b.datos) {
          if (b.datos.length > MAX_ARCHIVO) return jsonRes(res, 400, { error:"Archivo muy grande (máx. 6 MB)." });
          sumarPuntos(u.nick, PUNTOS_POR_MSG);
          var rol = rolDe(u.nick);
          agregarMensaje(u.sala, { tipo:"archivo", nick:u.nick, avatar:u.avatar, color:u.color, nombre:b.nombre, mime:b.mime, datos:b.datos, rol:rol.nombre, puntos:(usuariosPuntos[u.nick]||{}).puntos||0, pais:u.pais||"🌐" });
          return jsonRes(res, 200, { ok:true });
        }

        // Texto
        var texto = String(b.texto || "").trim().slice(0, MAX_MSG);
        if (!texto) return jsonRes(res, 400, { error:"Mensaje vacío." });

        if (tieneOfensiva(texto)) {
          var inf = registrarInfraccion(u.nick);
          var aviso = inf.expulsiones === 1
            ? "⚠️ Advertencia por lenguaje ofensivo. Es tu 1ª."
            : "🚫 Expulsado " + horasRestantes(banes.get(u.nick).hasta) + "h por lenguaje ofensivo. #" + inf.expulsiones;
          return jsonRes(res, 403, { error:aviso });
        }

        var r = sumarPuntos(u.nick, PUNTOS_POR_MSG);
        agregarMensaje(u.sala, { tipo:"msg", nick:u.nick, avatar:u.avatar, color:u.color, texto:texto, rol:r.rolNuevo.nombre, puntos:(usuariosPuntos[u.nick]||{}).puntos||0, pais:u.pais||"🌐" });

        if (r.subio) {
          agregarMensaje(u.sala, { tipo:"sys", texto:"🎉 ¡" + u.nick + " alcanzó el rango de " + r.rolNuevo.label + "! 🏆", nick:"" });
        }

        jsonRes(res, 200, { ok:true });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // POST /api/priv?token=T
    if (ruta === "/api/priv" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];

      parseBody(req).then(function(b) {
        var para = String(b.para || "").trim();
        var texto = String(b.texto || "").trim().slice(0, MAX_MSG);
        if (!para || !texto) return jsonRes(res, 400, { error:"Faltan datos." });
        if (para === u.nick) return jsonRes(res, 400, { error:"No puedes escribirte a ti mismo." });

        // Verificar que destino existe
        if (!nickTokens[para]) return jsonRes(res, 404, { error: para + " no está conectado." });

        var key = [u.nick, para].sort().join("|");
        if (!privados[key]) privados[key] = [];
        privados[key].push({ id:++msgIdCounter, from:u.nick, texto:texto, fecha:Date.now(), tipo:"msg" });
        if (privados[key].length > 100) privados[key] = privados[key].slice(-50);

        jsonRes(res, 200, { ok:true });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // POST /api/privArchivo?token=T
    if (ruta === "/api/privArchivo" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];

      parseBody(req).then(function(b) {
        var para = String(b.para || "").trim();
        if (!para || para === u.nick) return jsonRes(res, 400, { error:"Faltan datos." });
        if (!nickTokens[para]) return jsonRes(res, 404, { error: para + " no está conectado." });
        if (!b.nombre || !b.mime || !b.datos) return jsonRes(res, 400, { error:"Faltan datos del archivo." });
        if (b.datos.length > MAX_ARCHIVO) return jsonRes(res, 400, { error:"Archivo muy grande (máx. 6 MB)." });

        var key = [u.nick, para].sort().join("|");
        if (!privados[key]) privados[key] = [];
        privados[key].push({ id:++msgIdCounter, from:u.nick, texto:"", fecha:Date.now(), tipo:"archivo", nombre:b.nombre, mime:b.mime, datos:b.datos });
        if (privados[key].length > 100) privados[key] = privados[key].slice(-50);

        jsonRes(res, 200, { ok:true });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // GET /api/priv/messages?con=NICK&since=0&token=T
    if (ruta === "/api/priv/messages" && req.method === "GET") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];
      var con = (params.con || "").trim();
      var since = parseInt(params.since || "0", 10);
      if (!con) return jsonRes(res, 400, { error:"Falta parámetro 'con'." });

      var key = [u.nick, con].sort().join("|");
      var msgs = privados[key] || [];
      var filtrados = since ? msgs.filter(function(m) { return m.id > since; }) : msgs.slice(-50);
      jsonRes(res, 200, { messages:filtrados, lastId:msgIdCounter });
      return;
    }

    // GET /api/users?sala=X&token=T
    if (ruta === "/api/users" && req.method === "GET") {
      var token = params.token;
      var sala = params.sala || "cali";
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      usuarios[token].visto = Date.now();
      jsonRes(res, 200, { users:usuariosEnSala(sala) });
      return;
    }

    // GET /api/userinfo?token=T
    if (ruta === "/api/userinfo" && req.method === "GET") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];
      var r = rolDe(u.nick);
      var pts = (usuariosPuntos[u.nick] || {}).puntos || 0;
      jsonRes(res, 200, { nick:u.nick, rol:r.nombre, rolLabel:r.label, puntos:pts, esMod:esMod(u.nick) });
      return;
    }

    // POST /api/settings?token=T
    if (ruta === "/api/settings" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];
      parseBody(req).then(function(b) {
        var changes = {};
        // Change avatar
        if (b.avatar && typeof b.avatar === "string") {
          var newAvatar = b.avatar.slice(0, 8);
          u.avatar = newAvatar;
          changes.avatar = newAvatar;
        }
        // Change nick
        if (b.nick && typeof b.nick === "string") {
          var newNick = b.nick.trim().slice(0, MAX_NICK);
          if (newNick.length < 2) return jsonRes(res, 400, { error:"Apodo muy corto (mín. 2 caracteres)." });
          if (newNick === u.nick) return jsonRes(res, 200, { ok:true, changes:changes });
          if (nickTokens[newNick] && nickTokens[newNick] !== token) return jsonRes(res, 400, { error:"Ese apodo ya está en uso." });
          var oldNick = u.nick;
          // Transfer points
          if (usuariosPuntos[oldNick]) {
            if (!usuariosPuntos[newNick]) usuariosPuntos[newNick] = {puntos:0, mensajes:0, tiempoInicio:Date.now(), rolAnterior:"nuevo"};
            usuariosPuntos[newNick].puntos = (usuariosPuntos[newNick].puntos || 0) + (usuariosPuntos[oldNick].puntos || 0);
            usuariosPuntos[newNick].mensajes = (usuariosPuntos[newNick].mensajes || 0) + (usuariosPuntos[oldNick].mensajes || 0);
            delete usuariosPuntos[oldNick];
            guardarRoles();
          }
          // Transfer mod status
          if (mods.has(oldNick)) { mods.delete(oldNick); mods.add(newNick); }
          // Update references
          delete nickTokens[oldNick];
          u.nick = newNick;
          nickTokens[newNick] = token;
          // Notify room
          agregarMensaje(u.sala, { tipo:"sys", texto:"✏️ " + oldNick + " ahora se llama " + newNick, nick:"" });
          changes.nick = newNick;
        }
        jsonRes(res, 200, { ok:true, changes:changes });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // POST /api/switch?token=T
    if (ruta === "/api/switch" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];
      parseBody(req).then(function(b) {
        var nuevaSala = b.sala || "";
        if (!SALAS[nuevaSala]) return jsonRes(res, 400, { error:"Sala inválida." });
        if (u.sala === nuevaSala) return jsonRes(res, 200, { ok:true, sala:nuevaSala });
        var salaVieja = u.sala;
        agregarMensaje(salaVieja, { tipo:"sys", texto:"👋 " + u.nick + " cambió de sala", nick:"" });
        u.sala = nuevaSala;
        agregarMensaje(nuevaSala, { tipo:"sys", texto:"🎉 " + u.nick + " entró a " + (SALAS[nuevaSala] || nuevaSala), nick:"" });
        jsonRes(res, 200, { ok:true, sala:nuevaSala });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    // POST /api/leave
    if (ruta === "/api/leave" && req.method === "POST") {
      parseBody(req).then(function(b) {
        var token = b.token || params.token;
        if (token && usuarios[token]) {
          var u = usuarios[token];
          agregarMensaje(u.sala, { tipo:"sys", texto:"👋 " + u.nick + " salió del Parche", nick:"" });
          delete nickTokens[u.nick];
          delete usuarios[token];
        }
        jsonRes(res, 200, { ok:true });
      }).catch(function() { jsonRes(res, 200, { ok:true }); });
      return;
    }

    // POST /api/mod?token=T
    if (ruta === "/api/mod" && req.method === "POST") {
      var token = params.token;
      if (!token || !usuarios[token]) return jsonRes(res, 401, { error:"Sesión inválida." });
      var u = usuarios[token];
      if (!esMod(u.nick)) return jsonRes(res, 403, { error:"No eres moderador." });

      parseBody(req).then(function(b) {
        var para = String(b.para || "").trim();
        if (!para) return jsonRes(res, 400, { error:"Falta destino." });

        var targetToken = nickTokens[para];

        switch(b.accion) {
          case "kick":
            if (targetToken && usuarios[targetToken]) {
              var ts = usuarios[targetToken].sala;
              agregarMensaje(ts, { tipo:"sys", texto:"🚫 " + para + " fue expulsado por " + u.nick, nick:"" });
              delete nickTokens[para];
              delete usuarios[targetToken];
            }
            break;
          case "ban":
            var hrs = Math.max(1, parseInt(b.horas, 10) || 2);
            banes.set(para, { hasta:Date.now() + hrs * 3600000 });
            if (targetToken && usuarios[targetToken]) {
              var ts2 = usuarios[targetToken].sala;
              agregarMensaje(ts2, { tipo:"sys", texto:"🚫 " + para + " baneado " + hrs + "h por " + u.nick, nick:"" });
              delete nickTokens[para];
              delete usuarios[targetToken];
            }
            break;
          case "mute":
            var mins = Math.max(1, parseInt(b.minutos, 10) || 5);
            mutes.set(para, { hasta:Date.now() + mins * 60000 });
            jsonRes(res, 200, { ok:true, texto:"🔇 " + para + " silenciado " + mins + " min." });
            return;
          case "unmute":
            mutes.delete(para);
            jsonRes(res, 200, { ok:true, texto:"✅ " + para + " ya puede hablar." });
            return;
          case "mod":
            mods.add(para);
            jsonRes(res, 200, { ok:true, texto:"🎖️ " + para + " ahora es moderador." });
            return;
        }
        jsonRes(res, 200, { ok:true });
      }).catch(function() { jsonRes(res, 500, { error:"Error del servidor." }); });
      return;
    }

    jsonRes(res, 404, { error:"Endpoint no encontrado." });
    return;
  }

  // POST /webchat — Recepción de formulario estilo DaleChat
  if (ruta === "/webchat" && req.method === "POST") {
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() {
      var params = {};
      body.split("&").forEach(function(p) {
        var kv = p.split("=");
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      });
      var nick = (params.nick || "").trim().slice(0, MAX_NICK);
      var genero = params.genero || "No especificar";
      var rememberMe = params.remember_me === "on" || params.remember_me === "true";
      var sala = "cali";
      if (params.idNC === "salsa") sala = "salsa";
      else if (params.idNC === "rumba") sala = "rumba";
      else if (params.idNC === "colombia") sala = "colombia";
      else if (params.idNC === "general") sala = "general";
      else if (params.idNC === "amistad") sala = "amistad";

      if (!nick || nick.length < 2) {
        res.writeHead(302, { "Location": "/index.html?error=nick" });
        res.end();
        return;
      }

      var cookies = [];
      if (rememberMe) {
        cookies.push("nick=" + encodeURIComponent(nick) + "; Path=/; Max-Age=31536000; SameSite=Lax");
        cookies.push("genero=" + encodeURIComponent(genero) + "; Path=/; Max-Age=31536000; SameSite=Lax");
      } else {
        cookies.push("nick=; Path=/; Max-Age=0");
        cookies.push("genero=; Path=/; Max-Age=0");
      }

      var redirectUrl = "/chat.html?nick=" + encodeURIComponent(nick) + "&sala=" + encodeURIComponent(sala) + "&genero=" + encodeURIComponent(genero);
      res.writeHead(302, {
        "Location": redirectUrl,
        "Set-Cookie": cookies
      });
      res.end();
    });
    return;
  }

  // === Archivos estáticos ===
  var raiz = path.resolve(PUBLIC);
  var archivo = path.join(raiz, ruta);
  if (archivo.indexOf(raiz) !== 0) { res.writeHead(403); res.end("Prohibido"); return; }
  if (/^[\\/](node_modules|server|\.git)[\\/]/.test(ruta)) { res.writeHead(404); res.end("No existe."); return; }

  fs.readFile(archivo, function(err, data) {
    if (err) {
      res.writeHead(404, {"Content-Type":"text/plain; charset=utf-8"});
      res.end("404: Ese parche no existe, parce.");
      return;
    }
    var ext = path.extname(archivo).slice(1);
    res.writeHead(200, {"Content-Type": TIPOS[ext] || "application/octet-stream"});
    res.end(data);
  });
});

// ===== Limpieza y puntos periódicos =====
setInterval(function() {
  var ahora = Date.now();
  // Limpiar usuarios inactivos
  Object.keys(usuarios).forEach(function(token) {
    var u = usuarios[token];
    if (ahora - u.visto > LIMITE_SILENCIO) {
      agregarMensaje(u.sala, { tipo:"sys", texto:"👋 " + u.nick + " salió del Parche (inactividad)", nick:"" });
      delete nickTokens[u.nick];
      delete usuarios[token];
    }
  });
  // Limpiar archivos multimedia expirados (10 min)
  Object.keys(mensajes).forEach(function(sala) {
    mensajes[sala] = mensajes[sala].filter(function(m) {
      if (m.tipo === "archivo" && m.fecha && (ahora - m.fecha > MEDIA_EXPIRY_MS)) return false;
      return true;
    });
  });
  Object.keys(privados).forEach(function(key) {
    privados[key] = privados[key].filter(function(m) {
      if (m.tipo === "archivo" && m.fecha && (ahora - m.fecha > MEDIA_EXPIRY_MS)) return false;
      return true;
    });
  });
  // Bonus de puntos
  Object.keys(usuarios).forEach(function(token) {
    var u = usuarios[token];
    var r = sumarPuntos(u.nick, PUNTOS_POR_INTERVALO);
    if (r.subio) {
      agregarMensaje(u.sala, { tipo:"sys", texto:"🎉 ¡" + u.nick + " alcanzó el rango de " + r.rolNuevo.label + "! 🏆", nick:"" });
    }
  });
}, 5 * 60 * 1000);

servidor.listen(PUERTO, function() {
  console.log("💃 El Parche de Cali corriendo en http://localhost:" + PUERTO);
  console.log("🛡️ Sistema de roles activo: Nuevo → Activo → Veterano → Leyenda");
});
