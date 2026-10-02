import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { z } from "zod";
import { ClientEnv } from "../ClientEnv";
const RankSchema = z.object({
  tier: z.string().max(30),
  rank: z.number().int().positive().nullable(),
  elo: z.number().nullable(),
  ratedGames: z.number().int().nonnegative(),
});
const ResponseSchema = z.object({
  mode: z.string(),
  players: z.record(z.string(), RankSchema),
});
type RankResponse = z.infer<typeof ResponseSchema>;
const cache = new Map<
  string,
  { expires: number; request: Promise<RankResponse> }
>();
async function ranks(
  gameID: string,
  clientID: string,
  retry = true,
): Promise<RankResponse> {
  const existing = cache.get(gameID);
  if (existing && existing.expires > Date.now()) {
    const data = await existing.request;
    if (retry && !data.players[clientID]) {
      if (cache.get(gameID) === existing) cache.delete(gameID);
      return ranks(gameID, clientID, false);
    }
    return data;
  }
  for (const [key, value] of cache)
    if (value.expires <= Date.now()) cache.delete(key);
  const request = (async () => {
    const url = `${ClientEnv.gameHttpBase(gameID)}/${ClientEnv.gameWorkerPath(gameID)}/api/game/${encodeURIComponent(gameID)}/ranks`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Ranks unavailable");
    return ResponseSchema.parse(await response.json());
  })();
  cache.set(gameID, { expires: Date.now() + 60000, request });
  request.catch(() => cache.delete(gameID));
  return request;
}
@customElement("player-rank-badge")
export class PlayerRankBadge extends LitElement {
  @property({ type: String }) gameID = "";
  @property({ type: String }) clientID = "";
  @state() private data: RankResponse | null = null;
  @state() private failed = false;
  private generation = 0;
  createRenderRoot() {
    return this;
  }
  protected updated(changed: Map<string, unknown>) {
    if (!changed.has("gameID") && !changed.has("clientID")) return;
    const generation = ++this.generation;
    this.data = null;
    this.failed = false;
    if (!this.gameID || !this.clientID) return;
    ranks(this.gameID, this.clientID)
      .then((data) => {
        if (generation === this.generation) this.data = data;
      })
      .catch(() => {
        if (generation === this.generation) this.failed = true;
      });
  }
  render() {
    if (!this.gameID || !this.clientID || !this.data)
      return this.failed
        ? html`<span
            class="text-xs text-gray-400"
            title="Skill ranks are temporarily unavailable"
            >Rank unavailable</span
          >`
        : nothing;
    const rank = this.data.players[this.clientID];
    if (!rank) return nothing;
    const text = `${rank.tier}${rank.rank !== null && rank.ratedGames >= 10 ? ` #${rank.rank}` : ""}`;
    const detail = `${this.data.mode} skill ladder • ${rank.elo === null ? "No rated games" : `${rank.elo} rating • ${rank.ratedGames} rated games`}${rank.ratedGames < 10 && rank.elo !== null ? " • 10 games required for placement" : ""}`;
    return html`<span
      class="inline-flex shrink-0 rounded border border-sky-400/30 bg-sky-950/60 text-sky-200 px-1 py-0.5 ml-1 text-[10px]"
      title=${detail}
      aria-label=${`${text}: ${detail}`}
      >${text}</span
    >`;
  }
}
