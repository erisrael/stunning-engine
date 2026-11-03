# The app shell (Phase 5b): Myseed on Android and iPhone

The installed app is a thin shell around the live site. Every web update reaches it with no store release, and nothing is built twice.

## What already works, with no store app

You can use all of this today; the native shell adds to it.

- **Install:** Add to Home Screen on Android and iPhone, or Install in Chrome and Edge on a computer. This uses `public/manifest.webmanifest`.
- **Shortcuts:** a long press on the icon offers Check in, Chat, Email and Announcements.
- **Offline screen:** when there is no network, an offline page shows in English and Amharic instead of the browser's error. It reconnects by itself.
  - Only that page is kept offline, so people always see current data.
  - The code is `public/sw.js` and `public/offline.html`.
- **App badge:** the icon shows the number of unread notifications and chat messages, on systems that support badges (Android Chrome, installed apps on Windows and macOS, iOS 16.4 and later).
- **Notifications:**
  - Web push, including incoming calls, which stay on screen with Answer and Decline.
  - Tapping a notification opens the right page.
- **Deep links:** links in emails and notifications open the right page in the installed app.

## The native shell (to build on a machine with Android Studio and Xcode)

`capacitor.config.json` is ready:

- **App ID:** `et.myseed.app`.
- **Live site:** the shell loads `https://app.myseed.com.et`. Change it to the real address.
- **Offline:** the same offline page shows when the site cannot be reached.

### Android first

1. Install Android Studio (with an SDK and an emulator) and Node 20 or later.
2. In the project, add Capacitor, then generate the Android project:
   - `npm i @capacitor/core @capacitor/android @capacitor/push-notifications`
   - `npm i -D @capacitor/cli`
   - `npx cap add android`
3. Set up Firebase Cloud Messaging (free):
   - Create a Firebase project and add an Android app with the ID `et.myseed.app`.
   - Put `google-services.json` in `android/app/`.
4. Ringing calls:
   - Add a small plugin that registers the device's FCM token with `/api/calls/devices`.
   - On a data message of type `call`, show a full-screen incoming call over the lock screen through Android's self-managed `ConnectionService`.
   - Accept and Decline post to `/api/calls` as the browser does today.
   - This plugin is native code (Kotlin) and is the main work of this step.
5. Build an APK:
   - `npx cap open android`, then Build, Generate signed bundle or APK.
   - Share the APK with staff, or publish on Google Play (a one-time USD 25).

### iPhone

1. You need a Mac with Xcode and an Apple Developer account (USD 99 a year).
2. Set it up:
   - `npm i @capacitor/ios`
   - `npx cap add ios`
   - Enable Push Notifications and Background Modes, Voice over IP.
3. Call ringing needs PushKit (VoIP push) and CallKit, which is again a small native plugin.
4. Distribute through TestFlight, then the App Store.

### What the server needs for native call pushes

- A table of device tokens per person, kind `fcm` or `apns-voip`.
- On an incoming call, the server sends FCM and APNs messages next to the web push it sends today, from `src/server/push.ts`.
- The FCM server key and the APNs key are kept sealed in Admin, Integrations.

## Order

The web parts above are done.

For the native step:
1. Android shell with FCM and the full-screen call.
2. iPhone shell with PushKit and CallKit.
3. Device tokens and native call pushes on the server.

Each part can be tested on one phone before it is shared.
