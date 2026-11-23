# Router-initiated agent channel (staging feature)

This is the first backend layer for RouterOS integration. The router makes outbound HTTPS requests to the Worker; no inbound API/8728/8729 port is required.

## Added endpoints

- `POST /router/enroll`: one-time enrollment protected by Worker secret `ROUTER_ENROLLMENT_SECRET` (minimum 32 characters). Body: `router_key`, `router_name`, optional `routeros_version`. Returns a one-time bearer token; store it privately on the router. Re-enrollment rotates the token.
- `GET /router/poll`: authenticated router poll. Leases one queued job for 90 seconds.
- `POST /router/jobs/{id}/ack`: authenticated job acknowledgement with `status: applied|failed`.

Tokens are stored as SHA-256 hashes. Poll and acknowledgement require TLS plus the per-router bearer token. The enrollment secret and router token must never be committed to Git.

## First-time Hotspot signup provisioning

- New customer signup requires a separate Hotspot password (10–64 characters); the portal login password remains separate.
- The RouterOS username is set to the customer's mobile number. If that username is already mapped, the system uses a unique `mu<customer-id>` fallback and returns it in the customer profile.
- Hotspot passwords are encrypted with AES-256-GCM before being stored in D1. Configure Worker secret `HOTSPOT_CREDENTIAL_ENCRYPTION_KEY` as base64url for exactly 32 random bytes. Never place the key in Git or send it to the browser.
- When a router is enrolled, a `create_user` provisioning payload is queued. The Worker decrypts the password only for the authenticated router's HTTPS poll response. The RouterOS agent creates the user with the approved `Mahim-Hotspot-5M` profile and a customer-specific ownership comment.
- Provisioning is idempotent: a retry only reuses an existing username when its ownership comment matches the same portal customer. A conflicting existing username fails closed.
- After a successful RouterOS ACK, D1 marks the Hotspot account active and clears the encrypted password and IV. A failed job never grants access.
- If no router is enrolled, provisioning remains pending and is queued after a router enrolls. If the profile is missing or a username conflicts, an administrator must resolve the issue; no existing user is overwritten.

## Safety and current limits

The router makes outbound HTTPS requests only. Do not expose RouterOS API/8728 or API-SSL/8729 to the Internet. Keep the enrollment secret, router bearer token, and credential-encryption key private. Do not install the template on the live hAP ac² before a dedicated lab test and a verified backup.

## Package lifecycle wiring

- A package purchase creates a durable activation job only when the customer has a mapped `mikrotik_username` and an enrolled router exists. Otherwise the package remains pending.
- Admin mapping endpoint: `POST /admin/customers/{id}/mikrotik-username`, JSON body `{"mikrotik_username":"existing-router-login"}`. It also queues that customer's pending package orders.
- Router acknowledgement of an activation job sets the matching package order to active and starts its duration.
- Worker Cron runs every minute and queues a disable job after `expires_at`; successful router acknowledgement marks the package expired.
- Emergency approval queues a five-hour Hotspot activation when a router and existing username are mapped. Only a successful router acknowledgement records the confirmation and creates the ৳20 debt.
- The one-minute Worker Cron queues an emergency expiry job after five hours; successful acknowledgement marks the emergency access expired.
- The RouterOS template can create a new Hotspot user only for an authenticated encrypted provisioning job, and can enable/disable existing Hotspot users or PPP secrets for package lifecycle jobs.

## RouterOS template

See `routeros/mahim-ultranet-agent-template.rsc` (repository path: `worker/routeros/mahim-ultranet-agent-template.rsc`). Replace the staging Worker URL and one-time router token only after staging deployment/enrollment. It uses RouterOS JSON deserialization and HTTPS fetch. Test against a dedicated lab user first. The template intentionally does not create missing users, and a missing user/profile is reported as a failed job.

## Not ready for live customer traffic

The worker code and template are not yet deployed or validated end-to-end. No Cloudflare deployment, D1 migration, live router enrollment, or RouterOS changes have been performed. Emergency Internet queueing and five-hour expiry are implemented on this feature branch but remain untested in staging. Keep production payments and live activation workflows unchanged until staging validation is complete.
