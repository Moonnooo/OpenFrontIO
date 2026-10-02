import { describe, expect, it, vi } from "vitest";
import { NamePass } from "../../src/client/render/gl/passes/name-pass";

describe("eliminated player name visibility", () => {
  it.each([
    [false, 0, true],
    [true, 0, true],
    [false, 0, false],
  ])(
    "hides a dead slot before sliced name refresh (%s, %s, %s)",
    (isAlive, tilesOwned, hasName) => {
      const slot = {
        index: 1,
        alive: true,
        nameLen: 4,
        static: { smallID: 1 },
      };
      const write = vi.fn();
      const pass = Object.assign(Object.create(NamePass.prototype), {
        slots: new Map([["bot", slot]]),
        playerByID: new Map([["bot", {}]]),
        slicePhase: 0,
        writePlayerDataRow: write,
      });
      pass.updateNames(
        hasName ? new Map([["bot", { x: 10, y: 10, size: 3 }]]) : new Map(),
        new Map([[1, { isAlive, tilesOwned }]]),
        false,
      );
      expect(slot.alive).toBe(false);
      expect(write).toHaveBeenCalledOnce();
    },
  );

  it("keeps a living bot visible while its refresh is skipped", () => {
    const slot = { index: 1, alive: true, nameLen: 4, static: { smallID: 1 } };
    const write = vi.fn();
    const pass = Object.assign(Object.create(NamePass.prototype), {
      slots: new Map([["bot", slot]]),
      playerByID: new Map([["bot", {}]]),
      slicePhase: 0,
      writePlayerDataRow: write,
    });
    pass.updateNames(
      new Map([["bot", { x: 10, y: 10, size: 3 }]]),
      new Map([[1, { isAlive: true, tilesOwned: 1 }]]),
      false,
    );
    expect(slot.alive).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
});
