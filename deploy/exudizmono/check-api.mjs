import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { GameRecordSchema } from "./src/core/Schemas.ts";
const dir = fs.mkdtempSync("/tmp/frontrank-test-");
const child = spawn(process.execPath, ["--import", "tsx", "api.mjs"], {
  env: {
    ...process.env,
    DATA_DIR: dir,
    API_KEY: "test-secret",
    DOMAIN: "77.68.55.16",
    STANDALONE_API_URL: "http://127.0.0.1:8787",
  },
  stdio: ["ignore", "ignore", "inherit"],
});
const base = "http://127.0.0.1:8787";
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {
      /* Cleanup is best-effort when the test server has already stopped. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const players = [];
  for (const name of ["Alice", "Bob"]) {
    const auth = await fetch(base + "/auth/refresh", { method: "POST" });
    assert.equal(auth.status, 200);
    const { jwt } = await auth.json();
    const me = await fetch(base + "/users/@me", {
      headers: { Authorization: "Bearer " + jwt },
    });
    assert.equal(me.status, 200);
    const { player } = await me.json();
    const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url")).sub;
    const raw = Buffer.from(sub, "base64url").toString("hex");
    players.push({
      name,
      publicId: player.publicId,
      id: [
        raw.slice(0, 8),
        raw.slice(8, 12),
        raw.slice(12, 16),
        raw.slice(16, 20),
        raw.slice(20),
      ].join("-"),
    });
  }
  const config = {
    gameMap: "Africa",
    difficulty: "Medium",
    donateGold: true,
    donateTroops: true,
    gameType: "Private",
    gameMode: "Free For All",
    gameMapSize: "Normal",
    nations: "disabled",
    bots: 0,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const record = {
    version: "v0.0.2",
    gitCommit: "DEV",
    info: {
      gameID: "aTEST12345",
      lobbyCreatedAt: Date.now() - 10000,
      config,
      players: players.map((p, i) => ({
        clientID: "player00" + i,
        username: p.name,
        clanTag: null,
        persistentID: p.id,
        stats: {},
      })),
      start: Date.now() - 5000,
      end: Date.now(),
      duration: 5000,
      num_turns: 10,
      lobbyFillTime: 5000,
      winner: ["player", "player000"],
    },
    turns: [],
  };
  // Real completed matches may omit optional per-player statistics.
  delete record.info.players[0].stats;
  const validation = GameRecordSchema.safeParse(record);
  if (!validation.success) throw Error(JSON.stringify(validation.error.issues));
  const post = (key) =>
    fetch(base + "/game/aTEST12345", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-api-key": key } : {}),
      },
      body: JSON.stringify(record),
    });
  assert.equal((await post()).status, 403);
  const stored = await post("test-secret");
  assert.equal(stored.status, 200);
  assert.equal((await stored.json()).players, 2);
  assert.equal((await (await post("test-secret")).json()).duplicate, true);
  const privateLeaderboard = await (
    await fetch(base + "/leaderboard/recorded")
  ).json();
  assert.equal(
    privateLeaderboard.players.length,
    0,
    "Private games must not enter the public skill ladder",
  );
  const publicRecord = structuredClone(record);
  publicRecord.info.gameID = "aPUBLIC123";
  publicRecord.info.config.gameType = "Public";
  assert.equal(
    (
      await fetch(base + "/game/aPUBLIC123", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-secret",
        },
        body: JSON.stringify(publicRecord),
      })
    ).status,
    200,
  );
  const leaderboard = await (
    await fetch(base + "/leaderboard/recorded")
  ).json();
  assert.equal(leaderboard.players.length, 2);
  assert.equal(leaderboard.players.find((p) => p.username === "Alice").wins, 1);
  assert.equal(leaderboard.players.find((p) => p.username === "Bob").losses, 1);
  const history = await (
    await fetch(base + "/public/player/" + players[0].publicId + "/games")
  ).json();
  assert.equal(history.results[0].result, "victory");
  const profile = await (
    await fetch(base + "/public/player/" + players[0].publicId)
  ).json();
  assert.equal(profile.stats.Private["Free For All"].Medium.wins, "1");
  console.log(
    "PASS: guest identity, signed JWT, restricted ingestion, schema validation, duplicate handling, leaderboard, profile and history. Isolated database only.",
  );
} finally {
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
