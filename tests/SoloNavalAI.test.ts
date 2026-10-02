import { describe, expect, it } from "vitest";
import { NationEmojiBehavior } from "../src/core/execution/nation/NationEmojiBehavior";
import { NationWarshipBehavior } from "../src/core/execution/nation/NationWarshipBehavior";
import { tickNavalAI } from "../src/core/execution/utils/AiNavalBehavior";
import {
  Game,
  GameMapSize,
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { createGame } from "../src/core/game/GameImpl";
import { GameMapImpl } from "../src/core/game/GameMap";
import {
  ErrorUpdate,
  GameUpdateType,
  GameUpdateViewData,
} from "../src/core/game/GameUpdates";
import { navalUnitsEnabled } from "../src/core/game/NavalCombat";
import {
  createGameRunner,
  createGameRunnerFromSnapshot,
} from "../src/core/GameRunner";
import { AuthoritativeView } from "../src/core/net/AuthoritativeView";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { scriptedGameStart, TestDataMapLoader } from "./util/ScriptedGame";
import { setup } from "./util/Setup";
function coast() {
  const bytes = new Uint8Array(10000).fill(32);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 8; x++) bytes[y * 100 + x] = 128 | (x === 7 ? 64 : 0);
  return new GameMapImpl(100, 100, bytes, 800);
}
async function fixture(type: PlayerType, enabled = true) {
  const template = await setup("half_land_half_ocean", {
    gameType: GameType.Singleplayer,
    navalUnits: enabled,
    instantBuild: true,
  });
  const game: Game = createGame(
    [
      new PlayerInfo("AI", type, null, "ai"),
      new PlayerInfo("Human", PlayerType.Human, "human-client", "human"),
    ],
    [],
    coast(),
    coast(),
    template.config(),
  );
  game.endSpawnPhase();
  const ai = game.player("ai"),
    human = game.player("human");
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 8; x++) ai.conquer(game.ref(x, y));
  human.conquer(game.ref(7, 90));
  ai.addGold(10000000n);
  return { game, ai, human };
}
describe("solo naval AI", () => {
  it("nation counter-fleet targeting cannot locate hidden submarines", async () => {
    const { game, ai, human } = await fixture(PlayerType.Nation);
    const tile = game.ref(25, 40);
    for (let i = 0; i < 11; i++)
      human.buildUnit(UnitType.Warship, tile, {
        navalVariant: "submarine",
        patrolTile: tile,
      });
    const behavior = new NationWarshipBehavior(
      new PseudoRandom(1),
      game,
      ai,
      {} as NationEmojiBehavior,
    );
    const target = behavior as unknown as {
      findFreeForAllWarshipTarget(): unknown;
    };
    expect(target.findFreeForAllWarshipTarget()).toBeNull();
    ai.buildUnit(UnitType.Warship, game.ref(20, 40), {
      navalVariant: "sonar",
      patrolTile: tile,
    });
    expect(target.findFreeForAllWarshipTarget()).not.toBeNull();
  });

  it.each([PlayerType.Bot, PlayerType.Nation])(
    "%s builds a coastal port and a balanced navy within its fleet budget",
    async (type) => {
      const { game, ai } = await fixture(type);
      for (let i = 0; i < 1100; i++) {
        tickNavalAI(game, ai, game.ticks());
        game.executeNextTick();
      }
      expect(ai.units(UnitType.Port)).toHaveLength(1);
      const ships = ai.units(UnitType.Warship);
      expect(ships).toHaveLength(type === PlayerType.Bot ? 3 : 6);
      expect(
        new Set(ships.map((ship) => ship.warshipState().navalVariant)),
      ).toEqual(new Set(["warship", "sonar", "submarine"]));
      expect(ai.gold()).toBeLessThan(10000000n);
    },
  );
  it.each([PlayerType.Bot, PlayerType.Nation])(
    "%s attacks detected submarines but cannot track hidden movement or damage allies",
    async (type) => {
      const { game, ai, human } = await fixture(type);
      const sonar = ai.buildUnit(UnitType.Warship, game.ref(25, 50), {
        patrolTile: game.ref(25, 50),
        navalVariant: "sonar",
      });
      const sub = human.buildUnit(UnitType.Warship, game.ref(30, 50), {
        patrolTile: game.ref(30, 50),
        navalVariant: "submarine",
      });
      const friendly = ai.buildUnit(UnitType.Warship, game.ref(30, 50), {
        patrolTile: game.ref(30, 50),
        navalVariant: "submarine",
      });
      tickNavalAI(game, ai, ai.smallID() % 10);
      expect(sub.health()).toBe(200);
      expect(friendly.health()).toBe(650);
      sub.move(game.ref(80, 50));
      for (let i = 0; i < 50; i++) game.executeNextTick();
      tickNavalAI(game, ai, ai.smallID() % 10);
      expect(sub.health()).toBe(200);
      expect(sonar.warshipState().lastDepthChargeTick).toBe(0);
    },
  );
  it("does not add fleets to existing non-naval games or allow replicated multiplayer naval variants", async () => {
    const { game, ai } = await fixture(PlayerType.Bot, false);
    for (let i = 0; i < 200; i++) {
      tickNavalAI(game, ai, game.ticks());
      game.executeNextTick();
    }
    expect(ai.units()).toHaveLength(0);
    expect(
      navalUnitsEnabled({ gameType: GameType.Private, navalUnits: true }),
    ).toBe(false);
    expect(
      navalUnitsEnabled({
        gameType: GameType.Private,
        authoritativeNaval: true,
      }),
    ).toBe(true);
  });
  it("solo human view hides enemy submarines until sonar detects them", async () => {
    const { game, ai, human } = await fixture(PlayerType.Nation);
    const sub = ai.buildUnit(UnitType.Warship, game.ref(60, 50), {
      patrolTile: game.ref(30, 50),
      navalVariant: "submarine",
    });
    const updates = Object.fromEntries(
      Object.values(GameUpdateType)
        .filter((k) => typeof k === "number")
        .map((k) => [k, []]),
    ) as unknown as GameUpdateViewData["updates"];
    const frame = { tick: 100, updates, packedTileUpdates: new Uint32Array() };
    const view = new AuthoritativeView();
    expect(
      view
        .project(game, human, frame)
        .updates[GameUpdateType.Unit].some((u) => u.id === sub.id()),
    ).toBe(false);
    human.buildUnit(UnitType.Warship, game.ref(20, 50), {
      patrolTile: game.ref(25, 50),
      navalVariant: "sonar",
    });
    expect(
      view
        .project(game, human, frame)
        .updates[GameUpdateType.Unit].some((u) => u.id === sub.id()),
    ).toBe(true);
  });
});

