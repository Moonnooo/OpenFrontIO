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
