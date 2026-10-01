# Exudizmono sign-in

Website: https://game.exudizmono.com/
Standalone sign-in page: https://game.exudizmono.com/backend/auth/signin

Steam uses browser OpenID and does not require a Steam Web API key for identity.
The site verifies the assertion with Steam before accepting it. Steam names and
avatars are not fetched yet; the identity is the verified SteamID.

Discord: use an application owned by you at https://discord.com/developers/applications.
Add this exact redirect URL under OAuth2:
https://game.exudizmono.com/backend/auth/callback/discord
Only the identify scope is requested. This does not add a bot to any server.

Google: use a Web application OAuth client in your Google Cloud project.
Add this exact authorized redirect URI:
https://game.exudizmono.com/backend/auth/callback/google
Configure the consent screen as Exudizmono and include your domain. Testing-mode
apps only allow the test users you configure. Publish the consent screen when
you are ready to let the public sign in. Only openid/email scopes are requested.

Email: the implemented sender uses Resend HTTPS, with RESEND_API_KEY and MAIL_FROM.
Verify a sending domain/address in your own account before enabling it. If you
already have an SMTP provider, adapt the sender rather than creating another
paid service. No messages are sent when these values are absent.

## Secret setup

On the VPS, run `sudo nano /opt/frontrank/signin.env` and enter the variables
shown in signin.env.example. Do not paste secrets in chat, command arguments,
GitHub, or the browser client. Run `sudo chmod 600 /opt/frontrank/signin.env`.
Restart only the API with `cd /opt/frontrank && docker compose up -d api`.
Check `/backend/auth/providers`; this returns only readiness booleans, no secrets.

## Account behavior

- First sign-in on the same browser upgrades a guest when the identity is new,
  preserving that player's public ID and match history.
- Signing into a known identity loads its existing player on any device.
  Separate registered accounts are never automatically merged by email.
- Email links last 15 minutes, work once, and require a confirmation click so
  mail scanners do not use them. Cross-device email sign-in creates/loads the
  account, but does not import the original device's guest progress.
- Sessions expire after 30 days and use Secure, HttpOnly, SameSite=Lax cookies.
  New session tokens, email tokens and OAuth states are hashed at rest.
- Logout clears the current session. Logout-all revokes all refresh sessions;
  already issued game JWTs expire within one hour.
- This is website authentication. Native OpenFront Steam/CrazyGames app tickets
  and account deletion, provider unlinking and account merges are not supported.
- Email is rate-limited per address and IP. Email addresses are private and
  returned only to the authenticated player, not in public player stats.

## Validation

Run `node check-accounts.mjs` in the game image with accounts.mjs alongside it.
The test uses an in-memory database and injected mail/Steam transports. It
checks continuity, expiry/replay protection, origin/state checks, hashed sessions,
logout-all and Steam verification; it does not send email or log into real
provider accounts. Real Discord, Google and email end-to-end tests require
your configured credentials and your interactive provider/inbox verification.
