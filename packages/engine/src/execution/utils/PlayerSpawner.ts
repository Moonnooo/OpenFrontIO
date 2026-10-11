import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { GameID } from "@openfront/engine-api/Schemas";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";

export class PlayerSpawner {
  private players: SpawnExecution[] = [];

  constructor(
    private gm: Game,
    private gameID: GameID,
  ) {}

  spawnPlayers(): SpawnExecution[] {
    for (const player of this.gm.allPlayers()) {
      if (player.type() !== PlayerType.Human) {
        continue;
      }

      this.players.push(new SpawnExecution(this.gameID, player.info()));
    }

    return this.players;
  }
}
