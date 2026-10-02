import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { currentGameVersion } from "../GameVersion";
@customElement("page-footer")
export class Footer extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html`<footer
      class="[.in-game_&]:hidden bg-zinc-900/90 text-white/60 w-full relative py-5 text-center border-t border-white/10"
    >
      <div class="flex items-center justify-center gap-5 flex-wrap px-5">
        <a href="https://exudizmono.com/">Exudizmono</a>
        <a href="/stats/">Leaderboard &amp; stats</a>
        <a
          href="https://github.com/Moonnooo/OpenFrontIO"
          target="_blank"
          rel="noopener noreferrer"
          >GitHub</a
        >
        <a href="/credits/">Credits &amp; licences</a>
        <a href="/source.tar.gz">Download source</a>
        <a href="/clans/">Clans</a>
        <a
          href="https://discord.gg/SBR45wfR2b"
          target="_blank"
          rel="noopener noreferrer"
          >Join our Discord</a
        >
      </div>
      <p class="text-xs mt-3">
        Exudizmono · Independent community game · ${currentGameVersion()}
      </p>
      <p class="text-xs mt-1">
        Based on OpenFront · © OpenFront and Contributors · Exudizmono
        modifications.
      </p>
      <lang-selector class="absolute right-4 top-3"></lang-selector>
    </footer>`;
  }
}
