import { expect, it, vi } from "vitest";
import { Footer } from "../../../src/client/components/Footer";
vi.mock("../../../src/client/GameVersion", () => ({
  currentGameVersion: () => "Exudizmono v0.2.0 · OpenFront v0.34.14",
}));
it("links to Exudizmono and its fork while retaining upstream attribution", async () => {
  const footer = new Footer();
  document.body.append(footer);
  await footer.updateComplete;
  expect(footer.textContent).toContain("Exudizmono v0.2.0");
  expect(footer.textContent).toContain("OpenFront v0.34.14");
  expect(footer.textContent).toContain("© OpenFront and Contributors");
  expect(
    footer.querySelector('a[href="https://exudizmono.com/"]'),
  ).toBeTruthy();
  expect(
    footer.querySelector('a[href="https://github.com/Moonnooo/OpenFrontIO"]'),
  ).toBeTruthy();
  expect(footer.querySelector('a[href="/stats/"]')).toBeTruthy();
  expect(
    footer.querySelector('a[href="https://discord.gg/SBR45wfR2b"]'),
  ).toBeTruthy();
  footer.remove();
});
