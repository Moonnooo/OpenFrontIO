import { Game, Player, Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";
export const SONAR_RADIUS = 45;
export const DEPTH_CHARGE_RANGE = 55;
export const DEPTH_CHARGE_RADIUS = 12;
export const DEPTH_CHARGE_COOLDOWN = 40;
export const TORPEDO_COOLDOWN = 30;
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
