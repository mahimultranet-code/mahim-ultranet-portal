# Mahim UltraNet Worker API

This folder contains the Cloudflare Worker source for the customer portal API.

## Current stage

Only the read-only health endpoint is implemented in this first commit. It does not authenticate customers, change wallet balances, approve payments, or issue MikroTik commands.

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
2. Implement customer registration/login, password hashing, session expiry, rate limiting, and customer-isolated reads.
3. Implement payment requests and admin approval with atomic wallet ledger updates.
4. Implement package purchase with server-side price lookup and idempotency.
5. Implement the MikroTik outbound polling bridge only after command authentication, allowlisting, expiry, retry handling, and router-side verification are complete.

No package or emergency session may be marked active until RouterOS execution and reporting have been tested end-to-end.
