# Live deployment

On 2 October 2026, the approved social-preview branding fix was deployed to https://game.exudizmono.com/.

The game image is `frontrank-game:share-branding`, derived from `frontrank-game:demolition-refund`. It changes only `/app/index.html`, `/app/static/index.html`, and `/app/src/server/GamePreviewBuilder.ts` to apply the branding from commit `22eca945d`. The mounted production app shell has the same metadata patch. The client assets and gameplay remain at v0.1.8; experimental naval networking, solo AI, purchase UI, and rank badges are still preview-only. The API image remains `frontrank-game:demolition-refund` and was not restarted.

The live composition is `/opt/frontrank/compose.yaml`. Rollback copies of the prior compose file and app shell, plus the branding-only build overlay, are in `/var/tmp/frontrank-share-branding/`. To roll back, restore `compose.yaml.original` and `game-index.html.original` to their production paths, then recreate only the game service. The previous image is retained locally.

Validation: the public homepage returned HTTP 200 for Discordbot, with `og:title` and `twitter:title` set to Exudizmono, the correct game URL, and the new description. The browser also confirmed the metadata and a healthy public lobby list.
