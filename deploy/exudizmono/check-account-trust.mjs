import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
    assert.equal(
      player.trustTier,
      "untrusted",
      "guest API response remains untrusted",
    );
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
    const fixtureDB = new DatabaseSync(dir + "/stats.sqlite");
    fixtureDB
      .prepare("INSERT INTO identities VALUES(?,?,?,?)")
      .run(
        "steam",
        "7656119800000000" + players.length,
        players.at(-1).id,
        JSON.stringify({ steamId: "7656119800000000" + players.length }),
      );
    fixtureDB.close();
    const verified = await (
      await fetch(base + "/users/@me", {
        headers: { Authorization: "Bearer " + jwt },
      })
    ).json();
    assert.equal(
      verified.player.trustTier,
      "trusted",
      "API reports persisted verified Steam identity as trusted",
    );
  }
  console.log(
    "PASS: authenticated API returns untrusted for guests and trusted for verified Steam identities. Isolated database only.",
  );
} finally {
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
