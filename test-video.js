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
    setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error("timeout " + nick)); }, 9000);
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const a = await cliente("cam1", "cali");
  const b = await cliente("cam2", "cali");
  await espera(300);

  // cam1 activa video
  a.send(JSON.stringify({ t: "videoOn" }));
  await espera(300);
  const b_videoOn = b.evs.filter(m => m.t === "videoOn" && m.de === "cam1").length;
  console.log("cam2 vio videoOn de cam1:", b_videoOn);

  // cam2 activa video -> cam1 recibe videoOn cam2, y cam2 recibe lista de activos [cam1]
  b.send(JSON.stringify({ t: "videoOn" }));
  await espera(300);
  const a_videoOn = a.evs.filter(m => m.t === "videoOn" && m.de === "cam2").length;
  const b_lista = b.evs.filter(m => m.t === "videoLista").pop();
  console.log("cam1 recibio videoOn de cam2:", a_videoOn);
  console.log("cam2 recibio lista de activos:", b_lista && b_lista.lista.join(","));

  // frame de cam1 a cam2
  a.send(JSON.stringify({ t: "videoFrame", datos: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==" }));
  await espera(300);
  const b_frame = b.evs.filter(m => m.t === "videoFrame" && m.de === "cam1").length;
  console.log("cam2 recibio frame de cam1:", b_frame);

  // cam1 apaga video
  a.send(JSON.stringify({ t: "videoOff" }));
  await espera(300);
  const b_videoOff = b.evs.filter(m => m.t === "videoOff" && m.de === "cam1").length;
  console.log("cam2 vio videoOff de cam1:", b_videoOff);

  const ok = b_videoOn === 1 && a_videoOn === 1 && b_lista && b_lista.lista.indexOf("cam1") !== -1 && b_frame === 1 && b_videoOff === 1;
  console.log(ok ? "PRUEBA OK: video en vivo funciona" : "PRUEBA FALLO");
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
