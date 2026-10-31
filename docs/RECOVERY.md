# Backups, recovery and keeping the site running

For whoever runs the Myseed Content Manager (the administrator, and the person who looks after the server). It says what is backed up, how to restore, what to do when something breaks, and how to set up the scheduled jobs, alerts and a staging site on Render (today) and on a VPS (soon).

Everything here is configured in **Admin, System** unless a step says otherwise.

---

## 1. What runs by itself

| What | How often | Where to see it |
| --- | --- | --- |
| Scheduled jobs (reminders, alerts, email outbox, clean-ups, backups) | Every 10 minutes | Admin, System, Scheduled jobs |
| Backup of the whole workspace | Daily, at the hour set (default 02:00) | Admin, System, Backups |
| Test restore of the newest backup into a throwaway database | Every 30 days (configurable) | Admin, System, Backups, History |
| Error collection (server, browsers, jobs) | All the time | Admin, System, Errors |
| Alerts to Admin (new errors, failed backups, jobs failing twice) | When they happen | The bell; email and Telegram when set up |

### Making sure the jobs always run

Use at least one of these (more is fine: a lease makes sure two runs never overlap):

1. **The timer inside the server.** On by default. Runs every 10 minutes while the app is running. Enough on a VPS. Switch it off with `MYSEED_TIMER=0` only when several copies of the app run behind a load balancer.
2. **GitHub Actions (free).** `.github/workflows/schedule.yml` calls the site every 10 minutes. In the hosting settings set `CRON_SECRET` to a long random value; in GitHub, Settings, Secrets and variables, Actions, add `APP_URL` (for example `https://myseed.onrender.com`) and `CRON_SECRET` (the same value). GitHub emails the repository owner when a run fails, which also tells you the site is down. Needed on Render's free plan, where the app sleeps when nobody uses it.
3. **A cron line on the VPS:**
   ```
   */10 * * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/cron/checks > /dev/null
   ```

Admin, System, Health turns red when nothing ran for 30 minutes.

---

## 2. Backups

A backup is one file, `myseed-YYYYMMDD-HHMM.json.gz` (`.json.gz.enc` when encrypted), holding every table: people, HR and finance records, the curriculum, all production history, chat, and the files kept in the database. Files in Supabase Storage (when that is used) are not in it; Supabase keeps them.

**Where they go** (switch on as many as you like; keep at least one away from the server):

- **This server's disk.** The folder in `BACKUP_DIR` (default `backups/` in the app folder), or the one set in Admin, System. On Render the disk is wiped at every deploy unless a persistent disk is attached, so keep Google Drive on as well.
- **Google Drive.** Admin presses *Connect Google Drive* (the Google client from Admin, Sign-in is used), then switches it on. Backups go into a folder *Myseed backups* in that Admin's Drive. The app can only see files it created there. If that Admin leaves, another Admin connects their own Drive and switches it on again.
- **S3-compatible storage (optional).** Cloudflare R2 or Backblaze B2 (free tiers), Wasabi, Amazon S3, or MinIO on the VPS. Endpoint, bucket, access key and secret.

**How many are kept:** the newest of each of the last 7 days, 4 weeks and 12 months (configurable). Older ones are removed from each place after a new backup is safely saved there.

**Encryption:** switch on *Encrypt backups* and set a passphrase of at least 12 characters. **Write the passphrase down outside the app** (a password manager, or on paper in the safe). Without it nobody can restore an encrypted backup if the server and database are lost.

---

## 3. Restoring

Restoring replaces **all** current data with the backup. Do it only when the data is lost or damaged, and tell everyone first: anything entered after the backup is lost.

