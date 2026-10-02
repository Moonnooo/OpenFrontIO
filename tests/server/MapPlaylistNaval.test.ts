import { afterEach, describe, expect, it, vi } from "vitest";
import { GameConfigSchema } from "../../src/core/Schemas";
import { MapPlaylist } from "../../src/server/MapPlaylist";
vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTiles: async () => 1_000_000,
}));
afterEach(() => vi.unstubAllEnvs());
describe("public naval matchmaking", () => {
  it.each([
    ["true", "true", true],
    ["true", "false", false],
    ["false", "true", false],
  ])(
    "requires both simulation and public rollout flags (%s, %s)",
    async (simulation, publicRollout, enabled) => {
      vi.stubEnv("ENABLE_AUTHORITATIVE_NAVAL", simulation);
      vi.stubEnv("ENABLE_PUBLIC_AUTHORITATIVE_NAVAL", publicRollout);
      const playlist = new MapPlaylist();
      const configs = [
        await playlist.gameConfig("ffa"),
        await playlist.gameConfig("team"),
        await playlist.gameConfig("special"),
        playlist.get1v1Config(),
        playlist.get2v2Config(),
      ];
      for (const config of configs) {
        expect(GameConfigSchema.safeParse(config).success).toBe(true);
        expect(config.authoritativeNaval === true).toBe(enabled);
        if (enabled) {
          expect(config.maxPlayers).toBeLessThanOrEqual(24);
          if (typeof config.playerTeams === "number")
            expect(config.maxPlayers! % config.playerTeams).toBe(0);
        }
      }
    },
  );
});
