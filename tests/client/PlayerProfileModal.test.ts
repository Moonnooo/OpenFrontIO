import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PlayerProfileModal,
  playerProfileUrl,
} from "../../src/client/PlayerProfileModal";
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: { shareOrigin: () => "https://game.exudizmono.com" },
}));
let modal: PlayerProfileModal;
const assign = vi.fn();
beforeEach(() => {
  modal = new PlayerProfileModal();
  assign.mockClear();
  vi.stubGlobal("window", { location: { assign } });
});
afterEach(() => vi.unstubAllGlobals());
it("opens the fork's own player stats page", () => {
  modal.open({ publicID: "player_1" });
  expect(assign).toHaveBeenCalledWith(
    "https://game.exudizmono.com/stats/?player=player_1#profile-section",
  );
});
it("opens the profile section without a player id", () => {
  modal.open();
  expect(assign).toHaveBeenCalledWith("/stats/#profile-section");
});
it("escapes a supplied player id inside the query string", () => {
  expect(playerProfileUrl("name&next=evil")).toBe(
    "https://game.exudizmono.com/stats/?player=name%26next%3Devil#profile-section",
  );
});
it("clan and leaderboard entry points use the same own stats destination", () => {
  modal.openFromLeaderboard("public_player");
  expect(assign).toHaveBeenLastCalledWith(playerProfileUrl("public_player"));
  modal.returnFromClan("other_player", "clan");
  expect(assign).toHaveBeenLastCalledWith(playerProfileUrl("other_player"));
});
