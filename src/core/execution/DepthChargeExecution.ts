import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { launchDepthCharge, navalUnitsEnabled } from "../game/NavalCombat";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef } from "../snapshot/SnapshotType";
export class DepthChargeExecution implements Execution {
  constructor(
    private player: Player,
    private shipId: number,
    private tile: TileRef,
  ) {}
  init(game: Game): void {
    if (navalUnitsEnabled(game.config().gameConfig()))
      launchDepthCharge(game, this.player, this.shipId, this.tile);
  }
  tick(): void {}
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return DepthChargeExecutionSnapshot.write({
      player: w.player(this.player),
      shipId: this.shipId,
      tile: this.tile,
    });
  }
  restoreSnapshot(s: z.infer<typeof state>, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.shipId = s.shipId;
    this.tile = s.tile;
  }
}
const state = z.object({ player: zPlayerRef(), shipId: zInt(), tile: zInt() });
export const DepthChargeExecutionSnapshot = execSnapshotType({
  name: "DepthCharge",
  version: 1,
  schema: state,
  cls: () => DepthChargeExecution,
});
