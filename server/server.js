/* ===== El Parche de Cali · Servidor ===== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PUERTO = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "..");
const MAX_NICK = 24;
const MAX_MSG = 500;
const MAX_DATOS = 9 * 1024 * 1024; // ~6 MB por archivo (base64)

const TIPOS = {
  "html": "text/html; charset=utf-8",
  "css": "text/css; charset=utf-8",
  "js": "application/javascript; charset=utf-8",
  "png": "image/png",
  "jpg": "image/jpeg",
  "svg": "image/svg+xml",
  "ico": "image/x-icon",
  "webp": "image/webp"
};

// Salas disponibles
const SALAS = { cali: "#Cali", salsa: "#Salsa", rumba: "#Rumba", colombia: "#Colombia" };

// Estado: sala -> Set de clientes
const salas = {};
Object.keys(SALAS).forEach(k => { salas[k] = new Set(); });

// Estado global: nick -> ws (para chat privado entre salas/usuarios)
const conexiones = {};

// ===== Moderación =====
const MOD_ADMIN = (process.env.MOD_ADMIN || "").trim();
const mods = new Set();          // nicks moderadores
const historial = new Map();     // nick -> {expulsiones: n} (historial permanente)
const banes = new Map();         // nick -> {hasta: timestamp}
const mutes = new Map();         // nick -> {hasta: timestamp}
const videos = {};               // sala -> Map nick -> ws (en vivo)
Object.keys(SALAS).forEach(k => { videos[k] = new Map(); });

// Lista base de palabras ofensivas (normalizadas, sin acentos)
const OFENSIVAS = [
  "hijueputa", "hijuepucha", "malparido", "malparida", "marica", "maricon",
  "perra", "puta", "puto", "pendejo", "pendeja", "huevon", "huevona",
  "guevon", "guevona", "imbecil", "estupido", "estupida", "idiota",
  "cabron", "cabrona", "zorra", "perro", "mierda", "carajo", "verga",
  "culo", "culero", "nazi", "fascista", "retrasado", "mongol", "negro",
  "judio", "chino", "gordo", "feo", "bobo", "tonto", "asqueroso"
];

function normalizar(texto) {
  return texto.toLowerCase()
    .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i").replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function tieneOfensiva(texto) {
  const limpio = " " + normalizar(texto) + " ";
  return OFENSIVAS.some(p => limpio.includes(" " + p + " "));
}

function horasRestantes(ms) { return Math.max(0, Math.ceil((ms - Date.now()) / 3600000)); }

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

function registrarInfraccion(nick) {
  const h = historial.get(nick) || { expulsiones: 0 };
  h.expulsiones = (h.expulsiones || 0) + 1;
  historial.set(nick, h);
  // 1ª expulsión: advertencia. 2ª: 2 horas. Luego 4, 8, 24, y 48 por cada expulsión extra
  const horas = [0, 2, 4, 8, 24, 48];
  const idx = Math.min(h.expulsiones, horas.length) - 1;
  const b = { hasta: Date.now() + horas[idx] * 3600000 };
  banes.set(nick, b);
  return h;
}

function totalExpulsiones(nick) {
  const h = historial.get(nick);
  return h ? h.expulsiones : 0;
}

// ===== Utilidades de red =====
function mensaje(obj) { return JSON.stringify(obj); }

function usuariosDe(sala) {
  const lista = [];
  salas[sala].forEach(c => { if (c.nick) lista.push(c.nick); });
  return lista;
}

function difundir(sala, obj) {
  const datos = mensaje(obj);
  salas[sala].forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(datos);
  });
}

function notificarUsuarios(sala) {
  difundir(sala, { t: "users", lista: usuariosDe(sala) });
}

function enviarA(nick, obj) {
  const ws = conexiones[nick];
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(mensaje(obj));
}

function esMod(nick) { return mods.has(nick) || nick === MOD_ADMIN; }

function desconectar(ws) {
  if (ws.sala && ws.nick) {
    salas[ws.sala].delete(ws);
    videos[ws.sala].delete(ws.nick);
    difundir(ws.sala, { t: "videoOff", de: ws.nick });
    difundir(ws.sala, { t: "sys", texto: "👋 " + ws.nick + " salió del Parche" });
    notificarUsuarios(ws.sala);
  }
  if (ws.nick && conexiones[ws.nick] === ws) {
    delete conexiones[ws.nick];
  }
}

// ===== Servidor HTTP (estáticos) =====
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split("?")[0]);
  if (ruta === "/") ruta = "/index.html";

  const raiz = path.resolve(PUBLIC);
  const archivo = path.join(raiz, ruta);
  if (!archivo.startsWith(raiz)) {
    res.writeHead(403); res.end("Prohibido"); return;
  }
  if (/^[\\/](node_modules|server|\.git)[\\/]/.test(ruta)) {
    res.writeHead(404); res.end("No existe."); return;
  }

  fs.readFile(archivo, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404: Ese parche no existe, parce.");
      return;
    }
    const ext = path.extname(archivo).slice(1);
    res.writeHead(200, { "Content-Type": TIPOS[ext] || "application/octet-stream" });
    res.end(data);
  });
});

// ===== WebSocket =====
const wss = new WebSocketServer({ server: servidor, path: "/ws", maxPayload: 16 * 1024 * 1024 });

function salaValida(nombre) { return Object.prototype.hasOwnProperty.call(SALAS, nombre); }

function apodoValido(nick) {
  if (!nick) return false;
  const n = nick.trim();
  return n.length >= 2 && n.length <= MAX_NICK && !/[<>"']/.test(n);
}

function archivoValido(m) {
  if (typeof m.nombre !== "string" || typeof m.mime !== "string") return false;
  if (typeof m.datos !== "string" || !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(m.datos)) return false;
  if (m.datos.length > MAX_DATOS) return false;
  if (m.nombre.length > 120) return false;
  return true;
}

wss.on("connection", (ws) => {
  ws.sala = null;
  ws.nick = null;

  ws.on("message", (buf) => {
    let m;
    try { m = JSON.parse(buf.toString()); } catch (e) { return; }

    if (m.t === "join") {
      if (!apodoValido(m.nick) || !salaValida(m.sala)) {
        ws.send(mensaje({ t: "sys", texto: "Apodo o sala inválidos." }));
        ws.close();
        return;
      }
      const nick = m.nick.trim();
      const baneo = estaBaneado(nick);
      if (baneo) {
        ws.send(mensaje({ t: "sys", texto: "🚫 Estás expulsado del Parche. Vuelve en " + horasRestantes(baneo.hasta) + " hora(s). Expulsiones: " + totalExpulsiones(nick) + "." }));
        ws.close();
        return;
      }
      ws.nick = nick;
      ws.sala = m.sala;

      let repetido = false;
      salas[ws.sala].forEach(c => { if (c !== ws && c.nick === ws.nick) repetido = true; });
      if (repetido || (conexiones[ws.nick] && conexiones[ws.nick] !== ws)) {
        ws.send(mensaje({ t: "sys", texto: "Ese apodo ya está en el Parche. Elige otro, parce." }));
        ws.close();
        return;
      }

      if (conexiones[ws.nick]) {
        const viejo = conexiones[ws.nick];
        if (viejo.sala === ws.sala) salas[ws.sala].delete(viejo);
        difundir(viejo.sala, { t: "sys", texto: "👋 " + ws.nick + " salió del Parche" });
        notificarUsuarios(viejo.sala);
        viejo.close();
      }
      conexiones[ws.nick] = ws;

      salas[ws.sala].add(ws);
      difundir(ws.sala, { t: "sys", texto: "🎉 " + ws.nick + " entró al Parche de Cali" });
      notificarUsuarios(ws.sala);
      // El primer usuario en llegar se vuelve moderador automáticamente
      if (mods.size === 0 && !esMod(ws.nick)) {
        mods.add(ws.nick);
        ws.send(mensaje({ t: "rol", esMod: true }));
        ws.send(mensaje({ t: "sys", texto: "🛡️ Eres el primer caleño en el Parche: quedaste como moderador. Toca 🛡️ junto a un usuario para expulsar, silenciar o banear." }));
      } else {
        ws.send(mensaje({ t: "rol", esMod: esMod(ws.nick) }));
      }
      ws.send(mensaje({ t: "sys", texto: "Bienvenido a " + SALAS[ws.sala] + ", " + ws.nick + ". ¡Buena vibra!" }));
    }

    else if (m.t === "msg" && ws.sala && ws.nick) {
      if (estaMuteado(ws.nick)) {
        ws.send(mensaje({ t: "sys", texto: "🔇 Estás silenciado(a) por un moderador." }));
        return;
      }
      const texto = String(m.texto || "").trim().slice(0, MAX_MSG);
      if (!texto) return;
      if (tieneOfensiva(texto)) {
        const inf = registrarInfraccion(ws.nick);
        const aviso = inf.expulsiones === 1
          ? "🚫 Advertencia por lenguaje ofensivo. Es tu 1ª. A la 2ª quedas expulsado 2 horas."
          : "🚫 Expulsado " + horasRestantes(banes.get(ws.nick).hasta) + " hora(s) por lenguaje ofensivo. Expulsión #" + inf.expulsiones + ".";
        ws.send(mensaje({ t: "sys", texto: aviso }));
        setTimeout(() => { ws.close(4001, "ofensiva"); }, 400);
        return;
      }
      difundir(ws.sala, { t: "msg", nick: ws.nick, texto: texto });
    }

    else if (m.t === "archivo" && ws.sala && ws.nick) {
      if (estaMuteado(ws.nick)) {
        ws.send(mensaje({ t: "sys", texto: "🔇 Estás silenciado(a) por un moderador." }));
        return;
      }
      if (!archivoValido(m)) {
        ws.send(mensaje({ t: "sys", texto: "Archivo demasiado grande o inválido (máx. 6 MB)." }));
        return;
      }
      difundir(ws.sala, { t: "archivo", de: ws.nick, nombre: m.nombre, mime: m.mime, datos: m.datos });
    }

    else if (m.t === "priv" && ws.sala && ws.nick) {
      const para = String(m.para || "").trim();
      const texto = String(m.texto || "").trim().slice(0, MAX_MSG);
      if (!texto || !para || para === ws.nick) return;
      const dest = conexiones[para];
      if (!dest || dest.readyState !== WebSocket.OPEN) {
        ws.send(mensaje({ t: "sys", texto: "🙁 " + para + " no está conectado(a) en este momento." }));
        return;
      }
      enviarA(para, { t: "priv", de: ws.nick, texto: texto });
      ws.send(mensaje({ t: "priv", de: ws.nick, texto: texto, propio: true }));
    }

    else if (m.t === "privArchivo" && ws.sala && ws.nick) {
      const para = String(m.para || "").trim();
      if (!para || para === ws.nick) return;
      if (!archivoValido(m)) {
        ws.send(mensaje({ t: "sys", texto: "Archivo demasiado grande o inválido (máx. 6 MB)." }));
        return;
      }
      const dest = conexiones[para];
      if (!dest || dest.readyState !== WebSocket.OPEN) {
        ws.send(mensaje({ t: "sys", texto: "🙁 " + para + " no está conectado(a) en este momento." }));
        return;
      }
      enviarA(para, { t: "privArchivo", de: ws.nick, nombre: m.nombre, mime: m.mime, datos: m.datos });
      ws.send(mensaje({ t: "privArchivo", de: ws.nick, nombre: m.nombre, mime: m.mime, datos: m.datos, propio: true }));
    }

    // ===== Video en vivo =====
    else if (m.t === "videoOn" && ws.sala && ws.nick) {
      videos[ws.sala].set(ws.nick, ws);
      difundir(ws.sala, { t: "videoOn", de: ws.nick });
      // Enviar la lista de videos ya activos al nuevo
      const activos = [];
      videos[ws.sala].forEach((v, nick) => { if (nick !== ws.nick) activos.push(nick); });
      if (activos.length) ws.send(mensaje({ t: "videoLista", lista: activos }));
    }

    else if (m.t === "videoOff" && ws.sala && ws.nick) {
      videos[ws.sala].delete(ws.nick);
      difundir(ws.sala, { t: "videoOff", de: ws.nick });
    }

    else if (m.t === "videoFrame" && ws.sala && ws.nick) {
      if (typeof m.datos === "string" && m.datos.length < 400000) {
        const datos = mensaje({ t: "videoFrame", de: ws.nick, datos: m.datos });
        salas[ws.sala].forEach(c => {
          if (c !== ws && c.readyState === WebSocket.OPEN) c.send(datos);
        });
      }
    }

    // ===== Moderación =====
    else if (m.t === "report" && ws.sala && ws.nick) {
      const para = String(m.para || "").trim();
      if (!para || para === ws.nick) return;
      // Avisar a todos los moderadores conectados
      Object.keys(conexiones).forEach(function (nick) {
        if (esMod(nick)) {
          const modWs = conexiones[nick];
          if (modWs && modWs.readyState === WebSocket.OPEN) {
            modWs.send(mensaje({ t: "report", de: ws.nick, para: para }));
          }
        }
      });
    }

    else if (m.t === "mod" && ws.sala && ws.nick) {
      if (!esMod(ws.nick)) {
        ws.send(mensaje({ t: "sys", texto: "No tienes permisos de moderación." }));
        return;
      }
      const para = String(m.para || "").trim();
      const objetivo = conexiones[para];
      switch (m.accion) {
        case "kick":
          if (objetivo) {
            objetivo.send(mensaje({ t: "sys", texto: "🚫 Fuiste expulsado(a) por un moderador (" + ws.nick + ")." }));
            setTimeout(() => objetivo.close(4001, "kick"), 400);
          }
          break;
        case "ban":
          {
            const horas = Math.max(1, parseInt(m.horas, 10) || 2);
            banes.set(para, { hasta: Date.now() + horas * 3600000 });
            if (objetivo) {
              objetivo.send(mensaje({ t: "sys", texto: "🚫 Baneado(a) " + horas + " hora(s) por " + ws.nick + "." }));
              setTimeout(() => objetivo.close(4002, "ban"), 400);
            }
          }
          break;
        case "mute":
          {
            const mins = Math.max(1, parseInt(m.minutos, 10) || 5);
            mutes.set(para, { hasta: Date.now() + mins * 60000 });
            if (objetivo) objetivo.send(mensaje({ t: "sys", texto: "🔇 Silenciado(a) " + mins + " min por " + ws.nick + "." }));
            ws.send(mensaje({ t: "sys", texto: "🔇 Silenciaste a " + para + " por " + mins + " min." }));
          }
          break;
        case "unmute":
          mutes.delete(para);
          if (objetivo) objetivo.send(mensaje({ t: "sys", texto: "✅ Ya puedes hablar de nuevo." }));
          break;
        case "mod":
          mods.add(para);
          if (objetivo) objetivo.send(mensaje({ t: "rol", esMod: true }));
          enviarA(para, { t: "sys", texto: "🎖️ " + ws.nick + " te dio permisos de moderación." });
          break;
        default:
          break;
      }
    }
  });

  ws.on("close", () => { desconectar(ws); });
});

servidor.listen(PUERTO, () => {
  console.log("💃 El Parche de Cali corriendo en http://localhost:" + PUERTO);
});
