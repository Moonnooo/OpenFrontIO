import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import { decodeView, encodeView } from "../../src/core/net/AuthoritativeCodec";
import { createGameWireContext } from "../../src/core/ZbinWire";
import {
  makeClient,
  makeGame,
  makeMockWs,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";
const session = vi.hoisted(() => ({
  turn: vi.fn(),
  stop: vi.fn(),
  query: vi.fn(async () => ({ allowed: true })),
  view: vi.fn(() => ({
    tick: 1,
    updates: {},
    packedTileUpdates: new Uint32Array(),
  })),
}));
vi.mock("../../src/server/AuthoritativeSession", () => ({
  AuthoritativeSession: class {
    turn = session.turn;
    stop = session.stop;
    query = session.query;
    view = session.view;
  },
}));
describe("authoritative server wire boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("ENABLE_AUTHORITATIVE_NAVAL", "true");
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("never broadcasts raw inputs or reconnect history and binds RPC to the authenticated socket", async () => {
    const host = makeClient({ persistentID: "naval-host" });
    const enemy = makeClient();
    const game = makeGame({
      creatorPersistentID: host.persistentID,
      config: { authoritativeNaval: true },
    });
    expect(game.joinClient(host)).toBe("joined");
    expect(game.joinClient(enemy)).toBe("joined");
    startGame(game);
    const ctx = createGameWireContext([
      { clientID: host.clientID },
      { clientID: enemy.clientID },
    ]);
    await mockWsOf(host).emit({
      type: "intent",
      intent: { type: "spawn", tile: 42 },
    });
    vi.advanceTimersByTime(100);
    expect(session.turn).toHaveBeenCalled();
    expect(
      mockWsOf(enemy)
        .sent(ctx)
        .some((m) => m.type === "turn"),
    ).toBe(false);
    const reconnect = makeMockWs();
    expect(game.rejoinClient(reconnect as any, enemy.persistentID, 0)).toBe(
      true,
    );
    const starts = reconnect.sent(ctx).filter((m) => m.type === "start");
    expect(starts).toHaveLength(1);
    expect(starts[0].turns).toEqual([]);
    expect(
      reconnect.sent(ctx).some((m) => m.type === "authoritative_view"),
    ).toBe(true);
    await reconnect.emit({
      type: "authoritative_query",
      id: "safe-query",
      payload: encodeView({
        method: "player_actions",
        args: ["forged-player", 1, 1],
      }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.query).toHaveBeenCalledWith(
      enemy.clientID,
      "player_actions",
      ["forged-player", 1, 1],
    );
    const result = reconnect
      .sent(ctx)
      .find((m) => m.type === "authoritative_query_result");
    expect(result?.type).toBe("authoritative_query_result");
    if (result?.type === "authoritative_query_result")
      expect(decodeView(result.payload)).toEqual({ result: { allowed: true } });
    await game.end();
  });
  it("fails closed when server-authoritative mode is disabled", () => {
    vi.stubEnv("ENABLE_AUTHORITATIVE_NAVAL", "false");
    const game = makeGame({ config: { authoritativeNaval: true } });
    const host = makeClient();
    game.joinClient(host);
    startGame(game);
    expect(
      mockWsOf(host)
        .sent()
        .some((m) => m.type === "start" || m.type === "turn"),
    ).toBe(false);
  });
  it("cannot enable naval mode in a public match", () => {
    const game = makeGame({
      config: { authoritativeNaval: true, gameType: GameType.Public },
    });
    const host = makeClient();
    game.joinClient(host);
    startGame(game);
    expect(
      mockWsOf(host)
        .sent()
        .some((m) => m.type === "start" || m.type === "turn"),
    ).toBe(false);
  });
});
