"use strict";
const WebSocket = require("ws");
const URL = "wss://el-parche-de-cali.onrender.com/ws";
function cliente(nick) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.evs = [];
    ws.on("open", () => { ws.send(JSON.stringify({ t: "join", nick, sala: "cali" })); setTimeout(() => resolve(ws), 400); });
    ws.on("message", (b) => ws.evs.push(JSON.parse(b.toString())));
    ws.on("error", reject);
    setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error("timeout " + nick)); }, 20000);
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const mod = await cliente("mod-web");
  const rol = mod.evs.filter(m => m.t === "rol").pop();
  const ofen = await cliente("ofen-web");
  await espera(400);
  ofen.send(JSON.stringify({ t: "msg", texto: "eres un malparido" }));
  await espera(1000);
  const aviso = ofen.evs.filter(m => m.t === "sys" && m.texto.indexOf("ofensivo") !== -1).map(m => m.texto).join("|");
  console.log("filtro internet:", aviso || "(sin aviso)");
  const okF = aviso.indexOf("Advertencia") !== -1 || aviso.indexOf("Expulsado") !== -1;
  // mod banea a ofen-web
  const antes = ofen.evs.length;
  mod.send(JSON.stringify({ t: "mod", para: "ofen-web", accion: "kick" }));
  await espera(1000);
  console.log("kick internet:", ofen.evs.some(m => m.t === "sys" && m.texto.indexOf("expulsado") !== -1) ? "OK" : "no llego");
  console.log((okF ? "PRUEBA OK: filtro + moderacion en Internet" : "PRUEBA FALLO"));
  process.exit(okF ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
