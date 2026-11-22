# Examples

| Example | What it shows |
|---|---|
| academy-backend (`examples/academy-backend/server.mjs`) | A stand-in Myseed backend: creates a subscription payment, sends the payer to the hosted page, verifies the signed `payment.accepted` webhook, applies it once (redelivery is a no-op), and reports fulfillment. |

Run the whole sandbox on one computer (no Docker):

```sh
npm ci && npm run build
npm run setup                 # .env with generated keys
npm run db:start              # PostgreSQL 17 in data/pg (leave running)
npm run db:migrate
npm run sandbox:seed          # prints the server key and webhook secret once
npm run dev:api               # http://127.0.0.1:8080, hosted page at /pay/
npm run dev:worker
SANDBOX_SERVER_KEY=... WEBHOOK_SECRET=... npm run example:academy   # http://127.0.0.1:4010
```

The control panel (`python control-panel/control_panel.py`) runs all of these as background jobs.

Synthetic references: `SYN-1000` (ETB 1,000.00, confirmed), `SYN-1250`, `SYN-0800` (wrong amount), `SYN-WRONG` (paid to another account, rejected), `SYN-NORCPT` (no recipient, review), `SYN-NOTIME`, `SYN-USD`, `SYN-PEND` (pending), `SYN-DOWN` (provider down), `SYN-FAIL`, `SYN-SLOW` (timeout). Receipt links: `https://sandbox.verify.example/r/SYN-1000`.
