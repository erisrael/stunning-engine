# Releases, deploys and incidents

How the Dev team ships a change to production, checks it, undoes it when it goes wrong, and handles an incident. Production is **https://ops.myseed.com.et**, running on a Hostinger VPS.

## 1. How production is deployed

- The VPS runs the app in Docker (project `myseed-cm`): the app container, PostgreSQL 17 next to it (or Supabase, by setting), and Caddy for HTTPS. The files are `Dockerfile` and `deploy/vps/`.
- **Auto deploy**: the VPS checks `main` every 2 minutes. A new commit is built into a new image; when the build and the health check pass, it replaces the running app. A failed build keeps the previous release running and waits for the next push.
- On start the app updates the database schema by itself (additive changes only, RULE-20) and brings the repository's documents into Specs and docs.
- A watchdog restarts the app when it stops answering its health check; the container has a memory cap so a runaway app cannot push the database out of memory.
- The control panel (`npm run panel`, see `control-panel/README.md`) can also build and deploy, roll back, restart, back up, restore and show logs.

So **merging to `main` is releasing**. Everything below happens before the merge.

## 2. Before the merge

- [ ] Every task in the release passed QA and sits in Ready to release
- [ ] CI is green on the pull request (type check, build, server tests, browser tests)
- [ ] The pull request has an approval from someone other than the author
- [ ] Database changes: additive, `SCHEMA_VERSION` raised, new tables in `TABLES`, tried on a copy of real data when they migrate rows
- [ ] New settings or keys: written down for whoever sets them on the server (never in the repository)
- [ ] Release notes drafted (below)
- [ ] It is a good moment: people are around to watch, not before a weekend or holiday, nothing else risky going out (RULE-72)

## 3. Release notes and versions

In Dev team, Releases and quality, make a release with a semantic version:

- **Major** (2.0.0): a change people must adapt to (a workflow or a role changes).
- **Minor** (1.3.0): new features.
- **Patch** (1.2.1): fixes only.

Add the tasks (the drafted release notes come from them), then write the notes for the people who use the system, in their words: New, Improved, Fixed, Known issues. Mark the release as shipped after the deploy; that feeds the DORA measures. Use the **Release notes** template in Specs and docs for larger releases.

## 4. After the deploy

Within minutes of the merge:

1. Watch the deploy finish (control panel, or Admin, Platform, Status and deploys).
2. Check health: `https://ops.myseed.com.et/api/health` answers OK.
3. Sign in and use the changed area as the roles it affects.
4. Check Admin, System, Errors for new errors.
5. Tell the people affected, with the release notes.

## 5. Rolling back

When a release breaks something important, undo first and investigate second (RULE-73):

- **Fastest**: the control panel's **Roll back** puts the previous release back.
- **Through git**: revert the merge commit on `main` in a pull request (or directly, by the Head of Dev in an emergency); auto deploy ships the revert.
- **Database**: schema changes are additive, so the previous release runs on the newer schema. If data was damaged, restore from a backup only with the Head of Dev ([RECOVERY.md](../RECOVERY.md), sections 2 and 3), and take a backup of the current state first.

## 6. Hotfixes

A fix for a production problem follows the normal path, faster: a `fix/` branch from `main`, a small pull request, a reviewer found straight away, CI green, merge, check. Skipping review is allowed only for the Head of Dev during an incident, and the change is reviewed afterwards.

## 7. Incidents

An incident is production down or unusable for a group of people, wrong or lost data, money at risk (payments, Chapa, payroll), or a security problem.

| Severity | Examples | Response |
| --- | --- | --- |
| 1 | Site down; sign-in broken for everyone; data being lost; payments wrong; a leak | Drop everything; the Head of Dev leads; updates to the people affected until it is fixed |
| 2 | An important area broken (support desk, attendance, production workflow) with no workaround | Handled the same day by the people who know the area |
| 3 | A broken feature with a workaround; a slow page | A bug in the backlog with high priority |

What to do:

1. **Tell** the Head of Dev at once (call), and record an incident in Dev team, Releases and quality with its severity. That files a bug and starts the timeline.
2. **Stabilise**: roll back the last release if it is the likely cause; switch the affected module off in Settings if that helps.
3. **Communicate**: one person tells the people affected what is happening and when they will hear next.
4. **Fix** through the hotfix path.
5. **Close** the incident when it is resolved (that gives the time to restore).
6. **Postmortem** for severity 1 and 2, in Specs and docs from the Postmortem template, blameless, with actions that become tasks (RULE-81).

## 8. Backups

The app backs itself up on a schedule (Admin, System, Backups); the control panel can back up the VPS and download the file. Before anything that replaces data (a restore, a bulk import, copying data between this computer and the VPS) take a fresh backup and write its name on the task (RULE-25). Details are in [RECOVERY.md](../RECOVERY.md).

## Related documents

- [Rule book](RULEBOOK.md), sections 10 and 11
- [Runbook](../RUNBOOK.md) and [backups and recovery](../RECOVERY.md)
- [Deploying for free (Netlify and Supabase, the earlier setup)](../DEPLOY.md)
- [Test plan](../project/TEST-PLAN.md)
