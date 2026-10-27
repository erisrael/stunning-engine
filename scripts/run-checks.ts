/*
 * Runs the scheduled checks once: due-soon and overdue alerts, unresolved blockers, stale timers,
 * unaccepted handoffs and question escalation. Safe to run as often as you like; alerts are deduplicated.
 *
 *   npm run checks
 *
 * Schedule it every 15 minutes with cron or Windows Task Scheduler (see docs/RUNBOOK.md).
 */
import { runScheduledChecks } from "../src/server/jobs";
import { closeDb } from "../src/server/db";

runScheduledChecks()
  .then((counts) => console.log(new Date().toISOString(), JSON.stringify(counts)))
  .finally(() => closeDb());
