import { DeleteUnitExecution } from "../src/core/execution/DeleteUnitExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
} from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { GameID } from "../src/core/Schemas";
import { setup } from "./util/Setup";
import { roundTrip } from "./util/Snapshot";
import { executeTicks } from "./util/utils";

describe("DeleteUnitExecution Security Tests", () => {
  let game: Game;
  const gameID: GameID = "game_id";
  let player: Player;
  let enemyPlayer: Player;
  let unit: Unit;

  beforeEach(async () => {
    game = await setup("plains", {
      infiniteGold: false,
      instantBuild: true,
      infiniteTroops: true,
    });

    const player1Info = new PlayerInfo(
      "TestPlayer",
      PlayerType.Human,
      null,
      "TestPlayer",
    );
    const player2Info = new PlayerInfo(
      "EnemyPlayer",
      PlayerType.Human,
      null,
      "EnemyPlayer",
    );

    game.addPlayer(player1Info);
    game.addPlayer(player2Info);

    const playerSpawn: TileRef = game.ref(0, 10);
    const enemySpawn: TileRef = game.ref(0, 15);

    game.addExecution(
      new SpawnExecution(
        gameID,
        game.player(player1Info.id).info(),
        playerSpawn,
      ),
      new SpawnExecution(
        gameID,
        game.player(player2Info.id).info(),
        enemySpawn,
      ),
    );

    executeTicks(game, game.config().deleteUnitCooldown() + 1);

    player = game.player(player1Info.id);
    enemyPlayer = game.player(player2Info.id);

    const playerTiles = Array.from(player.tiles());
    if (playerTiles.length === 0) {
      throw new Error("Player has no tiles");
    }
    const spawnTile = playerTiles[0];
    player.addGold(100000000n);
    unit = player.buildUnit(UnitType.City, spawnTile, {});

    const tileOwner = game.owner(unit.tile());
    if (!tileOwner.isPlayer() || tileOwner.id() !== player.id()) {
      throw new Error("Unit is not on player's territory");
    }

    game.config().deleteUnitCooldown = () => 10;
    game.config().deletionMarkDuration = () => 10;
  });

  describe("Demolition refunds", () => {
    it("preserves paid investment through save and restore", async () => {
      const { restored } = await roundTrip(game, "plains");
      expect(restored.unit(unit.id())?.demolitionRefund()).toBe(
        unit.demolitionRefund(),
      );
      expect(unit.demolitionRefund()).toBeGreaterThan(0n);
    });

    it("refunds actual build and upgrade payments only when demolition completes", () => {
      const investment = unit.demolitionRefund();
      expect(investment).toBeGreaterThan(0n);
      const beforeUpgrade = player.gold();
      player.upgradeUnit(unit);
      const upgradePaid = beforeUpgrade - player.gold();
      expect(unit.demolitionRefund()).toBe(
        investment + (upgradePaid + 1n) / 2n,
      );
      const before = player.gold();
      const execution = new DeleteUnitExecution(player, unit.id());
      execution.init(game, game.ticks());
      execution.tick(game.ticks());
      expect(player.gold()).toBe(before);
      vi.spyOn(game, "ticks").mockReturnValue(game.ticks() + 11);
      execution.tick(game.ticks());
      expect(unit.isActive()).toBe(false);
      expect(player.gold()).toBe(before + investment + (upgradePaid + 1n) / 2n);
      execution.tick(game.ticks());
      expect(player.gold()).toBe(before + investment + (upgradePaid + 1n) / 2n);
    });

    it("rounds odd payments up and ignores later price changes", () => {
      const fresh = player.buildUnit(UnitType.City, unit.tile(), {});
      fresh.setOwner(enemyPlayer);
      fresh.setOwner(player);
      fresh.recordGoldInvestment(101n);
      expect(fresh.demolitionRefund()).toBe(51n);
      expect(unit.demolitionRefund()).toBeGreaterThan(0n);
    });

    it("does not refund destruction or a cancelled demolition after capture", () => {
      const before = player.gold();
      const execution = new DeleteUnitExecution(player, unit.id());
      execution.init(game, game.ticks());
      unit.setOwner(enemyPlayer);
      expect(unit.demolitionRefund()).toBe(0n);
      vi.spyOn(game, "ticks").mockReturnValue(game.ticks() + 11);
      execution.tick(game.ticks());
      expect(execution.isActive()).toBe(false);
      expect(unit.isActive()).toBe(true);
      unit.delete(true, player);
      expect(player.gold()).toBe(before);
    });
  });

  describe("Security Validations", () => {
    it("should prevent deleting units not owned by player", () => {
      const enemyUnit = enemyPlayer.buildUnit(
        UnitType.City,
        Array.from(enemyPlayer.tiles())[0],
        {},
      );
      const execution = new DeleteUnitExecution(player, enemyUnit.id());
      execution.init(game, 0);

      expect(execution.isActive()).toBe(false);
      expect(enemyUnit.isMarkedForDeletion()).toBe(false);
    });

    it("should prevent deleting units on enemy territory", () => {
      const enemyTiles = Array.from(enemyPlayer.tiles());
      if (enemyTiles.length > 0) {
        unit.move(enemyTiles[0]);

        const execution = new DeleteUnitExecution(player, unit.id());
        execution.init(game, 0);

        expect(execution.isActive()).toBe(false);
        expect(unit.isMarkedForDeletion()).toBe(false);
      }
    });

    it("should prevent deleting units during spawn phase", () => {
      vi.spyOn(game, "inSpawnPhase").mockReturnValue(true);

      const execution = new DeleteUnitExecution(player, unit.id());
      execution.init(game, 0);

      expect(execution.isActive()).toBe(false);
      expect(unit.isMarkedForDeletion()).toBe(false);
    });

    it("should allow deleting units when all conditions are met", () => {
      vi.spyOn(game, "inSpawnPhase").mockReturnValue(false);

      const execution = new DeleteUnitExecution(player, unit.id());
      execution.init(game, 0);

      expect(unit.isMarkedForDeletion()).toBe(true);
    });

    it("should delete after deletion delay", () => {
      vi.spyOn(game, "inSpawnPhase").mockReturnValue(false);

      const execution = new DeleteUnitExecution(player, unit.id());
      game.addExecution(execution);

      game.executeNextTick();
      expect(unit.isMarkedForDeletion()).toBe(true);
      expect(unit.isOverdueDeletion()).toBe(false);
      executeTicks(game, game.config().deletionMarkDuration() + 1);
      expect(unit.isActive()).toBe(false);
    });

    it("should reset deletion if captured", () => {
      vi.spyOn(game, "inSpawnPhase").mockReturnValue(false);

      const execution = new DeleteUnitExecution(player, unit.id());
      game.addExecution(execution);
      game.executeNextTick();
      expect(unit.isMarkedForDeletion()).toBe(true);
      unit.setOwner(enemyPlayer);
      expect(unit.isMarkedForDeletion()).toBe(false);
      expect(unit.isActive()).toBe(true);
    });
  });
});
