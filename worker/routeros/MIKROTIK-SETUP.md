# MikroTik hAP ac² — secure Router Agent setup (staging first)

This guide does **not** change your router by itself. Do not paste production secrets into GitHub or chat. Use a verified RouterOS backup and a maintenance window. First test on a spare/lab router; the live hAP ac² must remain unchanged until all checks pass.

## What this does

The hAP ac² initiates HTTPS requests to the staging Worker every 30 seconds. The Worker authenticates it using a per-router bearer token. The router does not accept inbound Internet connections. Do not expose TCP 8728, 8729, WinBox 8291, or any management port to WAN.

## Prerequisites in Cloudflare staging

1. Apply D1 migrations through `0012_hotspot_provisioning.sql` to `mahim-ultranet-db-staging`.
2. Set Worker secrets:
   - `ROUTER_ENROLLMENT_SECRET`: random secret, at least 32 characters.
   - `HOTSPOT_CREDENTIAL_ENCRYPTION_KEY`: base64url of exactly 32 cryptographically random bytes.
3. Deploy the staging Worker from the feature branch only after CI passes.
4. Confirm HTTPS certificate validation succeeds from the router. Keep `check-certificate=yes`.

## Step 1 — make a backup

In WinBox Terminal:

```routeros
/system backup save name=before-ultranet-agent
/export file=before-ultranet-agent
```

Download both backup files off the router. Verify the export is readable. Do not reset the router or remove any existing users, profiles, schedulers, or Mikhmon scripts.

## Step 2 — enroll the router once

Choose a unique router key (example: `mahim-hapac2-main`). Replace `YOUR_ENROLLMENT_SECRET` locally; do not send it in chat or commit it.

```routeros
/tool fetch url="https://mahim-ultranet-api-v2-staging.mahimultranet.workers.dev/router/enroll" http-method=post http-header-field={"X-Router-Enroll-Secret: YOUR_ENROLLMENT_SECRET";"Content-Type: application/json"} http-data="{\"router_key\":\"mahim-hapac2-main\",\"router_name\":\"Mahim UltraNet hAP ac2\",\"routeros_version\":\"7.24\"}" check-certificate=yes output=user
```

The response includes `router_token`. Copy it privately once. It is only returned at enrollment and cannot be recovered later; re-enrollment rotates it. If the command errors, stop and inspect the error; do not repeatedly enroll.

## Step 3 — install and manually test the agent

1. Download `mahim-ultranet-agent-v7.rsc` from this repository and edit the `ultranetRouterToken` value locally with the one-time token.
2. Set `ultranetApiBase` to the staging URL shown in the script.
3. Upload the edited file to **Files** in WinBox.
4. Import it once from Terminal: `/import file-name=mahim-ultranet-agent-v7.rsc`.
5. The import creates a script named `MahimUltraNetAgent`. Inspect it in System → Scripts, then run one manual test: `/system script run MahimUltraNetAgent`.
6. Verify the Worker records `last_seen_at` and an empty poll returns `job: null`. Do not test account creation on a live customer.

## Step 4 — enable recurring polling only after manual test

In WinBox Terminal:

```routeros
/system scheduler add name=MahimUltraNetAgent start-time=startup interval=30s on-event="/system script run MahimUltraNetAgent" policy=read,write,test,ftp
```

Check `/system scheduler print detail` and `/log print where message~"Mahim"`. If anything is wrong, disable only this scheduler:
`/system scheduler disable [find where name="MahimUltraNetAgent"]`.

## Important current limitations

- This agent is a staging integration. The staging Worker must be deployed and its D1 migrations/secrets configured first.
- RouterOS script syntax and HTTPS header formatting must be verified on a lab hAP ac² running RouterOS 7.24 before live use.
- The required Hotspot profile `Mahim-Hotspot-5M` must exist. This guide does not create or modify profiles.
- The agent can create a Hotspot user only for a signed, queued provisioning job. It will not overwrite a username owned by another record.
- PPPoE, package expiry, emergency Internet, and existing account lifecycle actions also require end-to-end lab validation.
- Never send the enrollment secret, router token, customer passwords, backup files, or public IP/DDNS address in chat.
