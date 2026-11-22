# Security

For engineers and the people who review the service's security, including the outside firm that does the penetration test. It covers what is encrypted and with which key, how to rotate keys, and what the penetration test should cover.

## Encryption review

| What | Where | How | Key |
|---|---|---|---|
| Traffic | Browser, SDKs and webhooks to the service | TLS from Caddy (Let's Encrypt). The service never turns TLS checking off for its own outbound calls | Caddy's certificates |
| Webhook signing secrets | `webhook_signing_keys.secret_ciphertext` | AES-256-GCM (SecretBox): 12-byte IV, 16-byte tag | DATA_ENCRYPTION_KEY |
| Two-step sign-in secrets | `staff_credentials.totp_secret_enc` | SecretBox, base64 | DATA_ENCRYPTION_KEY |
| Deployment keys (web push, license signing) | `deployment_keys.secret_enc` | SecretBox | DATA_ENCRYPTION_KEY |
| Provider API keys (Chapa) | `organization_provider_credentials.secret_enc` | SecretBox; only the last four characters are ever shown | DATA_ENCRYPTION_KEY |
| Archived receipts and backups | Archive storage (`ARCHIVE_STORAGE_*`) | AES-256-GCM, format "TVA1", with the object's key as associated data so files cannot be swapped | HKDF of DATA_ENCRYPTION_KEY ("transaction-verify archive objects") |
| Receipts in the main storage | `STORAGE_*` | Private folder (mode 700) or private bucket; uploads only through signed, expiring tickets. Not encrypted by the service: rely on disk or bucket encryption at the host | Host |
| Receiving account numbers | `receiving_accounts` | HMAC-SHA-256 digest for matching, plus the last four digits; the full number is never stored | ACCOUNT_DIGEST_KEY |
| Passwords | `staff_credentials` | scrypt with a salt per person | None |
| Server API keys, sessions, setup links | Their tables | SHA-256 digests only; the raw value is shown once | None |
| Payer submission tokens | Not stored | HMAC over the request and expiry | SUBMISSION_TOKEN_SECRET |

Findings from the review:

- **Receipts in the main storage are not encrypted by the service.** On the VPS they sit on the host disk, readable only by the service user. Turn on disk encryption at the host, or use a bucket with server-side encryption. Receipts older than the hot period move to the sealed archive anyway.
- **Database backups made by the console** are sealed in the archive. The server's own nightly backup (`deploy/vps/backup.sh`) is not: keep its folder at mode 700, and copy it off the server only encrypted.
- **ACCOUNT_DIGEST_KEY cannot be rotated** without every organization entering its account numbers again, because only digests are stored. Keep it as safe as the data key.

## Key rotation

DATA_ENCRYPTION_KEY can be replaced without downtime and without losing anything. Plan for once a year, and at once if the key may have leaked.

1. **Make a new key:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. **Set both keys** in `.env`:
   - `DATA_ENCRYPTION_KEY=<new>`
   - `DATA_ENCRYPTION_KEY_PREVIOUS=<old>`
   For more than one old key, separate them with commas. Restart `tv-api` and `tv-worker`.
   From now on, new secrets and new archive files are sealed with the new key, and old ones still open with the old key.
3. **Reseal:** `npm run keys:rotate reseal`. On the VPS, run it inside the API container, for example `docker compose exec tv-api node scripts/rotate-keys.mjs reseal`. It:
   - seals every database secret again with the new key, in one transaction
   - walks a local archive folder and seals each file again
   **Platform, Database, Encryption** shows the same counts. Its **Reseal** button does the database part.
4. **Check:** `npm run keys:rotate status` must show nothing on a previous key and nothing unreadable.
5. **Remove** `DATA_ENCRYPTION_KEY_PREVIOUS` and restart.
6. **Keep the old key** in your sealed records for as long as old backups exist. A backup restored from before the rotation holds secrets sealed with the old key. Set it again as the previous key after such a restore.

An S3 archive is not listed by the script. Keep the previous key set until objects sealed with it have aged out (the retention period), or copy the bucket through `SealedStorage` with a one-off script.

## Penetration test scope

An outside test before the first paying organizations go live, and yearly after that. Give the testers a sandbox deployment with its own data, never production.

In scope:

1. **Tenant isolation.** Two organizations; try to read or change the other's payments, receipts, accounts, staff, exports and backups through the console API, the payment API and direct object keys. The database tenant wall (row-level security) is the second line, after the code's checks; test both by trying to make queries without an organization.
2. **Authentication.** Password sign-in, two-step codes, passkeys, trusted devices, setup and reset links, session expiry, sign-out everywhere, platform sign-in, cashier terminals. Check rate limits on each.
3. **Permissions.** Each role, and a custom role, against every console route. A permission a person lacks must not be grantable by them, and they must not be able to change their own role. Check platform roles against each platform area.
4. **Payment API.** Server keys (test against live), idempotency, submission tokens (expiry, reuse, another request), upload tickets and the direct upload route, amount and currency handling at the limits.
5. **Receipts.** Malicious files: oversized, wrong type, PDF with scripts, images that crash decoders. Links in QR codes pointing at internal addresses (the worker's egress guard must refuse them).
6. **Webhooks.** Signature checking and replay windows; webhook addresses pointing inside the network (refused outside the sandbox).
7. **Hosted payment page and console in the browser.** XSS through every field a payer or staff member can type (names, references, notes, templates, branding); CSRF (the console needs the `x-console` header and a same-origin request); clickjacking; cookie flags.
8. **Data tools.** Backups, restore (owner only, phrase), test data removal, clean-up, exports: who can reach them, and whether a download link leaks.
9. **Secrets.** No secret in logs, error messages, the status page, `/metrics` or the front-end bundle.

Out of scope: denial-of-service load, the banks' own pages and APIs, the VPS provider, and Myseed's other sites on the same server.

The testers report to the platform owners. Findings are fixed in order of severity, and each fix is retested before it is closed.