describe("solo worker integration", () => {
  it("filters real runner frames and preserves the local naval mode across save/restore", async () => {
    const info = scriptedGameStart({
      gameType: GameType.Singleplayer,
      gameMapSize: GameMapSize.Normal,
      navalUnits: true,
      nations: "disabled",
      bots: 0,
      doomsdayClock: { enabled: false, speed: "slow" },
    });
    let latest: GameUpdateViewData | undefined;
    const callback = (frame: GameUpdateViewData | ErrorUpdate) => {
      if ("updates" in frame) latest = frame;
    };
    const runner = await createGameRunner(
      info,
      "HUMAN001",
      new TestDataMapLoader("world"),
      callback,
    );
    const game = runner.game;
    game.endSpawnPhase();
    const a = game.playerByClientID("HUMAN001")!,
      b = game.playerByClientID("HUMAN002")!;
    const land = Array.from(
      { length: game.width() * game.height() },
      (_, i) => i,
    ).filter((t) => game.isLand(t));
    const water = Array.from(
      { length: game.width() * game.height() },
      (_, i) => i,
    ).find((t) => game.isWater(t))!;
    a.conquer(land[0]);
    b.conquer(land[1]);
    const sub = b.buildUnit(UnitType.Warship, water, {
      patrolTile: water,
      navalVariant: "submarine",
    });
    runner.addTurn({ turnNumber: 0, intents: [] });
    runner.executeNextTick();
    expect(
      latest!.updates[GameUpdateType.Unit].some((u) => u.id === sub.id()),
    ).toBe(false);
    const restored = await createGameRunnerFromSnapshot(
      info,
      runner.snapshot(),
      "HUMAN001",
      new TestDataMapLoader("world"),
      callback,
    );
    expect(restored.game.config().gameConfig().navalUnits).toBe(true);
    restored.game
      .playerByClientID("HUMAN001")!
      .buildUnit(UnitType.Warship, water, {
        patrolTile: water,
        navalVariant: "sonar",
      });
    restored.addTurn({ turnNumber: 1, intents: [] });
    restored.executeNextTick();
    expect(
      latest!.updates[GameUpdateType.Unit].some((u) => u.id === sub.id()),
    ).toBe(true);
  });
});
