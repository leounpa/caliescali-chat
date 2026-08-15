"use strict";
const WebSocket = require("ws");
const URL = "wss://el-parche-de-cali.onrender.com/ws";
function cliente(nick, extra) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.evs = [];
    ws.on("open", () => {
      const m = Object.assign({ t: "join", nick, sala: "cali" }, extra || {});
      ws.send(JSON.stringify(m));
      setTimeout(() => resolve(ws), 500);
    });
    ws.on("message", (b) => ws.evs.push(JSON.parse(b.toString())));
    ws.on("error", reject);
    setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error("timeout " + nick)); }, 20000);
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const a = await cliente("perfil-web-a", { avatar: "🦄", color: "#7c3aed" });
  const b = await cliente("perfil-web-b", { avatar: "🐯", color: "#b45309" });
  await espera(500);
  b.send(JSON.stringify({ t: "msg", texto: "hola desde internet" }));
  await espera(500);
  const msg = a.evs.filter(m => m.t === "msg" && m.nick === "perfil-web-b").pop();
  console.log("msg internet avatar:", msg && msg.avatar, "color:", msg && msg.color);
  const ok = msg && msg.avatar === "🐯" && msg.color === "#b45309";
  console.log(ok ? "PRUEBA OK: perfil de usuario en Internet" : "PRUEBA FALLO");
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
