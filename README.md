# Mahim UltraNet

Mahim UltraNet customer self-service portal and Cloudflare Worker API.

## Customer portal preview

The API-connected mobile-first portal is in `portal-app.html`. It includes customer registration/login, wallet, package requests, bKash/Nagad payment submission, complaints, password-reset requests, administrator workflows, and the ৳20 emergency Internet request workflow.

The portal API URL is configured for the separate staging Worker. The existing `index.html` and premium preview files have intentionally not been replaced.

## Android app preparation

The portal is structured as a Progressive Web App. Once staging has passed its health, database, authentication, and browser-cookie tests, it can be installed from Android Chrome. A Trusted Web Activity/APK can be prepared later.

## Deployment status and safety

- API and portal changes are on `feature/secure-portal-backend`; `main` is unchanged.
- Staging Worker: `mahim-ultranet-api-v2-staging`.
- Staging D1: `mahim-ultranet-db-staging`, bound as `DB` in `worker/wrangler.toml`.
- Cloudflare Builds must use branch `feature/secure-portal-backend`, root directory `worker`, and deploy command `npx wrangler deploy`.
- Apply migrations `0001_initial.sql`, `0002_emergency_debt.sql`, `0003_seed_packages.sql`, and `0004_update_five_hour_package_price.sql` to staging D1 only, in order.
- The five-hour Hotspot package is ৳20. Emergency Internet is ৳20 for 5 hours and requires an account at least 3 months old plus 10 approved recharges of at least ৳10 each.
- Payment submissions remain pending until admin approval. Package orders remain pending and do not activate Internet.
- RouterOS activation/polling is not implemented. Do not advertise live package or emergency activation until the router integration is built and verified.
- Do not accept real payments until staging health, migrations, admin bootstrap, customer authentication, wallet/payment workflows, cookie behavior, and RouterOS integration are fully tested.
- Keep the production Worker and production D1 untouched during staging work. Never expose Worker secrets or MikroTik credentials.

## Main files

- `portal-app.html` — API-connected mobile-first portal
- `manifest.webmanifest`, `sw.js`, `icon.svg` — PWA assets
- `worker/src/index.js` — Cloudflare Worker API
- `worker/wrangler.toml` — isolated staging deployment configuration
- `worker/migrations/` — ordered staging D1 migrations
- `worker/README.md` — deployment and test instructions
