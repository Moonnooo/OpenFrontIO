import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import { assetUrl } from "../core/AssetUrls";
import { BaseModal } from "./components/BaseModal";
import { navNotifications } from "./components/NavNotificationsController";
import { modalHeader } from "./components/ui/ModalHeader";
import { renderMarkdown } from "./Markdown";
import { normalizeNewsMarkdown } from "./NewsMarkdown";

type Release = { id: string; title: string; markdown: string };
type ReleaseCatalog = {
  summary: string;
  exudizmono: Release[];
  upstream: Release[];
};

@customElement("news-modal")
export class NewsModal extends BaseModal {
  protected routerName = "news";

  @property({ type: String }) markdown = "Loading...";

  @property({ attribute: false }) catalog: ReleaseCatalog | null = null;
  @property({ type: String }) source = "exudizmono";
  @property({ type: String }) selected = "all";
  private initialized = false;

  private selectRelease(source: string, id: string) {
    this.source = source;
    this.selected = id;
    const rows =
      source === "upstream" ? this.catalog?.upstream : this.catalog?.exudizmono;
    this.markdown = normalizeNewsMarkdown(
      id === "all" && source === "exudizmono"
        ? (this.catalog?.summary ?? "")
        : (rows?.find((r) => r.id === id)?.markdown ??
            "Release notes unavailable."),
    );
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("news.title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`
      ${this.catalog
        ? html`<div class="px-6 py-3 flex flex-wrap gap-3">
            <label
              >History
              <select
                aria-label="Release history"
                class="bg-slate-800 text-white rounded p-2"
                .value=${this.source}
                @change=${(e: Event) => {
                  const source = (e.target as HTMLSelectElement).value;
                  this.selectRelease(
                    source,
                    source === "upstream"
                      ? (this.catalog!.upstream[0]?.id ?? "")
                      : "all",
                  );
                }}
              >
                <option value="exudizmono">Exudizmono changes</option>
                <option value="upstream">OpenFront releases</option>
              </select></label
            >
            <label
              >Release
              <select
                aria-label="Release version"
                class="bg-slate-800 text-white rounded p-2 max-w-full"
                .value=${this.selected}
                @change=${(e: Event) =>
                  this.selectRelease(
                    this.source,
                    (e.target as HTMLSelectElement).value,
                  )}
              >
                ${this.source === "exudizmono"
                  ? html`<option value="all">All Exudizmono changes</option>`
                  : ""}
                ${(this.source === "upstream"
                  ? this.catalog.upstream
                  : this.catalog.exudizmono
                ).map((r) => html`<option value=${r.id}>${r.title}</option>`)}
              </select></label
            >
          </div>`
        : ""}
      <div
        class="prose prose-invert prose-sm max-w-none px-6 py-3
          [&_a]:text-blue-400 [&_a:hover]:text-blue-300 transition-colors
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:text-white [&_h1]:border-b [&_h1]:border-white/10 [&_h1]:pb-2
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-blue-200
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-blue-100
          [&_ul]:pl-5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1
          [&_li]:text-gray-300 [&_li]:leading-relaxed
          [&_p]:text-gray-300 [&_p]:mb-3 [&_strong]:text-white [&_strong]:font-bold"
      >
        ${renderMarkdown(this.markdown, { includeImages: true })}
      </div>
    `;
  }

  protected onOpen(): void {
    if (!this.initialized) {
      this.initialized = true;
      fetch(assetUrl("release-history.json"))
        .then(async (response) => {
          if (!response.ok) throw new Error("Unavailable");
          return (await response.json()) as ReleaseCatalog;
        })
        .then((catalog) => {
          this.catalog = catalog;
          this.selectRelease("exudizmono", "all");
          navNotifications.markNewsRead();
        })
        .catch(() => {
          this.initialized = false;
          this.markdown =
            "Release notes could not be loaded. Please reopen News to retry.";
        });
    }
  }
}
