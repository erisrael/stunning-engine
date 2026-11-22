# @myseed/schoolhub-sdk

Typed client for the SchoolHub Connect API and a verifier for SchoolHub webhooks. Used by the MySeed Education System (School Gateway). Types and response validation come from `@myseed/contracts`, so a contract change shows up as a type error or a `ContractMismatchError`, not as bad data in the apps.

The SDK reads through to SchoolHub. It does not cache or store school data.

## Client

```ts
import { ConnectClient } from '@myseed/schoolhub-sdk';

const schoolhub = new ConnectClient({
  baseUrl: 'https://api.schoolhub.example.et',
  clientId: 'myseed-education-gateway',
  privateKeyJwk: JSON.parse(process.env.SCHOOLHUB_CLIENT_KEY!), // Ed25519 private JWK
});

// Calls for one MySeed account. The subject is checked against every connection.
const parent = schoolhub.forSubject(myseedAccountId);
const [connection] = await parent.connections();
const today = await parent.connection(connection.id).today();
```

- Access tokens use client credentials with a signed client assertion (RFC 7523). Tokens are cached and renewed 30 seconds before they expire; concurrent callers share one token request.
- Writes that must not happen twice (link with code, submit, start payment, start conversation, send message) send an `Idempotency-Key`. Pass `{ idempotencyKey }` to reuse the key when the user retries the same action.
- GETs and keyed writes are retried twice on network errors and 502, 503 or 504. A 401 refreshes the token once.
- Errors are `SchoolHubError` with `status` and the stable `code` from the API, for example `not_permitted`, `code_used` or `deadline_passed`.

## Webhooks

```ts
import { verifyWebhook, WebhookVerificationError } from '@myseed/schoolhub-sdk';

app.post('/schoolhub/events', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = verifyWebhook({ secret: process.env.SCHOOLHUB_WEBHOOK_SECRET!, body: req.body, signature: req.header('x-schoolhub-signature') });
    // Deliveries retry, so drop duplicates by event.id.
    res.sendStatus(204);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

Pass the raw body. Re-serialized JSON will not verify. Deliveries signed more than 300 seconds from now are rejected.

## Not included

There is no bulk export or change feed. SchoolHub is the system of record, and MySeed reads through the Connect API with at most a short cache (decision 4).
