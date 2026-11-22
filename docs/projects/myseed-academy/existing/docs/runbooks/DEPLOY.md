# Deploying MySeed Academy to a Hostinger VPS

This guide puts the whole platform online on one Hostinger VPS: the public website, the admin console, the API and the PostgreSQL database, with free HTTPS from Let's Encrypt. The first deploy takes about 30 minutes, most of it waiting for builds and DNS. Later deploys are one button and 5 to 10 minutes.

> **Other hosts:** the platform can also run on **Render** (everything), or with the website and admin on **Netlify** or **Vercel** and the API on Render, with the database on **Supabase**. Choose this in the control panel's **Deploy plan** page; section 11 summarises it. This guide covers the VPS in detail.

> **Shortcut:** the control panel (`python control-panel/control_panel.py`, see [control-panel/README.md](../../control-panel/README.md)) does sections 3 to 7 from your browser: it finds the VPS through the Hostinger API, installs its SSH key, prepares the server, sends the settings and deploys. The manual commands below do the same thing if you prefer a terminal.

## What runs where

| Address | Container | What it is |
| --- | --- | --- |
| https://myseed.com.et (and www, redirected) | `web` (Next.js, port 3000 inside Docker) | Public website in nine languages |
| https://admin.myseed.com.et | `admin` (Next.js, port 3001) | Staff console |
| https://api.myseed.com.et | `api` (Express, port 8080) | API, payment webhooks, uploads |
| not public | `postgres` (PostgreSQL 16) | Database, in the `myseed_pgdata` volume |
| ports 80 and 443 | `caddy` | HTTPS certificates and reverse proxy |

Only Caddy is reachable from the internet. The firewall allows SSH, HTTP and HTTPS, and the app containers are not published on the server's IP (`deploy/vps/docker-compose.vps.yml`).

Contact details on the site: **+251 93 747 1049**, **info@myseed.com.et**, Telegram **@MySeed_Academy**. They are set in `packages/types/src/seed-data.ts` (`SUPPORT_CHANNELS`, `SITE_LINKS`).

## 1. Choose the VPS plan

| Plan | Fits | Notes |
| --- | --- | --- |
| KVM 1 (1 CPU, 4 GB) | Small launch | Works; builds are slow and rely on the 4 GB swap that setup adds |
| **KVM 2 (2 CPU, 8 GB)** | **Recommended** | Comfortable builds, room for growth |
| KVM 4 and up | Heavy traffic | Same steps |

In hPanel choose **Ubuntu 24.04** as the operating system (plain OS, no application template). Pick a data center close to your visitors; for Ethiopia, the European locations have the lowest latency.

Hostinger prices and plans change. Check https://www.hostinger.com/vps-hosting before you buy.

## 2. Point the domains at the VPS

Copy the VPS IP address from **hPanel, VPS, Overview**. In the DNS zone of `myseed.com.et` add:

| Type | Name | Points to |
| --- | --- | --- |
| A | `@` (myseed.com.et) | VPS IP |
| A | `www` | VPS IP |
| A | `admin` | VPS IP |
| A | `api` | VPS IP |

Leave the email records (MX, SPF, DKIM, DMARC) for `info@myseed.com.et` exactly as they are; email keeps working from the current mail host. Change only A records.

Wait until each name resolves to the VPS (`nslookup admin.myseed.com.et`). Caddy can only get HTTPS certificates once they do.

## 3. Give the panel SSH access

