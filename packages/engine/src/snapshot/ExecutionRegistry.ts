import { DepthChargeExecutionSnapshot } from "@openfront/engine/execution/DepthChargeExecution";
// Every entry is `<ClassName>Snapshot`, exported next to its class.
import { AllianceExtensionExecutionSnapshot } from "@openfront/engine/execution/alliance/AllianceExtensionExecution";
import { AllianceRejectExecutionSnapshot } from "@openfront/engine/execution/alliance/AllianceRejectExecution";
import { AllianceRequestExecutionSnapshot } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { BreakAllianceExecutionSnapshot } from "@openfront/engine/execution/alliance/BreakAllianceExecution";
import { AttackExecutionSnapshot } from "@openfront/engine/execution/AttackExecution";
import { BoatRetreatExecutionSnapshot } from "@openfront/engine/execution/BoatRetreatExecution";
import { CityExecutionSnapshot } from "@openfront/engine/execution/CityExecution";
import { ConstructionExecutionSnapshot } from "@openfront/engine/execution/ConstructionExecution";
import { DefensePostExecutionSnapshot } from "@openfront/engine/execution/DefensePostExecution";
import { DeleteRailroadExecutionSnapshot } from "@openfront/engine/execution/DeleteRailroadExecution";
import { DeleteUnitExecutionSnapshot } from "@openfront/engine/execution/DeleteUnitExecution";
import { DonateGoldExecutionSnapshot } from "@openfront/engine/execution/DonateGoldExecution";
import { DonateTroopsExecutionSnapshot } from "@openfront/engine/execution/DonateTroopExecution";
import { DoomsdayClockExecutionSnapshot } from "@openfront/engine/execution/DoomsdayClockExecution";
import { EmbargoAllExecutionSnapshot } from "@openfront/engine/execution/EmbargoAllExecution";
import { EmbargoExecutionSnapshot } from "@openfront/engine/execution/EmbargoExecution";
import { EmojiExecutionSnapshot } from "@openfront/engine/execution/EmojiExecution";
import { FactoryExecutionSnapshot } from "@openfront/engine/execution/FactoryExecution";
import { MarkDisconnectedExecutionSnapshot } from "@openfront/engine/execution/MarkDisconnectedExecution";
import { MirvExecutionSnapshot } from "@openfront/engine/execution/MIRVExecution";
import { MissileSiloExecutionSnapshot } from "@openfront/engine/execution/MissileSiloExecution";
import { MoveWarshipExecutionSnapshot } from "@openfront/engine/execution/MoveWarshipExecution";
import { NationExecutionSnapshot } from "@openfront/engine/execution/NationExecution";
import { NoOpExecutionSnapshot } from "@openfront/engine/execution/NoOpExecution";
import { NukeExecutionSnapshot } from "@openfront/engine/execution/NukeExecution";
import { PauseExecutionSnapshot } from "@openfront/engine/execution/PauseExecution";
import { PlayerExecutionSnapshot } from "@openfront/engine/execution/PlayerExecution";
import { PortExecutionSnapshot } from "@openfront/engine/execution/PortExecution";
import { QuickChatExecutionSnapshot } from "@openfront/engine/execution/QuickChatExecution";
import { RecomputeRailClusterExecutionSnapshot } from "@openfront/engine/execution/RecomputeRailClusterExecution";
import { RetreatExecutionSnapshot } from "@openfront/engine/execution/RetreatExecution";
import { SAMLauncherExecutionSnapshot } from "@openfront/engine/execution/SAMLauncherExecution";
import { SAMMissileExecutionSnapshot } from "@openfront/engine/execution/SAMMissileExecution";
import { ShellExecutionSnapshot } from "@openfront/engine/execution/ShellExecution";
import { SpawnExecutionSnapshot } from "@openfront/engine/execution/SpawnExecution";
import { SpawnTimerExecutionSnapshot } from "@openfront/engine/execution/SpawnTimerExecution";
import { TargetPlayerExecutionSnapshot } from "@openfront/engine/execution/TargetPlayerExecution";
import { TradeShipExecutionSnapshot } from "@openfront/engine/execution/TradeShipExecution";
import { TrainExecutionSnapshot } from "@openfront/engine/execution/TrainExecution";
import { TrainStationExecutionSnapshot } from "@openfront/engine/execution/TrainStationExecution";
import { TransportShipExecutionSnapshot } from "@openfront/engine/execution/TransportShipExecution";
import { TribeExecutionSnapshot } from "@openfront/engine/execution/TribeExecution";
import { UpgradeStructureExecutionSnapshot } from "@openfront/engine/execution/UpgradeStructureExecution";
import { WarshipExecutionSnapshot } from "@openfront/engine/execution/WarshipExecution";
import { WinCheckExecutionSnapshot } from "@openfront/engine/execution/WinCheckExecution";
import type { ExecutionSnapshotType } from "@openfront/engine/snapshot/ExecutionSnapshot";

/**
 * Every execution class, by the type name its snapshots are stored under.
 * A class missing here cannot be snapshotted (snapshotGame throws), and a
 * stored type missing here cannot be restored. Retiring a class means
 * keeping an entry whose restoreSnapshot maps old records onto whatever
 * replaced it.
 */
export const EXECUTION_SNAPSHOT_TYPES = [
  AllianceExtensionExecutionSnapshot,
  AllianceRejectExecutionSnapshot,
  AllianceRequestExecutionSnapshot,
  AttackExecutionSnapshot,
  BoatRetreatExecutionSnapshot,
  BreakAllianceExecutionSnapshot,
  CityExecutionSnapshot,
  ConstructionExecutionSnapshot,
  DefensePostExecutionSnapshot,
  DeleteUnitExecutionSnapshot,
  DepthChargeExecutionSnapshot,
  DeleteRailroadExecutionSnapshot,
  DonateGoldExecutionSnapshot,
  DonateTroopsExecutionSnapshot,
  DoomsdayClockExecutionSnapshot,
  EmbargoAllExecutionSnapshot,
  EmbargoExecutionSnapshot,
  EmojiExecutionSnapshot,
  FactoryExecutionSnapshot,
  MarkDisconnectedExecutionSnapshot,
  MirvExecutionSnapshot,
  MissileSiloExecutionSnapshot,
  MoveWarshipExecutionSnapshot,
  NationExecutionSnapshot,
  NoOpExecutionSnapshot,
  NukeExecutionSnapshot,
  PauseExecutionSnapshot,
  PlayerExecutionSnapshot,
  PortExecutionSnapshot,
  QuickChatExecutionSnapshot,
  RecomputeRailClusterExecutionSnapshot,
  RetreatExecutionSnapshot,
  SAMLauncherExecutionSnapshot,
  SAMMissileExecutionSnapshot,
  ShellExecutionSnapshot,
  SpawnExecutionSnapshot,
  SpawnTimerExecutionSnapshot,
  TargetPlayerExecutionSnapshot,
  TradeShipExecutionSnapshot,
  TrainExecutionSnapshot,
  TrainStationExecutionSnapshot,
  TransportShipExecutionSnapshot,
  TribeExecutionSnapshot,
  UpgradeStructureExecutionSnapshot,
  WarshipExecutionSnapshot,
  WinCheckExecutionSnapshot,
] as unknown as readonly ExecutionSnapshotType<unknown>[];
