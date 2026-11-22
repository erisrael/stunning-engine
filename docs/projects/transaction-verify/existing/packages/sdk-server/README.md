# @myseed-verify/server

Node SDK for MySeed Verify, which checks Ethiopian bank and wallet payments against the bank's own record. Use it on your server: it holds your server key.

```sh
npm install @myseed-verify/server
```

Requires Node 20 or later.

## Create a payment request

```js
import { VerifyClient } from "@myseed-verify/server";

const verify = new VerifyClient({ baseUrl: "https://verify.myseed.com.et", apiKey: process.env.MYSEED_VERIFY_KEY });

const created = await verify.createPaymentRequest({
  externalReference: "order-1042",
  currency: "ETB",
  items: [{ purpose: "order", targetReference: "order-1042", expectedMinor: "150000" }], // ETB 1,500.00
});
// Give created.submissionAccess.token to the payer's browser or app. Never send them the server key.
```

Amounts are strings in minor units (cents), never floating-point numbers. Each call has an idempotency key that is kept across retries, so a retried create never makes two requests.

## Receive the webhook

```js
import { verifyWebhook, WebhookVerificationError } from "@myseed-verify/server";

app.post("/webhooks/verify", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const { event } = verifyWebhook({ rawBody: req.body, headers: req.headers, secrets: { k1: process.env.MYSEED_WEBHOOK_SECRET } });
    // Apply each event.id once. event.environment is "test" for sandbox payments.
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(e instanceof WebhookVerificationError ? 400 : 500);
  }
});
```

Pass every active signing secret by key ID while you rotate secrets.

## Batches

```js
const batch = await verify.createBatch({ items: [{ externalReference: "inv-1", currency: "ETB", items: [...], evidence: { kind: "link", value: receiptUrl } }] });
const later = await verify.getBatch(batch.batchId); // later.done, later.counts, later.items[n].status
```

A batch holds up to 100 payments. Batch payments are checked after your single payments. Repeating a call with the same idempotency key resumes a batch that was cut off.

## Sandbox

Test keys (`tvk_test_...`) reach only the sandbox bank, and nothing they do counts toward your package. To pay a test request, submit a reference such as `SYN-P1500X7K`: `SYN-P`, the amount in birr, `X`, and any short code. Each code is a new payment.

The full guide and API reference are on the documentation pages of your MySeed Verify console.
