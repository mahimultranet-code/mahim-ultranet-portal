# Mahim UltraNet Worker API

Cloudflare Worker source for the Mahim UltraNet customer portal.

## Implemented in this feature stack (review and staging verification still required)

- GET /health checks the D1 binding.
- Customer registration, login, current-session lookup, and logout.
- PBKDF2-SHA-256 password hashing and random session tokens stored as SHA-256 hashes.
- Secure, HttpOnly session cookies; exact-origin CORS for the GitHub Pages portal.
- Authenticated wallet balance and customer-scoped transaction history.
- Public active package catalogue and authenticated package purchase using server-side pricing, an idempotency key, and a guarded wallet debit.
- Package purchase creates a pending customer order. It does not activate a RouterOS service or start an expiry timer.
- bKash/Nagad payment request submission and customer payment history. Requests stay pending until an admin manually verifies and approves them. There is no verified payment-provider callback integration.
- One-time admin bootstrap protected by the ADMIN_SETUP_SECRET Worker secret.
- Admin dashboard, customer directory/search, payment queue with approve/reject, complaint queue/replies, package catalogue create/update/enable/disable, and read-only package-order queue.
- Emergency Internet request submission: ৳20 for 5 hours, account age at least 3 months, and at least 10 approved successful recharges of ৳10 or more each.
- Emergency approval does not create debt. A separate admin confirmation records that RouterOS was manually activated; only then is the ৳20 debt created exactly once. This is an administrative assertion, not automatic RouterOS verification.
- Customer password-reset requests with a generic response to avoid account enumeration; admin can set a new password, revoke existing customer sessions, and create an audit entry.
- Admin actions write audit-log entries where implemented.

## RouterOS outbound agent (initial transport layer)

- Migration `0008_router_agent_queue.sql` adds router registration, a durable job queue, and router event history.
- `src/router-agent.js` adds `POST /router/enroll`, `GET /router/poll`, and `POST /router/jobs/{id}/ack`.
- Routers initiate HTTPS requests; no public inbound RouterOS API port is needed. Per-router bearer tokens are stored only as SHA-256 hashes in D1.
- Set `ROUTER_ENROLLMENT_SECRET` as a Worker secret (minimum 32 characters) before enrollment. Enrollment returns a token once; keep it private.
- Package purchases now enqueue activation jobs only when the customer already has a valid `mikrotik_username` and a router is enrolled. Router acknowledgement changes the package to active and starts its duration.
- A one-minute Worker Cron queues expiry jobs for active package records. The RouterOS-side command executor is not yet implemented or tested, so these jobs must not be treated as live service activation/deactivation.
- Do not enroll or connect the live router until the RouterOS executor, credential/account mapping, retry behavior, and staging end-to-end tests are complete.

## Database migrations

Apply these files to the isolated staging D1 database in this exact order:

1. `0001_initial.sql` — baseline tables, indexes, wallets, packages, sessions, payments, and requests.
2. `0002_emergency_debt.sql` — emergency debt balance and repayment ledger tables plus lookup indexes.
3. `0003_seed_packages.sql` — idempotently adds the starter Hotspot and PPPoE catalogue, including the ৳20 five-hour Hotspot package.
4. `0004_update_five_hour_package_price.sql` — safely upgrades an existing legacy five-hour Hotspot package from ৳6 to ৳20.
5. `0005_disable_emergency_catalogue_package.sql` — removes the emergency-only offer from the normal package catalogue.
6. `0006_enforce_minimum_recharge.sql` — database-level guard rejects payment requests below ৳10.
7. `0007_emergency_activation_confirmation.sql` — records admin confirmation before emergency debt is created.
8. `0008_router_agent_queue.sql` — adds authenticated router registration, durable provisioning jobs, and event history.
9. `0009_package_router_lifecycle.sql` — binds purchased package records to the router that accepted activation and indexes expiries.

Take a D1 backup before applying migrations. Do not run these migrations against production as part of staging setup.

## Staging deploy prerequisites

- Worker name: mahim-ultranet-api-v2-staging
- D1 binding name: DB
- D1 database: mahim-ultranet-db-staging
- Wrangler config: this directory's wrangler.toml
- Keep ADMIN_SETUP_SECRET encrypted as a Worker secret; never paste it into chat or portal code.
- The customer app currently uses a GitHub Pages origin and a workers.dev API origin. Android Chrome third-party-cookie restrictions must be tested; a same-site custom API domain may be required.

## Required verification before accepting real payments

1. Confirm the staging Worker and D1 are separate from production; back up staging D1 before migrations.
2. Apply migrations 0001–0008 in order to staging D1 only and verify every migration in the build log.
3. Call GET /health and verify the schema, indexes, and migration state.
4. Configure ADMIN_SETUP_SECRET securely and perform the one-time admin bootstrap.
5. Test customer registration/login/logout, session expiry, customer isolation, and Android Chrome cookie behavior.
6. Test wallet reads, recharge submission, minimum ৳10 enforcement, duplicate Transaction ID rejection, admin approval/rejection, debt settlement, and exactly-once wallet credit.
7. Test package catalogue separation, Hotspot and PPPoE package selection, wallet purchase idempotency, insufficient balance, and pending-order visibility.
8. Test emergency eligibility, duplicate-request prevention, approval without debt, manual activation confirmation, exactly-once ৳20 debt creation, and repayment from later recharge.
9. Test complaints, admin replies, password-reset privacy, password reset, and revocation of prior sessions.
10. Review admin audit logs and error handling; run the full automated test suite against a disposable local database before staging.

## Not implemented — release blockers

- MikroTik/RouterOS API integration for Hotspot and PPPoE provisioning.
- Automatic 5-hour emergency session expiry and regular package expiry/renewal.
- Router-side confirmation or polling; emergency activation is currently confirmed manually by an admin.
- Verified bKash/Nagad provider API or webhook reconciliation; payment approval is manual.
- End-to-end Android Chrome verification of cross-site session cookies.
- Full automated Worker + D1 integration test suite and verified staging test report.

Do not advertise automatic Internet activation or accept real customer payments until the relevant integrations and end-to-end staging tests are implemented and verified.

## Safety gates

- Payment submissions never credit a wallet. Only an authenticated admin approval may credit it, with guarded status transitions and unique ledger references.
- Package purchase debits the wallet and creates a pending order. It does not activate Internet access.
- The admin package-order endpoint is read-only. Do not mark an order active before RouterOS activation and verification exist.
- Emergency approval alone creates no debt. The admin must manually verify actual RouterOS activation before using the confirmation endpoint; that endpoint creates the ৳20 debt.
- Existing debts created by earlier code are not automatically reversed; reconcile them case by case.
- Before RouterOS integration, require authenticated outbound commands, strict username/profile allowlists, least-privilege credentials, bounded timeouts, retries, replay protection, expiry enforcement, and router-side verification.
- Never expose RouterOS management ports or credentials to the public internet.

All work remains on feature branches until review and end-to-end staging tests are complete. Do not merge or deploy without explicit approval.
