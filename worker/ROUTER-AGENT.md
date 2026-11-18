# Router-initiated agent channel (staging feature)

This is the first backend layer for RouterOS integration. The router makes outbound HTTPS requests to the Worker; no inbound API/8728/8729 port is required.

## Added endpoints

- `POST /router/enroll`: one-time enrollment protected by Worker secret `ROUTER_ENROLLMENT_SECRET` (minimum 32 characters). Body: `router_key`, `router_name`, optional `routeros_version`. Returns a one-time bearer token; store it privately on the router. Re-enrollment rotates the token.
- `GET /router/poll`: authenticated router poll. Leases one queued job for 90 seconds.
- `POST /router/jobs/{id}/ack`: authenticated job acknowledgement with `status: applied|failed`.

Tokens are stored as SHA-256 hashes. Poll and acknowledgement require TLS plus the per-router bearer token. The enrollment secret and router token must never be committed to Git.

## Safety and current limits

This commit creates the authenticated transport and durable job queue only. It does not yet create or execute customer provisioning jobs. The RouterOS script, least-privilege router permissions, package-to-job mapping, job idempotency, and end-to-end staging tests are still required. Do not deploy or enroll a live router until those pieces are completed and reviewed. Keep RouterOS API and API-SSL inaccessible from WAN; this design does not need them exposed.

## Package lifecycle wiring

- A package purchase creates a durable activation job only when the customer has a mapped `mikrotik_username` and an enrolled router exists. Otherwise the package remains pending.
- Admin mapping endpoint: `POST /admin/customers/{id}/mikrotik-username`, JSON body `{"mikrotik_username":"existing-router-login"}`. It also queues that customer's pending package orders.
- Router acknowledgement of an activation job sets the matching package order to active and starts its duration.
- Worker Cron runs every minute and queues a disable job after `expires_at`; successful router acknowledgement marks the package expired.
- Emergency approval queues a five-hour Hotspot activation when a router and existing username are mapped. Only a successful router acknowledgement records the confirmation and creates the ৳20 debt.
- The one-minute Worker Cron queues an emergency expiry job after five hours; successful acknowledgement marks the emergency access expired.
- The RouterOS template only enables/disables existing Hotspot users or PPP secrets. It never creates accounts or sets/reuses passwords.

## RouterOS template

See `routeros/mahim-ultranet-agent-template.rsc`. Replace the staging Worker URL and one-time router token only after staging deployment/enrollment. It uses RouterOS JSON deserialization and HTTPS fetch. Test against a dedicated lab user first. The template intentionally does not create missing users, and a missing user/profile is reported as a failed job.

## Not ready for live customer traffic

The worker code and template are not yet deployed or validated end-to-end. No Cloudflare deployment, D1 migration, live router enrollment, or RouterOS changes have been performed. Emergency Internet queueing and five-hour expiry are implemented on this feature branch but remain untested in staging. Keep production payments and live activation workflows unchanged until staging validation is complete.
