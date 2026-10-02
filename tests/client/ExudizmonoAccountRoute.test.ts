import { afterEach, expect, it, vi } from "vitest";
import { AccountModal } from "../../src/client/AccountModal";
vi.mock("../../src/client/ApiBase", () => ({
  getApiBase: () => "https://game.exudizmono.com/backend",
}));
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: { shareOrigin: () => "https://game.exudizmono.com" },
}));
vi.mock("../../src/client/Api", () => ({
  getUserMe: vi.fn(async () => ({
    user: { steam: { steamId: "test", personaName: "Player" } },
    player: { publicId: "own_player" },
  })),
  invalidateUserMe: vi.fn(),
  fetchPlayerById: vi.fn(),
}));
vi.mock("../../src/client/CrazyGamesSDK", () => ({
  crazyGamesSDK: {
    getUserProfile: async () => null,
    isOnCrazyGames: () => false,
  },
}));
afterEach(() => vi.unstubAllGlobals());
it("routes a signed-in account to its own fork profile", async () => {
  const modal = new AccountModal();
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ steam: true }) })),
  );
  (modal as unknown as { onOpen: () => void }).onOpen();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(assign).toHaveBeenCalledWith(
    "https://game.exudizmono.com/stats/?player=own_player#profile-section",
  );
});
