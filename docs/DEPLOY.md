# Deploying Myseed Content Manager for free

This guide puts the app online at no cost with **Netlify (free plan)** for the website and **Supabase (free plan)** for the database. It takes about 30 minutes. You need a GitHub account and the project in a GitHub repository.

> **Shortcut:** the control panel (`python control-panel/control_panel.py`, see [control-panel/README.md](../control-panel/README.md)) does steps 2 to 4 and section 6 from your browser: it pushes your data to Supabase, sets the Netlify (or Vercel or Render) environment variables and deploys. The manual steps below still apply if you prefer them.

## Can Netlify free handle it alone?

No. Netlify runs the website, but it does not keep files between requests, so it cannot hold the database. You need a hosted PostgreSQL database as well. **Supabase free** is the recommended one: the app already supports it, and it costs nothing.

| Service | What it does here | Free plan, as of October 2026 | What to watch |
| --- | --- | --- | --- |
| Netlify | Website and server code | 300 credits per month, hard limit. A production deploy costs about 15 credits; page views and server time also use credits. | When credits run out the site pauses until next month. Deploy in batches (not after every small change) and check **Usage** in Netlify every week or two. |
| Supabase | Database | 500 MB database, 2 projects | The project pauses after 7 days without any activity. The app's 15-minute scheduled checks keep it active. If it ever pauses, press **Restore** in Supabase. |

For a team of about 5 to 15 people this fits within both free plans. The app is built to stay light: open chats check for new messages every 5 seconds, badges every 45 seconds, and nothing polls in background tabs.

Free plan terms change. Check https://www.netlify.com/pricing and https://supabase.com/pricing before you rely on them.

**Free alternatives, if Netlify credits run short:**

- **Render** (free web service): the whole app on one small server, connected to the same Supabase database. It sleeps after 15 minutes without visitors, so the first page after a pause takes about 30 seconds. Steps are in section 7.
- **Vercel Hobby**: very similar to Netlify and generous, but the Hobby plan is for non-commercial use only. Read its terms first.

---

## 1. Create the database (Supabase)

1. Go to https://supabase.com and sign up (GitHub sign-in is easiest).
2. Choose **New project**:
   - **Name**: `myseed`
   - **Database password**: choose a strong password and save it in your password manager. You need it below.
   - **Region**: **East US (Ohio), us-east-2**, the same region where Netlify runs the app's server code by default. Each page makes several database queries, and every one crosses the distance between the two, so keeping them together matters far more than being close to your team. With the database in Frankfurt and Netlify in Ohio, pages took seconds and the heaviest (Admin) hit Netlify's 10-second limit and showed "This page could not load". On Render, pick the same region for the web service and the database instead.
   - **Plan**: Free.
3. Wait about 2 minutes for the project to start.
4. Click **Connect** at the top of the project page and open the **Connection string** tab. Copy two strings:
   - **Transaction pooler** (ends in `:6543/postgres`). The website uses this one.
   - **Session pooler** (ends in `:5432/postgres`). Your computer uses this one to load data.
5. In both strings, replace `[YOUR-PASSWORD]` with your database password. If the password contains `@`, `#`, `/`, `?` or `%`, write them as `%40`, `%23`, `%2F`, `%3F` and `%25`.

They look like this:

```
postgresql://postgres.abcdefghijkl:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
postgresql://postgres.abcdefghijkl:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

You do not need to create tables. The app creates them itself the first time it connects.

> The app talks to the database directly. It does not use Supabase's Data API, so Supabase changes to the Data API do not affect it.

## 2. Load your users and curriculum into Supabase

On your computer, in the project folder (Node.js 22 or newer installed):

```powershell
npm install
$env:DATABASE_URL = "<your SESSION pooler string, port 5432>"
npm run db:reset
Remove-Item Env:DATABASE_URL
```

On macOS or Linux, use `DATABASE_URL="<session pooler string>" npm run db:reset` instead.

The first line it prints must be `Database: PostgreSQL (DATABASE_URL)`. If it says *Embedded PostgreSQL*, the variable was not set and nothing was sent to Supabase.

`db:reset` empties the database, creates the five accounts, loads `data-import/curriculum.json` and prints each person's starting password. The passwords are also saved in `data/initial-credentials.md` on your computer only. Hand them out privately, then delete that file. Everyone must choose a new password at first sign-in.

## 3. Create the website (Netlify)

1. Go to https://app.netlify.com and sign up with GitHub.
2. Choose **Add new site → Import an existing project → GitHub**, then pick the repository.
3. Netlify reads the settings from `netlify.toml`: build command `npm run build`, publish directory `.next`, Node 22. Leave them as they are.
4. **Before deploying**, open **Site configuration → Environment variables → Add a variable** and add:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Your **transaction pooler** string (port **6543**) |
| `DATABASE_POOL_SIZE` | `3` |
| `CRON_SECRET` | A long random text, for example the output of `openssl rand -hex 32`, or 40 random letters and digits |

5. Choose **Deploy**. The first build takes 3 to 5 minutes.
6. Open the site address Netlify shows (for example `https://myseed-content.netlify.app`) and sign in as Kidus with the password from step 2.

