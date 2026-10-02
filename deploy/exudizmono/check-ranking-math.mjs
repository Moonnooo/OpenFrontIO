import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  initLeaderboards,
  ladder,
  modeOf,
  rebuildRatings,
  variantOf,
} from "./leaderboards.mjs";
const db = new DatabaseSync(":memory:");
db.exec(
  `CREATE TABLE players(id TEXT PRIMARY KEY,public_id TEXT,username TEXT);CREATE TABLE games(id TEXT PRIMARY KEY,start TEXT,duration REAL,map TEXT,mode TEXT,type TEXT,ranked_type TEXT,winner TEXT,difficulty TEXT);CREATE TABLE results(game_id TEXT,player_id TEXT,username TEXT,result TEXT,stats TEXT);`,
);
initLeaderboards(db);
rebuildRatings(db);
assert.equal(modeOf({ gameMode: "Team", playerTeams: 7 }), "teams-7");
assert.equal(
  modeOf({ gameMode: "Team", playerTeams: "Humans Vs Nations" }),
  "humans-vs-nations",
);
assert.equal(
  variantOf({ randomSpawn: true, gameMapSize: "Compact" }),
  "compact+random-spawn",
);
const game = db.prepare("INSERT INTO games VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
game.run(
  "test",
  "2026-10-02",
  1,
  "World",
  "Free For All",
  "Public",
  "unranked",
  '["player","x"]',
  "Medium",
  "ffa",
  "compact+random-spawn",
  "{}",
);
for (let i = 0; i < 115; i++) {
  const id = "p" + String(i).padStart(3, "0");
  db.prepare("INSERT INTO players VALUES(?,?,?)").run(id, id, id);
  db.prepare("INSERT INTO results VALUES(?,?,?,?,?)").run(
    "test",
    id,
    id,
    "victory",
    "{}",
  );
  db.prepare("INSERT INTO skill_ratings VALUES(?,?,?,?,?)").run(
    id,
    "ffa",
    i < 2 ? 1500 : 1200 - i,
    10,
    1500,
  );
}
const first = ladder(db, { mode: "ffa" });
assert.equal(first.players.length, 100);
assert.equal(first.players[0].rank, 1);
assert.equal(first.players[1].rank, 1);
assert.equal(first.players[2].rank, 3);
const last = ladder(db, { mode: "ffa", cursor: 100 });
assert.equal(last.players.length, 15);
assert.equal(last.players[0].rank, 101);
assert.equal(ladder(db, { mode: "ffa", query: "p114" }).players[0].rank, 115);
assert.equal(ladder(db, { mode: "ffa", variant: "compact" }).totalPlayers, 115);
assert.equal(ladder(db, { mode: "ffa", tier: "Gold" }).players.length, 0);
assert.equal(ladder(db, { mode: "ffa", tier: "Platinum" }).players.length, 2);
db.exec(
  "DELETE FROM results; DELETE FROM players; DELETE FROM games; DELETE FROM skill_ratings;",
);
for (let i = 0; i < 3; i++) {
  db.prepare("INSERT INTO players VALUES(?,?,?)").run(
    "p" + i,
    "p" + i,
    "P" + i,
  );
}
for (let n = 0; n < 10; n++) {
  const id = "g" + n;
  game.run(
    id,
    "2026-10-02T00:" + String(n).padStart(2, "0"),
    1,
    "World",
    "Free For All",
    "Public",
    "unranked",
    '["player","p0"]',
    "Medium",
    "ffa",
    "standard",
    '{"recordedHumanCount":3}',
  );
  for (let i = 0; i < 3; i++)
    db.prepare("INSERT INTO results VALUES(?,?,?,?,?)").run(
      id,
      "p" + i,
      "P" + i,
      i === 0 ? "victory" : "defeat",
      JSON.stringify(i ? { deathPosition: i + 1 } : {}),
    );
}
rebuildRatings(db);
const rated = ladder(db, { mode: "ffa" }).players;
assert.equal(
  rated.every((p) => !p.provisional),
  true,
);
assert.ok(rated[0].elo > rated[1].elo && rated[1].elo > rated[2].elo);
const sum = db
  .prepare("SELECT SUM(rating) total FROM skill_ratings")
  .get().total;
assert.ok(Math.abs(sum - 3000) < 0.000001);
const before = JSON.stringify(rated);
rebuildRatings(db);
assert.equal(JSON.stringify(ladder(db, { mode: "ffa" }).players), before);
console.log(
  "PASS: full pagination, tied ranks, global filtering, variant combinations, FFA placement ordering, zero-sum changes, 10-game placement and deterministic rebuild.",
);
