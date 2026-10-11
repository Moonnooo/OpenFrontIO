import { GameType } from "@openfront/engine-api/game/GameTypes";
export const SONAR_RADIUS = 45;
export const DEPTH_CHARGE_RANGE = 55;
export const DEPTH_CHARGE_RADIUS = 12;
export const DEPTH_CHARGE_COOLDOWN = 40;
export const TORPEDO_COOLDOWN = 30;
/** Local naval units are permitted only in solo games; multiplayer requires server authority. */
export function navalUnitsEnabled(config: {
  authoritativeNaval?: boolean;
  navalUnits?: boolean;
  gameType?: GameType;
}): boolean {
  return (
    config.authoritativeNaval === true ||
    (config.gameType === GameType.Singleplayer && config.navalUnits === true)
  );
}
