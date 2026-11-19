# Mahim UltraNet

Mahim UltraNet customer self-service portal and Cloudflare Worker API.

## Customer portal

- `portal-app.html` — mobile-first customer portal and admin UI.
- `index.html` — GitHub Pages entry point.
- PWA assets: `manifest.webmanifest`, `sw.js`, and `icon.svg`.

The portal supports customer registration/login, wallet and transaction history, package requests, bKash/Nagad payment submission, complaints, password-reset requests, admin workflows, and the ৳20 emergency Internet request workflow.

## Current business rules

- Minimum wallet recharge/payment request: ৳10.
- Emergency Internet: ৳20 for 5 hours, Hotspot only; account age at least 3 months and at least 10 approved successful recharges of ৳10 or more.
- Emergency approval queues activation; the ৳20 debt is created only after the enrolled router acknowledges successful activation. The five-hour expiry starts from that confirmation.
- Payment requests remain pending until an admin manually verifies and approves them. No verified live bKash/Nagad provider API or webhook reconciliation is implemented.
- Package purchase debits the wallet and creates a pending order. It becomes active and its validity starts only after the router executes and acknowledges activation.

## Staging configuration

- Worker: `mahim-ultranet-api-v2-staging`
- D1: `mahim-ultranet-db-staging`, binding `DB`
- Wrangler config: `worker/wrangler.toml`
- Apply migrations `0001_initial.sql` through `0011_emergency_router_lifecycle.sql` in order to the isolated staging D1 only, after taking a backup.
- Keep `ADMIN_SETUP_SECRET` and `ROUTER_ENROLLMENT_SECRET` encrypted as Worker secrets. Never commit or paste secrets or MikroTik credentials into chat or portal code.
- The current GitHub Pages and workers.dev origins are cross-site. Android Chrome session-cookie behavior must be verified; a same-site custom API domain may be required.

## Captive Portal and Android app

- `hotspot/login.html` is the RouterOS Hotspot login-page template. Copy it into the router's Hotspot HTML directory only after testing on a lab router; it expects RouterOS's standard `md5.js` file for CHAP login. The signup flow separately provisions the new RouterOS Hotspot credential through the encrypted router-agent queue.
- The captive page links to the existing customer portal for both sign-up and sign-in. Portal credentials are not RouterOS Hotspot credentials. A newly registered portal account does not yet create a Hotspot user or grant Internet access; secure customer-to-router credential provisioning and mapping still require implementation and lab validation.
- Add only the exact portal hostname to Hotspot Walled Garden for unauthenticated sign-up/login access. Do not allow all destinations. Test captive assistant behavior and HTTPS on Android/iOS.
- `android/` contains a minimal Android WebView wrapper. GitHub Actions builds an installable debug APK artifact. A version tag such as `android-v1.0.0` publishes the APK to GitHub Releases. The first build is debug-signed; production signing needs a private keystore and protected CI secrets.
- The portal's Android APK button opens the Releases page. No APK is claimed available until the Android build workflow has succeeded and a release has been published.

## MikroTik / RouterOS integration status

- The feature branch contains an authenticated outbound router job API, durable provisioning queue, expiry queueing, and a RouterOS v7 single-run executor template.
- The template only modifies existing Hotspot users and PPP secrets; it does not create customer credentials.
- The template does not enroll a router or install a recurring Scheduler. A least-privilege recurring polling Scheduler and enrollment procedure still require lab validation.
- Do not import or run the template on the live router until staging API/D1 tests, RouterOS syntax and policy validation, profile prerequisites, retry/expiry behavior, and end-to-end tests on a dedicated staging router are complete.
- Never expose RouterOS management ports (8728/8729) to the public Internet.

## Verification and release gates

Before accepting real customer payments or advertising automatic Internet activation:

1. Verify the staging Worker and D1 are isolated from production; back up staging D1.
2. Apply migrations 0001–0012 to staging D1 and verify schema/migration state.
3. Verify `GET /health`, admin bootstrap, customer sessions, customer data isolation, and Android Chrome cookie behavior.
4. Test wallet recharge minimum, duplicate transaction handling, admin approval/rejection, exactly-once wallet credit, and debt settlement.
5. Test Hotspot/PPPoE package catalogue, wallet purchase idempotency, pending orders, activation acknowledgement, and expiry.
6. Test emergency eligibility, duplicate-request prevention, activation acknowledgement before debt creation, and five-hour expiry.
7. Test complaints, password reset, session revocation, and admin audit logs.
8. Run automated Worker tests and staging D1 integration tests.
9. Enroll only a dedicated staging router; validate HTTPS polling, token handling, existing-user activation, bounded retries, expiry, and recurring Scheduler behavior.

## Release blockers

- Verified staging Worker + D1 end-to-end test report.
- Dedicated RouterOS lab validation and tested recurring polling Scheduler installation.
- Live bKash/Nagad provider API/webhook integration and reconciliation.
- Android Chrome cross-site session-cookie verification.
- Explicit review and approval before production merge/deployment.

All work remains on the feature branch until review and end-to-end staging tests are complete. Do not merge or deploy production or alter the live MikroTik configuration without explicit approval.
