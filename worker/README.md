# Mahim UltraNet Worker API

Cloudflare Worker source for the Mahim UltraNet customer portal.

## Implemented in this feature stack (review and staging verification still required)

- GET /health checks the D1 binding.
- Customer registration, login, current-session lookup, and logout.
- PBKDF2-SHA-256 password hashing and random session tokens stored as SHA-256 hashes.
- Secure, HttpOnly session cookies; exact-origin CORS for the GitHub Pages portal.
- Authenticated wallet balance and customer-scoped transaction history.
- Public active package catalogue and authenticated package purchase using server-side pricing, an idempotency key, and a guarded wallet debit.
- Package purchase creates a pending customer order. When an enrolled router and mapped existing username are available, it queues activation; router acknowledgement activates the service and starts its expiry timer.
- bKash/Nagad payment request submission and customer payment history. Requests stay pending until an admin manually verifies and approves them. There is no verified payment-provider callback integration.
- One-time admin bootstrap protected by the ADMIN_SETUP_SECRET Worker secret.
- Admin dashboard, customer directory/search, payment queue with approve/reject, complaint queue/replies, package catalogue create/update/enable/disable, and read-only package-order queue.
- Emergency Internet request submission: ৳20 for 5 hours, account age at least 3 months, and at least 10 approved successful recharges of ৳10 or more each.
- Emergency approval queues a Hotspot activation job for the enrolled router. The ৳20 debt is created only after the router reports successful activation; the request then expires five hours after that confirmation. This flow still requires staging and physical-router verification.
- Customer password-reset requests with a generic response to avoid account enumeration; admin can set a new password, revoke existing customer sessions, and create an audit entry.
- Admin actions write audit-log entries where implemented.

## RouterOS outbound agent (initial transport layer)

- Migration `0008_router_agent_queue.sql` adds router registration, a durable job queue, and router event history.
- `src/router-agent.js` adds `POST /router/enroll`, `GET /router/poll`, and `POST /router/jobs/{id}/ack`.
- Routers initiate HTTPS requests; no public inbound RouterOS API port is needed. Per-router bearer tokens are stored only as SHA-256 hashes in D1.
- Set `ROUTER_ENROLLMENT_SECRET` as a Worker secret (minimum 32 characters) before enrollment. Enrollment returns a token once; keep it private.
- Package purchases now enqueue activation jobs only when the customer already has a valid `mikrotik_username` and a router is enrolled. Router acknowledgement changes the package to active and starts its duration.
- Overlapping access is blocked for the same customer/service while a package is `pending`, `active`, or `expiring`. Hotspot emergency access and a normal Hotspot package cannot overlap, preventing one session's expiry job from disabling another session.
- A one-minute Worker Cron queues expiry jobs for active package records. Router-reported execution failures are requeued up to eight attempts; exhausted jobs remain failed for operator review.
- Admins can map an existing RouterOS login to a portal customer with `POST /admin/customers/{id}/mikrotik-username` and JSON `{ "mikrotik_username": "existing-router-login" }`. The username must already exist on the router.
- `routeros/mahim-ultranet-agent-template.rsc` is a single-run RouterOS v7 executor template for existing Hotspot users and PPP secrets. It does not enroll the router and does not install a recurring Scheduler. Configure the staging Worker URL and one-time router token only after a dedicated staging router has been enrolled.
- The router must run this script repeatedly from a RouterOS Scheduler to poll jobs; the Scheduler command and required RouterOS policy must be validated on a lab router before installation. Without that recurring poll, queued activation and expiry jobs will not execute.
- Do not enroll or connect the live router until the RouterOS executor, enrollment procedure, recurring poll schedule, credential/account mapping, retry behavior, and staging end-to-end tests are complete.

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
10. `0010_unique_mikrotik_username.sql` — prevents multiple portal customers from sharing a RouterOS username.
11. `0011_emergency_router_lifecycle.sql` — records the approving admin, router, and five-hour emergency session expiry.

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
2. Apply migrations 0001–0012 in order to staging D1 only and verify every migration in the build log.
3. Call GET /health and verify the schema, indexes, and migration state.
4. Configure ADMIN_SETUP_SECRET securely and perform the one-time admin bootstrap.
5. Test customer registration/login/logout, session expiry, customer isolation, and Android Chrome cookie behavior.
6. Test wallet reads, recharge submission, minimum ৳10 enforcement, duplicate Transaction ID rejection, admin approval/rejection, debt settlement, and exactly-once wallet credit.
7. Test package catalogue separation, Hotspot and PPPoE package selection, wallet purchase idempotency, insufficient balance, and pending-order visibility.
8. Test emergency eligibility, duplicate-request prevention, queued Hotspot activation, debt creation only after router acknowledgement, five-hour expiry, and repayment from later recharge.
9. Test complaints, admin replies, password-reset privacy, password reset, and revocation of prior sessions.
10. Review admin audit logs and error handling; run the full automated test suite against a disposable local database before staging.
11. Enroll only a dedicated staging router; test token rotation, HTTPS polling, activation of an existing Hotspot user and PPP secret, failed-job retry, expiry queueing, and exact package status transitions.

## Not implemented — release blockers

- Live MikroTik/RouterOS rollout and end-to-end validation for Hotspot and PPPoE. The outbound transport, package queue, and RouterOS template exist on a feature branch only.
- Live emergency RouterOS activation/expiry is wired into the queue, but it still needs staging and RouterOS lab validation.
- Lab verification of RouterOS script execution, router profile prerequisites, recurring Scheduler installation/polling, acknowledgement retries, and package expiry.
- Verified bKash/Nagad provider API or webhook reconciliation; payment approval is manual.
- End-to-end Android Chrome verification of cross-site session cookies.
- Full automated Worker + D1 integration test suite and verified staging test report.
- Router enrollment helper and a tested, least-privilege recurring RouterOS Scheduler installation procedure.

Do not advertise automatic Internet activation or accept real customer payments until the relevant integrations and end-to-end staging tests are implemented and verified.

## Safety gates

- Payment submissions never credit a wallet. Only an authenticated admin approval may credit it, with guarded status transitions and unique ledger references.
- Package purchase debits the wallet and creates a pending order; when a router and username are mapped it also queues an activation job. Internet access is not considered active until the enrolled router executes and acknowledges that job.
- The admin package-order endpoint is read-only. Do not mark an order active before RouterOS activation and verification exist.
- Emergency approval alone creates no debt. The current queue flow creates the ৳20 debt only after an authenticated router acknowledges successful activation; verify this behavior against staging D1 and a lab router before real use.
- Existing debts created by earlier code are not automatically reversed; reconcile them case by case.
- Before RouterOS integration, require authenticated outbound commands, strict username/profile allowlists, least-privilege credentials, bounded timeouts, retries, replay protection, expiry enforcement, and router-side verification.
- Never expose RouterOS management ports or credentials to the public internet.

All work remains on feature branches until review and end-to-end staging tests are complete. Do not merge or deploy without explicit approval.


## Captive Portal signup provisioning

New Hotspot signup requires a separate Wi-Fi password. The Worker encrypts it using AES-256-GCM and queues a create-user job for an enrolled RouterOS agent. Set `HOTSPOT_CREDENTIAL_ENCRYPTION_KEY` as a base64url-encoded 32-byte secret in the staging Worker. The password is decrypted only for the authenticated router poll response and erased from D1 after successful RouterOS acknowledgement. Apply migration `0012_hotspot_provisioning.sql` before testing. This is not live-ready until tested on a lab router.
