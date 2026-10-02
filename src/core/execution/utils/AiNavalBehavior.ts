import { Game, Player, PlayerType, UnitType } from "../../game/Game";
import {
  canSeeNavalUnit,
  isSubmarine,
  launchDepthCharge,
  navalUnitsEnabled,
  SONAR_RADIUS,
} from "../../game/NavalCombat";
import { ConstructionExecution } from "../ConstructionExecution";
/** AI uses the same detection, costs, cooldowns and friendly-fire rules as humans. */
export function tickNavalAI(game: Game, player: Player, ticks: number): void {
  if (
    !navalUnitsEnabled(game.config().gameConfig()) ||
    game.inSpawnPhase() ||
    !player.isAlive() ||
    game.config().isUnitDisabled(UnitType.Warship)
  )
    return;
  const fleet = player.units(UnitType.Warship);
  if (ticks % 10 === player.smallID() % 10) {
    for (const ship of fleet) {
      if (
        !ship.isActive() ||
        ship.isUnderConstruction() ||
        ship.warshipState().navalVariant !== "sonar"
      )
        continue;
      const contact = game
        .nearbyUnits(ship.tile(), SONAR_RADIUS, UnitType.Warship)
        .find(
          ({ unit }) =>
            unit.isActive() &&
            isSubmarine(unit) &&
            player.canAttackPlayer(unit.owner(), true) &&
            canSeeNavalUnit(game, player, unit) &&
            game.getWaterComponent(unit.tile()) ===
              game.getWaterComponent(ship.tile()),
        );
      if (contact)
        launchDepthCharge(game, player, ship.id(), contact.unit.tile());
    }
  }
  // Stagger coastal scans and purchases; small tribes do not field unlimited fleets.
  if (ticks % 100 !== player.smallID() % 100) return;
  const ports = player.units(UnitType.Port);
  if (ports.length === 0) {
    if (
      game.config().isUnitDisabled(UnitType.Port) ||
      player.numTilesOwned() < 100 ||
      player.gold() < game.unitInfo(UnitType.Port).cost(game, player)
    )
      return;
    let inspected = 0;
    for (const tile of player.borderTiles()) {
      if (++inspected > 512) break;
      if (!game.isShore(tile)) continue;
      const spawn = player.canBuild(UnitType.Port, tile);
      if (spawn === false) continue;
      game.addExecution(new ConstructionExecution(player, UnitType.Port, tile));
      return;
    }
    return;
  }
  const limit = player.type() === PlayerType.Bot ? 3 : 6;
  if (fleet.length >= limit) return;
  const variants = ["warship", "sonar", "submarine"] as const;
  const counts = variants.map(
    (variant) =>
      fleet.filter(
        (ship) => (ship.warshipState().navalVariant ?? "warship") === variant,
      ).length,
  );
  const variant = variants[counts.indexOf(Math.min(...counts))];
  const cost =
    (game.unitInfo(UnitType.Warship).cost(game, player) *
      (variant === "warship" ? 2n : 3n)) /
    2n;
  if (player.gold() < cost) return;
  for (const port of ports) {
    if (!port.isActive() || port.isUnderConstruction()) continue;
    for (const radius of [40, 25, 12]) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const x = game.x(port.tile()) + dx * radius,
          y = game.y(port.tile()) + dy * radius;
        if (!game.isValidCoord(x, y)) continue;
        const tile = game.ref(x, y);
        if (
          !game.isWater(tile) ||
          player.canBuild(UnitType.Warship, tile) === false
        )
          continue;
        game.addExecution(
          new ConstructionExecution(
            player,
            UnitType.Warship,
            tile,
            undefined,
            undefined,
            variant,
          ),
        );
        return;
      }
    }
  }
}
