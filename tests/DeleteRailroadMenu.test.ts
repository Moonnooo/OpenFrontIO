import { describe, expect, it, vi } from "vitest";
import {
  deleteUnitElement,
  type MenuElementParams,
} from "../src/client/hud/layers/RadialMenuElements";
import { UnitType } from "../src/core/game/Game";
function params(rails: number[]) {
  return {
    tile: 22,
    myPlayer: {
      units: () => [],
      deleteUnitCooldown: () => 100,
      id: () => "me",
    },
    playerActions: {
      deletableRailroads: rails.map((id) => ({ id, fromTile: 10, toTile: 40 })),
    },
    game: {
      x: (t: number) => t,
      y: () => 0,
      owner: () => ({ isPlayer: () => true, id: () => "me" }),
      isLand: () => true,
      inSpawnPhase: () => false,
      manhattanDist: () => 0,
    },
    playerActionHandler: {
      handleDeleteRailroad: vi.fn(),
      handleDeleteUnit: vi.fn(),
    },
    closeMenu: vi.fn(),
  } as unknown as MenuElementParams;
}
describe("railway Delete menu", () => {
  it("allows immediate track deletion despite building cooldown", () => {
    const p = params([7]);
    expect(deleteUnitElement.disabled(p)).toBe(false);
    expect(deleteUnitElement.cooldown!(p)).toBe(0);
    expect(deleteUnitElement.subMenu!(p)).toEqual([]);
    deleteUnitElement.action!(p);
    expect(p.playerActionHandler.handleDeleteRailroad).toHaveBeenCalledWith(
      7,
      22,
    );
    expect(p.playerActionHandler.handleDeleteUnit).not.toHaveBeenCalled();
    expect(p.closeMenu).toHaveBeenCalled();
  });
  it("offers distinct connections at a junction", () => {
    const p = params([7, 9]);
    const choices = deleteUnitElement.subMenu!(p);
    expect(choices.length).toBe(2);
    choices[1].action!(p);
    expect(p.playerActionHandler.handleDeleteRailroad).toHaveBeenCalledWith(
      9,
      22,
    );
  });
  it("keeps the building choice separate and subject to its cooldown", () => {
    const p = params([7]);
    p.myPlayer.units = () =>
      [
        {
          type: () => UnitType.City,
          tile: () => 10,
          isUnderConstruction: () => false,
          markedForDeletion: () => false,
        },
      ] as never;
    const choices = deleteUnitElement.subMenu!(p);
    expect(choices.length).toBe(2);
    expect(choices[1].id).toBe("delete-building");
    expect(choices[1].disabled(p)).toBe(true);
    expect(choices[0].disabled(p)).toBe(false);
  });
});
