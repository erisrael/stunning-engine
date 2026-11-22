# MySeed Shop (Android)

The MySeed Shop app (`/shop`) and every store page (`/store/<id>`) in a native Android shell built with Capacitor. It loads the live site from `https://transactionverify.myseed.com.et/shop`, so it updates with every deploy and needs no app-store release for web changes.

What the app gives a shopper over the browser:

- An icon on the home screen and a full-screen app, opening on the shop.
- Store, item, shop and order-tracking links (`/store/...`, `/shop...`, `/track/...`) open in the app.
- The shopper stays signed in (the `tv_shop` cookie lives in the app's WebView).

Everything else is the web app: home, stores, search and filters, recently viewed, buy again, followed stores, cart, checkout, orders, bids, vouchers and memberships. See `docs/storefront-marketplace.md` and `docs/storefront-benchmark.md`.

## Sign-in inside the app

Phone or email with a password works as on the web. **Continue with Google is hidden in the app**: Google refuses sign-in from embedded WebViews. Telegram sign-in works inside a store's Telegram Mini App, not here.

## Payments

The payment page is on our own host. Pay with Chapa goes to `checkout.chapa.co` (allowed in `server.allowNavigation`) and comes back to our host. Any other address opens in the phone's browser.

## Build

This folder is not an npm workspace, so the server build never installs it.

Needs: Node 24, the Android SDK (platform 36, build-tools 35 or newer) and a JDK.

```
cd apps/shop-android
npm install
npx cap sync android
cd android
gradlew assembleDebug          # android/app/build/outputs/apk/debug/app-debug.apk
```

The Gradle wrapper and its notes are the same as the cashier app's (`apps/cashier-android/README.md`): Gradle 9.5.0, `JAVA_HOME` set to the JDK, and `sdk.dir` in `android/local.properties` (not committed).

A release build (`gradlew bundleRelease`) needs a signing key; keep the keystore and its passwords out of the repository.

## Opening links in the app without asking (App Links)

The manifest asks Android to verify the links (`autoVerify`). Until the server proves the app is ours, Android offers MySeed Shop in its "Open with" choice instead of opening it directly. To verify:

1. Get the SHA-256 fingerprint of the release signing key: `keytool -list -v -keystore <keystore> -alias <alias>`.
2. Serve this at `https://transactionverify.myseed.com.et/.well-known/assetlinks.json` (content type `application/json`):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "et.com.myseed.shop", "sha256_cert_fingerprints": ["AA:BB:..."] }
}]
```

## Configuration

`capacitor.config.json`:

- `server.url`: the shop's address. Change it for a different deployment, then run `npx cap sync android`, and change `HOST` in `MainActivity.java` and the hosts in `AndroidManifest.xml`.
- `server.allowNavigation`: our host and Chapa's checkout.
- `errorPath`: `www/offline.html`, shown when the server cannot be reached.

Debug builds also allow plain http to 10.0.2.2 and localhost, for testing against a local server from the emulator (`android/app/src/debug/`); release builds allow https only.

The web side detects the app with `isNativeApp()` (`apps/web/src/lib/native.ts`), adds `html.native-app`, and keeps the search bar below the status bar (`.shop-header` in `apps/web/src/styles.css`).
