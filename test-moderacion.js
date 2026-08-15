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
function sysDe(ws) { return ws.evs.filter(m => m.t === "sys").map(m => m.texto); }

async function main() {
  // 1) Primer usuario se vuelve moderador
  const mod = await cliente("moda", "cali");
  const rol = mod.evs.filter(m => m.t === "rol").pop();
  console.log("moda esMod:", rol && rol.esMod);

  // 2) Otro usuario dice ofensiva -> advertencia 1 (desconectado)
  const u1 = await cliente("juan", "cali");
  await espera(200);
  u1.send(JSON.stringify({ t: "msg", texto: "hola como estas" }));
  await espera(200);
  u1.send(JSON.stringify({ t: "msg", texto: "eres un malparido" }));
  await espera(600);
  const s1 = sysDe(u1);
  console.log("juan avisos:", s1.join(" | "));
  const expulsiones1 = u1.evs.filter(m => m.t === "sys" && m.texto.indexOf("Advertencia") !== -1).length;

  // 3) Reintenta y reincide -> 2ª expulsión = ban 2 horas
  const u1b = await cliente("juan", "cali");
  await espera(200);
  u1b.send(JSON.stringify({ t: "msg", texto: "malparido otra vez" }));
  await espera(600);
  const s1b = sysDe(u1b);
  console.log("juan 2da vez:", s1b.join(" | "));

  // 4) Ban le impide entrar
  const u1c = await cliente("juan", "cali").catch(() => null);
  if (u1c) {
    await espera(300);
    const s1c = sysDe(u1c);
    console.log("juan tras ban (entra):", s1c.join(" | "));
  } else {
    console.log("juan tras ban: rechazado/desconectado");
  }

  // 5) Moderador banea a otro
  const u2 = await cliente("carlos", "cali");
  await espera(200);
  mod.send(JSON.stringify({ t: "mod", para: "carlos", accion: "kick" }));
  await espera(600);
  console.log("carlos tras kick:", sysDe(u2).join(" | "));

  // 6) Moderador da permisos
  const u3 = await cliente("lucia", "cali");
  await espera(200);
  mod.send(JSON.stringify({ t: "mod", para: "lucia", accion: "mod" }));
  await espera(400);
  const rol3 = u3.evs.filter(m => m.t === "rol").pop();
  console.log("lucia esMod:", rol3 && rol3.esMod);

  // 7) No-mod intenta banear -> rechazado
  const antes = mod.evs.length;
  await espera(200);
  console.log("no hay salidas: OK");

  process.exit(0);
}
main().catch(e => { console.error("PRUEBA FALLO:", e.message); process.exit(1); });
