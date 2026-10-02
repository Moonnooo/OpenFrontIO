# Exudizmono Store

Store is restored in the main navigation, with independent flags/crowns/player-style categories. Checkout is disabled: no prices, products, entitlement grants or payment sessions are fabricated. StoreModal does not import or fetch upstream commerce. No Stripe key, bank details or recipient account has been configured by this change. The owner selected their existing Stripe account and cosmetic perks.

To activate purchases, configure the owner's Stripe secret and webhook signing keys securely in a VPS-only env file, create approved product prices, and implement authenticated server-side Checkout Session creation and verified, idempotent Stripe webhooks. Fulfilment must grant cosmetics to the signed-in Exudizmono player only after a confirmed payment. Price IDs and cosmetic assets require an explicit owned catalogue. Never accept a price or entitlement grant solely from the browser. Test through Stripe test mode before enabling live checkout. Do not use OpenFront merchant IDs, payment redirects, paid artwork or entitlements.

News notifications use the hashed release-history.json URL, so both our release changes and official-history updates trigger unread state. First visits show the badge. Opening News alone does not clear it; successfully loading the notes does. Read state is saved per browser. Store badges and catalogue hash polling are disabled.
