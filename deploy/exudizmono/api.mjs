import { SignJWT, importJWK, jwtVerify } from "jose";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";
import { createAccounts } from "./accounts.mjs";
import { createClans } from "./clans.mjs";
import {
  initLeaderboards,
  ladder,
  modeOf,
  modes,
  rebuildRatings,
  variantOf,
} from "./leaderboards.mjs";
import { GameRecordSchema } from "./src/core/Schemas.ts";
const dir = process.env.DATA_DIR || "/data";
fs.mkdirSync(dir + "/archives", { recursive: true });
const keyPath = dir + "/signing-key.json";
if (!fs.existsSync(keyPath)) {
  const keys = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(
    keyPath,
    JSON.stringify(keys.privateKey.export({ format: "jwk" })),
    { mode: 0o600 },
  );
}
const privateJwk = JSON.parse(fs.readFileSync(keyPath));
const signingKey = await importJWK(privateJwk, "EdDSA");
const publicJwk = {
  kty: privateJwk.kty,
  crv: privateJwk.crv,
  x: privateJwk.x,
  alg: "EdDSA",
};
const publicKey = await importJWK(publicJwk, "EdDSA");
const db = new DatabaseSync(dir + "/stats.sqlite");
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,public_id TEXT UNIQUE NOT NULL,username TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,start TEXT NOT NULL,duration REAL NOT NULL,map TEXT NOT NULL,mode TEXT NOT NULL,type TEXT NOT NULL,ranked_type TEXT NOT NULL,winner TEXT);
 CREATE TABLE IF NOT EXISTS results(game_id TEXT NOT NULL REFERENCES games(id),player_id TEXT NOT NULL REFERENCES players(id),username TEXT NOT NULL,result TEXT NOT NULL,stats TEXT NOT NULL,PRIMARY KEY(game_id,player_id));`);
if (
  !db
    .prepare("PRAGMA table_info(games)")
    .all()
    .some((c) => c.name === "difficulty")
)
  db.exec(
    "ALTER TABLE games ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'Medium'",
  );
initLeaderboards(db);
for (const g of db
  .prepare("SELECT id FROM games WHERE mode_key='legacy'")
  .all()) {
  try {
    const r = JSON.parse(
      zlib.gunzipSync(fs.readFileSync(dir + "/archives/" + g.id + ".json.gz")),
    );
    const cfg = r.info.config;
    db.prepare("UPDATE games SET mode_key=?,variant=?,config=? WHERE id=?").run(
      modeOf(cfg),
      variantOf(cfg),
      stringifyForMigration({
        ...cfg,
        recordedHumanCount: r.info.players.length,
      }),
      g.id,
    );
  } catch {
    console.warn("Legacy game lacks usable archived configuration:", g.id);
  }
}
function stringifyForMigration(v) {
  return JSON.stringify(v, (_k, x) =>
    typeof x === "bigint" ? x.toString() : x,
  );
}
rebuildRatings(db);
const issuer = process.env.JWT_ISSUER || process.env.STANDALONE_API_URL;
const audience = process.env.DOMAIN;
const secret = process.env.API_KEY;
if (!secret || !issuer || !audience) throw Error("Missing API configuration");
const accounts = createAccounts({
  db,
  origin: process.env.AUTH_ORIGIN || "https://" + audience,
  secure: process.env.COOKIE_SECURE === "true",
});
const clans = createClans({
  db,
  user,
  respond,
  origin: process.env.AUTH_ORIGIN || "https://" + audience,
});
const stringify = (body) =>
  JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
function respond(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(stringify(body));
}
async function user(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience,
      algorithms: ["EdDSA"],
    });
    const raw = Buffer.from(payload.sub, "base64url").toString("hex");
    const id = [
      raw.slice(0, 8),
      raw.slice(8, 12),
      raw.slice(12, 16),
      raw.slice(16, 20),
      raw.slice(20),
    ].join("-");
    return db.prepare("SELECT * FROM players WHERE id=?").get(id) || null;
  } catch {
    return null;
  }
}
async function readBody(req) {
  let chunks = [],
    length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 64 * 1024 * 1024) throw Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function profile(p) {
  const rows = db
    .prepare(
      `SELECT g.ranked_type,g.type,g.mode,g.difficulty,r.result FROM results r JOIN games g ON g.id=r.game_id WHERE r.player_id=?`,
    )
    .all(p.id);
  const stats = {};
  for (const r of rows) {
    const group = r.ranked_type === "unranked" ? r.type : "Ranked";
    const mode = r.ranked_type === "unranked" ? r.mode : r.ranked_type;
    stats[group] ??= {};
    const root = stats[group];
    const leaf =
      group === "Ranked"
        ? (root[mode] ??= { wins: "0", losses: "0", total: "0", stats: {} })
        : ((root[mode] ??= {})[r.difficulty] ??= {
            wins: "0",
            losses: "0",
            total: "0",
            stats: {},
          });
    leaf.total = String(Number(leaf.total) + 1);
    if (r.result === "victory") leaf.wins = String(Number(leaf.wins) + 1);
    else if (r.result === "defeat")
      leaf.losses = String(Number(leaf.losses) + 1);
  }
  return {
    publicId: p.public_id,
    username: p.username,
    createdAt: p.created_at,
    stats,
    ratings: modes(db)
      .modes.filter((m) => !["all", "teams"].includes(m.id))
      .flatMap((m) =>
        ladder(db, { mode: m.id, player: p.public_id })
          .players.filter((r) => r.elo !== null)
          .map((r) => ({ ...r, mode: m.id, label: m.label })),
      ),
  };
}
function resultFor(info, p) {
  const winner = info.winner;
  if (!winner) return "incomplete";
  if (winner[0] === "player")
    return winner.slice(1).includes(p.clientID) ? "victory" : "defeat";
  if (winner[0] === "team" && winner.length > 2)
    return winner.slice(2).includes(p.clientID) ? "victory" : "defeat";
  if (winner[0] === "nation") return "defeat";
  return "incomplete";
}
function ingest(record) {
  const parsed = GameRecordSchema.safeParse(record);
  if (!parsed.success) throw Error("Invalid game record");
  const r = parsed.data;
  const info = r.info;
  if (db.prepare("SELECT 1 FROM games WHERE id=?").get(info.gameID))
    return { duplicate: true };
  const cfg = info.config;
  const roster = info.players.filter(
    (p) =>
      p.persistentID &&
      db.prepare("SELECT 1 FROM players WHERE id=?").get(p.persistentID),
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO games(id,start,duration,map,mode,type,ranked_type,winner,difficulty,mode_key,variant,config) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      info.gameID,
      new Date(info.start).toISOString(),
      info.duration / 1000,
      cfg.gameMap,
      cfg.gameMode,
      cfg.gameType,
      cfg.rankedType || "unranked",
      stringify(info.winner ?? null),
      cfg.difficulty,
      modeOf(cfg),
      variantOf(cfg),
      stringify({ ...cfg, recordedHumanCount: info.players.length }),
    );
    for (const p of roster) {
      db.prepare("INSERT INTO results VALUES(?,?,?,?,?)").run(
        info.gameID,
        p.persistentID,
        p.username,
        resultFor(info, p),
        stringify(p.stats),
      );
      db.prepare("UPDATE players SET username=? WHERE id=?").run(
        p.username,
        p.persistentID,
      );
    }
    clans.record(info, roster, resultFor);
    const archive = dir + "/archives/" + info.gameID + ".json.gz";
    fs.writeFileSync(archive + ".tmp", zlib.gzipSync(stringify(r)));
    fs.renameSync(archive + ".tmp", archive);
    rebuildRatings(db);
    db.exec("COMMIT");
    return { stored: true, players: roster.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
const counts = new Map();
setInterval(() => counts.clear(), 60000).unref();
http
  .createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      const path = u.pathname;
      const internal = req.headers["x-api-key"] === secret;
      if (!internal) {
        const ip = req.headers["x-real-ip"] || req.socket.remoteAddress;
        const c = (counts.get(ip) || 0) + 1;
        counts.set(ip, c);
        if (c > 180) return respond(res, 429, { error: "Too many requests" });
      }
      if (req.method === "POST" && path === "/matchmaking/checkin" && internal)
        return respond(res, 200, { assignment: null });
      if (req.method === "GET" && path === "/health")
        return respond(res, 200, { ok: true });
      if (req.method === "GET" && path === "/.well-known/jwks.json")
        return respond(res, 200, { keys: [publicJwk] });
      if (req.method === "POST" && path === "/auth/refresh") {
        const allowedOrigin = process.env.AUTH_ORIGIN || "https://" + audience;
        if (req.headers.origin && req.headers.origin !== allowedOrigin)
          return respond(res, 403, { error: "Wrong origin" });
        let p = accounts.current(req),
          headers = {};
        if (!p) {
          p = accounts.newPlayer();
          headers = { "Set-Cookie": accounts.session(p, req) };
        }
        const sub = Buffer.from(p.id.replaceAll("-", ""), "hex").toString(
          "base64url",
        );
        const jwt = await new SignJWT({ provider: accounts.provider(p) })
          .setProtectedHeader({ alg: "EdDSA" })
          .setSubject(sub)
          .setJti(crypto.randomUUID())
          .setIssuedAt()
          .setIssuer(issuer)
          .setAudience(audience)
          .setExpirationTime("1h")
          .sign(signingKey);
        return respond(res, 200, { jwt, expiresIn: 3600 }, headers);
      }
      if (await accounts.handle(req, res, u)) return;
      if (await clans.handle(req, res, u)) return;
      if (req.method === "GET" && path === "/users/@me") {
        const p = await user(req);
        if (!p) return respond(res, 401, { error: "Unauthorized" });
        return respond(res, 200, {
          user: accounts.identities(p),
          player: {
            publicId: p.public_id,
            username: null,
            adfree: true,
            unlimitedRanked: false,
            canCreatePublicLobbies: true,
            trustTier: accounts.trustTier(p),
            achievements: { singleplayerMap: [], player: [] },
            friends: [],
            clans: clans.mine(p.id),
            clanRequests: clans.pending(p.id),
            subscription: null,
          },
        });
      }
      if (req.method === "GET" && path === "/cluster.json")
        return respond(res, 200, {
          latest: process.env.GIT_COMMIT,
          servers: {
            a: {
              host: process.env.DOMAIN,
              numWorkers: Number(process.env.NUM_WORKERS ?? 2),
              version: process.env.GIT_COMMIT,
              state: "open",
            },
          },
        });
      if (req.method === "POST" && /^\/game\/[A-Za-z0-9_-]+$/.test(path)) {
        if (!internal)
          return respond(res, 403, { error: "Server ingestion only" });
        const body = await readBody(req);
        if (body.info?.gameID !== path.split("/").at(-1))
          return respond(res, 400, { error: "Game ID mismatch" });
        return respond(res, 200, ingest(body));
      }
      if (req.method === "GET" && path === "/leaderboard/modes")
        return respond(res, 200, modes(db));
      if (req.method === "GET" && path === "/leaderboard/recorded")
        return respond(
          res,
          200,
          ladder(db, {
            mode: u.searchParams.get("mode") || "all",
            variant: u.searchParams.get("variant") || "all",
            cursor: Number(u.searchParams.get("cursor") || 0),
            query: (u.searchParams.get("q") || "").slice(0, 120),
            player: u.searchParams.get("player"),
            tier: u.searchParams.get("tier") || "all",
            sort: u.searchParams.get("sort") || "elo",
          }),
        );
      if (req.method === "GET" && path === "/leaderboard/ranked")
        return respond(res, 200, { "1v1": [], "2v2": [] });
      const match = path.match(
        /^\/public\/player\/([A-Za-z0-9_-]{1,80})(\/games)?$/,
      );
      if (req.method === "GET" && match) {
        const p = db
          .prepare("SELECT * FROM players WHERE public_id=?")
          .get(match[1]);
        if (!p) return respond(res, 404, { error: "Player not found" });
        if (!match[2]) return respond(res, 200, profile(p));
        const offset = Number(u.searchParams.get("cursor") || 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          return respond(res, 400, { error: "Invalid cursor" });
        const rows = db
          .prepare(
            `SELECT g.*,r.result,r.username FROM games g JOIN results r ON r.game_id=g.id WHERE r.player_id=? ORDER BY g.start DESC,g.id LIMIT 51 OFFSET ?`,
          )
          .all(p.id, offset);
        const results = rows.slice(0, 50).map((g) => ({
          gameId: g.id,
          start: g.start,
          durationSeconds: Math.floor(g.duration),
          map: g.map,
          mode: g.mode,
          type: g.type,
          playerTeams: g.config
            ? (JSON.parse(g.config).playerTeams ?? null)
            : null,
          modeKey: g.mode_key,
          variant: g.variant,
          rankedType: g.ranked_type,
          result: g.result,
          totalPlayers: null,
          username: g.username,
          clanTag: null,
        }));
        return respond(res, 200, {
          results,
          nextCursor: rows.length > 50 ? String(offset + 50) : null,
        });
      }
      if (req.method === "GET" && path === "/public/clans/leaderboard")
        return respond(res, 200, clans.leaderboard());
      if (req.method === "GET" && path === "/news.json")
        return respond(res, 200, []);
      if (req.method === "GET" && path === "/cosmetics.json")
        return respond(res, 200, { patterns: {}, flags: {} });
      if (req.method === "GET" && path === "/streams.json")
        return respond(res, 200, {
          verifiedAt: new Date().toISOString(),
          featured: [],
          live: [],
        });
      return respond(res, 404, {
        error: "Not available on this independent test server",
      });
    } catch (error) {
      console.error("API request failed:", error.message);
      if (!res.headersSent) respond(res, 400, { error: "Invalid request" });
      else res.end();
    }
  })
  .listen(8787, process.env.API_BIND ?? "127.0.0.1", () =>
    console.log("FrontRank API listening on loopback:8787"),
  );
