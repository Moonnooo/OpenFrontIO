import { Execution, Game } from "@openfront/engine/game/Game";
import { execSnapshotType } from "@openfront/engine/snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
} from "@openfront/engine/snapshot/SnapshotContext";
import { z } from "zod";

export class SpawnTimerExecution implements Execution {
  private mg: Game;

  init(mg: Game): void {
    this.mg = mg;
  }

  tick(): void {
    if (this.mg.ticks() > this.mg.config().numSpawnPhaseTurns()) {
      this.mg.endSpawnPhase();
    }
  }

  isActive(): boolean {
    return this.mg.inSpawnPhase();
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  snapshot(): ExecRecord {
    return SpawnTimerExecutionSnapshot.write({
      initialized: this.mg !== undefined,
    });
  }

  restoreSnapshot(s: SpawnTimerState, r: SnapshotReader): void {
    if (s.initialized) this.mg = r.game;
  }
}

const SpawnTimerStateSchema = z.object({ initialized: z.boolean() });
type SpawnTimerState = z.infer<typeof SpawnTimerStateSchema>;

export const SpawnTimerExecutionSnapshot = execSnapshotType({
  name: "SpawnTimer",
  version: 1,
  schema: SpawnTimerStateSchema,
  cls: () => SpawnTimerExecution,
});
