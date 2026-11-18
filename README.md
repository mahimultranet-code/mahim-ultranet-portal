# Mahim UltraNet

Mahim UltraNet customer self-service portal and Cloudflare Worker API.

## Customer portal

The API-connected mobile-first customer app is in `portal-app.html`. It includes registration/login, wallet, package requests, bKash/Nagad payment submission, complaints, password-reset requests, admin workflows, and the ৳20 emergency Internet request workflow. The PWA assets are `manifest.webmanifest`, `sw.js`, and `icon.svg`.

The app currently targets the separate staging Worker. GitHub Pages and workers.dev are cross-site; Android Chrome session-cookie behavior must be verified before release. A same-site custom API domain may be required.

## Staging configuration

- Worker: `mahim-ultranet-api-v2-staging`
- D1: `mahim-ultranet-db-staging`, binding `DB`
- Wrangler config: `worker/wrangler.toml`
- Apply migrations `0001_initial.sql` through `0007_emergency_activation_confirmation.sql` in order to staging D1 only, after taking a backup.
- Keep `ADMIN_SETUP_SECRET` encrypted as a Worker secret. Never commit or share secrets or MikroTik credentials.

## Business rules in the current feature stack

- Minimum recharge: ৳10.
- Emergency Internet: ৳20 for 5 hours; customer account age at least 3 months and at least 10 approved recharges of ৳10 or more.
- Emergency approval alone creates no debt. A separate admin confirmation, after manually verifying RouterOS activation, creates the ৳20 debt exactly once.
- Payment requests remain pending until admin verification. No verified bKash/Nagad provider callback is implemented.
- Package purchase deducts wallet balance and creates a pending order. It does not provision Hotspot or PPPoE access or start an expiry timer.

## Release blockers

- Automatic MikroTik/RouterOS provisioning for Hotspot and PPPoE.
- Automatic five-hour emergency expiry and regular package expiry/renewal.
- Verified payment-provider integration and reconciliation.
- Android Chrome cross-site cookie verification.
- Full automated Worker/D1 integration tests and a verified staging test report.

Do not advertise automatic Internet activation or accept real customer payments until the relevant integrations and end-to-end staging tests are implemented and verified. Production Worker and D1 must remain untouched during staging work.

## Main files

- `portal-app.html` — customer app and admin UI
- `worker/src/index.js` — Cloudflare Worker API
- `worker/wrangler.toml` — staging deployment configuration
- `worker/migrations/` — ordered D1 migrations
- `worker/README.md` — implementation, verification, and safety guide
