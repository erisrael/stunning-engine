# Cashier phone app (Android)

The cashier page (`/app/cashier`) in a native Android shell built with Capacitor. It loads the live console from `https://transactionverify.myseed.com.et/app/cashier`, so it updates with every deploy and needs no app-store release for web changes.

What the shell adds over the browser: the phone can be its organization's **phone relay**. Some banks' receipt pages answer only from inside Ethiopia (telebirr only on Ethiopian networks), and a browser cannot read another site's page. When the server cannot reach a bank, it hands the receipt address to the organization's relays; the phone opens the page over its own connection, Wi-Fi or mobile data, and sends it back tagged with its receipt number. The server reads it as usual.

## Permissions

The app asks for what it needs at first start, and the Cashier page lists anything still missing with an Allow button.

| Permission | Why | Asked |
|---|---|---|
| Camera | Scanning payment QR codes and photographing receipts | At first start |
| Notifications (Android 13+) | Payments, and the relay's ongoing "Checking bank receipts" notification | At first start |
| Run without battery restrictions | Bank checks continue with the screen off | When the phone becomes a relay, and from the Cashier page |
| Internet, network state, change network | Loading the console; telling Wi-Fi from mobile data; switching a check to mobile data | Granted at install |
| Foreground service, wake lock | The relay runs as a foreground service while the phone is a relay | Granted at install |
| Vibrate | A short buzz when a payment is confirmed | Granted at install |

A permission refused for good is changed in Android settings; the Cashier page opens the app's settings page when Allow cannot ask again.

## How a phone becomes a relay

1. Install the APK (version 1.1 or later) on the counter phone and sign in.
2. An admin opens Cashier and taps **Use this phone**. The app asks for any missing permission, the server makes a relay for this organization only and returns its token once, and the app stores it in native storage (never in the browser). Android then asks to let the app run without battery restrictions: allow it.
3. The relay runs in the app's own service (`RelayService`), also with the screen off or the app in the background, and shows an ongoing notification such as "12 checked. Last: DKD25KI0AE over mobile data". It starts again whenever the app opens.
4. For each job it reads the receipt number from the address (`.../receipt/DKD25KI0AE`), fetches the page over the current network and, if that network cannot reach the bank (a Wi-Fi without access, for example), tries again over mobile data. It posts the page back with the receipt number and the network used. The server refuses a page tagged with another receipt number.
5. To stop, tap **Stop on this phone**, or turn the relay off from the list on the Cashier page on any device. The token stops working at once.

A phone relay takes only its own organization's lookups (migration 053). Keep the phone plugged in; it fetches at most one page a little over a second per bank, and only public https addresses, without following redirects.

Older apps (1.0) still work as relays, but only while the app is open, and the Cashier page says so.

The same can be done from a shop computer with the relay extension for Chrome and Edge: see `apps/relay-extension/README.md`.

## Build

This folder is not an npm workspace, so the server build never installs it.

Needs: Node 24, the Android SDK (platform 36, build-tools 35 or newer) and a JDK.

```
cd apps/cashier-android
npm install
npx cap sync android
cd android
gradlew assembleDebug          # android/app/build/outputs/apk/debug/app-debug.apk
```

Notes for this machine:

- Capacitor 8 generates a Gradle 8.14 wrapper, which cannot run on JDK 25. The wrapper here is set to Gradle 9.5.0. Gradle 9.6 removed an internal API that the Android Gradle plugin 8.x uses, so do not move past 9.5 until the plugin is updated.
- Set `JAVA_HOME` to the JDK, and put `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` in `android/local.properties` (not committed).

A release build (`gradlew bundleRelease` or `assembleRelease`) needs a signing key; keep the keystore and its passwords out of the repository.

## Configuration

`capacitor.config.json`:

- `server.url`: the console address. Change it for a different deployment, then run `npx cap sync android`.
- `server.allowNavigation`: only the console's own host.
- `errorPath`: `www/offline.html`, shown when the server cannot be reached.
- `CapacitorHttp.enabled: false`: the console's own requests keep using the WebView (and its cookies); only the relay calls native HTTP directly.

The native side is `RelayService.java` (the relay) and `CashierDevicePlugin.java` (permissions, battery, network, starting and stopping the relay) in `android/app/src/main/java/et/com/myseed/verify/cashier/`. The web side is `apps/web/src/lib/native.ts` (it uses the native relay when the app has it, and runs the old in-page loop otherwise) and the PhoneRelayCard on `apps/web/src/pages/cashier.tsx`. Debug builds also allow plain http to 10.0.2.2 and localhost, for testing against a local server from the emulator (`android/app/src/debug/`); release builds allow https only. The server side is `/cashier/phone-relays` in `apps/api/src/console/commerce.ts` and the organization filter on `/relay/jobs` in `apps/api/src/relay.ts`.

## If the app shows a white screen

The app loads the console from the server, so most start-up problems are on the web side. These guards prevent a blank screen:

- **Older WebViews.** The web app is built for Chrome 87 and Safari 15 (`apps/web/build.mjs`), so Android System WebView 87 or newer reads it. Before that, it targeted newer browsers, and an older WebView failed to parse it and stayed white.
- **A boot screen.** `apps/web/public/boot.js` is a small ES5 script that runs before the app. It shows "Loading". After 20 seconds it shows "Still loading" with a Retry button. If the app's code fails to load or parse, it shows the reason. For a WebView that is too old, it asks the user to update "Android System WebView" from the Play Store.
- **Smaller download.** The Creative Studio (three.js and the sound engine) is a separate chunk, loaded only when opened. The main bundle the phone downloads went from about 1.5 MB to 1 MB.
- **Status bar.** The app draws edge to edge. In the app (`html.native-app`), the header and the bottom tab bar are padded by the system bar insets, so the page is not hidden under the status bar.
- **Icons and splash.** These are vector drawables (`res/drawable/ic_launcher_foreground.xml`, `splash_icon.xml`) made from `icon.svg`, so there are no missing PNG sizes.

The web changes reach the phones when the server is deployed; the APK itself does not need rebuilding for them. To see what a phone shows, connect it with USB debugging and open `chrome://inspect` on a computer.
