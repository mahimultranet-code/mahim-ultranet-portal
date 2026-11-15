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
- `worker/wrangler.toml` now defines an isolated staging Worker named `mahim-ultranet-api-v2-staging`; configure Cloudflare Builds with repository root `worker/` and branch `feature/secure-portal-backend` only after creating that separate Worker.
- Staging deployment is intentionally blocked until a separate D1 database named `mahim-ultranet-db-staging` is created and its ID replaces the placeholder in `worker/wrangler.toml`. Do not use the production D1 database ID here.
- The migration directory currently has migrations `0002` and `0003` but no baseline `0001`; prepare and verify a complete staging schema before applying migrations or deploying.
- Do not accept real payments or promise live Internet activation until the Worker, D1 schema, cookie/session behavior and RouterOS integration have been tested end-to-end.
- The portal currently calls the Worker at `https://mahim-ultranet-api-v2.mahimultranet.workers.dev`. Its cross-site Secure cookie must be tested in Android Chrome; browser third-party-cookie restrictions may require putting the API on a same-site custom domain before production.
- Package orders remain pending until a verified RouterOS activation bridge is implemented.

## Main files

- `portal-app.html` — API-connected customer portal
- `manifest.webmanifest` — PWA install metadata
- `sw.js` — static app-shell caching
- `icon.svg` — application icon
- `worker/src/index.js` — Cloudflare Worker API
- `worker/wrangler.toml` — isolated staging deployment configuration (D1 ID placeholder must be replaced)
- `worker/migrations/0002_emergency_debt.sql` — emergency debt accounting
- `worker/migrations/0003_seed_packages.sql` — 40 Hotspot + 1 PPPoE starter packages
- `worker/README.md` — API deployment and test notes
