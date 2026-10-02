import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  ClanBrowseResponseSchema,
  ClanLeaderboardResponseSchema,
} from "./src/core/ClanApiSchemas.ts";
const dir = fs.mkdtempSync("/tmp/clan-browse-test-");
const child = spawn(process.execPath, ["--import", "tsx", "api.mjs"], {
  env: {
    ...process.env,
    DATA_DIR: dir,
    API_KEY: "test-secret",
    DOMAIN: "game.exudizmono.com",
    STANDALONE_API_URL: "http://127.0.0.1:8787",
  },
  stdio: ["ignore", "ignore", "inherit"],
});
const base = "http://127.0.0.1:8787";
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {
      /* Cleanup is best-effort when the test server has already stopped. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const path of [
    "/clans?page=1&limit=20",
    "/clans?page=2&limit=20&search=test",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200);
    const b = ClanBrowseResponseSchema.parse(await r.json());
    assert.equal(b.total, 0);
    assert.deepEqual(b.results, []);
    assert.equal(b.limit, 20);
  }
  for (const path of [
    "/clans?page=0",
    "/clans?limit=101",
    "/clans?page=abc",
    "/clans?limit=1.5",
  ])
    assert.equal((await fetch(base + path)).status, 400);
  const r = await fetch(base + "/public/clans/leaderboard");
  assert.equal(r.status, 200);
  assert.deepEqual(
    ClanLeaderboardResponseSchema.parse(await r.json()).clans,
    [],
  );
  console.log(
    "PASS: client clan schemas, empty own-server directory, search/pagination and invalid pagination.",
  );
} finally {
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
