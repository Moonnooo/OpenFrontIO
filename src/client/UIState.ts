import { PlayerBuildableUnitType } from "../core/game/Game";

export interface UIState {
  navalVariant?: "warship" | "submarine" | "sonar";
  attackRatio: number;
  ghostStructure: PlayerBuildableUnitType | null;
  rocketDirectionUp: boolean;
  upgradeMultiplier: number;
}
