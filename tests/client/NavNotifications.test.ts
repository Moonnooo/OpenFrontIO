import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCosmeticsHash, getGamesPlayed } = vi.hoisted(() => ({
  getCosmeticsHash: vi.fn(async () => "hash-2"),
  getGamesPlayed: vi.fn(() => 0),
}));
vi.mock("../../src/client/Cosmetics", () => ({ getCosmeticsHash }));
vi.mock("../../src/client/Utils", () => ({ getGamesPlayed }));
vi.mock("../../src/core/AssetUrls", () => ({ assetUrl: () => "/_assets/release-history.rev2.json" }));

import {
  NavNotificationsController,
  navNotifications,
} from "../../src/client/components/NavNotificationsController";

// Two components with their own controller â€” the bell lives in
// <nav-utility-icons>, the store dot in the nav bars.
function host() {
  const requestUpdate = vi.fn();
  const stub = {
    requestUpdate,
    addController: () => {},
    removeController: () => {},
    updateComplete: Promise.resolve(true),
  };
  const controller = new NavNotificationsController(stub as never);
  controller.hostConnected();
  return { controller, requestUpdate };
}

describe("nav notifications", () => {
  beforeEach(() => {
    navNotifications.reset();
    localStorage.clear();
    // Seen an older version and an older cosmetics hash: news and store both
    // have something new.
    localStorage.setItem("exudizmono.releaseNotesSeen", "/_assets/release-history.rev1.json");
    localStorage.setItem("storeSeenHash", "hash-1");
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shares read state across components without showing Store notifications", async () => {
    const bell = host();
    const navBar = host();
    // Let the cosmetics-hash fetch settle.
    await Promise.resolve();
    await Promise.resolve();

    // News outranks store, so only the bell shows a dot.
    expect(bell.controller.showNewsDot()).toBe(true);
    expect(navBar.controller.showStoreDot()).toBe(false);

    // Dismissing the bell used to leave the nav bar's own copy of
    // hasNewVersion set, suppressing the store dot until a reload.
    navNotifications.markNewsRead();

    expect(bell.controller.showNewsDot()).toBe(false);
    expect(navBar.controller.showStoreDot()).toBe(false);
    // Both components re-render off the shared state.
    expect(navBar.requestUpdate).toHaveBeenCalled();
  });

  it("keeps help last in the priority chain", async () => {
    const bell = host();
    await Promise.resolve();
    await Promise.resolve();

    expect(bell.controller.showHelpDot()).toBe(false);
    navNotifications.markNewsRead();
    expect(bell.controller.showHelpDot()).toBe(true); // Store never suppresses Help
    bell.controller.onStoreClick();
    expect(bell.controller.showHelpDot()).toBe(true);
  });
  it("starts unread on a first visit and clears only after successful reading", () => {
    localStorage.removeItem("exudizmono.releaseNotesSeen"); const bell=host();
    expect(bell.controller.showNewsDot()).toBe(true);
    bell.controller.onNewsClick(); expect(bell.controller.showNewsDot()).toBe(true);
    navNotifications.markNewsRead(); expect(bell.controller.showNewsDot()).toBe(false);
    expect(localStorage.getItem("exudizmono.releaseNotesSeen")).toBe("/_assets/release-history.rev2.json");
    navNotifications.reset(); expect(host().controller.showNewsDot()).toBe(false);
  });

});
