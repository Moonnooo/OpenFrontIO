import {
  ClientID,
  GameID,
  StampedIntent,
  Turn,
} from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { simpleHash } from "@openfront/engine-lib/Util";
import { AllianceExtensionExecution } from "@openfront/engine/execution/alliance/AllianceExtensionExecution";
import { AllianceRejectExecution } from "@openfront/engine/execution/alliance/AllianceRejectExecution";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { BreakAllianceExecution } from "@openfront/engine/execution/alliance/BreakAllianceExecution";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { BoatRetreatExecution } from "@openfront/engine/execution/BoatRetreatExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { DeleteRailroadExecution } from "@openfront/engine/execution/DeleteRailroadExecution";
import { DeleteUnitExecution } from "@openfront/engine/execution/DeleteUnitExecution";
import { DepthChargeExecution } from "@openfront/engine/execution/DepthChargeExecution";
import { DonateGoldExecution } from "@openfront/engine/execution/DonateGoldExecution";
import { DonateTroopsExecution } from "@openfront/engine/execution/DonateTroopExecution";
import { EmbargoAllExecution } from "@openfront/engine/execution/EmbargoAllExecution";
import { EmbargoExecution } from "@openfront/engine/execution/EmbargoExecution";
import { EmojiExecution } from "@openfront/engine/execution/EmojiExecution";
import { MarkDisconnectedExecution } from "@openfront/engine/execution/MarkDisconnectedExecution";
import { MoveWarshipExecution } from "@openfront/engine/execution/MoveWarshipExecution";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { NoOpExecution } from "@openfront/engine/execution/NoOpExecution";
import { PauseExecution } from "@openfront/engine/execution/PauseExecution";
import { QuickChatExecution } from "@openfront/engine/execution/QuickChatExecution";
import { RetreatExecution } from "@openfront/engine/execution/RetreatExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { TargetPlayerExecution } from "@openfront/engine/execution/TargetPlayerExecution";
import { TransportShipExecution } from "@openfront/engine/execution/TransportShipExecution";
import { TribeSpawner } from "@openfront/engine/execution/TribeSpawner";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { PlayerSpawner } from "@openfront/engine/execution/utils/PlayerSpawner";
import { Execution, Game } from "@openfront/engine/game/Game";

export class Executor {
  // private random = new PseudoRandom(999)
  private random: PseudoRandom;

  constructor(
    private mg: Game,
    private gameID_: GameID,
    private clientID: ClientID | undefined,
    // Purchased bot tribe names drawn for this game (GameStartInfo.tribes).
    private purchasedTribeNames: string[] = [],
  ) {
    // Add one to avoid id collisions with tribes.
    this.random = new PseudoRandom(simpleHash(gameID_) + 1);
  }

  gameID(): GameID {
    return this.gameID_;
  }

  createExecs(turn: Turn): Execution[] {
    return turn.intents.map((i) => this.createExec(i));
  }

  createExec(intent: StampedIntent): Execution {
    const player = this.mg.playerByClientID(intent.clientID);
    if (!player) {
      console.warn(`player with clientID ${intent.clientID} not found`);
      return new NoOpExecution();
    }

    // create execution
    switch (intent.type) {
      case "attack": {
        return new AttackExecution(
          intent.troops,
          player,
          intent.targetID,
          null,
        );
      }
      case "cancel_attack":
        return new RetreatExecution(player, intent.attackID);
      case "cancel_boat":
        return new BoatRetreatExecution(player, intent.unitID);
      case "move_warship":
        return new MoveWarshipExecution(player, intent.unitIds, intent.tile);
      case "spawn":
        // fromIntent: this one came off the wire, so it is subject to the
        // spawn-phase gate that internal spawns are not.
        return new SpawnExecution(
          this.gameID_,
          player.info(),
          intent.tile,
          true,
        );
      case "boat":
        return new TransportShipExecution(player, intent.dst, intent.troops);
      case "allianceRequest":
        return new AllianceRequestExecution(player, intent.recipient);
      case "allianceReject":
        return new AllianceRejectExecution(intent.requestor, player);
      case "breakAlliance":
        return new BreakAllianceExecution(player, intent.recipient);
      case "targetPlayer":
        return new TargetPlayerExecution(player, intent.target);
      case "emoji":
        return new EmojiExecution(player, intent.recipient, intent.emoji);
      case "donate_troops":
        return new DonateTroopsExecution(
          player,
          intent.recipient,
          intent.troops,
        );
      case "donate_gold":
        return new DonateGoldExecution(player, intent.recipient, intent.gold);
      case "embargo":
        return new EmbargoExecution(player, intent.targetID, intent.action);
      case "embargo_all":
        return new EmbargoAllExecution(player, intent.action);
      case "depth_charge":
        return new DepthChargeExecution(player, intent.shipId, intent.tile);
      case "build_unit":
        return new ConstructionExecution(
          player,
          intent.unit,
          intent.tile,
          intent.rocketDirectionUp,
          intent.amount,
          intent.navalVariant,
        );
      case "allianceExtension": {
        return new AllianceExtensionExecution(player, intent.recipient);
      }

      case "upgrade_structure":
        return new UpgradeStructureExecution(
          player,
          intent.unitId,
          intent.amount,
        );
      case "delete_railroad":
        return new DeleteRailroadExecution(
          player,
          intent.railroadId,
          intent.tile,
        );
      case "delete_unit":
        return new DeleteUnitExecution(player, intent.unitId);
      case "quick_chat":
        return new QuickChatExecution(
          player,
          intent.recipient,
          intent.quickChatKey,
          intent.target,
        );
      case "mark_disconnected":
        return new MarkDisconnectedExecution(player, intent.isDisconnected);
      case "toggle_pause":
        return new PauseExecution(player, intent.paused);
      default:
        throw new Error(`intent type ${intent} not found`);
    }
  }

  spawnTribes(numTribes: number): SpawnExecution[] {
    const nationCells = this.mg
      .nations()
      .map((n) => n.spawnCell)
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    return new TribeSpawner(this.mg, this.gameID_, nationCells).spawnTribes(
      numTribes,
      this.purchasedTribeNames,
    );
  }

  spawnPlayers(): SpawnExecution[] {
    return new PlayerSpawner(this.mg, this.gameID_).spawnPlayers();
  }

  nationExecutions(): Execution[] {
    const execs: Execution[] = [];
    for (const nation of this.mg.nations()) {
      execs.push(new NationExecution(this.gameID_, nation));
    }
    return execs;
  }
}
