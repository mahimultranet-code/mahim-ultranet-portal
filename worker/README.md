# Mahim UltraNet Worker API

Cloudflare Worker source for the Mahim UltraNet customer portal.

## Implemented in this feature branch

- GET /health checks the D1 binding.
- Customer registration, login, current-session lookup, and logout.
- PBKDF2-SHA-256 password hashing and random session tokens stored as SHA-256 hashes.
- Secure, HttpOnly session cookies; exact-origin CORS for the GitHub Pages portal.
- Authenticated wallet balance and customer-scoped transaction history.
- Public active package catalogue and authenticated package purchase using server-side pricing, an idempotency key, and a guarded wallet debit.
- Package purchase creates a pending customer order. This API does not activate a RouterOS service.
- bKash/Nagad payment request submission and customer payment history. Requests stay pending until an admin verifies them.
- One-time admin bootstrap protected by the ADMIN_SETUP_SECRET Worker secret.
- Admin dashboard, customer directory/search, payment queue with approve/reject, complaint queue/replies, and package catalogue create/update/enable/disable.
- Read-only admin package-order queue.
- Emergency Internet request submission: ৳20 for 5 hours, account age at least 3 months, and at least 10 approved successful recharges of ৳10 or more each. Admin approval records debt; it does not activate RouterOS.
- Customer password-reset requests with a generic response to avoid account enumeration; admin can set a new password, revoke existing customer sessions, and create an audit entry.
- Admin actions write audit-log entries where implemented.

## Database migrations

Apply these files to the isolated staging D1 database in this exact order:

1. `0001_initial.sql` — baseline tables, indexes, wallets, packages, sessions, payments, and requests.
2. `0002_emergency_debt.sql` — emergency debt balance and repayment ledger tables plus lookup indexes.
3. `0003_seed_packages.sql` — idempotently adds the starter Hotspot and PPPoE catalogue, including the ৳20 five-hour Hotspot package.
4. `0004_update_five_hour_package_price.sql` — safely upgrades an existing legacy five-hour Hotspot package from ৳6 to ৳20.

Take a D1 backup before applying migrations. Do not run these migrations against production as part of staging setup.

## Staging deploy prerequisites

- Worker name: mahim-ultranet-api-v2-staging
- D1 binding name: DB
- D1 database: mahim-ultranet-db-staging
- Wrangler config: this directory's wrangler.toml
- Cloudflare Builds branch: feature/secure-portal-backend
- Cloudflare Builds root directory: worker
- Deploy command (staging only): `npx wrangler d1 migrations apply mahim-ultranet-db-staging --remote && npx wrangler deploy`
- Keep ADMIN_SETUP_SECRET encrypted as a Worker secret; never paste it into chat or portal code.

## Deployment and verification

The source is not considered deployed merely because GitHub is connected. After Cloudflare Builds completes:

1. Confirm the Build root directory is `worker` and the branch is `feature/secure-portal-backend`.
2. The deploy command above applies pending migrations to the staging D1 database (`--remote`) before deploying the staging Worker. Verify the build log shows each migration succeeded.
3. Call GET /health and confirm D1 connectivity, then verify the database schema and required unique wallet transaction reference index.
4. Configure ADMIN_SETUP_SECRET securely and perform the one-time admin bootstrap.
5. Test admin login/session, customer registration/login, customer isolation, wallet reads, payment submission, approval/rejection, package purchase idempotency, complaints, package management, and package-order visibility.
6. Test emergency eligibility, duplicate pending-request prevention, admin approval/rejection, the ৳20 debt record, debt settlement from recharge, and repeated-approval protection.
7. Test password-reset request privacy, admin reset, login with the new password, and revocation of previous sessions.
8. Test cookies in Android Chrome. GitHub Pages and workers.dev are cross-site; third-party cookie restrictions may prevent sessions. A same-site custom API domain may be needed.
9. Only after all tests pass should real customer payments be accepted.

## Safety gates

- Payment submissions never credit a wallet. Only an authenticated admin approval may credit it, with a unique ledger reference and guarded balance update.
- Package purchase debits the wallet and creates a pending order. It does not activate internet access.
- The admin package-order endpoint is read-only. Do not mark an order active before RouterOS activation and verification exist.
- Emergency approval records a ৳20 debt; no RouterOS session is activated by this API.
- Password reset is administrator-managed. Communicate new passwords only through a separately verified secure channel.
- MikroTik outbound polling/command execution is not implemented. Before implementation, require command authentication, strict allowlisting, expiry, replay protection, retries, and router-side verification.
- Never expose RouterOS management ports or credentials to the public internet.

All work remains on the feature branch until end-to-end staging tests and review are complete.
