export const baseModes = [
  ["all", "All multiplayer"],
  ["1v1", "Ranked 1v1"],
  ["2v2", "Ranked 2v2"],
  ["ffa", "Free for all"],
  ["teams", "All team games"],
  ["duos", "Duos"],
  ["trios", "Trios"],
  ["quads", "Quads"],
  ["humans-vs-nations", "Humans vs nations"],
];
export function modeOf(cfg) {
  if (cfg.rankedType) return cfg.rankedType;
  if (cfg.gameMode === "Free For All") return "ffa";
  return (
    {
      Duos: "duos",
      Trios: "trios",
      Quads: "quads",
      "Humans Vs Nations": "humans-vs-nations",
    }[cfg.playerTeams] ||
    (typeof cfg.playerTeams === "number" ? "teams-" + cfg.playerTeams : "teams")
  );
}
export function variantOf(cfg) {
  const tags = [];
  if (cfg.gameMapSize === "Compact") tags.push("compact");
  if (cfg.randomSpawn) tags.push("random-spawn");
  if (cfg.waterNukes) tags.push("water-nukes");
  if (cfg.doomsdayClock?.enabled) tags.push("doomsday");
  if (cfg.goldMultiplier && cfg.goldMultiplier !== 1)
    tags.push("gold-x" + cfg.goldMultiplier);
  if (
    cfg.infiniteGold ||
    cfg.infiniteTroops ||
    cfg.instantBuild ||
    Object.values(cfg.hostCheats || {}).some(Boolean)
  )
    tags.push("custom-cheats");
  return tags.sort().join("+") || "standard";
}
export function initLeaderboards(db) {
  const cols = db.prepare("PRAGMA table_info(games)").all();
  for (const [name, type] of [
    ["mode_key", "TEXT NOT NULL DEFAULT 'legacy'"],
    ["variant", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["config", "TEXT"],
  ])
    if (!cols.some((c) => c.name === name))
      db.exec(`ALTER TABLE games ADD COLUMN ${name} ${type}`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_results_player ON results(player_id); CREATE INDEX IF NOT EXISTS idx_games_mode_type ON games(mode_key,type); PRAGMA optimize;",
  );
}
function condition(mode, variant) {
  return {
    sql: `g.type='Public' AND r.result IN ('victory','defeat') AND (?='all' OR g.mode_key=? OR (?='teams' AND g.mode='Team')) AND (?='all' OR g.variant=? OR instr('+'||g.variant||'+','+'||?||'+')>0)`,
    args: [mode, mode, mode, variant, variant, variant],
  };
}
export function modes(db) {
  const list = new Map([
    ...baseModes,
    ...Array.from({ length: 19 }, (_, i) => [
      "teams-" + (i + 2),
      i + 2 + " teams",
    ]),
  ]);
  for (const g of db
    .prepare(
      "SELECT DISTINCT mode_key FROM games WHERE type='Public' AND mode_key!='legacy'",
    )
    .all())
    if (!list.has(g.mode_key))
      list.set(
        g.mode_key,
        g.mode_key.startsWith("teams-")
          ? g.mode_key.slice(6) + " teams"
          : g.mode_key,
      );
  return {
    modes: [...list].map(([id, label]) => ({ id, label })),
    variants: [
      { id: "all", label: "All variants" },
      ...["standard", "compact", "random-spawn", "water-nukes", "doomsday"].map(
        (id) => ({ id, label: id.replaceAll("-", " ") }),
      ),
      ...db
        .prepare(
          "SELECT DISTINCT variant FROM games WHERE type='Public' AND variant NOT IN ('unknown','standard','compact','random-spawn','water-nukes','doomsday') ORDER BY variant",
        )
        .all()
        .map((r) => ({
          id: r.variant,
          label: r.variant.replaceAll("+", " · ").replaceAll("-", " "),
        })),
    ],
  };
}
export function ladder(
  db,
  {
    mode = "all",
    variant = "all",
    cursor = 0,
    query = "",
    player = null,
    tier = "all",
    sort = "elo",
    limit = 100,
  } = {},
) {
  if (!modes(db).modes.some((m) => m.id === mode)) throw Error("Invalid mode");
  if (variant !== "all" && !modes(db).variants.some((m) => m.id === variant))
    throw Error("Invalid variant");
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw Error("Invalid cursor");
  const c = condition(mode, variant);
  const rows = db
    .prepare(
      `WITH totals AS (SELECT p.public_id,p.username,COUNT(*) total,SUM(r.result='victory') wins,SUM(r.result='defeat') losses FROM results r JOIN players p ON p.id=r.player_id JOIN games g ON g.id=r.game_id WHERE ${c.sql} GROUP BY p.id), ranked AS (SELECT *,RANK() OVER(ORDER BY wins DESC) rank FROM totals) SELECT * FROM ranked ORDER BY wins DESC,total DESC,public_id`,
    )
    .all(...c.args);
  const skills = db
    .prepare(
      "SELECT s.*,p.public_id FROM skill_ratings s JOIN players p ON p.id=s.player_id",
    )
    .all();
  for (const r of rows) {
    const rs = skills.filter(
      (x) =>
        x.public_id === r.public_id &&
        (mode === "all" ||
          (mode === "teams" && x.mode !== "ffa" && x.mode !== "1v1") ||
          x.mode === mode),
    );
    r.ratedGames = rs.reduce((n, x) => n + x.games, 0);
    r.elo = rs.length
      ? Math.round(
          rs.reduce((n, x) => n + x.rating * x.games, 0) / r.ratedGames,
        )
      : null;
    r.peakElo = rs.length
      ? Math.round(Math.max(...rs.map((x) => x.peak)))
      : null;
    r.provisional = r.ratedGames < 10;
    r.tier =
      r.elo === null
        ? "Unrated"
        : r.provisional
          ? "Provisional"
          : r.elo >= 2000
            ? "Grandmaster"
            : r.elo >= 1800
              ? "Master"
              : r.elo >= 1600
                ? "Diamond"
                : r.elo >= 1400
                  ? "Platinum"
                  : r.elo >= 1200
                    ? "Gold"
                    : r.elo >= 1000
                      ? "Silver"
                      : "Bronze";
  }
  rows.sort(
    (a, b) =>
      (b.elo ?? -Infinity) - (a.elo ?? -Infinity) ||
      a.public_id.localeCompare(b.public_id),
  );
  let previous = null,
    rank = 0;
  rows.forEach((r, i) => {
    if (r.elo !== null) {
      if (r.elo !== previous) rank = i + 1;
      r.rank = rank;
      previous = r.elo;
    } else r.rank = null;
  });
  const filtered = rows.filter(
    (p) =>
      (!query ||
        (p.username || "").toLowerCase().includes(query.toLowerCase()) ||
        p.public_id.toLowerCase().includes(query.toLowerCase())) &&
      (!player || p.public_id === player) &&
      (tier === "all" || p.tier === tier),
  );
  filtered.sort((a, b) =>
    sort === "winRate"
      ? b.wins / b.total - a.wins / a.total ||
        (a.rank ?? Infinity) - (b.rank ?? Infinity)
      : sort === "total"
        ? b.total - a.total || (a.rank ?? Infinity) - (b.rank ?? Infinity)
        : (a.rank ?? Infinity) - (b.rank ?? Infinity),
  );
  return {
    players: filtered.slice(cursor, cursor + limit),
    averageRating: rows.some((p) => p.elo !== null)
      ? Math.round(
          rows.filter((p) => p.elo !== null).reduce((n, p) => n + p.elo, 0) /
            rows.filter((p) => p.elo !== null).length,
        )
      : null,
    leader: rows.find((p) => p.rank === 1) || null,
    totalPlayers: rows.length,
    matchingPlayers: filtered.length,
    nextCursor: filtered.length > cursor + 100 ? String(cursor + 100) : null,
    metric:
      mode === "all" || mode === "teams"
        ? "Average mode skill rating"
        : "Skill rating",
    mode,
    variant,
    rankingPolicy:
      "1000 starting rating; pairwise Elo, K=32 divided across opponents. FFA uses recorded finishing positions where available, otherwise winners versus losers. Team wins compare winning members with opposing humans. Ten rated games for placement. Equal displayed ratings share a rank. Public completed games with all human identities recorded only; private, solo, cancelled, cheats and humans-vs-nations excluded. Variant filters restrict results but ratings belong to the whole mode.",
  };
}
export function rebuildRatings(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS skill_ratings(player_id TEXT NOT NULL,mode TEXT NOT NULL,rating REAL NOT NULL,games INTEGER NOT NULL,peak REAL NOT NULL,PRIMARY KEY(player_id,mode)); CREATE TABLE IF NOT EXISTS rating_changes(game_id TEXT NOT NULL,player_id TEXT NOT NULL,mode TEXT NOT NULL,before REAL NOT NULL,after REAL NOT NULL,PRIMARY KEY(game_id,player_id)); DELETE FROM skill_ratings; DELETE FROM rating_changes;`,
  );
  const state = new Map();
  const insert = db.prepare("INSERT INTO rating_changes VALUES(?,?,?,?,?)");
  for (const g of db
    .prepare(
      "SELECT * FROM games WHERE type='Public' AND mode_key!='legacy' ORDER BY start,id",
    )
    .all()) {
    if (
      g.variant.includes("custom-cheats") ||
      g.mode_key === "humans-vs-nations"
    )
      continue;
    const rows = db
      .prepare("SELECT * FROM results WHERE game_id=? ORDER BY player_id")
      .all(g.id);
    if (
      rows.length < 2 ||
      rows.some((r) => !["victory", "defeat"].includes(r.result)) ||
      !rows.some((r) => r.result === "victory")
    )
      continue;
    const cfg = g.config ? JSON.parse(g.config) : {};
    if (cfg.recordedHumanCount !== rows.length) continue;
    if (
      (g.mode_key === "1v1" && rows.length !== 2) ||
      (g.mode_key === "2v2" &&
        (rows.length !== 4 ||
          rows.filter((r) => r.result === "victory").length !== 2))
    )
      continue;
    const current = rows.map((r) => {
      const key = r.player_id + "|" + g.mode_key;
      const entry = state.get(key) || {
        player_id: r.player_id,
        mode: g.mode_key,
        rating: 1000,
        games: 0,
        peak: 1000,
      };
      state.set(key, entry);
      return entry;
    });
    const deltas = rows.map(() => 0);
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        let score;
        const a = rows[i],
          b = rows[j],
          sa = JSON.parse(a.stats),
          sb = JSON.parse(b.stats);
        if (a.result !== b.result) score = a.result === "victory" ? 1 : 0;
        else if (
          g.mode_key === "ffa" &&
          Number.isInteger(sa.deathPosition) &&
          Number.isInteger(sb.deathPosition) &&
          sa.deathPosition !== sb.deathPosition
        )
          score = sa.deathPosition < sb.deathPosition ? 1 : 0;
        else continue;
        const expected =
          1 / (1 + 10 ** ((current[j].rating - current[i].rating) / 400));
        const delta = (32 * (score - expected)) / (rows.length - 1);
        deltas[i] += delta;
        deltas[j] -= delta;
      }
    for (let i = 0; i < rows.length; i++) {
      const r = current[i],
        before = r.rating;
      r.rating += deltas[i];
      r.games++;
      r.peak = Math.max(r.peak, r.rating);
      insert.run(g.id, r.player_id, g.mode_key, before, r.rating);
    }
  }
  const save = db.prepare("INSERT INTO skill_ratings VALUES(?,?,?,?,?)");
  for (const r of state.values())
    save.run(r.player_id, r.mode, r.rating, r.games, r.peak);
}
