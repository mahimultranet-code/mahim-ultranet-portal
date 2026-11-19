# RouterOS Hotspot captive page setup (LAB ONLY)

This folder contains a login-page template. It is not installed on the live hAP ac².

## Important limits

- The captive page supports existing RouterOS Hotspot username/password authentication using the standard RouterOS `md5.js` CHAP helper.
- The sign-up/sign-in link opens the existing Mahim UltraNet customer portal.
- Portal account credentials are not RouterOS Hotspot credentials. Registering or logging in to the portal does not create a Hotspot user, change a Hotspot password, or grant Internet access.
- Do not expose RouterOS API ports 8728/8729 to the WAN.
- Do not copy this template to the live router until it has been tested with a backup and a dedicated lab Hotspot user.

## Exact unauthenticated portal hosts

The customer portal currently loads from GitHub Pages and calls the staging Worker API. If testing this template on a dedicated lab Hotspot, allow only these hosts in the Hotspot Walled Garden:

```routeros
/ip hotspot walled-garden
add action=allow dst-host=mahimultranet-code.github.io comment="Mahim UltraNet customer portal"
/ip hotspot walled-garden
add action=allow dst-host=mahim-ultranet-api-v2-staging.mahimultranet.workers.dev comment="Mahim UltraNet staging API"
```

Do not allow `github.com`, all of `github.io`, all of `workers.dev`, or arbitrary HTTPS destinations before authentication. APK downloads should happen after customer authentication.

## Lab install checklist

1. Make a fresh RouterOS backup and export; confirm both files are retrievable.
2. Create a dedicated test Hotspot user and test profile. Do not reuse a paying customer's account.
3. Copy the contents of this folder into a separate copy of the Hotspot HTML directory; preserve the existing live files.
4. Confirm the RouterOS-provided `md5.js` is present beside `login.html`.
5. Configure the two exact Walled Garden hosts above on the lab Hotspot.
6. Connect an Android phone and verify captive detection, portal loading, portal sign-up/login, existing Hotspot CHAP login, logout, and redirect behavior.
7. Confirm that the customer portal account does not accidentally bypass Hotspot authentication.
8. Remove the lab configuration after testing unless separately approved for rollout.

## Still required for true first-time Wi-Fi onboarding

A secure account-to-RouterOS provisioning flow is not yet implemented. It needs a deliberate credential lifecycle, RouterOS user creation job, idempotent acknowledgements, and physical-router tests. Until that is delivered, a newly registered portal customer must be linked to a valid RouterOS Hotspot user by an administrator before Internet access can be activated.
