# Operations runbooks

For the MySeed platform team on call: owners, operations and engineers. Each alert on **Platform, Operations** (`/app/platform/ops`) has a runbook below. An alert opens once while its problem lasts and closes by itself when the problem clears. Each new alert sends a console notice, and an email when SMTP is set up, to every platform owner, operations and engineer account.

Before you start:

- **Acknowledge** the alert so the others know someone is on it.
- If payers or organizations notice the problem, open an incident on the status page ([incident guide](incident-guide.md)).

The worker checks every minute. The same numbers are at `GET /metrics` (Prometheus text, `Authorization: Bearer <METRICS_TOKEN>`) for an outside monitor; see [Monitoring from outside](#monitoring-from-outside).

Commands below run on the VPS in `/opt/transactionverify`, unless a step says otherwise.

## Payments are waiting at a step (`queue.age:<stage>`)

The oldest ready check at that step (extract, ocr or provider) has waited more than 5 minutes. It turns critical after 15 minutes.

1. On the Ops page, look at **Workers and queues**. If no worker is running, go to [No worker is running](#no-worker-is-running-workernone).
2. **Provider step:** look at the bank or wallet table. If one connector fails most of its checks, follow [A bank or wallet is failing](#a-bank-or-wallet-is-failing-providerfailuresconnector). A connector whose circuit is open waits before retrying; that is expected.
3. **OCR step:** check that Tesseract is installed in the worker image: `docker compose logs tv-worker | grep -i tesseract`.
4. Read the worker log for errors: `docker compose logs --since 30m tv-worker | grep '"level":"error"'`.
5. If the worker is healthy but slow, raise `WORKER_*_CONCURRENCY` in `.env`, then run `docker compose up -d tv-worker`. Or start a second worker on another host against the same database.

## Many payments are waiting to be checked (`queue.backlog`)

More than 500 checks are ready and not yet taken by a worker. It turns critical above 2,000. The cause is usually the same as for a slow queue (above), or a burst from one organization.

1. Find the organization: `SELECT organization_id, count(*) FROM verify.verification_jobs WHERE state = 'ready' GROUP BY 1 ORDER BY 2 DESC LIMIT 5;`
2. A batch intake from one organization drains by itself. Organizations are served in turn, so others are not blocked.

## A bank or wallet is failing (`provider.failures:<connector>`)

In the last hour, at least half of at least 10 checks with this connector were unavailable or failed. Payments from that bank wait, retry, and then go to staff review. Nothing is accepted wrongly.

1. Look up the connector under **Platform, Methods**.
2. Official receipt link connectors: open one recent receipt link yourself in a browser. If the bank's page is down or has changed, wait, or ask the provider admin to update the definition.
3. Chapa: a single organization's key may be wrong. Look for `credential` in the worker log.
4. If it lasts more than 30 minutes, open a status incident on **Payment checks**: minor impact, naming the bank.

## Webhook deliveries gave up (`webhooks.dead`)

A delivery stopped after its last retry (about 2 days of retries). The organization's own server did not answer with 2xx.

1. **Platform, Organizations, *organization*, Deliveries** shows the endpoint and the last HTTP status.
2. Tell the organization's technical contact. Once their server is fixed, they can replay from **Deliveries**.
3. Many organizations at once points to a problem on our side: egress, DNS or TLS. Check `docker compose logs tv-worker | grep delivery`.

## Emails or text messages could not be sent (`messages.dead`)

1. Check the SMTP and SMS settings in `.env` (deploy step 5).
2. `docker compose logs --since 1h tv-worker | grep -i "message"` shows the provider's error.
3. A single wrong address is permanent and needs nothing. If every message fails, the credentials or the provider are at fault.

## Worker stopped reporting (`worker.silent:<id>`)

One worker has not written its heartbeat for 2 minutes and did not stop cleanly.

1. `docker compose ps tv-worker` and `docker compose logs --tail 100 tv-worker`.
2. If it was killed (out of memory, a host restart), start it with `docker compose up -d tv-worker`. Jobs it held are taken over when their lease ends (60 seconds).
3. A worker id that no longer exists, such as an old container, closes the alert within a day.

## No worker is running (`worker.none`)

Critical: every worker that reported has gone silent, so no payments are being checked.

1. `docker compose up -d tv-worker`, then watch for `"worker started"` in the log.
2. If it exits at once, read the first error. The usual causes are `DATABASE_URL`, a missing key, or a license problem (dedicated deployments).
3. Open a status incident on **Payment checks** (major) if it is not back within 5 minutes.

## The database is near its connection limit (`database.connections`)

At least 80% of `max_connections` are in use. It turns critical at 95%.

1. `SELECT application_name, state, count(*) FROM pg_stat_activity GROUP BY 1, 2 ORDER BY 3 DESC;`
2. Many `idle in transaction` connections point to a stuck request. Restart `tv-api`.
3. A second API or worker host adds its own pool (API 10, worker 20). Raise `max_connections` in the PostgreSQL settings if the host has the memory.

## There is no database backup, or it is old (`backup.stale`)

The newest whole-database backup is more than 26 hours old.

1. The worker makes one each night after 02:00 Addis Ababa time and keeps the newest 14. This needs the archive storage (deploy step 6).
2. Look for `nightly database backup` or `nightly backup failed` in the worker log.
3. Make one now: **Platform, Database, Backups, Make a backup**.
4. The server's own nightly backup at 02:45 (`deploy/vps/backup.sh`, set up by setup.sh) is a separate copy. Check `/opt/transactionverify/backups/backup.log`.

## Someone reports "Something went wrong on our side"

The console shows a request ID after the message (for example `Request ID: req_6b1f...`). Open Platform, Operations, **Server errors** and find that ID: the row has the address, the person, the organization and the first lines of the error. Without the console: `SELECT * FROM verify.server_errors WHERE request_id = '<id>'`. The API's log has the same ID on its error line.

## Monitoring from outside

The Ops page needs a working console. An outside monitor still sees an outage when the server is down.

- Set `METRICS_TOKEN` (at least 16 characters) in `.env` and restart `tv-api`. `GET /metrics` then answers with Prometheus text.
- Without the token, `/metrics` does not exist.
- The metrics hold counts only, never organization names or payment data.
- Probe `GET /health` (process up) and `GET /ready` (database reachable) every minute from outside the VPS. Alert if either fails twice in a row.
- Useful rules:
  - `tv_workers_running == 0` for 5 minutes
  - `tv_job_oldest_ready_seconds > 900`
  - `tv_backup_age_seconds > 93600`
  - `tv_alerts_open > 0` for 30 minutes

## Restore drill (monthly)

A backup nobody has restored is not yet a backup.

1. **Platform, Operations, Restore drills, Run a drill.** Pick a backup, or leave it on the newest.
2. Within a minute the worker:
   - creates a scratch database on the same server
   - applies the migrations and restores the backup into it
   - counts every table against the backup's own counts and checks the tenant wall
   - drops the scratch database
3. The live database is never touched.
4. Each step is timed. The total is roughly how long a real restore takes; note it in the incident guide's recovery estimate.
5. **Passed:** sign it off. **Failed:** the problems column says which table differed. Keep the failed backup, make a new one, and drill that.
6. The database user needs CREATEDB, as the deployment's owner user has. Receipt files are not part of a database backup; the archive is checked by the nightly receipt archive's read-back.

To restore for real, see **Restore a backup on the server** in the [deploy guide](../deploy/vps/README.md), or **Platform, Database, Restore** (platform owners only).

## Rotating DATA_ENCRYPTION_KEY

See [Security, Key rotation](security.md#key-rotation).
