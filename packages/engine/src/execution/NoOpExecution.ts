import { Execution, Game } from "@openfront/engine/game/Game";
import { execSnapshotType } from "@openfront/engine/snapshot/ExecutionSnapshot";
import type { ExecRecord } from "@openfront/engine/snapshot/SnapshotContext";
import { z } from "zod";

export class NoOpExecution implements Execution {
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  init(mg: Game, ticks: number): void {}
  tick(ticks: number): void {}

  snapshot(): ExecRecord {
    return NoOpExecutionSnapshot.write({});
  }

  restoreSnapshot(): void {}
}

export const NoOpExecutionSnapshot = execSnapshotType({
  name: "NoOp",
  version: 1,
  schema: z.object({}),
  cls: () => NoOpExecution,
});
