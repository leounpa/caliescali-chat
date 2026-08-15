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

function desconectar(ws) {
  if (ws.sala && ws.nick) {
    salas[ws.sala].delete(ws);
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

  // Evitar path traversal
  const raiz = path.resolve(PUBLIC);
  const archivo = path.join(raiz, ruta);
  if (!archivo.startsWith(raiz)) {
    res.writeHead(403); res.end("Prohibido"); return;
  }
  // No servir archivos internos del repo
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
const wss = new WebSocketServer({ server: servidor, path: "/ws" });

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
      ws.nick = m.nick.trim();
      ws.sala = m.sala;

      // Nick repetido (global, para que el privado funcione bien) -> se rechaza
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
      ws.send(mensaje({ t: "sys", texto: "Bienvenido a " + SALAS[ws.sala] + ", " + ws.nick + ". ¡Buena vibra!" }));
    }

    else if (m.t === "msg" && ws.sala && ws.nick) {
      const texto = String(m.texto || "").trim().slice(0, MAX_MSG);
      if (texto) {
        difundir(ws.sala, { t: "msg", nick: ws.nick, texto: texto });
      }
    }

    else if (m.t === "archivo" && ws.sala && ws.nick) {
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
  });

  ws.on("close", () => { desconectar(ws); });
});

servidor.listen(PUERTO, () => {
  console.log("💃 El Parche de Cali corriendo en http://localhost:" + PUERTO);
});