1. Get the file: Admin, System, Backups, *Download*; or from the *Myseed backups* folder in Google Drive; or from the server folder or S3 bucket.
2. On a computer with the app's code (the server itself, or any computer with Node.js 22+ and `npm install` done), point it at the database to restore into:
   - the live database: `DATABASE_URL` in `.env` (Supabase or the VPS's PostgreSQL);
   - or nothing set, to restore into a local copy first and look at it.
3. Run:
   ```
   BACKUP_PASSPHRASE='the passphrase' npm run db:restore -- path/to/myseed-20261031-0200.json.gz.enc
   ```
   (`BACKUP_PASSPHRASE` only for encrypted files. On Windows PowerShell: `$env:BACKUP_PASSPHRASE='...'; npm run db:restore -- file`.) For a remote database, `npm run db:bulk-restore -- file` is much faster.
4. Restart the app. Sign in, check a few records, then tell everyone.
5. If nobody can sign in (for example the only Admin lost their phone): `npm run db:set-password -- their@email`, which prints a temporary password and clears their two-step sign-in.

How long it takes: a few minutes to download, then the restore itself. The monthly test restore in Admin, System, Backups shows how long restoring your data takes (it restores into a database in memory, so a real restore to a remote database takes somewhat longer).

---

## 4. When something breaks: who does what

| Situation | Who | What to do |
| --- | --- | --- |
| Alert "New error" | Admin | Open Admin, System, Errors. If it keeps happening or blocks work, send the error text and the steps to the developer. Mark it *Fixed* once a fix is deployed; it opens again if it comes back. |
| Alert "Backup failed" | Admin | Admin, System, Backups, History says which place failed. Google Drive: connect again. Disk: check space. Then *Back up now*. |
| "Scheduled job failing" | Admin, then the developer | Admin, System, Scheduled jobs shows the error. |
| Site down (GitHub email, or people cannot open it) | Server person | Check the hosting dashboard (Render, or `systemctl status myseed` on the VPS). Restart. If the database is the problem, check Supabase or PostgreSQL status. |
| Data lost or damaged | Admin and server person | Stop people working, restore the newest good backup (section 3). |
| Server or hosting lost | Server person | Set up a new server (section 6), restore the newest backup from Google Drive or S3, point the domain at it. Expect about an hour. |
| Account taken over | Admin | Admin, Sessions and devices: sign the person out everywhere, block unknown devices. Reset their password and two-step sign-in. Check Admin, Sign-in, Sign-in log. |

Keep this list updated with names and phone numbers:

- Administrator: ________
- Server person: ________
- Developer: ________

---

## 5. A staging site

Changes are tried on a copy before they reach the live site.

- **Render:** create a second Web Service from the same repository, on a `staging` branch, with its own database (a second Supabase project, or no `DATABASE_URL` for a throwaway one), its own `APP_URL` and `APP_SECRET`, and no Google or email secrets unless needed. Push to `staging`, check, then merge into `main`.
- **VPS:** a second copy of the app in another folder with its own port, database and service (`myseed-staging`), behind a `staging.` subdomain.
- To try with real data, restore a recent backup into the staging database (section 3). Staging then holds personal data: limit who can open it.

On Render, set the live service's **Auto-Deploy** to **After CI Checks Pass**, so the tests in `.github/workflows/ci.yml` must pass before anything is deployed.

---

## 6. Moving to a VPS

1. Ubuntu 24.04, Node.js 24, PostgreSQL 16 (or keep Supabase and only move the app), Nginx or Caddy for HTTPS.
2. `git clone`, `npm ci`, `npm run build`. Environment in `/etc/myseed.env`: `DATABASE_URL`, `APP_URL`, `APP_SECRET`, `CRON_SECRET`, `BACKUP_DIR=/var/backups/myseed`, email settings.
3. A systemd service running `npm start` with `Restart=always`; the timer inside the app runs the jobs.
4. Restore the newest backup (section 3), or keep the same Supabase database.
5. Point the domain at the VPS. In Google Cloud, add the new address to the OAuth client's redirect URIs (Admin, Sign-in shows them).
6. Keep Google Drive backups on: the VPS disk alone is not a backup.

---

## 7. Errors and privacy

Errors are kept only in the app, in Admin, System, Errors. No outside service receives them. Email addresses, long numbers and keys are masked before saving, page addresses are kept without their query, and nothing a person typed is recorded. Errors are removed after 90 days (configurable in Admin, System, Alerts).
