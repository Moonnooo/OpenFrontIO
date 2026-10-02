import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Side-effect import registers <news-modal>; a type-only import would be
// elided and leave the element inert.
import "../../src/client/NewsModal";
import { NewsModal } from "../../src/client/NewsModal";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewsModal", () => {
  it("starts on the loading placeholder", () => {
    const modal = new NewsModal();
    expect(modal.markdown).toBe("Loading...");
  });

  it("fetches the changelog on first open only", async () => {
    const fetchMock = vi.fn(async (_input: unknown) => ({
      ok: true,
      json: async () => ({
        summary: "changelog body text",
        exudizmono: [],
        upstream: [],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const modal = new NewsModal();
    modal.open();

    await vi.waitFor(() => expect(modal.markdown).toContain("changelog body"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "release-history.json",
    );

    // Already initialized: re-opening must not refetch.
    modal.open();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a failure message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );

    const modal = new NewsModal();
    modal.open();

    await vi.waitFor(() =>
      expect(modal.markdown).toContain("reopen News to retry"),
    );
  });
  it("switches between real histories and individual versions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          summary: "Our changes",
          exudizmono: [
            {
              id: "0.1.5",
              title: "Exudizmono v0.1.5",
              markdown: "Own release",
            },
          ],
          upstream: [
            { id: "v0.34.14", title: "v0.34.14", markdown: "Official notes" },
          ],
        }),
      })),
    );
    const modal = new NewsModal();
    document.body.append(modal);
    modal.open();
    await vi.waitFor(() => expect(modal.markdown).toBe("Our changes"));
    await modal.updateComplete;
    const source = modal.querySelector(
      'select[aria-label="Release history"]',
    ) as HTMLSelectElement;
    expect(source).not.toBeNull();
    source.value = "upstream";
    source.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(modal.markdown).toBe("Official notes"));
    source.value = "exudizmono";
    source.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(modal.markdown).toBe("Our changes"));
  });
});
