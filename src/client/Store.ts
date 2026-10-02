import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";

/** Independent storefront. No upstream catalogue, payments or entitlements. */
@customElement("store-modal")
export class StoreModal extends BaseModal {
  protected routerName = "store";
  onUserMe(_response: unknown): void {
    this.refresh();
  }
  refresh(): void {
    this.requestUpdate();
  }
  protected renderHeaderSlot() {
    return modalHeader({
      title: "Exudizmono Store",
      onBack: () => this.close(),
      ariaLabel: "Back",
    });
  }
  protected renderBody() {
    return html`<div class="px-6 py-6 text-white">
      <p class="text-xl font-bold mb-3">Make your mark.</p>
      <p class="text-white/70 mb-6">
        Cosmetic perks for your Exudizmono account. Change your look while
        keeping gameplay fair.
      </p>
      <div class="grid sm:grid-cols-3 gap-4 mb-6">
        ${[
          ["Flags", "Stand out on the map."],
          ["Crowns", "Give your profile a signature look."],
          ["Player styles", "Personalise how you appear in game."],
        ].map(
          ([name, description]) =>
            html`<div class="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 class="font-bold text-lg mb-2">${name}</h2>
              <p class="text-white/70 mb-4">${description}</p>
              <span class="text-xs uppercase tracking-wider text-cyan-300"
                >Coming soon</span
              >
            </div>`,
        )}
      </div>
      <div class="rounded-xl border border-white/10 p-5">
        <h2 class="font-bold mb-2">The store is being prepared</h2>
        <p class="text-white/70 mb-4">
          Cosmetic packs and prices will appear here when they are ready.
          Payments will be handled by Stripe for Exudizmono.
        </p>
        <button
          disabled
          class="rounded-lg px-5 py-3 bg-white/10 text-white/50 cursor-not-allowed"
        >
          Checkout coming soon
        </button>
      </div>
    </div>`;
  }
}
