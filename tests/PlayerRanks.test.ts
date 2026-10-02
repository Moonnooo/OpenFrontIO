import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, GameType, RankedType } from "../src/core/game/Game";
import type { GameConfig } from "../src/core/Schemas";
import { lookupRanks, mayShowRanks, rankMode } from "../src/server/PlayerRanks";
vi.mock("../src/server/ServerEnv", () => ({
  ServerEnv: { jwtIssuer: () => "https://stats.example.test" },
}));
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());
describe("multiplayer skill ranks", () => {
  it("matches the stats ladder mode and hides solo and anonymous identities", () => {
    const cfg = {
      gameType: GameType.Public,
      gameMode: GameMode.FFA,
    } as GameConfig;
    expect(rankMode(cfg)).toBe("ffa");
    expect(
      rankMode({ ...cfg, gameMode: GameMode.Team, playerTeams: "Duos" }),
    ).toBe("duos");
    expect(rankMode({ ...cfg, gameMode: GameMode.Team, playerTeams: 4 })).toBe(
      "teams-4",
    );
    expect(rankMode({ ...cfg, rankedType: RankedType.OneVOne })).toBe("1v1");
    expect(mayShowRanks(cfg)).toBe(true);
    expect(mayShowRanks({ ...cfg, anonymizeNames: true })).toBe(false);
    expect(mayShowRanks({ ...cfg, gameType: GameType.Singleplayer })).toBe(
      false,
    );
  });
  it("batches trusted IDs, validates ranks and reuses concurrent lookups", async () => {
    const value = {
      players: {
        rank_test: { tier: "Gold", rank: 17, elo: 1250, ratedGames: 23 },
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(value)));
    const result = await Promise.all([
      lookupRanks("ffa", ["rank_test"]),
      lookupRanks("ffa", ["rank_test", "rank_test"]),
    ]);
    expect(result[0].rank_test.rank).toBe(17);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual(
      { mode: "ffa", players: ["rank_test"] },
    );
  });
  it("does not invent ranks when the backend fails and permits retry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ players: {} })));
    await expect(lookupRanks("ffa", ["retry_test"])).rejects.toThrow(
      "unavailable",
    );
    await expect(lookupRanks("ffa", ["retry_test"])).resolves.toEqual({});
  });
});