With the control panel: **Hostinger VPS, step 1** (paste a Hostinger API token from hPanel, profile, **Account information, API**, and pick the VPS), then **step 2** (**Create the panel's SSH key**, **Add with Hostinger API**, **Test connection**).

Without the API token, add the panel's public key in **hPanel, VPS, Settings, SSH keys**, or paste the command the panel shows into the VPS **Browser terminal**.

By hand from your own computer:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/myseed_vps
ssh-copy-id -i ~/.ssh/myseed_vps.pub root@<VPS IP>
```

## 4. Prepare the server (once)

Panel: **step 4, Prepare the server**. By hand:

```bash
scp deploy/vps/*.sh root@<VPS IP>:/root/
ssh root@<VPS IP> "bash /root/setup.sh"
```

`setup.sh` installs Docker Engine and the Compose plugin, turns on the ufw firewall (SSH, 80, 443), adds swap, enables fail2ban and automatic security updates, creates `/opt/myseed`, and schedules the nightly database backup at 02:30. It is safe to run again.

## 5. Settings and secrets

Panel: **step 3**, then **Send settings to the server** (every deploy sends them too). They land in `/opt/myseed/.env` (mode 600). By hand:

```bash
ssh root@<VPS IP> "APP_ROOT=/opt/myseed bash /root/env.sh" <<'EOF'
SITE_DOMAIN=myseed.com.et
SITE_ALIAS=www.myseed.com.et
ADMIN_DOMAIN=admin.myseed.com.et
API_DOMAIN=api.myseed.com.et
ACME_EMAIL=info@myseed.com.et
PUBLIC_SITE_URL=https://myseed.com.et
SMTP_HOST=mail.myseed.com.et
SMTP_PORT=465
SMTP_USER=info@myseed.com.et
SMTP_PASSWORD=<mailbox password>
SMTP_FROM=MySeed Academy <info@myseed.com.et>
BILLING_FINANCE_EMAIL=info@myseed.com.et
TELEGRAM_HANDLE=MySeed_Academy
EOF
```

| Key | Needed | Where it comes from |
| --- | --- | --- |
| `SITE_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` | Yes | Section 2 |
| `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET`, `REVALIDATE_SECRET` | Yes | Generated on the server by `env.sh` the first time. **Never change `ENCRYPTION_KEY`**: keys saved in Admin, Integrations would become unreadable. Copy `/opt/myseed/.env` to your password manager. |
| `SMTP_*` or `RESEND_API_KEY` | For email | The cPanel mailbox for info@myseed.com.et, or Resend. The Resend key in the local `.env` is invalid; do not copy it. |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | For ETB payments | Chapa dashboard. Webhook URL: `https://api.myseed.com.et/api/donations/webhook/chapa` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | For card payments | Stripe dashboard. Webhook URL: `https://api.myseed.com.et/api/donations/webhook/stripe` |
| `S3_*` | Recommended | A Cloudflare R2 or S3 bucket for uploads. Without it, uploads stay in the `myseed_uploads` volume on the VPS (backed up weekly). |
| `ANTHROPIC_API_KEY`, `GOOGLE_TRANSLATE_API_KEY` | Optional | Assistant answers and machine translation |

Payment, email and AI keys can also be entered in **Admin, Integrations** after the first deploy. Values saved there are encrypted and take priority.

## 6. Deploy

Panel: **step 5, Build and deploy**. By hand, from the project folder:

```bash
release=$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)
git archive --format=tar.gz -o $release.tar.gz HEAD
scp $release.tar.gz deploy/vps/*.sh root@<VPS IP>:/opt/myseed/incoming/
ssh root@<VPS IP> "bash /opt/myseed/incoming/deploy.sh $release"
```

`deploy.sh` unpacks the release, builds the API, website and admin images one at a time while the current site keeps serving, dumps the database, switches `/opt/myseed/current`, starts the new containers and checks that the API, website and admin answer. The `migrate` container applies schema changes (`prisma db push`) and seeds missing defaults before the API starts.

The first deploy takes 10 to 20 minutes. Then open:

- https://myseed.com.et
- https://admin.myseed.com.et (sign in, then change the seeded admin password straight away in **Profile**)
- https://api.myseed.com.et/healthz

## 7. After the first deploy

1. **Admin, Integrations**: add or test email, Chapa and Stripe. Send a test email and run a test checkout (Chapa test mode first).
2. **Admin, Sponsorship**: check prices, and set the international card (USD) price; 0 hides the card option in the **Sponsor a student** popup.
3. **External uptime monitor**: the built-in checks run inside the API, so they cannot report the API itself being down. `.github/workflows/uptime.yml` checks the three addresses from GitHub every 30 minutes and opens a `downtime` issue (GitHub emails repository watchers) until they recover. Turn it on in GitHub, **Settings, Secrets and variables, Actions, Variables**: add `UPTIME_ENABLED` = `true`. For checks every minute or SMS alerts, add a free UptimeRobot or Better Stack monitor as well.
4. **Staff notifications**: in **Admin, Integrations, Alert channels** set the alert email (for example info@myseed.com.et). New inquiries, failed payments and new donations are sent there; each can be switched off on the same page.
5. **Backups**: in the panel, **Backups, Back up and download now**. Do it weekly, so a copy exists off the VPS. Also turn on Hostinger's weekly VPS snapshots in hPanel.
6. **Search engines**: submit `https://myseed.com.et/sitemap.xml` in Google Search Console and Bing Webmaster Tools; paste the verification codes in **Admin, SEO**.

## 8. Everyday operations

| Task | Panel | By hand (on the server, in `/opt/myseed/current`) |
| --- | --- | --- |
| Deploy new code | Commit in **Code (GitHub)**, then **Build and deploy** | Section 6 |
| Roll back | **Roll back** | `bash /opt/myseed/incoming/deploy.sh --rollback` |
| Restart | **Restart app** | `bash /opt/myseed/incoming/deploy.sh --restart` |
| Logs | **Show log** (pick a service) | `docker compose -p myseed -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml logs --tail 200 api` |
| Back up now | **Back up database** | `bash deploy/vps/backup.sh` |
| Status | **Overview, Check now** | `docker compose -p myseed ... ps` |

Shortcut for the long compose command on the server:

```bash
echo "alias dc='cd /opt/myseed/current && docker compose -p myseed -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml'" >> ~/.bashrc
```

### Restore a backup

Restoring replaces the live database. Backups are plain SQL dumps (`myseed-YYYYMMDD-HHMMSS.sql.gz`), kept 14 days in `/opt/myseed/backups`, plus the copies you downloaded to `backups/vps` on your computer.

```bash
cd /opt/myseed/current
dc stop api web admin
gunzip -c /opt/myseed/backups/myseed-<stamp>.sql.gz | dc exec -T postgres psql -U myseed -d myseed_academy
dc start api web admin
```

Practise this once on a spare VPS (or locally with `docker compose up -d postgres`) so it is familiar before it is needed. Uploaded files are in `uploads-<stamp>.tar.gz` (weekly) and restore with `docker run --rm -v myseed_uploads:/data -v /opt/myseed/backups:/in alpine tar xzf /in/uploads-<stamp>.tar.gz -C /data`.

### Moving to a new VPS

1. Panel: **Back up database** on the old server.
2. Prepare the new VPS (sections 1, 3 and 4) and copy `/opt/myseed/.env` from the old server to the new one **before** the first deploy, so `ENCRYPTION_KEY` and the database password carry over.
3. Deploy, restore the backup (above), then change the A records to the new IP.

## 9. Troubleshooting

| You see | Fix |
| --- | --- |
| Test connection: `Permission denied (publickey)` | The panel's key is not on the server yet. Add it (section 3) and wait 30 seconds when using the API. |
| Test connection times out | Wrong IP, the VPS is stopped, or a custom SSH port. Check hPanel, VPS, Overview. |
| Browser shows a certificate warning | DNS did not point at the VPS when Caddy started. Fix the A records, then **Restart app**. Caddy retries by itself too. See **Show log, caddy**. |
| `ADMIN_DOMAIN is missing from /opt/myseed/.env` | Save the domains in step 3 and **Send settings to the server**. |
| Build stops with `Killed` or `ENOMEM` | Not enough memory. Check swap with `free -m` (setup adds it), or move to KVM 2. |
| `The release did not become healthy` | The deploy prints the API log. Common causes: a schema change `prisma db push` refused (see **Show log, migrate**), or a missing setting. **Roll back** keeps the site up while you fix it. |
| Site works, but sign-in to admin fails | `ALLOWED_ORIGINS` does not include the admin domain. `env.sh` sets it from the domains; send the settings again and **Restart app**. |
| Emails do not arrive | **Admin, Integrations, Email, Send test**. Check SMTP host, port 465 and the mailbox password. Gmail delivery depends on SPF, DKIM and DMARC for myseed.com.et. |
| Disk full | `docker system prune -af` on the server removes old images (the next deploy rebuilds what it needs). Old backups older than 14 days are deleted automatically. |

## 10. Running it on your own computer

```bash
npm install
npm run local:domains              # once: adds myseedweb.local and friends to the hosts file (asks for admin rights)
docker compose up -d postgres      # or any PostgreSQL 16
npm run db:setup                   # schema and seed data
npm run dev                        # starts everything plus the local-domain proxy
```

| Address | What |
| --- | --- |
| http://myseedweb.local | Website (dev server on port 3000) |
| http://myseedwebadmin.local | Admin console (port 3001) |
| http://myseedapi.local | API (port 8080) |

`npm run dev` starts a small proxy on port 80 (`scripts/local-proxy.mjs`) that sends each name to its dev server, hot reload included. If port 80 is taken (IIS, Skype), run with `LOCAL_PROXY_PORT=8088` and add `:8088` to the addresses, or use `npm run dev:ports` and the plain `localhost:3000` and `:3001`.

If PostgreSQL is not reachable, the API serves from a seeded in-memory store, so the site still runs for design work.

To try the production builds on this computer:

```bash
npm run build          # website, admin console and API type check
npm run start:local    # production servers at the same .local addresses
```

`start:local` runs in production mode but allows the sign-in cookie over plain http (`COOKIE_SECURE=false`); real hosting keeps it HTTPS-only.

## 11. Other hosts: Render, Netlify, Vercel, Supabase

| Part | Where it can run | Files |
| --- | --- | --- |
| API | VPS or Render (a long-running server) | `render.yaml` |
| Website, admin console | VPS, Render, Netlify or Vercel | `render.yaml`, `apps/web/netlify.toml`, `apps/admin/netlify.toml` |
| Database | VPS container, or Supabase (any PostgreSQL works) | |

In the control panel:

1. **Deploy plan**: pick Render, Netlify or Vercel.
2. **Database (Supabase)**: connect the project (session pooler, port 5432), then **Create tables and starting content**. Put Supabase in the same region as the API (Render Frankfurt with Supabase Frankfurt).
3. **Domains**, **Keys and settings**: the panel generates `ENCRYPTION_KEY`, `JWT_SECRET` and `REVALIDATE_SECRET` once and copies everything to the hosts. Never change `ENCRYPTION_KEY` after launch.
4. **Render**: **Create services from render.yaml**, link the services, push to GitHub, **Deploy latest commit**. Render's free instances sleep after 15 idle minutes and have no lasting disk, so connect an S3 or R2 bucket for uploads.
5. **Netlify** / **Vercel**: create and link a site or project for the website and the admin console, then **Deploy**. Vercel's Hobby plan is non-commercial only; a donations site needs Pro.
6. Add each custom domain in the host's dashboard; it shows the CNAME record to create (the **Domains** page lists them).

### Moving data between this computer and Supabase

`npm run db:sync -- status | push | pull | backup local|remote | restore local|remote <file>` (the control panel's **Database** page has the same buttons). It copies every table, backs up the side being replaced first (`backups/local`, `backups/supabase`) and replaces it in one transaction, so a failure changes nothing. Both sides must use the same `ENCRYPTION_KEY` (the panel uses the one from your local `.env`) so keys saved in Admin, Integrations stay readable. Uploaded media files are not in the database; use an S3 or R2 bucket on Render.
