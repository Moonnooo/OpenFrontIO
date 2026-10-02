export function createClans({ db, user, respond, origin }) {
  db.exec(`CREATE TABLE IF NOT EXISTS clans(tag TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,discord_url TEXT,is_open INTEGER NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT);
 CREATE TABLE IF NOT EXISTS clan_members(tag TEXT NOT NULL REFERENCES clans(tag),player_id TEXT NOT NULL REFERENCES players(id),role TEXT NOT NULL CHECK(role IN ('leader','officer','member')),joined_at TEXT NOT NULL,PRIMARY KEY(tag,player_id));
 CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_leader ON clan_members(tag) WHERE role='leader';
 CREATE INDEX IF NOT EXISTS idx_clan_members_player ON clan_members(player_id);
 CREATE TABLE IF NOT EXISTS clan_requests(tag TEXT NOT NULL REFERENCES clans(tag),player_id TEXT NOT NULL REFERENCES players(id),created_at TEXT NOT NULL,PRIMARY KEY(tag,player_id));
 CREATE TABLE IF NOT EXISTS clan_bans(tag TEXT NOT NULL REFERENCES clans(tag),player_id TEXT NOT NULL REFERENCES players(id),banned_by TEXT NOT NULL REFERENCES players(id),reason TEXT,created_at TEXT NOT NULL,PRIMARY KEY(tag,player_id));
 CREATE TABLE IF NOT EXISTS clan_audit(id INTEGER PRIMARY KEY,tag TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS clan_game_players(game_id TEXT NOT NULL REFERENCES games(id),tag TEXT NOT NULL REFERENCES clans(tag),player_id TEXT NOT NULL REFERENCES players(id),username TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(game_id,tag,player_id));
 CREATE INDEX IF NOT EXISTS idx_clan_games_tag ON clan_game_players(tag,game_id);
 PRAGMA optimize;`);
  const now = () => new Date().toISOString();
  const get = (tag) =>
    db
      .prepare("SELECT * FROM clans WHERE tag=? AND deleted_at IS NULL")
      .get(tag);
  const membership = (tag, id) =>
    db
      .prepare("SELECT * FROM clan_members WHERE tag=? AND player_id=?")
      .get(tag, id);
  const info = (c) => ({
    tag: c.tag,
    name: c.name,
    description: c.description,
    discordUrl: c.discord_url,
    isOpen: !!c.is_open,
    createdAt: c.created_at,
    memberCount: db
      .prepare("SELECT COUNT(*) n FROM clan_members WHERE tag=?")
      .get(c.tag).n,
  });
  const mine = (id) =>
    db
      .prepare(
        "SELECT c.*,m.role,m.joined_at FROM clans c JOIN clan_members m ON m.tag=c.tag WHERE c.deleted_at IS NULL AND m.player_id=? ORDER BY c.created_at,c.tag",
      )
      .all(id)
      .map((c) => ({ ...info(c), role: c.role, joinedAt: c.joined_at }));
  const pending = (id) =>
    db
      .prepare(
        "SELECT c.tag,c.name,r.created_at FROM clans c JOIN clan_requests r ON r.tag=c.tag WHERE c.deleted_at IS NULL AND r.player_id=?",
      )
      .all(id)
      .map((r) => ({ tag: r.tag, name: r.name, createdAt: r.created_at }));
  const audit = (tag, actor, action, target = null) =>
    db
      .prepare(
        "INSERT INTO clan_audit(tag,actor,action,target,created_at) VALUES(?,?,?,?,?)",
      )
      .run(tag, actor, action, target, now());
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function fail(status, message, extra = {}) {
    throw Object.assign(Error(message), { status, extra });
  }
  function page(u, rows) {
    const page = Number(u.searchParams.get("page") || 1),
      limit = Number(u.searchParams.get("limit") || 20);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      fail(400, "Invalid pagination");
    return {
      results: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
    };
  }
  function validate(data, creating = false) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail(400, "Invalid clan details");
    const out = {};
    if (creating || "name" in data) {
      if (
        typeof data.name !== "string" ||
        !data.name.trim() ||
        data.name.trim().length > 35
      )
        fail(400, "Name must contain 1–35 characters");
      out.name = data.name.trim();
    }
    if (creating || "description" in data) {
      if (
        data.description !== undefined &&
        (typeof data.description !== "string" || data.description.length > 200)
      )
        fail(400, "Description must be at most 200 characters");
      out.description = data.description || "";
    }
    if (creating || "isOpen" in data) {
      if (data.isOpen !== undefined && typeof data.isOpen !== "boolean")
        fail(400, "Invalid membership setting");
      out.is_open = data.isOpen === false ? 0 : 1;
    }
    if ("discordUrl" in data) {
      if (data.discordUrl === null || data.discordUrl === "")
        out.discord_url = null;
      else {
        if (typeof data.discordUrl !== "string")
          fail(400, "Invalid Discord invite", { code: "DISCORD_INVALID" });
        const m = data.discordUrl.match(
          /^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)([A-Za-z0-9-]{2,100})\/?$/,
        );
        if (!m)
          fail(400, "Use a Discord invite URL", { code: "DISCORD_INVALID" });
        out.discord_url = "https://discord.gg/" + m[1];
      }
    }
    return out;
  }
  async function body(req) {
    let text = "",
      size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) fail(413, "Clan request too large");
      text += chunk.toString();
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      fail(400, "Invalid JSON");
    }
  }
  function room(tag, id) {
    if (mine(id).length >= 5) fail(409, "You can belong to at most five clans");
    if (
      db.prepare("SELECT COUNT(*) n FROM clan_members WHERE tag=?").get(tag)
        .n >= 100
    )
      fail(409, "This clan is full");
  }
  const reserved = () =>
    db
      .prepare("SELECT tag FROM clans WHERE deleted_at IS NULL ORDER BY tag")
      .all()
      .map((r) => r.tag);
  async function handle(req, res, u) {
    const path = u.pathname;
    if (
      !path.startsWith("/clans") &&
      !path.startsWith("/public/clan/") &&
      path !== "/reserved_clan_tags"
    )
      return false;
    try {
      if (req.method === "GET" && path === "/reserved_clan_tags") {
        respond(res, 200, reserved());
        return true;
      }
      const probe = path.match(/^\/public\/clan\/([A-Za-z0-9]{2,5})\/exists$/);
      if (probe && req.method === "GET") {
        respond(res, get(probe[1].toUpperCase()) ? 200 : 404, {
          exists: !!get(probe[1].toUpperCase()),
        });
        return true;
      }
      if (req.method === "GET" && path === "/clans") {
        const q = (u.searchParams.get("search") || "")
          .toLowerCase()
          .slice(0, 100);
        const rows = db
          .prepare(
            "SELECT * FROM clans WHERE deleted_at IS NULL ORDER BY created_at DESC,tag",
          )
          .all()
          .filter(
            (c) =>
              !q ||
              c.tag.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q),
          )
          .map(info);
        respond(res, 200, page(u, rows));
        return true;
      }
      const actor = await user(req);
      const signed =
        actor &&
        db
          .prepare("SELECT 1 FROM identities WHERE player_id=? LIMIT 1")
          .get(actor.id);
      if (req.method !== "GET") {
        if (!signed) fail(401, "Sign in to manage clans");
        if (req.headers.origin && req.headers.origin !== origin)
          fail(403, "Wrong origin");
      }
      if (req.method === "POST" && path === "/clans") {
        const b = await body(req),
          tag = typeof b.tag === "string" ? b.tag.toUpperCase() : "";
        if (!/^[A-Z0-9]{2,5}$/.test(tag))
          fail(400, "Tag must contain 2–5 letters or digits");
        const fields = validate(b, true);
        transaction(() => {
          if (db.prepare("SELECT 1 FROM clans WHERE tag=?").get(tag))
            fail(409, "This clan tag is already reserved");
          if (mine(actor.id).length >= 5)
            fail(409, "You can belong to at most five clans");
          db.prepare("INSERT INTO clans VALUES(?,?,?,?,?,?,NULL)").run(
            tag,
            fields.name,
            fields.description,
            fields.discord_url ?? null,
            fields.is_open,
            now(),
          );
          db.prepare("INSERT INTO clan_members VALUES(?,?,?,?)").run(
            tag,
            actor.id,
            "leader",
            now(),
          );
          audit(tag, actor.id, "create");
        });
        respond(res, 201, info(get(tag)));
        return true;
      }
      const match = path.match(/^\/clans\/([A-Za-z0-9]{2,5})(?:\/(.*))?$/);
      if (!match) fail(404, "Clan endpoint not found");
      const tag = match[1].toUpperCase(),
        action = match[2] || "",
        c = get(tag);
      if (!c) fail(404, "Clan not found");
      let role = actor ? membership(tag, actor.id)?.role : null;
      const manage = () => {
        if (!signed || !["leader", "officer"].includes(role))
          fail(403, "Clan leader or officer access required");
      };
      const leader = () => {
        if (role !== "leader" || !signed)
          fail(403, "Only the clan leader can do this");
      };
      if (req.method === "GET") {
        if (!action) {
          respond(res, 200, info(c));
          return true;
        }
        if (action === "members") {
          respond(
            res,
            200,
            page(
              u,
              db
                .prepare(
                  "SELECT m.role,m.joined_at,p.public_id,p.username FROM clan_members m JOIN players p ON p.id=m.player_id WHERE m.tag=? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,m.joined_at,p.public_id",
                )
                .all(tag)
                .map((m) => ({
                  role: m.role,
                  joinedAt: m.joined_at,
                  publicId: m.public_id,
                  username: m.username,
                })),
            ),
          );
          return true;
        }
        if (action === "requests") {
          manage();
          respond(
            res,
            200,
            page(
              u,
              db
                .prepare(
                  "SELECT p.public_id,p.username,r.created_at FROM clan_requests r JOIN players p ON p.id=r.player_id WHERE r.tag=? ORDER BY r.created_at,p.public_id",
                )
                .all(tag)
                .map((r) => ({
                  publicId: r.public_id,
                  username: r.username,
                  createdAt: r.created_at,
                })),
            ),
          );
          return true;
        }
        if (action === "bans") {
          manage();
          respond(
            res,
            200,
            page(
              u,
              db
                .prepare(
                  "SELECT p.public_id,p.username,b.reason,b.created_at,a.public_id banned_by,a.username banned_by_username FROM clan_bans b JOIN players p ON p.id=b.player_id JOIN players a ON a.id=b.banned_by WHERE b.tag=? ORDER BY b.created_at DESC",
                )
                .all(tag)
                .map((b) => ({
                  publicId: b.public_id,
                  username: b.username,
                  bannedBy: b.banned_by,
                  bannedByUsername: b.banned_by_username,
                  reason: b.reason,
                  createdAt: b.created_at,
                })),
            ),
          );
          return true;
        }
        if (action === "games") {
          const cursor = Number(u.searchParams.get("cursor") || 0);
          if (!Number.isSafeInteger(cursor) || cursor < 0)
            fail(400, "Invalid cursor");
          const filter = u.searchParams.get("filter") || "all";
          if (!["all", "ffa", "team", "hvn", "ranked"].includes(filter))
            fail(400, "Invalid filter");
          const games = db
            .prepare(
              `SELECT DISTINCT g.* FROM games g JOIN clan_game_players c ON c.game_id=g.id WHERE c.tag=? AND (?='all' OR (?='ffa' AND g.mode_key='ffa') OR (?='team' AND g.mode='Team') OR (?='hvn' AND g.mode_key='humans-vs-nations') OR (?='ranked' AND g.ranked_type!='unranked')) ORDER BY g.start DESC,g.id LIMIT 51 OFFSET ?`,
            )
            .all(tag, filter, filter, filter, filter, filter, cursor);
          respond(res, 200, {
            results: games.slice(0, 50).map((g) => {
              const players = db
                .prepare(
                  "SELECT c.*,p.public_id FROM clan_game_players c JOIN players p ON p.id=c.player_id WHERE c.tag=? AND c.game_id=?",
                )
                .all(tag, g.id);
              const cfg = g.config ? JSON.parse(g.config) : {};
              return {
                gameId: g.id,
                start: g.start,
                durationSeconds: Math.floor(g.duration),
                map: g.map,
                mode: g.mode,
                playerTeams:
                  cfg.playerTeams === undefined
                    ? null
                    : String(cfg.playerTeams),
                rankedType: g.ranked_type,
                totalPlayers: cfg.recordedHumanCount ?? null,
                result: players.some((p) => p.result === "victory")
                  ? "victory"
                  : players.some((p) => p.result === "defeat")
                    ? "defeat"
                    : "incomplete",
                clanPlayers: players.map((p) => ({
                  publicId: p.public_id,
                  username: p.username,
                  won: p.result === "victory",
                })),
              };
            }),
            nextCursor: games.length > 50 ? String(cursor + 50) : null,
          });
          return true;
        }

        if (action === "donations") {
          respond(res, 200, page(u, []));
          return true;
        }
        fail(404, "Clan endpoint not found");
      }
      if (req.method === "PATCH" && !action) {
        const fields = validate(await body(req));
        transaction(() => {
          if (!get(tag)) fail(404, "Clan not found");
          role = membership(tag, actor.id)?.role;
          leader();
          for (const [key, value] of Object.entries(fields))
            db.prepare("UPDATE clans SET " + key + "=? WHERE tag=?").run(
              value,
              tag,
            );
          audit(tag, actor.id, "update");
        });
        respond(res, 200, info(get(tag)));
        return true;
      }
      if (req.method === "DELETE" && !action) {
        transaction(() => {
          role = membership(tag, actor.id)?.role;
          leader();
          db.prepare("UPDATE clans SET deleted_at=? WHERE tag=?").run(
            now(),
            tag,
          );
          audit(tag, actor.id, "disband");
        });
        respond(res, 200, { ok: true });
        return true;
      }
      if (req.method !== "POST") fail(405, "Method not allowed");
      let joinStatus;
      transaction(() => {
        if (!get(tag)) fail(404, "Clan not found");
        role = membership(tag, actor.id)?.role;
        if (action === "join") {
          if (
            db
              .prepare(
                "SELECT reason FROM clan_bans WHERE tag=? AND player_id=?",
              )
              .get(tag, actor.id)
          ) {
            const ban = db
              .prepare(
                "SELECT reason FROM clan_bans WHERE tag=? AND player_id=?",
              )
              .get(tag, actor.id);
            fail(403, "You are banned from this clan", {
              code: "BANNED",
              reason: ban.reason,
            });
          }
          if (role) fail(409, "Already a member");
          room(tag, actor.id);
          if (
            db
              .prepare(
                "SELECT 1 FROM clan_requests WHERE tag=? AND player_id=?",
              )
              .get(tag, actor.id)
          )
            fail(409, "Join request already pending");
          joinStatus = get(tag).is_open ? "joined" : "requested";
          if (joinStatus === "joined")
            db.prepare("INSERT INTO clan_members VALUES(?,?,?,?)").run(
              tag,
              actor.id,
              "member",
              now(),
            );
          else
            db.prepare("INSERT INTO clan_requests VALUES(?,?,?)").run(
              tag,
              actor.id,
              now(),
            );
          audit(tag, actor.id, joinStatus === "joined" ? "join" : "request");
          return;
        }
        if (action === "leave") {
          if (!role) fail(409, "Not a member");
          if (role === "leader")
            fail(409, "Transfer leadership or disband before leaving");
          db.prepare(
            "DELETE FROM clan_members WHERE tag=? AND player_id=?",
          ).run(tag, actor.id);
          audit(tag, actor.id, "leave");
          return;
        }
        if (action === "requests/withdraw") {
          db.prepare(
            "DELETE FROM clan_requests WHERE tag=? AND player_id=?",
          ).run(tag, actor.id);
          audit(tag, actor.id, "withdraw");
          return;
        }
        if (
          ![
            "requests/approve",
            "requests/deny",
            "kick",
            "promote",
            "demote",
            "transfer",
            "ban",
            "unban",
          ].includes(action)
        )
          fail(404, "Clan endpoint not found");
        manage();
      });
      if (["join", "leave", "requests/withdraw"].includes(action)) {
        respond(
          res,
          200,
          action === "join" ? { status: joinStatus } : { ok: true },
        );
        return true;
      }
      const b = await body(req),
        target =
          typeof b.targetPublicId === "string"
            ? db
                .prepare("SELECT * FROM players WHERE public_id=?")
                .get(b.targetPublicId)
            : null;
      if (!target) fail(404, "Player not found");
      transaction(() => {
        if (!get(tag)) fail(404, "Clan not found");
        role = membership(tag, actor.id)?.role;
        manage();
        const targetRole = membership(tag, target.id)?.role;
        if (["promote", "demote", "transfer"].includes(action)) leader();
        if (
          ["kick", "ban"].includes(action) &&
          (target.id === actor.id ||
            targetRole === "leader" ||
            (role === "officer" && targetRole === "officer"))
        )
          fail(403, "You cannot remove this member");
        if (action === "requests/approve" || action === "requests/deny") {
          if (
            !db
              .prepare(
                "SELECT 1 FROM clan_requests WHERE tag=? AND player_id=?",
              )
              .get(tag, target.id)
          )
            fail(404, "Join request not found");
          if (action === "requests/approve") {
            if (
              db
                .prepare("SELECT 1 FROM clan_bans WHERE tag=? AND player_id=?")
                .get(tag, target.id)
            )
              fail(403, "Player is banned");
            room(tag, target.id);
            db.prepare("INSERT INTO clan_members VALUES(?,?,?,?)").run(
              tag,
              target.id,
              "member",
              now(),
            );
          }
          db.prepare(
            "DELETE FROM clan_requests WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        } else if (action === "kick") {
          if (!targetRole) fail(404, "Member not found");
          db.prepare(
            "DELETE FROM clan_members WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        } else if (action === "ban") {
          if (
            b.reason !== undefined &&
            (typeof b.reason !== "string" || b.reason.length > 200)
          )
            fail(400, "Ban reason must be at most 200 characters");
          db.prepare(
            "INSERT INTO clan_bans VALUES(?,?,?,?,?) ON CONFLICT(tag,player_id) DO UPDATE SET banned_by=excluded.banned_by,reason=excluded.reason,created_at=excluded.created_at",
          ).run(tag, target.id, actor.id, b.reason || null, now());
          db.prepare(
            "DELETE FROM clan_members WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
          db.prepare(
            "DELETE FROM clan_requests WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        } else if (action === "unban")
          db.prepare("DELETE FROM clan_bans WHERE tag=? AND player_id=?").run(
            tag,
            target.id,
          );
        else if (action === "promote") {
          if (targetRole !== "member") fail(409, "Choose an ordinary member");
          db.prepare(
            "UPDATE clan_members SET role='officer' WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        } else if (action === "demote") {
          if (targetRole !== "officer") fail(409, "Choose an officer");
          db.prepare(
            "UPDATE clan_members SET role='member' WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        } else if (action === "transfer") {
          if (!targetRole || target.id === actor.id)
            fail(409, "Choose another clan member");
          db.prepare(
            "UPDATE clan_members SET role='officer' WHERE tag=? AND player_id=?",
          ).run(tag, actor.id);
          db.prepare(
            "UPDATE clan_members SET role='leader' WHERE tag=? AND player_id=?",
          ).run(tag, target.id);
        }
        audit(tag, actor.id, action, target.id);
      });
      respond(res, 200, { ok: true });
      return true;
    } catch (e) {
      respond(res, e.status || 400, {
        error: e.status ? e.message : "Invalid clan request",
        message: e.status ? e.message : "Invalid clan request",
        ...e.extra,
      });
      return true;
    }
  }
  function record(info, roster, resultFor) {
    for (const p of roster) {
      const tag = p.clanTag?.toUpperCase(),
        c = tag ? get(tag) : null;
      if (c && Date.parse(c.created_at) <= info.start)
        db.prepare(
          "INSERT OR IGNORE INTO clan_game_players VALUES(?,?,?,?,?)",
        ).run(info.gameID, tag, p.persistentID, p.username, resultFor(info, p));
    }
  }
  function leaderboard() {
    const end = new Date(),
      start = new Date(end.getTime() - 30 * 86400000).toISOString();
    const rows = db
      .prepare(
        `SELECT c.tag,COUNT(DISTINCT c.game_id) games,COUNT(*) playerSessions,SUM(c.result='victory') weightedWins,SUM(c.result='defeat') weightedLosses FROM clan_game_players c JOIN games g ON g.id=c.game_id JOIN clans cl ON cl.tag=c.tag WHERE cl.deleted_at IS NULL AND g.type='Public' AND g.start>=? AND c.result IN ('victory','defeat') GROUP BY c.tag ORDER BY weightedWins DESC,c.tag`,
      )
      .all(start);
    return {
      start,
      end: end.toISOString(),
      clans: rows.map((r) => {
        const games = db
          .prepare(
            `SELECT c.game_id,MAX(c.result='victory') won FROM clan_game_players c JOIN games g ON g.id=c.game_id WHERE c.tag=? AND g.type='Public' AND g.start>=? AND c.result IN ('victory','defeat') GROUP BY c.game_id`,
          )
          .all(r.tag, start);
        const wins = games.filter((g) => g.won).length;
        return {
          clanTag: r.tag,
          games: r.games,
          wins,
          losses: r.games - wins,
          playerSessions: r.playerSessions,
          weightedWins: r.weightedWins,
          weightedLosses: r.weightedLosses,
          weightedWLRatio: r.weightedLosses
            ? r.weightedWins / r.weightedLosses
            : r.weightedWins,
        };
      }),
      total: rows.length,
      limit: rows.length,
    };
  }
  return { handle, mine, pending, reserved, record, leaderboard };
}
