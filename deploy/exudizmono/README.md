# Exudizmono VPS deployment

Game: https://game.exudizmono.com/
Stats: https://game.exudizmono.com/stats/
Website: https://exudizmono.com/
Development: https://github.com/Moonnooo/OpenFrontIO

The fork is based on official upstream commit e02eeba, current on 1 October 2026. Origin is Moonnooo/OpenFrontIO; upstream remains the official repository. Commit future changes to the user's fork and review upstream merges deliberately.

The live VPS directory is /opt/frontrank: source in game, configuration in deploy, secrets in runtime.env and optional signin.env, and identities/database/archives in data. Two game workers and a loopback-only SQLite API run behind nginx. Services restart automatically; HTTPS renews through certbot. The main domain and www remain on shared hosting.

## Build and restart

Dockerfile.frontrank at the fork root builds the modified source with Node 24 and locked dependencies. Tag it frontrank-game:profiles. Dockerfile.brand and Dockerfile.accounts are incremental optimizations against earlier images, not the clean-build entrypoint.

Compose mounts the API, server JWT verifier and compiled index. Refresh these mounts when updating source: copy the new image's /app/static/index.html to public/game-index.html, copy api.mjs, accounts.mjs and src/server/jwt.ts to deploy, then run docker compose up -d. Set runtime GIT_COMMIT to the deployed fork revision. Preserve runtime secrets and data.

Earlier setup/patch scripts document the initial conversion and contain historical IP settings. Do not rerun them blindly on the current fork. Use the committed modified source as the development base.

## Data and access

Database backups run daily at 03:23 UTC and keep seven snapshots in backups. A signing-key backup also exists. These are local backups; offsite backup is not configured. Match archives persist in data/archives.

The approved GitHub deploy key has read/write access limited to this repository and is stored only in /opt/frontrank/private. Never commit runtime secrets, private keys, player identities or databases, or include them in the public source archive.

## Validation and remaining work

TypeScript and production Vite builds passed. Public lobbies, browser guest-hosted lobby creation/joining, HTTPS guest schema, private lobby creation and secure WebSocket joining were verified. Isolated API tests verified schema validation, authenticated ingestion, duplicates, wins, profiles and history without fake live matches. In-memory account tests cover expiry/replay rejection, guest preservation, cross-device login, hashed sessions, origin/state checks, Google PKCE and Steam assertion verification. Real Discord, Google, email and completed Steam account sign-ins still require interactive/provider checks.

A complete human multiplayer round and load testing have not been performed. Recorded wins are not Elo or a verified skill ranking. Guest cookies have no recovery. Persistent website accounts now support email links, Discord/Google OAuth and Steam OpenID. Steam browser sign-in is enabled; Discord, Google and email require provider credentials. See SIGN-IN.md. Competitive ranking, skill matchmaking and stronger result validation remain future work. Upstream commerce and native Steam/CrazyGames app-ticket login are not implemented.

## Attribution

Primary branding is Exudizmono. Original notices remain visible in the footer/loading screen, licence files and /credits/. Corresponding deployed source is available at /source.tar.gz. Proprietary assets are excluded from the deployed image/source archive.

Independent header versions are recorded in resources/fork-version.json. Bump exudizmono for our releases; change upstreamRef/upstreamCommit only after an upstream update.

Profile and leaderboard entry points now open our own /stats/ page. Share links use /stats/?player=PUBLIC_ID#profile-section. The page loads the requested player without replacing them with the viewer’s identity, and shows all-time totals plus up to 50 recent recorded matches. The signed-in account modal redirects to this profile; guest sign-in remains available.

### Worker map loading (Exudizmono 0.1.2)

Inline blob workers resolve hashed map assets and fallback paths against their creator origin. Main-thread paths and explicit CDN URLs are preserved. Regression coverage: `tests/AssetUrls.test.ts` (22 tests). Build this update using `Dockerfile.worker-assets` after the profiles image.

### Full leaderboards and skill ratings

Stats UI is the restored FrontRank design at `/stats/`, also published on the original Site. Only Exudizmono public read endpoints are proxied by that Site. Nginx serves `stats.html`, `stats-app.js` (deployed as `public/app.js`) and `stats-style.css` (deployed as `public/style.css`).

`leaderboards.mjs` records base mode, modifiers and complete human counts from server-only archives; existing archives backfill missing mode metadata. Mode-specific pairwise Elo starts at 1000 with K=32 divided across human opponents. FFA compares wins and recorded death positions; team modes compare winning versus losing humans without inventing other teams' final places. Updates are simultaneous from pre-match ratings. The first ten eligible games are provisional. Rounded equal ratings share competition rank. Aggregate views use match-weighted mode ratings, not a separate matchmaking score.

Competitive ratings exclude solo/private/cancelled/cheat-enabled games, humans-vs-nations, records with missing human identities and fewer than two humans, nation victories and malformed ranked roster sizes. Variant filters affect results and visible players; the displayed rating remains the whole-mode rating. Missing placement data permits winner-versus-loser comparisons only. This estimates skill from available outcomes, not a guarantee of player strength. New variant combinations appear from actual game configurations.

Rating tables are deterministically rebuilt chronologically from saved results at startup and ingestion; duplicates cannot award points again. This prioritizes correctness for this initial deployment; large match histories will need incremental chronological updates. All ladder search, sorting, tier filters and pagination preserve global ranks. Live fixtures are never seeded. Isolated verification: `check-rankings.mjs`, `check-ranking-math.mjs`.
