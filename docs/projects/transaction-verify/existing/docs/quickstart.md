# Quickstart: a signed sandbox webhook

For developers connecting a system to MySeed Verify for the first time. At the end you will have:

- a test payment request, paid at the sandbox bank
- a signed `payment.accepted` webhook received by your own code

It takes about half an hour. Nothing you do with a test key touches real money or counts toward your package. The two files below are run by the test suite exactly as printed (`tests/e2e/quickstart.test.mjs`), so they work as written.

## 1. Keys and a webhook address

In the console, open **Developers**:

1. Choose **Create a test key**. Copy the key (`tvk_test_...`). It is shown once.
2. Under **Webhooks**, enter an https address that reaches your computer, and choose **Test only**. For example, use a tunnel such as `cloudflared tunnel --url http://localhost:4020`. Choose **Add webhook**, then copy the signing secret (`whsec_...`) and its key ID (`k1`).

## 2. Install the SDKs

```sh
npm install @myseed-verify/server @myseed-verify/web
```

Node 20 or later.

## 3. Receive webhooks

`webhook-receiver.mjs`:

```js
// Quickstart, step 1: receive signed webhooks.
//   MYSEED_WEBHOOK_SECRET=whsec_... node webhook-receiver.mjs
import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyWebhook } from "@myseed-verify/server";

export function startReceiver({ port = 4020, secrets, onEvent = (e) => console.log(e.type, e.environment, e.data.externalReference) }) {
  const applied = new Set(); // keep this in your database: apply each event once
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const { event } = verifyWebhook({ rawBody: Buffer.concat(chunks), headers: req.headers, secrets });
        if (!applied.has(event.id)) {
          applied.add(event.id);
          onEvent(event);
        }
        res.writeHead(200).end();
      } catch {
        res.writeHead(400).end(); // not signed by MySeed Verify: ignore it
      }
    });
  });
  return new Promise((done) => server.listen(port, () => done(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await startReceiver({ secrets: { k1: process.env.MYSEED_WEBHOOK_SECRET } });
  console.log("Listening on http://localhost:4020");
}
```

```sh
MYSEED_WEBHOOK_SECRET=whsec_... node webhook-receiver.mjs
```

## 4. Create a request and pay it in the sandbox

`pay-test-request.mjs`:

```js
// Quickstart, step 2: create a payment request with a test key and pay it at the sandbox bank.
//   MYSEED_VERIFY_URL=https://... MYSEED_VERIFY_KEY=tvk_test_... node pay-test-request.mjs
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VerifyClient } from "@myseed-verify/server";
import { VerifyBrowserClient } from "@myseed-verify/web";

export async function payTestRequest({ baseUrl, apiKey, birr = 1500 }) {
  // Your server: create the request. The token goes to the payer; the key never leaves the server.
  const verify = new VerifyClient({ baseUrl, apiKey });
  const externalReference = `quickstart-${randomUUID().slice(0, 8)}`;
  const created = await verify.createPaymentRequest({
    externalReference,
    currency: "ETB",
    items: [{ purpose: "order", targetReference: "quickstart", expectedMinor: String(birr * 100) }],
  });

  // The payer's page or app: submit the receipt. In the sandbox, SYN-P<birr>X<code> is a paid transfer.
  const payer = new VerifyBrowserClient({ baseUrl, requestId: created.requestId, token: created.submissionAccess.token });
  const code = randomUUID().replace(/[^0-9]/g, "").slice(0, 4) || "1";
  const submitted = await payer.submit({ kind: "reference", providerId: "synthetic", reference: `SYN-P${birr}X${code}` });
  const result = await payer.waitForResult(submitted.submissionId);
  return { requestId: created.requestId, externalReference, status: result.status };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const r = await payTestRequest({ baseUrl: process.env.MYSEED_VERIFY_URL, apiKey: process.env.MYSEED_VERIFY_KEY });
  console.log(r.status, r.externalReference); // accepted; the webhook reaches your receiver within seconds
}
```

```sh
MYSEED_VERIFY_URL=https://your-verify-address MYSEED_VERIFY_KEY=tvk_test_... node pay-test-request.mjs
```

It prints `accepted`. Within seconds, the receiver prints `payment.accepted test quickstart-...`.

Without any code, **Send a test payment** on the Developers page does the same: it makes a test request, pays it, and the signed webhook arrives the same way.

## 5. What to do next

- **Payer's side:** let the payer submit the receipt. Use `mountPayment` from `@myseed-verify/web` on a website, or `@myseed-verify/react-native` in an app.
- **Your system:** apply each event ID once, and act on `event.data.externalReference`.
- **Other sandbox results:** try the fixed sandbox references:
  - `SYN-WRONG`: the money went to another account, so the payment goes to review
  - `SYN-PEND`: the bank has not finished the transfer yet
  - `SYN-DOWN`: the bank is unavailable
  - `SYN-0800`: the wrong amount
- **Many payments at once:** use `createBatch`. See the [developer guide](integrations-sdk.md).
- **Going live:** once your organization is approved, create a live key. Point a webhook at **Live only**, or use **Test and live** and check `event.environment`.
