# Mahim UltraNet

Mahim UltraNet customer self-service portal and Cloudflare Worker API.

## Customer portal preview

The API-connected mobile-first portal is in `portal-app.html`. It includes:

- Customer registration, login, session check and logout
- Wallet balance and transaction history
- Active Hotspot/PPPoE package catalogue and purchase requests
- bKash/Nagad payment submission (pending until an administrator verifies it)
- Customer complaints and replies
- Customer password-reset requests and administrator-managed password replacement with session revocation
- ৳20 emergency Internet request workflow, admin approval queue, and debt-first recharge settlement (requires D1 migration 0002)
- Basic administrator dashboard and package creation
- PWA manifest, app icon and an offline shell service worker

The existing `index.html` and premium preview files have intentionally not been replaced.

## Android app preparation

The portal is structured as a Progressive Web App. Once it is safely published over HTTPS and the API is deployed and verified, open the portal in Android Chrome and use **Install app** or **Add to Home screen**. A Trusted Web Activity/APK can be prepared later if required.

## Important deployment status

- The API-connected portal and Worker source are committed to `feature/secure-portal-backend`.
- The existing `main` branch has not been changed.
- The Worker source has **not** been deployed to Cloudflare yet. The existing production Worker may still return `Hello World!`.
- `worker/wrangler.toml` defines an isolated staging Worker named `mahim-ultranet-api-v2-staging`, with its D1 binding pointed at `mahim-ultranet-db-staging`. Cloudflare Builds must use repository root `worker/` and branch `feature/secure-portal-backend`.
- The migration directory contains baseline schema `0001`, emergency debt migration `0002`, and package seed migration `0003`. Apply them in order to the staging D1 database only.
- Do not accept real payments or promise live Internet activation until the Worker, D1 schema, cookie/session behavior and RouterOS integration have been tested end-to-end.
- The portal currently calls the production Worker URL `https://mahim-ultranet-api-v2.mahimultranet.workers.dev`; staging deployment does not switch the portal to staging automatically. Update the portal API URL only after staging health and auth tests pass.
- The portal's cross-site Secure cookie must be tested in Android Chrome; browser third-party-cookie restrictions may require putting the API on a same-site custom domain before production.
- Package orders remain pending until a verified RouterOS activation bridge is implemented.

## Main files

- `portal-app.html` — API-connected customer portal
- `manifest.webmanifest` — PWA install metadata
- `sw.js` — static app-shell caching
- `icon.svg` — application icon
- `worker/src/index.js` — Cloudflare Worker API
- `worker/wrangler.toml` — isolated staging deployment configuration
- `worker/migrations/0001_initial.sql` — baseline D1 schema
- `worker/migrations/0002_emergency_debt.sql` — emergency debt accounting
- `worker/migrations/0003_seed_packages.sql` — 40 Hotspot + 1 PPPoE starter packages
- `worker/README.md` — API deployment and test notes
