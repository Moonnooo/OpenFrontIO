import assert from "node:assert/strict";
import WebSocket from "ws";
import { UserMeResponseSchema } from "./src/core/ApiSchemas.ts";
import {
  decodeServerMessage,
  encodeClientMessage,
} from "./src/core/ZbinWire.ts";
const base = process.env.TEST_BASE || "https://game.exudizmono.com";
const auth = await fetch(base + "/backend/auth/refresh", { method: "POST" });
assert.equal(auth.status, 200);
const { jwt } = await auth.json();
const me = await fetch(base + "/backend/users/@me", {
  headers: { Authorization: "Bearer " + jwt },
});
assert.equal(me.status, 200);
UserMeResponseSchema.parse(await me.json());
const create = await fetch(base + "/api/create_game", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + jwt,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({}),
});
const lobby = await create.json();
assert.equal(create.status, 200, JSON.stringify(lobby));
const cluster = await (await fetch(base + "/backend/cluster.json")).json();
const ws = new WebSocket(base.replace(/^http/, "ws") + "/" + lobby.workerPath);
await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(Error("WebSocket join timed out")),
    15000,
  );
  ws.on("open", () =>
    ws.send(
      encodeClientMessage(
        {
          type: "join",
          token: jwt,
          gameID: lobby.gameID,
          username: "ConnectionCheck",
          clanTag: null,
          turnstileToken: null,
          gitCommit: cluster.latest,
        },
        undefined,
      ),
    ),
  );
  ws.on("error", reject);
  ws.on("close", (code, reason) =>
    reject(Error("Closed " + code + " " + reason)),
  );
  ws.on("message", (bytes) => {
    try {
      const msg = decodeServerMessage(new Uint8Array(bytes), undefined);
      if (msg.type === "lobby_info") {
        clearTimeout(timeout);
        resolve();
      }
    } catch (e) {
      reject(e);
    }
  });
});
ws.close();
console.log(
  "PASS: public HTTP, guest schema, private lobby creation and binary WebSocket join on " +
    lobby.workerPath,
);
