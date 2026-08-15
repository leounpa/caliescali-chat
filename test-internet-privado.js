"use strict";
const WebSocket = require("ws");
const URL = "wss://el-parche-de-cali.onrender.com/ws";
function cliente(nick) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.evs = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({ t: "join", nick, sala: "cali" }));
      setTimeout(() => resolve(ws), 300);
    });
    ws.on("message", (b) => ws.evs.push(JSON.parse(b.toString())));
    ws.on("error", reject);
    setTimeout(() => { ws.close(); reject(new Error("timeout " + nick)); }, 15000);
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const a = await cliente("alfa-web");
  const b = await cliente("beta-web");
  await espera(300);
  a.send(JSON.stringify({ t: "priv", para: "beta-web", texto: "prueba internet privado" }));
  await espera(400);
  const datos = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  a.send(JSON.stringify({ t: "privArchivo", para: "beta-web", nombre: "foto-web.png", mime: "image/png", datos }));
  await espera(400);
  const privs = b.evs.filter(m => m.t === "priv");
  const privArch = b.evs.filter(m => m.t === "privArchivo");
  console.log("priv internet:", privs.map(m => m.de + ":" + m.texto).join(","));
  console.log("privArchivo internet:", privArch.length, privArch[0] && privArch[0].nombre);
  const ok = privs.length === 1 && privs[0].texto === "prueba internet privado" && privArch.length === 1;
  console.log(ok ? "PRUEBA OK: privado + fotos funcionando en Internet" : "PRUEBA FALLO");
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
