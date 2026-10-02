import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ladder } from "./leaderboards.mjs";
test("rank badge lookup includes accounts below the first leaderboard page", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,public_id TEXT,username TEXT);
 CREATE TABLE games(id TEXT,type TEXT,mode TEXT,mode_key TEXT,variant TEXT);
 CREATE TABLE results(game_id TEXT,player_id TEXT,result TEXT);
 CREATE TABLE skill_ratings(player_id TEXT,mode TEXT,rating REAL,games INTEGER,peak REAL);
 INSERT INTO games VALUES('g','Public','Free For All','ffa','standard');`);
  for (let i = 1; i <= 110; i++) {
    db.prepare("INSERT INTO players VALUES(?,?,?)").run(
      String(i),
      `p${i}`,
      `Player ${i}`,
    );
    db.prepare("INSERT INTO results VALUES('g',?,'defeat')").run(String(i));
    db.prepare("INSERT INTO skill_ratings VALUES(?,'ffa',?,10,?)").run(
      String(i),
      2000 - i,
      2000 - i,
    );
  }
  assert.equal(ladder(db, { mode: "ffa" }).players.length, 100);
  const rows = ladder(db, {
    mode: "ffa",
    limit: Number.MAX_SAFE_INTEGER,
  }).players;
  assert.equal(rows.length, 110);
  assert.equal(rows.find((p) => p.public_id === "p110").rank, 110);
  assert.equal(rows.find((p) => p.public_id === "p110").elo, 1890);
  assert.equal(rows.find((p) => p.public_id === "p110").tier, "Master");
  assert.equal(
    ladder(db, { mode: "duos", limit: Number.MAX_SAFE_INTEGER }).players.length,
    0,
  );
  db.close();
});
