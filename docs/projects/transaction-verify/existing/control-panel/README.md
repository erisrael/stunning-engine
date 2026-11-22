# Transaction Verify control panel

A local web panel that runs the whole system on this computer (the PostgreSQL 17 database, the verification API with the hosted payment page, the workers, the academy demo backend, migrations, backups, the sandbox, the checks and GitHub) and deploys it to the Myseed VPS at https://transactionverify.myseed.com.et, with Render and Supabase as optional extra hosts. It follows the same design as the Myseed Content Manager and MySeed Academy panels.

It needs Python 3.10+ (standard library only, no `pip install`), Node.js 24 and npm. Git and the OpenSSH client that ships with Windows 10 and 11 are needed to deploy. Docker is only needed on the server.

## Start and stop

| Do this | How |
| --- | --- |
| Start (opens the browser) | Double-click **Start Control Panel.cmd**, or run `python control-panel/control_panel.py` (also `npm run panel`) |
| Is it running? | `python control-panel/control_panel.py status` |
| Stop everything | **Stop and exit** in the panel, or `python control-panel/control_panel.py stop` |
| Stop the panel, keep jobs running | **Settings, Exit panel**, or `python control-panel/control_panel.py stop --keep-jobs` |
| Forgot the password | `python control-panel/control_panel.py set-password` |

The panel runs in the background at **http://verify.localhost:8767** (also http://127.0.0.1:8767). The Content Manager panel uses 8765 and the MySeed Academy panel 8766, so all three can run side by side: different ports, host names, cookies and settings folders. Closing the browser tab or the terminal does not stop it or its jobs.

The first time you open it, you choose a panel password.

## First run

The **Overview** shows a checklist that turns green step by step:

1. **Install packages** (`npm ci`) and **Build** everything.
2. **Configuration, Create .env**: writes `.env` with generated keys. It is git-ignored.
3. **Start the system**: starts PostgreSQL 17 from `data/pg`, applies migrations, then the API and workers.
4. **Sandbox, Create sandbox organization**: a server key, an approved account at the synthetic bank and a webhook to the academy demo. The key and webhook secret are shown once; the panel keeps encrypted copies.
5. **Local system, Academy demo backend, Start**, then **Sandbox, Create test payment** and open the payment page. Paste `https://sandbox.verify.example/r/SYN-1000` on the link tab.

## What each page does

| Page | What it does |
| --- | --- |
| Overview | Status of the database, API, workers and academy demo, the getting-started checklist, payment counts, recent jobs and backups |
| Configuration | `.env` keys (set or missing, never shown) and settings such as token lifetime, default deadline and storage |
| Open questions | Link to the plan's questions; answers are copied into the build |
| Local system | Start and stop each service; build, unit tests, end-to-end tests, full check, migrations, database status, no-emoji check |
| Database and backups | Migrations applied or pending, the model check, exact JSON backups with restore, download and delete |
| Sandbox | Sandbox organization, test payments with the hosted page link, synthetic receipts, recent submissions and webhook deliveries, and a console admin for the sandbox organization (staff console at `/console/`) |
| Hostinger VPS | Five steps: choose the VPS (the one running myseed.com.et), the panel's own SSH key, DNS and the shared Caddy, settings and prepare, then build and deploy. Also check routing, roll back, restart, database backup to `backups/vps`, logs per container, reboot, and live status (DNS, HTTPS, containers, disk, memory) |
| Render | Optional second host for the API and workers: connect a key, link the two services from `render.yaml`, receipt storage (S3-compatible), copy settings, deploy, recent deploys |
| Database (Supabase) | Optional cloud PostgreSQL: pick a project or paste a URL, apply migrations, compare row counts, back up the cloud, push this computer to the cloud or pull the cloud here (each side is backed up first; one transaction) |
| Code (GitHub) | Branch status, changed files, commit and push (after the no-emoji check), pull |
| Jobs and logs | Every background job with its live log; stop, run again, delete |
| Settings | Password, automatic backups, start at sign-in, port, exit |

**Restore is safe to undo.** It first saves a before-restore backup, then replaces every table in one database transaction, so a failure changes nothing. Stop the API and workers first; the panel insists.

**Stopping the database is clean.** The panel runs `npm run db:stop` (PostgreSQL's own fast shutdown) instead of killing it, because a killed PostgreSQL on Windows can leave a child process holding the port. `db:stop` also ends leftover PostgreSQL processes, but only ones started from this project's own binaries; a system PostgreSQL service is never touched.

## Deploy to the Myseed VPS

Transaction Verify shares the server with myseed.com.et but nothing else: its own folder `/opt/transactionverify`, its own containers (all named `tv-...`), its own PostgreSQL 17 and its own SSH key. Only the Caddy that already serves Myseed is shared, so the first deploy needs two one-time steps outside this project:

1. **DNS:** an `A` record `transactionverify` under `myseed.com.et` pointing at the VPS.
2. **Myseed Caddy:** apply `deploy/vps/myseed-edge.patch` to the My-Seed-Academy repository (`git apply`), then deploy Myseed once from its panel. It adds an import of `/opt/edge/sites/*.caddy`, a read-only mount and the shared `edge` network. Nothing else on the Myseed side changes.

After the first deploy, **Organization and first admin** creates the Myseed organization on the server: server key, webhook secret, first receiving accounts and the first console admin's setup link, all shown once and never written to a job log. See [docs/console.md](../docs/console.md).

After that, **Build and deploy** packages the last commit, uploads it, builds while the current release keeps serving, backs up the database, applies migrations, switches, and reloads Myseed's Caddy with the Transaction Verify site. Details: [deploy/vps/README.md](../deploy/vps/README.md).

The server generates its own `SUBMISSION_TOKEN_SECRET`, `DATA_ENCRYPTION_KEY`, `ACCOUNT_DIGEST_KEY` and `POSTGRES_PASSWORD` once and never replaces them; they never pass through this computer. The settings the panel sends (domain, deployment, defaults) go over SSH standard input, never on a command line.

## Security

- Listens on 127.0.0.1 only. Requests with another host name (DNS rebinding), from another site, or without the panel's header are refused.
- The panel password is a salted PBKDF2 hash. Five wrong attempts lock sign-in for five minutes. Sessions last 12 hours.
- Sandbox keys, webhook secrets and the Hostinger, Render and Supabase tokens are encrypted with Windows DPAPI, so only your Windows account on this computer can read them. They are masked in job logs and never sent back to the browser in full. Each token goes only to its own provider over HTTPS.
- The SSH private key for the VPS is kept in `%LOCALAPPDATA%\TransactionVerifyPanel\ssh`, outside the project and outside OneDrive.
- Database contents are read through fixed, named queries (`tools/panel-data.mjs`); the browser never sends SQL.
- Everything the panel stores is in `control-panel/.state` (git-ignored). Backups in `backups/` contain payment records, so keep that folder private.

## Tests

`npm run test:panel` (password hashing, secret masking, `.env` edits, detached jobs and locks).
