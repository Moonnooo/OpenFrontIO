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

A complete human multiplayer round and load testing have not been performed. Guest cookies have no recovery. Persistent website accounts now support email links, Discord/Google OAuth and Steam OpenID. Steam browser sign-in is enabled; Discord, Google and email require provider credentials. See SIGN-IN.md. Independent per-mode skill ratings are implemented; skill matchmaking and stronger result validation remain future work. Upstream commerce and native Steam/CrazyGames app-ticket login are not implemented.

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

### Clan directory compatibility

Clan membership management is not implemented on this fork yet. `GET /clans` returns the schema-compatible empty directory with validated page/limit values. `GET /public/clans/leaderboard` returns an empty leaderboard. These endpoints do not import upstream clans or enable clan creation/joining. Isolated check: `check-clan-browse.mjs`.

## Clans (Exudizmono 0.1.4)

The game and leaderboard link to /clans/. Linked sign-in is required for creation and membership changes; guest browsing remains available. Steam sign-in works with the current configuration. Each account may join five clans, each clan holds 100 members. Tags contain 2-5 letters/digits and are canonical uppercase. Open clans allow instant joining; closed clans use requests approved by leaders/officers. Leaders edit settings, promote/demote officers, transfer leadership and disband. Officers manage ordinary members and requests; they cannot remove leaders or other officers. The last leader must transfer ownership or disband before leaving. Bans prevent rejoining until lifted. Disband preserves database records but removes the clan from active listings. Administrative changes are audited.

clans.mjs must be mounted beside api.mjs, accounts.mjs and leaderboards.mjs. The module migrates the existing SQLite database automatically; back it up before deployment. Users/@me exposes current memberships and pending requests. Trusted match ingestion records server-validated clan tags for games starting after clan creation; no historic clan attribution is fabricated. Clan history and the 30-day clan leaderboard use those records. Clan commerce is not implemented.

Isolated check-clans.mjs tests creation, permissions, joins, requests, bans, transfers, persistence, recoverable disband, origin checks, schema compatibility and recorded match history/leaderboards. Ranking integration regression checks and TypeScript/Vite production build passed. Browser guest state and sign-in gating were verified; human provider sign-in followed by clan creation still needs an interactive account.

## Release notes (Exudizmono 0.1.5)

News loads resources/release-history.json, with separate Exudizmono and OpenFront history selectors. resources/changelog.md now contains real fork changes instead of upstream's sample. All official published releases through the latest release tag in the exact upstream base's ancestry are preserved with original release bodies and source links. Separate-branch historical tags are labelled; newer release notes are excluded. A main snapshot is explicitly labelled with git describe, not claimed to be the latest official release. Exudizmono entries are generated from actual feature commits grouped by their recorded fork version.

For every feature release: bump resources/fork-version.json, commit the feature, fetch upstream tags/full ancestry, run python3 scripts/releases/generate-history.py, review resources/release-history.json and commit generated resources with message “Refresh generated release history”. Then build and deploy. The generator fails if ancestry or tags cannot be verified; do not silently substitute sample notes. Metadata-only history-refresh commits are excluded to avoid self-referential notes. No automated claim of deploying new upstream code is made. Existing stale upstream tournament announcements were removed because Exudizmono has not announced those events.

## Store and notifications (0.1.6)

Store is visible with independent cosmetic categories and checkout disabled. The owner has chosen their own Stripe account; credentials, prices and webhook fulfilment are pending. See STORE.md. News dots track the actual release catalog hash and clear only after successful loading. Store dots are disabled. Eight focused notification, storefront and News tests passed.
