# @myseed-verify/react-native

React Native adapter for MySeed Verify. A payer picks a receipt from the gallery or camera, or scans its QR code, and the app follows the check to its result. A check survives the app being closed.

```sh
npm install @myseed-verify/react-native expo-crypto @react-native-async-storage/async-storage
```

Your app gets the payment request ID and the scoped submission token from your own server, which holds the server key. Never put a server key in an app.

```js
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createMobileClient, PendingChecks, permissionText, submitPickedReceipt, submitScannedCode } from "@myseed-verify/react-native";

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const client = createMobileClient({
  requestId, token, baseUrl: "https://verify.myseed.com.et",
  randomId: Crypto.randomUUID,
  sha256: async (blob) => toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(await blob.arrayBuffer()))),
});
const pending = new PendingChecks(AsyncStorage);

// On start and when the app returns to the foreground:
const resumed = await pending.resume(client);

// Gallery or camera:
const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
if (!pick.canceled) {
  const result = await pending.track(client, await submitPickedReceipt(client, pick.assets[0]));
}

// QR scanner (expo-camera onBarcodeScanned):
const result = await pending.track(client, await submitScannedCode(client, data));
```

- **Permissions:** asking for the camera and photos stays with your app. When one is refused, `permissionText("camera", "blocked")` gives the words to show, and the payer can paste the receipt link instead.
- **What it stores:** `PendingChecks` keeps only IDs. It never stores the token or the receipt.
- **Testing:** before a release, test on real Android and iOS phones:
  - leaving the app while a check is running
  - refusing the camera
  - large PDF receipts
  - an expired token, renewed through `onTokenExpired`
