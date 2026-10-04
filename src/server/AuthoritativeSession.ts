import fs from "node:fs/promises";
import path from "node:path";
import { GameMapType } from "../core/game/Game";
import { GameMapLoader, MapData } from "../core/game/GameMapLoader";
import { GameUpdateType, GameUpdateViewData } from "../core/game/GameUpdates";
import { createGameRunner, GameRunner } from "../core/GameRunner";
import { ClientID, GameStartInfo, Turn } from "../core/Schemas";
import { AuthoritativeView } from "./AuthoritativeView";
class ServerMaps implements GameMapLoader {
  getMapData(map: GameMapType): MapData {
    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (!key) throw new Error("Unknown map");
    const root = path.join(process.cwd(), "resources/maps", key.toLowerCase());
    const binary = async (name: string) =>
      new Uint8Array(await fs.readFile(path.join(root, name)));
    return {
      mapBin: () => binary("map.bin"),
      map4xBin: () => binary("map4x.bin"),
      map16xBin: () => binary("map16x.bin"),
      manifest: async () =>
        JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")),
      webpPath: "",
      layerPng: () => Promise.reject(new Error("Server cannot render images")),
    };
  }
}
/** Server owns the only simulation for this game. No inputs, snapshots or future motion plans leave it. */
export class AuthoritativeSession {
  readonly ready: Promise<GameRunner>;
  runner?: GameRunner;
  latest?: GameUpdateViewData;
  private tiles = new Map<number, number>();
  private names: GameUpdateViewData["playerNameViewData"] = {};
  private projections = new Map<ClientID, AuthoritativeView>();
  private stopped = false;
  private railroads = new Map<
    number,
    GameUpdateViewData["updates"][GameUpdateType.RailroadConstructionEvent][number]
  >();
  private chain: Promise<void> = Promise.resolve();
  private spawnEnd: GameUpdateViewData["updates"][GameUpdateType.SpawnPhaseEnd] =
    [];
  constructor(
    info: GameStartInfo,
    private publish: (frame: GameUpdateViewData) => void,
    private failed: () => void,
  ) {
    this.ready = createGameRunner(
      info,
      undefined,
      new ServerMaps(),
      (frame) => {
        if (this.stopped) return;
        if (!("updates" in frame)) {
          this.failed();
          return;
        }
        for (let i = 0; i < frame.packedTileUpdates.length; i += 2)
          this.tiles.set(
            frame.packedTileUpdates[i],
            frame.packedTileUpdates[i + 1],
          );
        if (frame.playerNameViewData) this.names = frame.playerNameViewData;
        if (frame.updates[GameUpdateType.SpawnPhaseEnd].length)
          this.spawnEnd = frame.updates[GameUpdateType.SpawnPhaseEnd];
        for (const rail of frame.updates[
          GameUpdateType.RailroadConstructionEvent
        ])
          this.railroads.set(rail.id, rail);
        for (const rail of frame.updates[
          GameUpdateType.RailroadDestructionEvent
        ])
          this.railroads.delete(rail.id);
        for (const rail of frame.updates[GameUpdateType.RailroadSnapEvent]) {
          this.railroads.delete(rail.originalId);
          this.railroads.set(rail.newId1, {
            type: GameUpdateType.RailroadConstructionEvent,
            id: rail.newId1,
            tiles: rail.tiles1,
          });
          this.railroads.set(rail.newId2, {
            type: GameUpdateType.RailroadConstructionEvent,
            id: rail.newId2,
            tiles: rail.tiles2,
          });
        }
        this.latest = frame;
        this.publish(frame);
      },
    ).then((runner) => {
      this.runner = runner;
      return runner;
    });
    void this.ready.catch(() => this.failed());
  }
  turn(turn: Turn): void {
    this.chain = this.chain
      .then(async () => {
        const runner = await this.ready;
        if (this.stopped) return;
        runner.addTurn(turn);
        if (!runner.executeNextTick())
          throw new Error("Server simulation failed");
      })
      .catch(() => this.failed());
  }
  stop(): void {
    this.stopped = true;
  }
  view(clientID: ClientID, bootstrap = false): GameUpdateViewData | undefined {
    if (!this.runner || !this.latest) return undefined;
    let projection = this.projections.get(clientID);
    if (!projection) {
      projection = new AuthoritativeView();
      this.projections.set(clientID, projection);
      bootstrap = true;
    }
    const frame = bootstrap
      ? {
          ...this.latest,
          packedTileUpdates: Uint32Array.from([...this.tiles].flat()),
          playerNameViewData: this.names,
        }
      : this.latest;
    const result = projection.project(
      this.runner.game,
      this.runner.game.playerByClientID(clientID) ?? undefined,
      frame,
      bootstrap,
    );
    if (bootstrap) {
      result.updates[GameUpdateType.SpawnPhaseEnd] = this.spawnEnd;
      result.updates[GameUpdateType.RailroadConstructionEvent] = [
        ...this.railroads.values(),
      ];
    }
    return result;
  }
  async query(
    clientID: ClientID,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    const runner = await this.ready;
    if (this.stopped) throw new Error("Game ended");
    const player = runner.game.playerByClientID(clientID);
    if (!player) throw new Error("Player required");
    const coord = (v: unknown, max: number): number | undefined => {
      if (v === undefined || v === null) return undefined;
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= max)
        throw new Error("Invalid coordinate");
      return v as number;
    };
    const positional =
      method === "player_actions" || method === "player_buildables";
    const x = positional ? coord(args[1], runner.game.width()) : undefined,
      y = positional ? coord(args[2], runner.game.height()) : undefined;
    if (method === "player_profile" && args[0] !== player.smallID()) {
      if (!Number.isInteger(args[0])) throw new Error("Invalid player");
      const target = runner.game.playerBySmallID(args[0] as number);
      if (!target.isPlayer()) throw new Error("Invalid player");
      const profile = target.playerProfile();
      // Only this viewer's relationship and public alliance membership are exposed.
      return {
        relations: { [player.smallID()]: profile.relations[player.smallID()] },
        alliances: profile.alliances,
      };
    }
    if (method === "attack_clustered_positions" && args[0] !== player.smallID())
      return [];
    if (args[0] !== player.id() && args[0] !== player.smallID())
      throw new Error("Other players private queries are unavailable");
    // Bind every query to the authenticated player's identity. The client's requested player ID is ignored.
    switch (method) {
      case "player_actions":
        return runner.playerActions(
          player.id(),
          x,
          y,
          args[3] as Parameters<GameRunner["playerActions"]>[3],
        );
      case "player_buildables":
        return runner.playerBuildables(
          player.id(),
          x,
          y,
          args[3] as Parameters<GameRunner["playerBuildables"]>[3],
        );
      case "player_profile":
        return runner.playerProfile(player.smallID());
      case "player_border_tiles":
        return runner.playerBorderTiles(player.id());
      case "attack_clustered_positions":
        return runner.attackClusteredPositions(
          player.smallID(),
          typeof args[1] === "string" ? args[1] : undefined,
        );
      case "transport_ship_spawn":
        if (
          !Number.isInteger(args[1]) ||
          !runner.game.isValidRef(args[1] as number)
        )
          throw new Error("Invalid tile");
        return runner.bestTransportShipSpawn(player.id(), args[1] as number);
      default:
        throw new Error("Query not allowed");
    }
  }
}
