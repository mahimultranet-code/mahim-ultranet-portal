# Mahim UltraNet Worker API

This folder contains the Cloudflare Worker source for the customer portal API.

## Current stage

The Worker source now includes a read-only health endpoint, customer authentication routes (registration, login, current-session lookup, logout), an authenticated wallet balance endpoint, authenticated customer-scoped wallet transaction history, a public active-package catalogue, and authenticated payment submission/history endpoints. Payment submissions are always pending and do not credit a wallet. Passwords use PBKDF2-SHA-256; sessions use random bearer secrets stored only as SHA-256 hashes and are delivered in Secure, HttpOnly cookies. Registration creates a zero-balance wallet. CORS is restricted to the exact GitHub Pages origin. Wallet balance changes are currently limited to the admin payment-approval flow. Admins can list payment requests and approve/reject pending requests. Approval uses a D1 batch, a unique ledger reference, and a guarded balance update to prevent duplicate credits. Package purchase/activation, broader admin dashboard APIs, and MikroTik commands are not implemented.

## Deploy prerequisites

- Cloudflare Worker: `mahim-ultranet-api-v2`
- Existing D1 binding name: `DB`
- Existing D1 database: `mahim-ultranet-db`
- Keep the existing `ADMIN_SETUP_SECRET` secret private.
- Do not enable RouterOS API-SSL or expose router management ports.

## Health check

After deploying this source to the existing Worker, request:

`GET /health`

A healthy response includes `ok: true` and a successful D1 connectivity check. Until this source is deployed, the current `Hello World!` response is not proof that the API is live.

## Next implementation gates

1. Verify health and D1 connectivity on the deployed Worker.
2. Deploy and test authentication, wallet reads, customer-isolated histories, package catalogue, pending payment submissions, and admin approval/rejection from the GitHub Pages origin. Verify D1 batch semantics and duplicate-approval behavior before accepting real payments.
3. Implement payment requests and admin approval with atomic wallet ledger updates.
4. Implement package purchase with server-side price lookup and idempotency.
5. Implement the MikroTik outbound polling bridge only after command authentication, allowlisting, expiry, retry handling, and router-side verification are complete.

Authentication source is committed to the feature branch only and has not been deployed. No package or emergency session may be marked active until RouterOS execution and reporting have been tested end-to-end.
