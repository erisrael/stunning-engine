# Myseed control panel

A local web panel for running the Myseed Content Manager's data and deployments: push and pull data between this computer and Supabase, deploy to Netlify, Vercel or Render, push code to GitHub, run the app locally and keep backups.

It needs only Python 3.10+ (standard library, no `pip install`), Node.js and npm. Git is optional.

## Start and stop

| Do this | How |
| --- | --- |
| Start (opens the browser) | Double-click **Start Control Panel.cmd**, or run `python control-panel/control_panel.py` (also `npm run panel`) |
| Is it running? | `python control-panel/control_panel.py status` |
| Stop everything | **Stop and exit** in the panel, or `python control-panel/control_panel.py stop` |
| Stop the panel, keep jobs running | **Settings → Exit panel**, or `python control-panel/control_panel.py stop --keep-jobs` |
| Forgot the password | `python control-panel/control_panel.py set-password` |

The panel runs as its own background process at **http://127.0.0.1:8765**. Closing the browser tab, the terminal or VS Code does not stop it or its jobs. Only **Stop** on a job, or **Stop and exit**, ends running work. You can also turn on **Settings → Start when I sign in to Windows**.

The first time you open it, you choose a panel password.

## First-time setup

1. **Supabase sync**: paste the two connection strings from Supabase → **Connect** (session pooler, port 5432; transaction pooler, port 6543). Or connect a Supabase access token, pick the project and enter the database password, and the panel fills them in. **Test connection**.
2. **Hosting → Netlify** (or Vercel or Render): create an access token on the linked page and paste it. Pick or create the site.
3. **Copy settings from Supabase**: sets `DATABASE_URL`, `DATABASE_POOL_SIZE`, `CRON_SECRET` and `MYSEED_SHOW_DEMO_ACCOUNTS` on the host.
4. **Deploy**.

## What each page does

| Page | What it does |
| --- | --- |
| Overview | Status of every service, local versus Supabase row counts, the local dev server, recent jobs and backups |
| Supabase sync | Connection strings, project status (unpause a paused project), **Push** (this computer → Supabase) and **Pull** (Supabase → this computer) |
| Backups | Every snapshot, with restore to local or Supabase, download, delete. Optional automatic Supabase backups (Settings) |
| Hosting | Netlify, Vercel and Render: connect, choose a site, environment variables, deploy, deploy history with logs and cancel |
| Code (GitHub) | Branch status, changed files, commit and push, pull |
| Local app | Dev server, production build and server, type check, verification suite, templates, `npm install` |
| Jobs and logs | Every background job with its live log; stop, run again, delete |

**Push and pull are safe to undo.** Each one first saves a backup of the side being replaced (in `backups/local` or `backups/supabase`), then replaces the data in one database transaction, so a failure changes nothing. To undo, restore the "before-push" or "before-pull" backup from **Backups**.

The local database (`data/pg`) can be opened by only one program at a time. The panel refuses local database work while this project's app is running elsewhere (for example `npm run dev` in a terminal), and offers to stop its own dev server for you.

## Hosts

| Host | Deploy options | Notes |
| --- | --- | --- |
| Netlify | Build on Netlify from GitHub, or build here and upload (Netlify CLI) | Recommended. Free plan has 300 credits a month; a production deploy uses about 15. Scheduled alerts every 15 minutes. |
| Vercel | Upload this folder (Vercel CLI; Vercel builds it) | Hobby plan is free for non-commercial use. `vercel.json` runs the alert checks once a day. `.vercelignore` keeps `data/` and `backups/` from being uploaded. |
| Render | Deploy the latest commit | Create the web service once in the Render dashboard (build `npm install && npm run build`, start `npm start`). The free instance sleeps after 15 idle minutes. |

The CLI deploys use `npx` to download the Netlify or Vercel CLI the first time, which takes a minute.

## Security

- Listens on 127.0.0.1 only. Requests with another host name, from another site, or without the panel's header are refused.
- The panel password is stored as a salted PBKDF2 hash. Five wrong attempts lock sign-in for five minutes. Sessions last 12 hours.
- Connection strings and tokens are encrypted with Windows DPAPI, so only your Windows account on this computer can read them. They are never sent back to the browser, and they are masked in job logs.
- Tokens go only to their own provider over HTTPS.
- Everything the panel stores is in `control-panel/.state` (git-ignored). Backups contain password hashes and chat messages, so keep the `backups` folder private.