## 4. Check the scheduled alerts

`netlify/functions/scheduled-checks.mts` runs every 15 minutes. It sends deadline, blocker and handoff alerts, and keeps Supabase from pausing. After the first deploy, open **Logs → Functions → scheduled-checks**: within 15 minutes you should see `scheduled-checks 200`. A `401` means `CRON_SECRET` is missing or was added after the deploy. Add it, then use **Deploys → Trigger deploy**.

## 5. Your own domain (optional)

**Domain management → Add a domain**, then follow the DNS steps. Netlify issues the HTTPS certificate automatically.

## 6. Updating the site

- Push changes to the main branch and Netlify rebuilds automatically. Each production deploy costs about 15 credits on the free plan, so group several changes into one push.
- Database tables are only ever added to, so updates never lose data. Still, download a backup first (**Admin → Data → Download full backup**).
- To load a newer curriculum tracker file without wiping data, sign in as Admin or the Recording team lead and use **Import and export → Curriculum tracker JSON**. Or run `npm run db:import -- path/to/file.json` with the session pooler `DATABASE_URL`.

## 6a. Moving to a new account or region, keeping the data

Use this to deploy from another GitHub or Netlify account, or to move the database next to the app.

1. **Save the live data.** In the control panel, **Backups → Back up Supabase**. Without the panel: `$env:DATABASE_URL = "<old session pooler string>"; npm run backup` writes `backups/myseed-….json`.
2. **New database** (only when moving region): create the Supabase project as in section 1, in East US (Ohio).
3. **Load the data into it.** In the panel, paste the new connection strings on **Supabase sync**, then **Backups → To Supabase** on the file from step 1. Without the panel: `$env:DATABASE_URL = "<new session pooler string>"; npm run db:bulk-restore -- backups/<file>.json`. Accounts and passwords come along.
4. **New site.** Fork or clone the repository into the new GitHub account, then create the Netlify site from it (section 3). In the panel, connect the new Netlify account, choose the site and press **Copy settings from Supabase**, then deploy.
5. If nobody can sign in, give the admin a new temporary password: `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/set-password.ts kidus@myseed.local` (with `.env` pointing at the database).

Deploys from this computer ("Build here and upload") leave a `.netlify` folder that contains a copy of `.env`. It is git-ignored; never commit it.

## 7. Alternative: Render (one free server)

Use this if you prefer not to count Netlify credits. It uses the same Supabase database from steps 1 and 2.

1. https://render.com → **New → Web Service** → connect the repository.
2. **Runtime**: Node. **Build command**: `npm install && npm run build`. **Start command**: `npm start`. **Instance type**: Free.
3. Environment variables: `DATABASE_URL` (the **session pooler** string, port 5432, works best on a long-running server), `DATABASE_POOL_SIZE` = `5`, `NODE_VERSION` = `22`.
4. Deploy. The free instance sleeps after 15 minutes idle, so the first visit afterwards is slow. Scheduled checks then run only while people use the app.

## 8. Troubleshooting

| You see | Fix |
| --- | --- |
| "DATABASE_URL is not set" | Add it in Netlify environment variables, then **Trigger deploy**. Variables only apply to new deploys. Make sure the variable's **context** includes **production** — a variable scoped only to deploy previews leaves the live site without it (server actions such as signing in then fail with a 500). |
| `password authentication failed` | Wrong database password, or special characters not URL-encoded (step 1.5). |
| `Tenant or user not found` | The user name in pooler strings is `postgres.<project-ref>`, not just `postgres`. Copy the string again from **Connect**. |
| `too many connections` | Set `DATABASE_POOL_SIZE` to `2` or `3` and make sure Netlify uses the transaction pooler (port 6543). |
| The site says "Site not available" | Netlify credits for the month are used up. Check **Usage**. It resets at the start of the next billing cycle; reduce deploys or move to Render (section 7). |
| Pages fail and Supabase shows "Paused" | Open the Supabase project and press **Restore**. Check that the scheduled-checks function runs (section 4). |
| The first page after a while is slow | A serverless cold start plus the database connection (about 2 seconds through the pooler). Later pages are fast. |
| Every page is slow, or a page shows "This page could not load" | The website and the database are far apart (section 1, Region). Netlify stops a page after 10 seconds. Move the database next to the app (section 6a). |
| Login works locally but not online | Make sure you ran `db:reset` against Supabase (step 2) and not only on your computer. |

## 9. Running it on your own computer

```bash
npm install
npm run setup      # empties the local database and loads accounts and the curriculum
npm run dev        # http://localhost:3020
```

Locally the app uses an embedded PostgreSQL in `data/pg`. No Supabase is needed. Stop `npm run dev` before any `npm run db:` command.
