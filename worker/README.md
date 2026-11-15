# Mahim UltraNet Worker API

This folder contains the Cloudflare Worker source for the customer portal API.

## Current stage

The Worker source now includes a read-only health endpoint, customer authentication routes (registration, login, current-session lookup, logout), an authenticated wallet balance endpoint, authenticated customer-scoped transaction history, and a public active-package catalogue. Passwords use PBKDF2-SHA-256; sessions use random bearer secrets stored only as SHA-256 hashes and are delivered in Secure, HttpOnly cookies. Registration creates a zero-balance wallet. CORS is restricted to the exact GitHub Pages origin. Wallet changes, payment approvals, package activation, admin APIs, and MikroTik commands are not implemented.

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
2. Deploy and test authentication, wallet reads, customer-isolated transaction history, and the package catalogue from the GitHub Pages origin, including cookie behavior on Android browsers and D1 wallet creation.
3. Implement payment requests and admin approval with atomic wallet ledger updates.
4. Implement package purchase with server-side price lookup and idempotency.
5. Implement the MikroTik outbound polling bridge only after command authentication, allowlisting, expiry, retry handling, and router-side verification are complete.

Authentication source is committed to the feature branch only and has not been deployed. No package or emergency session may be marked active until RouterOS execution and reporting have been tested end-to-end.
