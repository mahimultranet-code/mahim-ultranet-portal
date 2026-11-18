# Router-initiated agent channel (staging feature)

This is the first backend layer for RouterOS integration. The router makes outbound HTTPS requests to the Worker; no inbound API/8728/8729 port is required.

## Added endpoints

- `POST /router/enroll`: one-time enrollment protected by Worker secret `ROUTER_ENROLLMENT_SECRET` (minimum 32 characters). Body: `router_key`, `router_name`, optional `routeros_version`. Returns a one-time bearer token; store it privately on the router. Re-enrollment rotates the token.
- `GET /router/poll`: authenticated router poll. Leases one queued job for 90 seconds.
- `POST /router/jobs/{id}/ack`: authenticated job acknowledgement with `status: applied|failed`.

Tokens are stored as SHA-256 hashes. Poll and acknowledgement require TLS plus the per-router bearer token. The enrollment secret and router token must never be committed to Git.

## Safety and current limits

This commit creates the authenticated transport and durable job queue only. It does not yet create or execute customer provisioning jobs. The RouterOS script, least-privilege router permissions, package-to-job mapping, job idempotency, and end-to-end staging tests are still required. Do not deploy or enroll a live router until those pieces are completed and reviewed. Keep RouterOS API and API-SSL inaccessible from WAN; this design does not need them exposed.
