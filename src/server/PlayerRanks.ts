import { z } from "zod";
import { GameMode, GameType } from "../core/game/Game";
import { GameConfig } from "../core/Schemas";
import { ServerEnv } from "./ServerEnv";

const RankSchema = z.object({
  tier: z.string().max(30),
  rank: z.number().int().positive().nullable(),
  elo: z.number().nullable(),
  ratedGames: z.number().int().nonnegative(),
});
export type PlayerRank = z.infer<typeof RankSchema>;
export function rankMode(config: GameConfig): string {
  if (config.rankedType) return config.rankedType;
  if (config.gameMode === GameMode.FFA) return "ffa";
  const team = config.playerTeams;
  return (
    (
      {
        Duos: "duos",
        Trios: "trios",
        Quads: "quads",
        "Humans Vs Nations": "humans-vs-nations",
      } as Record<string, string>
    )[String(team)] ?? (typeof team === "number" ? `teams-${team}` : "teams")
  );
}
export function mayShowRanks(config: GameConfig): boolean {
  return config.gameType !== GameType.Singleplayer && !config.anonymizeNames;
}
const cache = new Map<
  string,
  { expires: number; value: Promise<Record<string, PlayerRank>> }
>();
export async function lookupRanks(
  mode: string,
  publicIds: string[],
): Promise<Record<string, PlayerRank>> {
  const ids = [...new Set(publicIds)].sort().slice(0, 200);
  if (!ids.length) return {};
  const key = `${mode}:${ids.join(",")}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
  const value = (async () => {
    const response = await fetch(`${ServerEnv.jwtIssuer()}/public/ranks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, players: ids }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Rank service unavailable");
    const parsed = z
      .object({ players: z.record(z.string(), RankSchema) })
      .parse(await response.json());
    return parsed.players;
  })();
  cache.set(key, { expires: Date.now() + 60000, value });
  // Failures expire quickly so a temporary backend outage does not mislabel players.
  value.catch(() => cache.delete(key));
  return value;
}
