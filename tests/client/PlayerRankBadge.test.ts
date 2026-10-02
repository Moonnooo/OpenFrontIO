import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerRankBadge } from "../../src/client/components/PlayerRankBadge";
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: {
    gameHttpBase: () => "https://game.example.test",
    gameWorkerPath: () => "w0",
  },
}));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
describe("player skill badge", () => {
  it("shows mode-specific tier and position and shares one roster request", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: "ffa",
          players: {
            alice: { tier: "Gold", rank: 12, elo: 1250, ratedGames: 20 },
            bob: { tier: "Provisional", rank: 99, elo: 1000, ratedGames: 2 },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const a = new PlayerRankBadge();
    a.gameID = "badge_ranked";
    a.clientID = "alice";
    const b = new PlayerRankBadge();
    b.gameID = "badge_ranked";
    b.clientID = "bob";
    document.body.append(a, b);
    await vi.waitFor(() => expect(a.textContent).toContain("Gold #12"));
    await vi.waitFor(() => expect(b.textContent).toContain("Provisional"));
    expect(b.textContent).not.toContain("#99");
    expect(a.querySelector("span")?.title).toContain("ffa skill ladder");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refreshes a cached roster for a newly joined player", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mode: "ffa",
            players: {
              alice: { tier: "Unrated", rank: null, elo: null, ratedGames: 0 },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mode: "ffa",
            players: {
              bob: { tier: "Unrated", rank: null, elo: null, ratedGames: 0 },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const a = new PlayerRankBadge();
    a.gameID = "badge_join";
    a.clientID = "alice";
    document.body.append(a);
    await vi.waitFor(() => expect(a.textContent).toContain("Unrated"));
    const b = new PlayerRankBadge();
    b.gameID = "badge_join";
    b.clientID = "bob";
    document.body.append(b);
    await vi.waitFor(() => expect(b.textContent).toContain("Unrated"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shows unavailable rather than a fabricated rank on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    const badge = new PlayerRankBadge();
    badge.gameID = "badge_fail";
    badge.clientID = "alice";
    document.body.append(badge);
    await vi.waitFor(() =>
      expect(badge.textContent).toContain("Rank unavailable"),
    );
  });
});
