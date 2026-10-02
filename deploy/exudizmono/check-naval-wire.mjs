// An ordinary second guest client for the isolated preview. Never point this at production.
import WebSocket from "ws";
import {
  createGameWireContext,
  decodeServerMessage,
  encodeClientMessage,
} from "../../src/core/ZbinWire.ts";
const gameID = process.argv[2];
if (!gameID) throw new Error("Pass the preview lobby ID");
const auth = await fetch("http://api:8787/auth/refresh", {
  method: "POST",
  headers: { Origin: "https://game.exudizmono.com:8443" },
});
if (!auth.ok) throw new Error("Preview auth failed: " + auth.status);
const { jwt } = await auth.json();
const ws = new WebSocket("ws://127.0.0.1:3001");
let context;
let views = 0;
let started = false;
const send = (m) => ws.send(encodeClientMessage(m, context));
ws.on("open", () =>
  send({
    type: "join",
    gameID,
    username: "NavalTestOpponent",
    clanTag: null,
    turnstileToken: "preview-test",
    token: jwt,
    spectator: false,
    gitCommit: process.env.GIT_COMMIT,
    platform: "web",
  }),
);
ws.on("message", (bytes) => {
  try {
    const message = decodeServerMessage(new Uint8Array(bytes), context);
    if (message.type === "start") {
      context = createGameWireContext(message.gameStartInfo.players);
      started = true;
      console.log(
        "START",
        JSON.stringify({
          authoritative: message.gameStartInfo.config.authoritativeNaval,
          rawTurns: message.turns.length,
          players: message.gameStartInfo.players.length,
        }),
      );
      if (
        !message.gameStartInfo.config.authoritativeNaval ||
        message.turns.length
      )
        throw new Error("Unsafe naval start");
    }
    if (message.type === "turn" && started) throw new Error("Raw turn leaked");
    if (message.type === "authoritative_view") {
      views++;
      if (views === 1 || views % 100 === 0)
        console.log("FILTERED_VIEWS", views);
    }
    if (message.type === "error") console.log("SERVER_ERROR", message);
  } catch (e) {
    console.error(e.message);
    ws.close();
    process.exitCode = 1;
  }
});
const ping = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN)
    send({ type: "ping", sentAt: Date.now() });
}, 5000);
const timeout = setTimeout(() => ws.close(), 300000);
ws.on("close", (code, reason) => {
  clearInterval(ping);
  clearTimeout(timeout);
  console.log("CLOSED", code, reason.toString(), "views", views);
});
ws.on("error", (e) => console.error(e.message));
