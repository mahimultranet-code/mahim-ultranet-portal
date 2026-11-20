# Mahim UltraNet Android wrapper

This is a minimal Android WebView shell for the existing customer portal. It contains no router credentials or payment secrets. It loads the HTTPS customer portal and opens external links in the browser.

## Build

GitHub Actions builds an installable debug APK and stores it as the `MahimUltraNet-Android-APK` workflow artifact. To publish a downloadable GitHub Release APK, push a version tag such as `android-v1.0.0`.

The first APK is debug-signed, not Play Store production-signed. A private release keystore and protected GitHub Actions secrets are required before publishing a production-signed APK.

## Current limitation

The app is a WebView wrapper, not a native offline-first application. Customer registration/login uses the existing portal API. Android WebView third-party cookie behavior must be tested against the staging Worker before live rollout.
