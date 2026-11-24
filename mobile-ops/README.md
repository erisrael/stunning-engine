# Myseed Ops for Android

The whole Ops app (`https://ops.myseed.com.et`) as an Android app (Capacitor 7). The pages come from the live
site, so every deploy reaches the app at once; a new APK is only needed when this folder changes.

What the app adds to the website:

- Its own icon and launch screen (the Myseed mark), full screen without a browser bar, any orientation.
- Camera, microphone and location when a page asks (QR check-in, calls, voice messages, the check-in area).
- Downloads: files the server sends go to Downloads with the person's sign-in; files a page makes itself (Excel, CSV,
  PDF exports) come through `MyseedAndroid.save` (`src/components/app/android-bridge.tsx`).
- Back button goes back a page; links to other sites open in the browser; the sign-in is kept between launches.
- The site sees `MyseedOpsAndroid/<version>` in the user agent and hides its own Install card.

## Build

Needs JDK 21 (Gradle 8.11 does not run on newer JDKs) and the Android SDK (`%LOCALAPPDATA%\Android\Sdk`).

```sh
cd mobile-ops
npm install
JAVA_HOME=~/.jdks/jdk-21... ANDROID_HOME=$LOCALAPPDATA/Android/Sdk npm run apk
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk` (copied to `dist/` as `MyseedOps-<version>-debug.apk`).
Raise `versionCode` and `versionName` in `android/app/build.gradle` for each new APK. A Play Store build needs a
release keystore (`gradlew bundleRelease` with signing set up); keep the keystore out of the repository.

Icons: `android/app/src/main/res/mipmap-*` were drawn from `public/brand/myseed-logo.svg`.
