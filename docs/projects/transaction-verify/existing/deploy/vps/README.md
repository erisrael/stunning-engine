# Deploy on the Myseed VPS

Transaction Verify runs on the same Hostinger VPS as myseed.com.et, at **https://transactionverify.myseed.com.et**. It has its own containers, its own PostgreSQL 17 database and its own folder, `/opt/transactionverify`. It shares only Myseed's Caddy, which already holds ports 80 and 443 and handles HTTPS certificates.

The control panel's **Hostinger VPS** page runs every step below. This file explains what the steps do.

```
Internet ── 80/443 ──> Caddy (Myseed project)
                         ├─ myseed.com.et, admin., api.   -> Myseed containers
                         └─ transactionverify.myseed.com.et -> tv-api:8080   (network "edge")
tv-api ─┐
tv-worker ─┼─ tv-postgres (volume transactionverify_pgdata, never published)
tv-migrate ┘   receipts: /opt/transactionverify/data/receipts (private disk)
```

## One time

1. **DNS.** Add an `A` record `transactionverify` for `myseed.com.et` pointing at the VPS IP address, the same address as `myseed.com.et`. Add `AAAA` too if the other records have one.
2. **Shared Caddy.** Apply `deploy/vps/myseed-edge.patch` to the My-Seed-Academy repository, then deploy Myseed once from its own panel:
   ```sh
   cd ../My-Seed-Academy
   git apply ../Transaction-Verify/deploy/vps/myseed-edge.patch
   ```
   The patch makes three additions and changes nothing else:
   - Myseed's Caddyfile ends with `import /etc/caddy/sites/*.caddy`. If the folder is empty, Caddy logs a warning and serves Myseed as before.
   - Caddy mounts `/opt/edge/sites` read-only.
   - Caddy joins a shared Docker network called `edge`.
3. **Prepare the server** (`deploy/vps/setup.sh`). If Docker is already there, it leaves the firewall and other services alone. It creates `/opt/transactionverify`, the receipts folder (owner uid 1000, mode 700), the `edge` network and `/opt/edge/sites`, and a nightly backup at 02:45.
4. **Settings** (`deploy/vps/env.sh`). The panel sends `TV_DOMAIN`, `DEPLOYMENT=myseed` and the defaults chosen in the plan. On first run the server generates `POSTGRES_PASSWORD`, `SUBMISSION_TOKEN_SECRET`, `DATA_ENCRYPTION_KEY` and `ACCOUNT_DIGEST_KEY`. They are never replaced, because a new encryption or digest key would make saved webhook secrets unreadable and stop receiving accounts matching.
5. **Email and SMS (optional).** Send these with the settings so the worker can deliver payer and staff messages and export links. Until they are set, messages wait in the outbox.
   - `EMAIL_SMTP_URL`: `smtps://<user>:<password>@mail.example.com:465` or `smtp://<user>:<password>@mail.example.com:587`. Port 587 must offer STARTTLS; a server without TLS is refused.
   - `EMAIL_FROM`: the sender address, for example `no-reply@transactionverify.myseed.com.et`. Set SPF and DKIM for that domain at the mail provider.
   - `SMS_PROVIDER=afromessage` with `SMS_TOKEN`, and optionally `SMS_SENDER` and `SMS_IDENTIFIER`; or `SMS_PROVIDER=http` with `SMS_HTTP_URL` (https) and `SMS_TOKEN` sent as a bearer token.
6. **Archive storage.** Receipts older than the hot period (`EVIDENCE_HOT_DAYS`, default 90) and console backups go to a sealed archive. By default it is the folder `data/archive` next to the receipts folder; set `ARCHIVE_STORAGE_DIR` to a different disk, or `ARCHIVE_STORAGE_DRIVER=s3` with `ARCHIVE_STORAGE_ENDPOINT`, `ARCHIVE_STORAGE_BUCKET`, `ARCHIVE_STORAGE_ACCESS_KEY` and `ARCHIVE_STORAGE_SECRET_KEY` for a separate bucket. It must differ from the receipts folder or bucket. Objects are sealed with a key derived from `DATA_ENCRYPTION_KEY`, so keep that key in your own records: without it the archive cannot be read. Mount the archive folder into both `tv-api` and `tv-worker`.
7. **Monitoring (optional).** Set `METRICS_TOKEN` (at least 16 characters) to turn on `GET /metrics` (Prometheus text, bearer token) for an outside monitor. Probe `/health` and `/ready` from outside the VPS too. Alerts, the restore drills and the status page are on **Platform, Operations**; see [runbooks](../../docs/runbooks.md).
8. **Rotating the data key.** `DATA_ENCRYPTION_KEY` is never replaced by the setup scripts. To rotate it on purpose, set the new key with the old one in `DATA_ENCRYPTION_KEY_PREVIOUS`, restart, run `node scripts/rotate-keys.mjs reseal` in the API container, then remove the previous key. See [security](../../docs/security.md#key-rotation).

## Every deploy (`deploy/vps/deploy.sh`)

1. The panel packages the last commit with `git archive` and uploads it to `/opt/transactionverify/incoming`.
2. The image is built while the current release keeps serving. It contains the API, the hosted page, the workers and Tesseract with English and Amharic.
3. The database is dumped to `/opt/transactionverify/backups`.
4. `current` switches to the new release. `tv-migrate` applies pending migrations, then `tv-api` and `tv-worker` start.
5. The site block goes to `/opt/edge/sites/transactionverify.caddy`, and Myseed's Caddy reloads it. Myseed's sites are not restarted.
6. Checks: `/ready` inside the container, then `https://transactionverify.myseed.com.et/health` from the server.

If step 5 finds that Myseed's Caddy hasn't been deployed with the patch yet, the deploy fails with that message and changes nothing on the Myseed side. The new release is still running inside the server, so deploy Myseed with the patch, then press **Check routing** (`deploy.sh --edge-check`).

**Roll back** starts the previous release again (the newest three are kept). The database is not rolled back; migrations only add.

## On a server without Myseed

Set `EDGE_MODE=own` in the settings. Transaction Verify then starts its own Caddy (`tv-caddy`, compose profile `own-edge`) on ports 80 and 443, reading the same sites folder.

## Restore a backup on the server

Stop `tv-api` and `tv-worker` first, then:

```sh
cd /opt/transactionverify
gunzip -c backups/tv-YYYYMMDD-HHMMSS.sql.gz | docker compose -p transactionverify -f current/deploy/vps/docker-compose.yml exec -T tv-postgres psql -U verify -d transaction_verify
```

The weekly `receipts-*.tar.gz` archives restore with `tar xzf ... -C /opt/transactionverify/data`.
