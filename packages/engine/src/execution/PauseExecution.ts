import { GameType } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { Execution, Game, Player } from "@openfront/engine/game/Game";
import { execSnapshotType } from "@openfront/engine/snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "@openfront/engine/snapshot/SnapshotContext";
import { z } from "zod";

export class PauseExecution implements Execution {
  constructor(
    private player: Player,
    private paused: boolean,
  ) {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(game: Game, ticks: number): void {
    if (
      this.player.isLobbyCreator() ||
      game.config().gameConfig().gameType === GameType.Singleplayer
    ) {
      game.setPaused(this.paused);
    }
  }

  tick(ticks: number): void {}

  snapshot(w: SnapshotWriter): ExecRecord {
    return PauseExecutionSnapshot.write({
      player: w.player(this.player),
      paused: this.paused,
    });
  }

  restoreSnapshot(s: PauseState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.paused = s.paused;
  }
}

const PauseStateSchema = z.object({
  player: zPlayerRef(),
  paused: z.boolean(),
});
type PauseState = z.infer<typeof PauseStateSchema>;

export const PauseExecutionSnapshot = execSnapshotType({
  name: "Pause",
  version: 1,
  schema: PauseStateSchema,
  cls: () => PauseExecution,
});
