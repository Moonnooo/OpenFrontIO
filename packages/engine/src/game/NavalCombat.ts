import { TileRef } from "@openfront/engine-api/game/GameMap";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  DEPTH_CHARGE_COOLDOWN,
  DEPTH_CHARGE_RADIUS,
  DEPTH_CHARGE_RANGE,
  SONAR_RADIUS,
} from "@openfront/engine-lib/game/NavalRules";
import { Game, Player, Unit } from "@openfront/engine/game/Game";
export {
  DEPTH_CHARGE_COOLDOWN,
  DEPTH_CHARGE_RADIUS,
  DEPTH_CHARGE_RANGE,
  navalUnitsEnabled,
  SONAR_RADIUS,
  TORPEDO_COOLDOWN,
} from "@openfront/engine-lib/game/NavalRules";
export function isSubmarine(unit: Unit): boolean {
  return (
    unit.type() === UnitType.Warship &&
    unit.warshipState().navalVariant === "submarine"
  );
}
export function canSeeNavalUnit(
  game: Game,
  viewer: Player | undefined,
  unit: Unit,
): boolean {
  if (!isSubmarine(unit)) return true;
  if (!viewer) return false;
  if (unit.owner() === viewer || viewer.isOnSameTeam(unit.owner())) return true;
  return game
    .nearbyUnits(unit.tile(), SONAR_RADIUS, UnitType.Warship)
    .some(
      ({ unit: detector }) =>
        detector.isActive() &&
        detector.warshipState().navalVariant === "sonar" &&
        (detector.owner() === viewer ||
          viewer.isOnSameTeam(detector.owner())) &&
        game.euclideanDistSquared(detector.tile(), unit.tile()) <=
          SONAR_RADIUS ** 2 &&
        game.getWaterComponent(detector.tile()) ===
          game.getWaterComponent(unit.tile()),
    );
}
export function depthChargeDamage(distance: number): number {
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance >= DEPTH_CHARGE_RADIUS
  )
    return 0;
  return Math.round(450 * (1 - distance / DEPTH_CHARGE_RADIUS));
}
/** Server validates owner, cooldown and launch point; no target ID or hidden contact is required. */
export function launchDepthCharge(
  game: Game,
  player: Player,
  shipId: number,
  target: TileRef,
): boolean {
  const ship = game.unit(shipId);
  if (
    game.inSpawnPhase() ||
    !game.isValidRef(target) ||
    game.isLand(target) ||
    !ship?.isActive() ||
    ship.owner() !== player ||
    ship.type() !== UnitType.Warship ||
    ship.warshipState().navalVariant !== "sonar" ||
    game.euclideanDistSquared(ship.tile(), target) > DEPTH_CHARGE_RANGE ** 2 ||
    game.getWaterComponent(ship.tile()) !== game.getWaterComponent(target) ||
    game.ticks() -
      (ship.warshipState().lastDepthChargeTick ?? -DEPTH_CHARGE_COOLDOWN) <
      DEPTH_CHARGE_COOLDOWN
  )
    return false;
  ship.updateWarshipState({
    lastDepthChargeTick: game.ticks(),
    isInCombat: true,
  });
  // Area attack is deliberate: guessing a stale contact is allowed, querying hidden targets is not.
  for (const { unit, distSquared } of game.nearbyUnits(
    target,
    DEPTH_CHARGE_RADIUS,
    UnitType.Warship,
  )) {
    if (
      !isSubmarine(unit) ||
      !player.canAttackPlayer(unit.owner(), true) ||
      game.getWaterComponent(unit.tile()) !== game.getWaterComponent(target)
    )
      continue;
    const damage = depthChargeDamage(Math.sqrt(distSquared));
    if (damage > 0) unit.modifyHealth(-damage, player);
  }
  return true;
}
