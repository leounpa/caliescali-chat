"use strict";
const WebSocket = require("ws");
const URL = "ws://localhost:3000/ws";
function cliente(nick, extra) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.evs = [];
    ws.on("open", () => {
      const m = Object.assign({ t: "join", nick, sala: "cali" }, extra || {});
      ws.send(JSON.stringify(m));
      setTimeout(() => resolve(ws), 200);
    });
    ws.on("message", (b) => ws.evs.push(JSON.parse(b.toString())));
    ws.on("error", reject);
    setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error("timeout " + nick)); }, 9000);
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const a = await cliente("alfa", { avatar: "🕺", color: "#e3222a" });
  const b = await cliente("beta", { avatar: "💃", color: "#007a4d" });
  await espera(300);

  // La lista de usuarios debe traer detalles con avatar y color
  const usersA = a.evs.filter(m => m.t === "users").pop();
  const det = usersA && usersA.detalles;
  console.log("detalles:", JSON.stringify(det));
  const detBeta = det && det.filter(d => d.nick === "beta").pop();
  console.log("beta avatar:", detBeta && detBeta.avatar, "color:", detBeta && detBeta.color);

  // Mensaje público difunde avatar y color
  b.send(JSON.stringify({ t: "msg", texto: "hola alfa" }));
  await espera(300);
  const msg = a.evs.filter(m => m.t === "msg" && m.nick === "beta").pop();
  console.log("msg avatar:", msg && msg.avatar, "color:", msg && msg.color, "texto:", msg && msg.texto);

  const ok = detBeta && detBeta.avatar === "💃" && detBeta.color === "#007a4d" && msg && msg.avatar === "💃" && msg.color === "#007a4d";
  console.log(ok ? "PRUEBA OK: avatar y color funcionan" : "PRUEBA FALLO");
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
