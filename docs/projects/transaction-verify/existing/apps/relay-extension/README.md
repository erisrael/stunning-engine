# MySeed Verify relay (Chrome and Edge extension)

A shop computer's browser as a relay. Some banks answer only inside Ethiopia. When the MySeed Verify server cannot reach one, it queues the receipt page for the organization's relays. This extension takes those jobs, opens the bank's receipt page over the computer's internet, and sends the page back tagged with its receipt number. A web page cannot do this, because the banks do not let other sites read their pages; an extension with permission for the bank's address can.

## Install

1. On the Cashier page, an admin opens "Bank checks from your shop's phones and computers" and downloads the extension (`/relay/extension.zip`), then unzips it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked** and pick the unzipped `myseed-verify-relay` folder.
3. Reload the Cashier page and choose **Use this computer**. The page pairs the extension through its bridge script; nothing is typed. For a server other than transactionverify.myseed.com.et, the page shows a relay code to paste under "Pair by hand" in the extension's popup.
4. Keep the browser open while you take payments. The extension's popup shows the receipts fetched, the last receipt number, and any error. Pause or Forget stops it; turning the relay off on the Cashier page stops it on the server.

## What it may do

| | |
|---|---|
| Bank pages | Only the bank receipt hosts listed in `host_permissions` in `manifest.json`, over https, without following redirects, at most one page a little over a second per bank, up to 4 MB |
| The server | `GET /relay/jobs` and `POST /relay/jobs/:id` with its relay code. Nothing else |
| The console page | `bridge.js` runs only on the console and answers two messages: ping (installed, paired) and pair (store a relay code). The page never gets data from the extension |
| Storage | The server address and relay code in `chrome.storage.local`, and its counters |

Add a bank's receipt host to `host_permissions` when a new provider is added (the list mirrors the hosts in `packages/provider-connectors`).

## Files

`manifest.json` (Manifest V3), `background.js` (the relay loop, restarted every 30 seconds by an alarm if the browser stopped it), `bridge.js` (pairing from the console), `popup.html`, `popup.css`, `popup.js`, `icon.png`. The server serves this folder as a zip at `/relay/extension.zip` (`apps/api/src/relay.ts`).

Tested in Microsoft Edge with the real telebirr receipt page: paired from the Cashier page, fetched the page and returned it tagged with its receipt number. Branded Chrome loads unpacked extensions from the extensions page as above; it no longer accepts the `--load-extension` command-line switch.
