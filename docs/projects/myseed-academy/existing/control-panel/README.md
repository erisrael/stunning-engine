# MySeed Academy control panel

A local web panel that deploys the platform (website, admin console, API, PostgreSQL) to the host you choose: a **Hostinger VPS**, **Render**, **Netlify** or **Vercel**, with the database on the VPS or on **Supabase**. It also commits and pushes to GitHub, runs the local dev servers and checks, and downloads database backups.

It needs Python 3.10+ (standard library only, no `pip install`), Git, and the OpenSSH client that ships with Windows 10 and 11. Docker is only needed on the server.

## Start and stop

| Do this | How |
| --- | --- |
| Start (opens the browser) | Double-click **Start Control Panel.cmd**, or run `python control-panel/control_panel.py` (also `npm run panel`) |
| Is it running? | `python control-panel/control_panel.py status` |
| Stop everything | **Stop and exit** in the panel, or `python control-panel/control_panel.py stop` |
| Stop the panel, keep jobs running | **Settings, Exit panel**, or `python control-panel/control_panel.py stop --keep-jobs` |
| Forgot the password | `python control-panel/control_panel.py set-password` |

The panel runs in the background at **http://127.0.0.1:8766** (the Content Manager panel uses 8765, so both can run). Closing the browser tab or the terminal does not stop it or a running deploy.

## Choose a deploy plan

**Deploy plan** sets where each part runs. The Overview then shows a checklist for that plan.

| Plan | Website and admin | API | Database |
| --- | --- | --- | --- |
| Everything on a Hostinger VPS (default) | VPS | VPS | PostgreSQL container on the VPS |
| Everything on Render | Render | Render | Supabase |
| Netlify | Netlify | Render | Supabase |
| Vercel | Vercel | Render | Supabase |
| Custom | any of the four | VPS or Render | VPS (with the API on the VPS) or Supabase |

The API is a long-running Express server (uploads, scheduled newsletters, uptime checks), so it runs on the VPS or Render, not on Netlify or Vercel.

**Domains** and **Keys and settings** are shared by every host: the panel turns them into each app's environment variables and copies them to the host before each deploy.

## First deploy on the VPS (about 30 minutes, most of it waiting)

1. **Domains.** The defaults are `myseed.com.et`, `www.myseed.com.et`, `admin.myseed.com.et` and `api.myseed.com.et`. Add the A records the page lists and wait until they resolve.
2. **Keys and settings.** SMTP password, and Chapa or Stripe keys if you have them (they can also go in Admin, Integrations later).
3. **Hostinger VPS**, step 1: paste a Hostinger API token (hPanel, profile, Account information, API) and pick the VPS, or type its IP address. Use Ubuntu 24.04.
4. Step 2: **Create the panel's SSH key**, then **Add with Hostinger API** (or paste the key in hPanel, VPS, Settings, SSH keys). **Test connection**.
5. Step 3: **Prepare the server** (Docker, firewall, swap, fail2ban, security updates, nightly backup).
6. Step 4: **Build and deploy**. Later deploys are this step only. Commit first, or tick **Include uncommitted changes**.

## First deploy on Render, Netlify or Vercel

1. **Database (Supabase)**: connect a Supabase token, pick the project, type its database password. The panel builds the session-pooler connection string. Or paste any PostgreSQL URL. **Create tables and starting content**.
2. **Domains** and **Keys and settings** as above. You can use the hosts' own addresses (for example `myseed-web.netlify.app`, `myseed-api.onrender.com`) until your domain is ready.
3. **Render**: connect an API key, press **Create services from render.yaml** (Render Blueprint), then link the API (and the website and admin, on the Render plan). Push your code to GitHub, then **Deploy latest commit**.
4. **Netlify** or **Vercel**: connect a token, **Create new site/project** for the website and the admin console (the panel sets the monorepo build settings), then **Deploy**. Netlify can build here and upload with its CLI, or build from GitHub; Vercel uploads with its CLI and builds there.

Each deploy copies the settings to the host first. **Show settings** lists what the host has.

## What a VPS deploy does

1. `git archive` packages the last commit (or the working tree) on this computer.
2. The server scripts in `deploy/vps/` and the settings are sent over SSH. Secrets travel on standard input, never on the command line, and are masked in job logs.
3. The code is uploaded to `/opt/myseed/incoming` and unpacked into `/opt/myseed/releases/<release>`.
4. The API, website and admin images are built one at a time while the current site keeps running.
5. The database is dumped to `/opt/myseed/backups`.
6. `/opt/myseed/current` is switched to the new release, the containers are replaced, and the API, website and admin are checked. A failed check fails the deploy and prints the API log.

**Roll back** rebuilds the previous release (the newest three are kept). The database is not rolled back.

## Pages

| Page | What it does |
| --- | --- |
| Overview | Checklist for your plan, where each part runs, live status (HTTPS checks of the three domains; containers, disk and memory on the VPS), recent jobs |
| Deploy plan | Presets and a custom mix of hosts for the website, admin console, API and database |
| Domains | The three public addresses and the DNS records to add for each host |
| Keys and settings | Email, payment, storage and AI keys; app secrets |
| Hostinger VPS | Server, SSH key, prepare, build and deploy, roll back, restart, back up, logs, reboot |
| Render, Netlify, Vercel | Connect a token, link or create the site, project or service for each app, copy settings, deploy, recent deploys |
| Database (Supabase) | Pick a Supabase project or paste any PostgreSQL URL, check the connection, create the tables, wake a paused project. **Push and pull**: compare row counts, push this computer's database to the cloud, pull the cloud to this computer, back up either side, restore any snapshot. Every replace backs up the side it replaces first and runs in one transaction. |
| Backups | Dump the VPS database and download it to `backups/vps` on this computer; how to restore |
| Code (GitHub) | Branch status, changed files, commit and push, pull |
| Local app | Dev servers (http://myseedweb.local and http://myseedwebadmin.local), production build, type check, API tests, local Docker database, `npm install` |
| Jobs and logs | Every background job with its live log |
| Settings | Password, start with Windows, port |

## Security

- Listens on 127.0.0.1 only. Requests with another host name, from another site, or without the panel's header are refused.
- The panel password is a salted PBKDF2 hash. Five wrong attempts lock sign-in for five minutes.
- Netlify, Vercel, Render, Supabase and Hostinger tokens go only to their own provider over HTTPS.
- Tokens and keys are encrypted with Windows DPAPI, so only your Windows account on this computer can read them. They never go back to the browser in full.
- The SSH private key is kept in `%LOCALAPPDATA%\MySeedControlPanel\ssh`, outside the project and outside OneDrive.
- On the server, `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET` and `REVALIDATE_SECRET` are generated once and never replaced. Changing `ENCRYPTION_KEY` would make the keys saved in Admin, Integrations unreadable.
- Only Caddy (ports 80 and 443) is reachable from the internet. The API, website, admin and database containers are not published on the server's IP.
- Panel state is in `control-panel/.state` and downloaded backups in `backups/`; both are git-ignored. Backups contain user accounts and donor details, so keep them private.
