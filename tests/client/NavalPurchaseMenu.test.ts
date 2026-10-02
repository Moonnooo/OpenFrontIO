import { afterEach, describe, expect, it, vi } from "vitest";
import { UnitDisplay } from "../../src/client/hud/layers/UnitDisplay";
import type { UIState } from "../../src/client/UIState";
import type { GameView } from "../../src/client/view";
import { GameType, UnitType } from "../../src/core/game/Game";
vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  renderNumber: (n: bigint | number) => String(n),
}));
afterEach(() => document.body.replaceChildren());
describe("naval purchase menu", () => {
  it("puts the selector below the purchase control and previews each real variant cost", async () => {
    const display = new UnitDisplay();
    display.game = {
      myPlayer: () => ({
        isAlive: () => true,
        gold: () => 10000n,
        units: () => [{}],
      }),
      inSpawnPhase: () => false,
      config: () => ({
        isUnitDisabled: () => false,
        gameConfig: () => ({
          gameType: GameType.Singleplayer,
          navalUnits: true,
        }),
      }),
    } as unknown as GameView;
    display.uiState = {
      navalVariant: "warship",
      ghostStructure: null,
    } as UIState;
    (display as unknown as { playerBuildables: unknown }).playerBuildables = [
      { type: UnitType.Warship, cost: 1000n },
    ];
    document.body.append(display);
    await display.updateComplete;
    const selector = display.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose naval unit"]',
    )!;
    const ship = display.querySelector('img[alt="warship"]')!;
    expect(
      ship.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    selector.click();
    await display.updateComplete;
    const choices = Array.from(
      display.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Naval unit types"] button',
      ),
    );
    expect(
      choices.map((c) =>
        Array.from(c.children)
          .map((child) => child.textContent?.replace(/\s+/g, " ").trim())
          .join(" "),
      ),
    ).toEqual([
      "Warship 1000 gold",
      "Submarine 1500 gold",
      "Sonar ship 1500 gold",
    ]);
    choices[1].dispatchEvent(new MouseEvent("mouseenter"));
    await display.updateComplete;
    expect(choices[1].title).toContain("1500 gold");
    choices[1].click();
    await display.updateComplete;
    expect(display.uiState.navalVariant).toBe("submarine");
    expect(
      display.querySelector('[aria-label="Choose naval unit"]')?.textContent,
    ).toContain("Submarine");
    expect(display.querySelector('[aria-label="Naval unit types"]')).toBeNull();
  });
});
