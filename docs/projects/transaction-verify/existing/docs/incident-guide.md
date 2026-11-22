# Incident guide

For the MySeed platform team. An incident is anything payers or organizations notice: payments not checked, the console or API down, webhooks or messages late, or data exposed. For a single alert with no visible effect, the [runbooks](runbooks.md) are enough.

## Severity

| Level | Example | Status page impact | Who is told |
|---|---|---|---|
| SEV1 | API or console down; no payments checked; data seen by the wrong organization; a key leaked | Critical or major | All platform owners at once; affected organizations within 1 hour; the regulator where the law asks (see Data breach) |
| SEV2 | One bank's checks failing; webhooks late for many organizations; slow checks | Major or minor | Operations on call; status page |
| SEV3 | One organization's integration broken; one message provider down | Minor or none | The organization directly |

## The first 15 minutes

1. **Own it.** One person leads: they post updates and decide. Acknowledge the alert on the Ops page.
2. **Say so.** On **Platform, Operations, Status page**, choose **New incident**:
   - a plain title ("Payment checks are slow")
   - the impact and the affected parts
   - a first update: what people see and that we are on it
   The public page at `/status` shows it at once. Each part also turns yellow or red by itself from open alerts.
3. **Stop the harm.** Turn off the failing connector (Methods) or the failing feature (Feature flags). Restart the failing container. If a key or secret leaked, revoke it first and investigate after.
4. **Keep evidence.** Do not delete logs or rows. Copy the worker and API logs for the window: `docker compose logs --since 2h tv-api tv-worker > incident-<date>.log`.

## While it lasts

- Post an update at least every 30 minutes, even with nothing new. Use the states as they come: **Investigating** (looking), **Identified** (cause known), **Monitoring** (fix in, watching).
- Write for an accountant at a school, not an engineer: what they see, what to do (usually nothing; payments wait and are checked once we are back), and when you will update next.
- Never put an organization's name, a payer's name, an account number or a receipt on the status page.

## Closing

1. Post **Resolved** with one sentence on what happened. The incident moves to the last 14 days on the status page.
2. Within 5 working days, write a review in the team's notes:
   - the timeline
   - the cause
   - why the alerts did or did not catch it
   - the changes to make
   Add a runbook section if one was missing.
3. For SEV1, send the review's summary to the affected organizations.

## Data breach

A personal data breach (payer names, phone numbers, account details or receipts seen by someone who should not see them) has legal duties under Ethiopia's Personal Data Protection Proclamation (No. 1321/2024).

1. Contain it, then tell the platform owners at once.
2. Record what was exposed, for which organizations and payers, how, and when it started and stopped. The audit log and `api_request_log` help.
3. MySeed processes this data for the organizations, which are the controllers. Tell the affected organizations without delay, so they can meet their own duty to notify the authority and the people concerned.
4. Confirm the notification deadlines and contents with legal counsel. These are not settled engineering facts.

## Recovery estimates

These come from restore drills (Ops page). Update them after each drill.

- **Database restore:** the drill's total time, plus about 10 minutes to stop the services and switch.
- **Data lost at worst:** back to the newest nightly backup, up to 24 hours. The server's own nightly backup at 02:45 (backup.sh) is a second copy.
- **Receipt files:** they are not in database backups. They are in the main storage and the sealed archive; keep both disks or buckets backed up by the host.
