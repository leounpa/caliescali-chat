"use strict";
const WebSocket = require("ws");
const URL = "ws://localhost:3000/ws";

function cliente(nick, sala) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.evs = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({ t: "join", nick, sala }));
      setTimeout(() => resolve(ws), 200);
    });
    ws.on("message", (b) => ws.evs.push(JSON.parse(b.toString())));
    ws.on("error", reject);
    setTimeout(() => { ws.close(); reject(new Error("timeout " + nick)); }, 8000);
  });
}

function espera(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const a = await cliente("alfa", "cali");
  const b = await cliente("beta", "cali");
  await espera(300);

  a.send(JSON.stringify({ t: "priv", para: "beta", texto: "hola beta en privado" }));
  await espera(300);

  const datos = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  a.send(JSON.stringify({ t: "archivo", nombre: "foto.png", mime: "image/png", datos }));
  await espera(300);

  a.send(JSON.stringify({ t: "privArchivo", para: "beta", nombre: "video.mp4", mime: "video/mp4", datos }));
  await espera(300);

  const privs = b.evs.filter(m => m.t === "priv");
  const arch = b.evs.filter(m => m.t === "archivo");
  const privArch = b.evs.filter(m => m.t === "privArchivo");
  const propios = a.evs.filter(m => m.t === "priv" && m.propio);

  console.log("priv recibido:", privs.map(m => m.de + ":" + m.texto).join(","));
  console.log("priv propio:", propios.map(m => m.de + ":" + m.texto).join(","));
  console.log("archivo publico:", arch.length, arch[0] && arch[0].nombre);
  console.log("privArchivo:", privArch.length, privArch[0] && privArch[0].nombre);

  const ok = privs.length === 1 && privs[0].texto === "hola beta en privado" &&
             arch.length === 1 && arch[0].nombre === "foto.png" &&
             privArch.length === 1 && privArch[0].nombre === "video.mp4" &&
             propios.length === 1;
  console.log(ok ? "PRUEBA OK: privado + fotos + videos funcionan" : "PRUEBA FALLO");
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
