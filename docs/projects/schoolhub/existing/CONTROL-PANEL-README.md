# SchoolHub control panel

A local page for running the SchoolHub stack and managing its database. It needs only Python 3.10 or later; the first run creates `tools/control-panel/.venv` and installs [pg8000](https://pypi.org/project/pg8000/), a pure-Python PostgreSQL driver, so no Postgres client tools are needed.

```
pnpm control-panel
# or
python tools/control-panel/control_panel.py [--port 8090] [--no-browser]
```

It opens http://127.0.0.1:8090. Ctrl+C quits and stops the services the panel started.

## What it does

| Tab | Purpose |
| --- | --- |
| Overview | Start or stop everything in order (database, pending migrations, API, worker, portal, local gateway), health of each part, database summary, quick links |
| Services | Start, stop, restart and read the live log of each service. Services started in another terminal are found by their port and can be stopped |
| Tasks | Install, build, migrate, load demo data, typecheck, lint, format check, emoji check, API tests, the portal crawl for every role, OpenAPI export. Tasks that rewrite files the API holds (the Prisma engine is locked on Windows while it runs) stop the API first and start it again afterwards |
| Schools | Every tenant with plan, students, staff, accounts and app links; suspend or reactivate (written to the platform audit log) |
| Accounts | Demo sign-ins for every role in every school; search any account and reset it to the demo password, unlock it, remove two-step verification, sign it out everywhere or disable it |
| Tables | Every table with size and whether row-level security protects it; browse rows with a column filter. Password hashes and secrets are hidden |
| SQL console | Runs queries in a read-only transaction unless writes are allowed (and confirmed); CSV download; saved queries |
| Backups | Logical backup of every table to a zip (CSV per table and a manifest of applied migrations) in `.control-panel/backups`; download, restore (refused when migrations differ) and delete |
| Queues | Outbox lag, background jobs by queue and status, failing jobs, school webhooks and message deliveries; retry dead jobs and purge finished ones |
| MySeed integration | Install a local stand-in for the MySeed Education System with a one-time code and watch verified events arrive; issue install codes for real deployments; installed clients and their delivery health |

## Safety

- The panel listens on 127.0.0.1 only and rejects requests whose Host header is not `127.0.0.1` or `localhost`.
- Every API call carries a token generated at start and embedded in the page, so other web pages cannot drive the panel.
- Destructive actions (reseed, restore, delete, disable, suspend, SQL with writes) ask you to type a confirmation word.
- It connects with `DATABASE_URL` from the environment or the repository `.env`, falling back to the development database on localhost:55432. Point it at a production database only if you mean to.
