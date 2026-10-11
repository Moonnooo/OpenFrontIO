import { PlayerBuildableUnitType } from "@openfront/engine-api/game/GameTypes";

export interface UIState {
  navalVariant?: "warship" | "submarine" | "sonar";
  attackRatio: number;
  ghostStructure: PlayerBuildableUnitType | null;
  rocketDirectionUp: boolean;
  upgradeMultiplier: number;
}
