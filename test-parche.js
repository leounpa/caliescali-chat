// Prueba de integración: 2 clientes WebSocket conversando
"use strict";
const WebSocket = require("ws");

const URL = "ws://localhost:3000/ws";

function cliente(nick, rol) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const eventos = [];
    ws.on("open", () => ws.send(JSON.stringify({ t: "join", nick, sala: "cali" })));
    ws.on("message", (buf) => {
      const m = JSON.parse(buf.toString());
      eventos.push(m);
      if (rol === "emisor" && m.t === "sys" && m.texto.indexOf("Bienvenido") !== -1) {
        ws.send(JSON.stringify({ t: "msg", texto: "¡Qué hubo parce!" }));
        ws.close();
        resolve(eventos);
      }
      if (rol === "receptor" && m.t === "msg" && m.nick === "caleña2") {
        ws.close();
        resolve(eventos);
      }
    });
    ws.on("error", reject);
    setTimeout(() => { ws.close(); reject(new Error("timeout " + nick)); }, 8000);
  });
}

async function main() {
  const a = cliente("caleño1", "receptor");
  const b = await cliente("caleña2", "emisor");
  const aEv = await a;
  const listaUsers = aEv.filter(m => m.t === "users").pop();
  const sys = aEv.filter(m => m.t === "sys").map(m => m.texto);
  const msg = aEv.filter(m => m.t === "msg").map(m => m.nick + ": " + m.texto);
  console.log("sys:", sys.join(" | "));
  console.log("usuarios:", (listaUsers && listaUsers.lista) ? listaUsers.lista.join(",") : "(sin lista)");
  console.log("msg:", msg.join(" | "));
  if (listaUsers && listaUsers.lista.indexOf("caleña2") !== -1 && msg.length === 1) {
    console.log("PRUEBA OK: chat en tiempo real funciona en #cali");
    process.exit(0);
  } else {
    console.log("PRUEBA FALLO: resultado inesperado");
    process.exit(1);
  }
}

main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
