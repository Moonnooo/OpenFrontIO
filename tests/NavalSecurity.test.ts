import { beforeEach, describe, expect, it } from "vitest";
import { WarshipExecution } from "../src/core/execution/WarshipExecution";
import {
  Game,
  GameType,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
} from "../src/core/game/Game";
import { createGame } from "../src/core/game/GameImpl";
import { GameMapImpl } from "../src/core/game/GameMap";
import {
  GameUpdateType,
  GameUpdateViewData,
} from "../src/core/game/GameUpdates";
import {
  canSeeNavalUnit,
  depthChargeDamage,
  launchDepthCharge,
} from "../src/core/game/NavalCombat";
import { decodeView, encodeView } from "../src/core/net/AuthoritativeCodec";
import { restoreGame, snapshotGame } from "../src/core/snapshot/GameSnapshot";
import { AuthoritativeSession } from "../src/server/AuthoritativeSession";
import { AuthoritativeView } from "../src/server/AuthoritativeView";
import { setup } from "./util/Setup";
function waterMap(width = 100) {
  const bytes = new Uint8Array(width * width).fill(32);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < 8; x++) bytes[y * width + x] = 128 | (x === 7 ? 64 : 0);
  return new GameMapImpl(width, width, bytes, width * 8);
}
let game: Game, a: Player, b: Player, sub: Unit;
function frame(tick = 100): GameUpdateViewData {
  const updates = Object.fromEntries(
    Object.values(GameUpdateType)
      .filter((k) => typeof k === "number")
      .map((k) => [k, []]),
  ) as unknown as GameUpdateViewData["updates"];
  return {
    tick,
    updates,
    packedTileUpdates: new Uint32Array(),
    packedMotionPlans: new Uint32Array([sub.id(), sub.tile()]),
  };
}
beforeEach(async () => {
  const template = await setup("half_land_half_ocean", {
    infiniteGold: true,
    instantBuild: true,
    authoritativeNaval: true,
    gameType: GameType.Private,
  });
  game = createGame(
    [
      new PlayerInfo("A", PlayerType.Human, "client_a", "a"),
      new PlayerInfo("B", PlayerType.Human, "client_b", "b"),
    ],
    [],
    waterMap(),
    waterMap(),
    template.config(),
  );
  game.endSpawnPhase();
  a = game.player("a");
  b = game.player("b");
  a.conquer(game.ref(7, 10));
  b.conquer(game.ref(7, 80));
  sub = b.buildUnit(UnitType.Warship, game.ref(20, 50), {
    patrolTile: game.ref(20, 50),
    navalVariant: "submarine",
  });
});
describe("server-authoritative submarine secrecy", () => {
  it("sends player snapshots only on bootstrap and preserves incremental stat channels", () => {
    const projection = new AuthoritativeView();
    const initial = projection.project(game, a, frame());
    expect(initial.updates[GameUpdateType.Player]).toHaveLength(
      game.players().length,
    );
    const next = frame(101);
    next.packedPlayerUpdates = new Float64Array([a.smallID(), 1, 100, 50, 100]);
    next.packedAttackUpdates = new Float64Array();
    const delta = projection.project(game, a, next);
    expect(delta.updates[GameUpdateType.Player]).toEqual([]);
    expect(delta.packedPlayerUpdates).toEqual(next.packedPlayerUpdates);
    expect(delta.packedAttackUpdates).toEqual(next.packedAttackUpdates);
    expect(
      projection.project(game, a, next, true).updates[GameUpdateType.Player],
    ).toHaveLength(game.players().length);
    projection.reset();
    expect(
      projection.project(game, a, next).updates[GameUpdateType.Player],
    ).toHaveLength(game.players().length);
  });

  it("introduces late players with complete snapshots before forwarding deltas", () => {
    const projection = new AuthoritativeView();
    projection.project(game, a, frame());
    const late = game.addPlayer(
      new PlayerInfo("late", PlayerType.Bot, null, "late"),
    );
    const next = frame(101);
    next.updates[GameUpdateType.Player] = [
      { type: GameUpdateType.Player, id: late.id(), isAlive: true },
    ];
    const projected = projection.project(game, a, next);
    const introduced = projected.updates[GameUpdateType.Player].find(
      (p) => p.id === late.id(),
    );
    expect(introduced?.allies).toEqual([]);
    expect(introduced?.targets).toEqual([]);
    expect(introduced?.outgoingAllianceRequests).toEqual([]);
    expect(introduced?.smallID).toBe(late.smallID());
    expect(next.updates[GameUpdateType.Player][0].allies).toBeUndefined();
    const later = frame(102);
    later.updates[GameUpdateType.Player] = [
      { type: GameUpdateType.Player, id: late.id(), isAlive: false },
    ];
    expect(
      projection.project(game, a, later).updates[GameUpdateType.Player],
    ).toEqual(later.updates[GameUpdateType.Player]);
  });

  it("rejects numeric typed-array allocation attacks and malformed wire tags", () => {
    expect(() =>
      decodeView('{"$wire":"Uint32Array","value":4294967295}'),
    ).toThrow("Invalid wire array");
    expect(() => decodeView('{"$wire":"bigint","value":123}')).toThrow(
      "Invalid bigint",
    );
    expect(() =>
      decodeView('{"$wire":"Uint32Array","value":["hidden"]}'),
    ).toThrow("Invalid numeric array");
    expect(() => decodeView('{"$wire":"Object","value":[]}')).toThrow(
      "Unsupported",
    );
  });
  it("keeps submarines visible to their owner and invisible to enemies and spectators without sonar", () => {
    expect(canSeeNavalUnit(game, b, sub)).toBe(true);
    expect(canSeeNavalUnit(game, a, sub)).toBe(false);
    expect(canSeeNavalUnit(game, undefined, sub)).toBe(false);
  });
  it("hidden movement cannot change the enemy wire payload, including bootstrap and motion plans", () => {
    const p1 = new AuthoritativeView(),
      p2 = new AuthoritativeView();
    const before = encodeView(p1.project(game, a, frame(), true));
    sub.move(game.ref(40, 80));
    const after = encodeView(p2.project(game, a, frame(), true));
    expect(after).toBe(before);
    const decoded = decodeView(after) as GameUpdateViewData;
    expect(decoded.packedMotionPlans).toBeUndefined();
    expect(decoded.updates[GameUpdateType.Unit]).toEqual([]);
    expect(decoded.updates[GameUpdateType.Hash]).toEqual([]);
  });
  it("reveals only within sonar range and withdraws using the previous known location", () => {
    const sonar = a.buildUnit(UnitType.Warship, game.ref(20, 20), {
      patrolTile: game.ref(20, 20),
      navalVariant: "sonar",
    });
    expect(canSeeNavalUnit(game, a, sub)).toBe(true);
    const projection = new AuthoritativeView();
    const detected = projection.project(game, a, frame());
    expect(
      detected.updates[GameUpdateType.Unit].some((u) => u.id === sub.id()),
    ).toBe(true);
    const known = sub.tile();
    sub.move(game.ref(40, 90));
    expect(canSeeNavalUnit(game, a, sub)).toBe(false);
    const hidden = projection.project(game, a, frame(101));
    const removal = hidden.updates[GameUpdateType.Unit].find(
      (u) => u.id === sub.id(),
    );
    expect(removal).toMatchObject({
      pos: known,
      isActive: false,
      concealed: true,
    });
    expect(hidden.navalContacts).toEqual([
      { id: sub.id(), pos: known, expiresAt: 131 },
    ]);
    expect(projection.project(game, a, frame(132)).navalContacts).toEqual([]);
    sonar.delete();
  });
  it("uses the exact sonar boundary and never gives spectators sonar contacts", () => {
    a.buildUnit(UnitType.Warship, game.ref(20, 20), {
      patrolTile: game.ref(20, 20),
      navalVariant: "sonar",
    });
    sub.move(game.ref(20, 65));
    expect(canSeeNavalUnit(game, a, sub)).toBe(true);
    expect(canSeeNavalUnit(game, undefined, sub)).toBe(false);
    sub.move(game.ref(20, 66));
    expect(canSeeNavalUnit(game, a, sub)).toBe(false);
  });
  it("strips an indirect target reference to a hidden submarine", () => {
    const ship = a.buildUnit(UnitType.Warship, game.ref(20, 10), {
      patrolTile: game.ref(20, 10),
    });
    ship.setTargetUnit(sub);
    const result = new AuthoritativeView().project(game, a, frame());
    expect(result.updates[GameUpdateType.Unit][0].targetUnitId).toBeUndefined();
  });
  it("denies forged cross-player queries and private snapshot methods", async () => {
    const session = Object.create(
      AuthoritativeSession.prototype,
    ) as AuthoritativeSession;
    Object.assign(session, { ready: Promise.resolve({ game }) });
    await expect(
      session.query("client_a", "player_actions", [b.id(), 20, 50]),
    ).rejects.toThrow("Other players");
    await expect(
      session.query("client_a", "snapshot", [a.id()]),
    ).rejects.toThrow("Query not allowed");
    await expect(
      session.query("spectator", "player_actions", [a.id()]),
    ).rejects.toThrow("Player required");
  });
});
describe("naval weapons and persistence", () => {
  it("applies depth-charge falloff, rejects remote/enemy launchers, and enforces cooldown", () => {
    const sonar = a.buildUnit(UnitType.Warship, game.ref(20, 40), {
      patrolTile: game.ref(20, 40),
      navalVariant: "sonar",
    });
    expect(launchDepthCharge(game, b, sonar.id(), sub.tile())).toBe(false);
    expect(launchDepthCharge(game, a, sonar.id(), game.ref(90, 90))).toBe(
      false,
    );
    const friendly = a.buildUnit(UnitType.Warship, sub.tile(), {
      patrolTile: sub.tile(),
      navalVariant: "submarine",
    });
    const friendlyHealth = friendly.health();
    const before = sub.health();
    expect(launchDepthCharge(game, a, sonar.id(), sub.tile())).toBe(true);
    expect(sub.health()).toBe(before - 450);
    expect(friendly.health()).toBe(friendlyHealth);
    expect(launchDepthCharge(game, a, sonar.id(), sub.tile())).toBe(false);
    expect(depthChargeDamage(0)).toBe(450);
    expect(depthChargeDamage(6)).toBe(225);
    expect(depthChargeDamage(12)).toBe(0);
  });
  it("submarine torpedoes damage surface ships without emitting revealing surface shells", () => {
    const ship = a.buildUnit(UnitType.Warship, game.ref(20, 49), {
      patrolTile: game.ref(20, 49),
    });
    const execution = new WarshipExecution(sub);
    execution.init(game, game.ticks());
    execution.tick(game.ticks());
    expect(ship.health()).toBe(700);
    expect(game.units(UnitType.Shell)).toHaveLength(0);
    execution.tick(game.ticks());
    expect(ship.health()).toBe(700);
  });
  it("preserves naval variants and weapon cooldowns through save/restore", async () => {
    sub.updateWarshipState({ lastTorpedoTick: 80, lastDepthChargeTick: 75 });
    const restored = restoreGame(snapshotGame(game), {
      config: () => game.config(),
      gameMap: waterMap(),
      miniGameMap: waterMap(),
    });
    expect(restored.unit(sub.id())?.warshipState()).toMatchObject({
      navalVariant: "submarine",
      lastTorpedoTick: 80,
      lastDepthChargeTick: 75,
    });
    expect(sub.maxHealth()).toBe(650);
  });
});
