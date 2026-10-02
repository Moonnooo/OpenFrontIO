import {
  BuildableUnit,
  Cell,
  PlayerActions,
  PlayerBorderTiles,
  PlayerBuildableUnitType,
  PlayerID,
  PlayerProfile,
} from "../core/game/Game";
import { TileRef } from "../core/game/GameMap";
import { ErrorUpdate, GameUpdateViewData } from "../core/game/GameUpdates";
import { decodeView } from "../core/net/AuthoritativeCodec";
import { ClientID, GameStartInfo, Turn } from "../core/Schemas";
import { WorkerClient } from "../core/worker/WorkerClient";
import { Transport } from "./Transport";
/** Rendering and input only. This client never starts a simulation worker or consumes other players' intents. */
export class RemoteSimulationClient extends WorkerClient {
  private receive?: (frame: GameUpdateViewData | ErrorUpdate) => void;
  private pending: GameUpdateViewData[] = [];
  private queryCache = new Map<
    string,
    { promise: Promise<unknown>; expires: number }
  >();
  private query<T>(method: string, args: unknown[]): Promise<T> {
    const key = JSON.stringify([method, args]);
    const now = performance.now();
    for (const [id, entry] of this.queryCache)
      if (entry.expires <= now) this.queryCache.delete(id);
    const existing = this.queryCache.get(key);
    if (existing) return existing.promise as Promise<T>;
    const entry = {
      promise: this.transport.authoritativeQuery<T>(method, args),
      expires: Infinity,
    };
    this.queryCache.set(key, entry);
    void entry.promise.then(
      () => {
        entry.expires = performance.now() + 100;
      },
      () => {
        this.queryCache.delete(key);
      },
    );
    return entry.promise;
  }
  constructor(
    info: GameStartInfo,
    id: ClientID | undefined,
    private transport: Transport,
  ) {
    super(info, id);
    transport.setAuthoritativeReceiver((payload) => {
      const frame = decodeView(payload) as GameUpdateViewData;
      if (this.receive) this.receive(frame);
      else {
        if (this.pending.length >= 200) {
          this.cleanup();
          throw new Error("Authoritative initialization backlog exceeded");
        }
        this.pending.push(frame);
      }
    });
  }
  override initialize(): Promise<void> {
    return Promise.resolve();
  }
  override start(
    callback: (frame: GameUpdateViewData | ErrorUpdate) => void,
  ): void {
    this.receive = callback;
    for (const frame of this.pending) callback(frame);
    this.pending = [];
  }
  override sendTurn(_turn: Turn): void {
    throw new Error("Replicated turns forbidden in authoritative mode");
  }
  override snapshot(): Promise<Uint8Array> {
    return Promise.reject(
      new Error("Private server snapshots cannot be downloaded"),
    );
  }
  override playerInteraction(
    playerID: PlayerID,
    x?: number,
    y?: number,
    units?: readonly PlayerBuildableUnitType[] | null,
  ): Promise<PlayerActions> {
    return this.query("player_actions", [playerID, x, y, units]);
  }
  override playerBuildables(
    playerID: PlayerID,
    x?: number,
    y?: number,
    units?: readonly PlayerBuildableUnitType[],
  ): Promise<BuildableUnit[]> {
    return this.query("player_buildables", [playerID, x, y, units]);
  }
  override playerProfile(playerID: number): Promise<PlayerProfile> {
    return this.query("player_profile", [playerID]);
  }
  override playerBorderTiles(playerID: PlayerID): Promise<PlayerBorderTiles> {
    return this.query("player_border_tiles", [playerID]);
  }
  override async attackClusteredPositions(
    playerID: number,
    attackID?: string,
  ): Promise<{ id: string; positions: Cell[] }[]> {
    const result = await this.query<
      { id: string; positions: { x: number; y: number }[] }[]
    >("attack_clustered_positions", [playerID, attackID]);
    return result.map((a) => ({
      ...a,
      positions: a.positions.map((c) => new Cell(c.x, c.y)),
    }));
  }
  override transportShipSpawn(
    playerID: PlayerID,
    targetTile: TileRef,
  ): Promise<TileRef | false> {
    return this.query("transport_ship_spawn", [playerID, targetTile]);
  }
  override cleanup(): void {
    this.transport.setAuthoritativeReceiver(undefined);
    this.receive = undefined;
    this.pending = [];
    this.queryCache.clear();
  }
}
