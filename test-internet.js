"use strict";
const WebSocket = require("ws");
const URL = "wss://el-parche-de-cali.onrender.com/ws";
function cliente(nick, rol) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const eventos = [];
    ws.on("open", () => ws.send(JSON.stringify({ t: "join", nick, sala: "salsa" })));
    ws.on("message", (buf) => {
      const m = JSON.parse(buf.toString());
      eventos.push(m);
      if (rol === "emisor" && m.t === "sys" && m.texto.indexOf("Bienvenido") !== -1) {
        ws.send(JSON.stringify({ t: "msg", texto: "¡Quiubo! Probando desde Internet." }));
        ws.close();
        resolve(eventos);
      }
      if (rol === "receptor" && m.t === "msg" && m.nick === "caleo-internet") {
        ws.close();
        resolve(eventos);
      }
    });
    ws.on("error", reject);
    setTimeout(() => { ws.close(); reject(new Error("timeout " + nick)); }, 15000);
  });
}
async function main() {
  const a = cliente("caleo-local", "receptor");
  const b = await cliente("caleo-internet", "emisor");
  const aEv = await a;
  const msg = aEv.filter(m => m.t === "msg").map(m => m.nick + ": " + m.texto);
  const users = aEv.filter(m => m.t === "users").pop();
  console.log("msg:", msg.join(" | "));
  if (msg.length === 1 && users && users.lista.indexOf("caleo-internet") !== -1) {
    console.log("PRUEBA OK: chat funcional desde Internet en #salsa");
    process.exit(0);
  } else {
    console.log("PRUEBA FALLO");
    process.exit(1);
  }
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
