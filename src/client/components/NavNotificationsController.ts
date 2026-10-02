import { ReactiveController, ReactiveControllerHost } from "lit";
import { assetUrl } from "../../core/AssetUrls";
import { getGamesPlayed } from "../Utils";

const HELP_SEEN_KEY = "helpSeen";
const NEWS_SEEN_VERSION_KEY = "exudizmono.releaseNotesSeen";

function normalizedVersion(): string {
  return assetUrl("release-history.json");
}

/** Shared unread release state across desktop and mobile navigation.
 * Store notifications are disabled; catalogue changes do not mark News unread.
 */
class NavNotificationsStore {
  private hosts = new Set<ReactiveControllerHost>();
  private loaded = false;

  private _helpSeen = false;
  private _hasNewVersion = false;

  subscribe(host: ReactiveControllerHost): void {
    this.hosts.add(host);
    this.load();
  }

  unsubscribe(host: ReactiveControllerHost): void {
    this.hosts.delete(host);
  }

  private notify(): void {
    for (const host of this.hosts) host.requestUpdate();
  }

  // Read once per page load; every later subscriber reuses the result.
  private load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this._helpSeen = localStorage.getItem(HELP_SEEN_KEY) === "true";

    const currentVersion = normalizedVersion();
    const seenVersion = localStorage.getItem(NEWS_SEEN_VERSION_KEY);
    this._hasNewVersion = seenVersion !== currentVersion;
  }

  // Only show one dot at a time to prevent
  // overwhelming users. Priority: News > Help.
  showNewsDot(): boolean {
    return this._hasNewVersion;
  }

  showStoreDot(): boolean {
    return false;
  }

  showHelpDot(): boolean {
    return (
      getGamesPlayed() < 10 &&
      !this._helpSeen &&
      !this.showNewsDot() &&
      !this.showStoreDot()
    );
  }

  // Opening the panel is not proof its notes loaded successfully.
  onNewsClick = (): void => {};

  markNewsRead = (): void => {
    this._hasNewVersion = false;
    localStorage.setItem(NEWS_SEEN_VERSION_KEY, normalizedVersion());
    this.notify();
  };

  onStoreClick = (): void => {};

  onHelpClick = (): void => {
    localStorage.setItem(HELP_SEEN_KEY, "true");
    this._helpSeen = true;
    this.notify();
  };

  /** Test seam: drop all state so a fresh load re-reads localStorage. */
  reset(): void {
    this.hosts.clear();
    this.loaded = false;
    this._helpSeen = false;
    this._hasNewVersion = false;
  }
}

export const navNotifications = new NavNotificationsStore();

/**
 * Host-facing view of {@link navNotifications}: keeps the component subscribed
 * for its lifetime and forwards the dot queries and click handlers.
 */
export class NavNotificationsController implements ReactiveController {
  private host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    navNotifications.subscribe(this.host);
  }

  hostDisconnected(): void {
    navNotifications.unsubscribe(this.host);
  }

  showNewsDot(): boolean {
    return navNotifications.showNewsDot();
  }

  showStoreDot(): boolean {
    return navNotifications.showStoreDot();
  }

  showHelpDot(): boolean {
    return navNotifications.showHelpDot();
  }

  onNewsClick = (): void => navNotifications.onNewsClick();
  onStoreClick = (): void => navNotifications.onStoreClick();
  onHelpClick = (): void => navNotifications.onHelpClick();
}
