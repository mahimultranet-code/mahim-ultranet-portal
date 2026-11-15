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
- One-time admin bootstrap protected by the existing ADMIN_SETUP_SECRET Worker secret.
- Admin dashboard, customer directory/search, payment queue with approve/reject, complaint queue/replies, and package catalogue create/update/enable/disable.
- Read-only admin package-order queue at GET /admin/package-orders?status=pending. Supported status filters: pending, active, expired, and rejected.
- Admin actions write audit-log entries where implemented.

## Deploy prerequisites

- Existing Worker: mahim-ultranet-api-v2
- D1 binding name: DB
- Existing D1 database: mahim-ultranet-db
- Existing secret: ADMIN_SETUP_SECRET (keep private; never paste it into chat or the portal).
- Keep RouterOS management ports private. Do not enable public RouterOS API-SSL.

## Deployment and verification

The source in this repository is not automatically deployed to Cloudflare. The live Worker previously returned Hello World!; that response is not evidence that this API has been deployed.

After deploying the feature-branch Worker source manually:

1. Call GET /health and confirm D1 connectivity.
2. Confirm the database schema and required unique wallet transaction reference index.
3. Perform the one-time admin bootstrap securely, using the Worker secret without exposing it.
4. Test admin login/session, customer registration/login, customer isolation, wallet reads, payment submission, approval/rejection, package purchase idempotency, complaints, package management, and package-order visibility.
5. Test cookies in Android Chrome. GitHub Pages and workers.dev are cross-site; third-party cookie restrictions may prevent sessions. A same-site custom API domain may be needed.
6. Only after all tests pass should real customer payments be accepted.

## Safety gates

- Payment submissions never credit a wallet. Only an authenticated admin approval may credit it, with a unique ledger reference and guarded balance update.
- Package purchase debits the wallet and creates a pending order. It does not activate internet access.
- The admin package-order endpoint is read-only. No manual action in the portal may mark an order active before RouterOS activation and verification exist.
- Emergency Internet/debt accounting is not implemented. The approved product fee is ৳20 for a 30-minute emergency session; do not activate or collect this fee until the debt ledger, eligibility checks (5 successful recharges), and next-recharge debt deduction are implemented and tested.
- MikroTik outbound polling/command execution is not implemented. Before implementation, require command authentication, strict allowlisting, expiry, replay protection, retries, and router-side verification.
- Never expose RouterOS management ports or credentials to the public internet.

All work remains on the feature branch until end-to-end testing and review are complete.
