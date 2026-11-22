# Progressive web apps

The hosted submission page, the cashier app and the console are progressive web apps built from `packages/ui`. They install on phones and desktops and survive a dropped connection without losing the user's place. They never keep receipts, tokens or account numbers in a cache. Verification always happens on the server.

## Surfaces

| Surface | App | Install | Offline and resume | Phase |
|---|---|---|---|---|
| Hosted submission | `apps/hosted` | Light: no install prompt, opened from a link | Code is cached. Status resumes from the request link. An offline page explains what to do. | 2 |
| Staff console | `apps/console` | Installable, standalone | Network first. Push shows review queue counts. Locks after idle time. | 3 |
| Cashier | `apps/cashier` | Installable, standalone, portrait | Camera QR scan. Items captured offline are marked "Not sent". Resume a pending check by bill number. | 4 |
| Developer console | `apps/console` | Same install as the staff console | No secrets cached. Keys are revealed once. | 4 |

## Caching rules

The service worker caches code, never payment data.

| Content | Strategy | Cached |
|---|---|---|
| App shell, JS, CSS, fonts, icons | Precache with versioned names | Yes |
| Message catalogs (en, am) | Stale while revalidate | Yes |
| Tenant theme and manifest | Network first, cache fallback | Yes |
| API calls (requests, status, submissions) | Network only | Never |
| Receipt images, PDFs, upload URLs | Network only, uploaded straight to private storage | Never |
| Submission tokens, API keys, sessions | Memory or httpOnly cookie | Never in Cache Storage or localStorage |
| Cashier offline queue | IndexedDB, encrypted with a per-session key, deleted after sending or after 24 hours | Short-lived, device only |

## Offline and resume behavior

- The hosted page shows the request summary and a status link that works after reconnecting. Nothing is verified offline.
- A dropped upload keeps the selected file in memory and retries the reserved upload while the token is valid.
- The cashier can capture a QR while offline. The item shows "Not sent" and is never shown as paid.
- If the token expires during a resume, the integrating app is asked to renew it. Renewal never extends the payment deadline.
- A new app version shows "A new version is ready. Reload." and never reloads during a submission.
- Signing out clears caches, IndexedDB and the push subscription.

## Device features

- Camera QR scanning with `BarcodeDetector` where available and a JavaScript decoder elsewhere, including iOS Safari.
- If camera permission is denied, the screen switches to Upload and Paste link immediately.
- Web push for staff only. Payloads contain counts, never names, amounts or references.
- A screen wake lock on the cashier result screen while a check runs.
- An Android share target to send a receipt image into the hosted page.
- No geolocation, contacts or background sync of payment data.

## Manifest

Each deployment serves its own manifest. A tenant install takes its name, colors and icons from the approved theme record (see [UI guidelines](ui-guidelines.md#tenant-theme-from-a-logo)).

```json
{
  "name": "Myseed Academy Verify",
  "short_name": "Myseed Verify",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "background_color": "#F6F7F7",
  "theme_color": "#05C78C",
  "icons": [
    { "src": "/brand/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/brand/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/brand/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Security

- Strict Content Security Policy with no third-party scripts.
- The service worker scope never covers API routes, and the worker never touches `Authorization` headers.
- A cache audit in CI fails if any cached response matches API, upload or receipt paths.
- Sandbox and live installs use different origins, so their storage and caches never mix.

## Release checks

| Check | Pass when |
|---|---|
| Installability | Manifest, 192, 512 and maskable icons, HTTPS, service worker |
| Security | Strict CSP, egress allowlist, cache audit shows no personal or payment data |
| Performance | Hosted page is interactive in under 3 s on a mid-range Android phone over 3G |
| Resilience | Airplane mode during upload, token expiry, app update mid-flow |
| Accessibility | Keyboard and screen reader pass on all three apps |
| Devices | Android Chrome, iOS Safari, desktop Chrome and Edge |
