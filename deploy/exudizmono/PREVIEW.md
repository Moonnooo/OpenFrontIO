# Separate naval test environment

The server-authoritative naval test runs separately at https://game.exudizmono.com:8443/. Production on port 443 is unchanged. Use `docker compose -p exudizmono-preview -f deploy/exudizmono/compose.preview.yaml up -d` after building the preview image and preparing the ignored preview.env file.

The preview has a separate Docker network, API signing key, session cookie and SQLite volume. Guest accounts are used for testing. Test matches never update production leaderboards. No production runtime files or API data mounts are changed.

Host an unlisted private multiplayer lobby and enable **Server-authoritative naval test**. Share the lobby URL with a second player. Use a coastal map, build a port, and select Warship, Submarine or Sonar ship in the naval purchase control. Sonar ships show their detection circle. Right-click water and choose Navy / Depth charges to attack a location in range. Infinite gold and instant build help with testing.

For solo testing, choose **Solo** on the preview. New single-player games enable all three naval variants automatically and run locally in the usual game worker. The player view uses the same sonar visibility and last-contact rules. Bots and nations can fund coastal ports and balanced fleets; tribe fleets are capped at three ships, nation fleets at six from the new strategy. Existing nation retaliation may also construct warships. AI depth charges require a detected enemy submarine and respect the normal cooldown and friendly-fire rules. Disabled ports or warships prevent these purchases. Coastal ownership and sufficient gold are required, so AI navies do not appear immediately. Local solo simulation is not a multiplayer security boundary.

Submarines are visible to their owner and teammates. Enemy submarines are delivered only within friendly sonar range in the same connected water body. Spectators do not receive submarine positions. When contact is lost, the last delivered position remains marked for three seconds; it is not updated with hidden movement. Depth charges can be aimed at guessed positions, including stale contacts.

Private multiplayer naval games remain an experimental opt-in mode. Standard multiplayer games keep their existing network protocol and do not offer naval variants. The multiplayer naval mode runs simulation exclusively on the server, with filtered current-state updates and authenticated queries. It does not send raw input histories, simulation snapshots, hashes or future motion plans. Replays in this mode are currently unavailable. Naval artwork uses existing silhouettes and weapons currently apply damage without dedicated underwater effects.

Check two opposing players and a spectator: hidden movement, exact sonar boundaries, contact loss, reconnect, owner-only queries, weapon range/cooldowns, allied immunity and server-decided results. Load and bandwidth testing are required before enabling this mode for public matches.

Pushes to GitHub never authorize live deployment. Test the preview first and obtain the owner's explicit approval for each production release.
