import { all, get, nowIso, run } from "./db";
import { getMeta, getSettings, setMeta } from "./settings";
import { managers, notify } from "./notifications";
import { purgeTrash } from "./trash";
import { cleanupChatFiles } from "./chat";
import { hrReminderChecks } from "./hr";
import { trainingReminders } from "./hr-growth";
import { BLOCKER_CAUSE_LABELS, STAGE_LABELS, type Stage } from "@/lib/domain";
import { localDate } from "@/lib/format";

// Scheduled checks: deadlines, blockers, stale timers, waiting handoffs and question escalation.
// Each alert has a dedupe key per item and day, so repeated runs and page refreshes never re-send.
export async function runScheduledChecks(now = nowIso()) {
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const day = localDate(now, tz);
  const nowMs = new Date(now).getTime();
  const counts = { dueSoon: 0, overdue: 0, blockers: 0, stale: 0, handoffs: 0, questions: 0 };

  const soon = new Date(nowMs + s.alerts.dueSoonHours * 3600e3).toISOString();
  const due = await all<{ id: string; code: string; title: string; current_due_at: string; next_action_owner_id: string | null }>(
      "SELECT id, code, title, current_due_at, next_action_owner_id FROM items WHERE lifecycle IN ('draft','in_production') AND current_due_at IS NOT NULL AND current_due_at <= ?",
      soon,
    );
  for (const i of due) {
    const overdue = i.current_due_at < now;
    const recipients = overdue ? [i.next_action_owner_id, ...await managers()] : [i.next_action_owner_id];
    await notify(
            recipients,
            {
              type: overdue ? "overdue" : "deadline",
              title: overdue ? `Overdue: ${i.code}` : `Due soon: ${i.code}`,
              body: i.title,
              link: `/items/${i.id}`,
              itemId: i.id,
              // Overdue alerts repeat at most once per day; due-soon alerts once per deadline.
              dedupeKey: overdue ? `overdue:${i.id}:${day}` : `due-soon:${i.id}:${i.current_due_at}`,
            },
            now,
          );
    if (overdue) counts.overdue++;
    else counts.dueSoon++;
  }

  const blockerCut = new Date(nowMs - s.alerts.blockerAgeHours * 3600e3).toISOString();
  const blockers = await all<{ id: string; item_id: string; code: string; cause: string; resolver_id: string | null; opened_at: string }>(
      `SELECT b.id, b.item_id, i.code, b.cause, b.resolver_id, b.opened_at FROM blockers b JOIN items i ON i.id = b.item_id
     WHERE b.resolved_at IS NULL AND b.opened_at <= ?`,
      blockerCut,
    );
  for (const b of blockers) {
    await notify(
            [b.resolver_id, ...await managers()],
            {
              type: "blocker",
              title: `Unresolved blocker on ${b.code}`,
              body: `${BLOCKER_CAUSE_LABELS[b.cause] ?? b.cause}, open since more than ${s.alerts.blockerAgeHours}h`,
              link: `/items/${b.item_id}`,
              itemId: b.item_id,
              dedupeKey: `blocker-age:${b.id}:${day}`,
            },
            now,
          );
    counts.blockers++;
  }

  const staleCut = new Date(nowMs - s.alerts.staleSessionHours * 3600e3).toISOString();
  const stale = await all<{ id: string; user_id: string; item_id: string; code: string }>(
      `SELECT ws.id, ws.user_id, ws.item_id, i.code FROM work_sessions ws JOIN items i ON i.id = ws.item_id
     WHERE ws.ended_at IS NULL AND ws.started_at <= ?`,
      staleCut,
    );
  for (const w of stale) {
    await notify(
            [w.user_id],
            {
              type: "deadline",
              title: `Is your timer on ${w.code} still running?`,
              body: `It has been open for more than ${s.alerts.staleSessionHours}h. Review it so effort stays accurate.`,
              link: `/dashboard?review=sessions`,
              itemId: w.item_id,
              dedupeKey: `stale:${w.id}`,
            },
            now,
          );
    counts.stale++;
  }

  const waitCut = new Date(nowMs - s.alerts.handoffWaitHours * 3600e3).toISOString();
  const waiting = await all<{ item_id: string; code: string; stage: Stage; id: string }>(
      `SELECT a.item_id, i.code, a.stage, a.id FROM stage_attempts a JOIN items i ON i.id = a.item_id
     WHERE a.status = 'awaiting_handoff' AND a.handoff_submitted_at <= ?`,
      waitCut,
    );
  for (const w of waiting) {
    await notify(
            await managers(),
            {
              type: "handoff",
              title: `Handoff waiting over ${s.alerts.handoffWaitHours}h: ${w.code}`,
              body: `${STAGE_LABELS[w.stage]} submitted and nobody has accepted or returned it yet.`,
              link: `/items/${w.item_id}`,
              itemId: w.item_id,
              dedupeKey: `handoff-wait:${w.id}`,
            },
            now,
          );
    counts.handoffs++;
  }

  const questions = await all<{ id: string; owner_id: string; asked_by: string; question: string; item_id: string | null; due_at: string; escalation_level: number; escalation_history: string }>(
      "SELECT * FROM manager_questions WHERE status = 'open' AND due_at IS NOT NULL AND due_at < ?",
      now,
    );
  for (const q of questions) {
    if (q.escalation_level >= 1) continue;
    const hist = JSON.parse(q.escalation_history || "[]");
    hist.push({ at: now, level: 1, note: "Answer deadline passed" });
    await run("UPDATE manager_questions SET escalation_level = 1, escalation_history = ? WHERE id = ?", JSON.stringify(hist), q.id);
    await notify(
            [q.owner_id, q.asked_by],
            {
              type: "question",
              title: "Question past its answer deadline",
              body: q.question.slice(0, 140),
              link: q.item_id ? `/items/${q.item_id}?tab=discussion` : "/questions",
              itemId: q.item_id,
              dedupeKey: `question-escalated:${q.id}`,
            },
            now,
          );
    counts.questions++;
  }
  // Trash entries are kept for a fixed period, then removed for good.
  await purgeTrash({ actor: null, source: "system" }, "expired");
  // Voice messages past their 10 minutes, and uploads never sent.
  await cleanupChatFiles(200);
  // HR: documents, contracts and probation coming up (deduplicated per date, so this runs safely every time).
  await hrReminderChecks(now);
  await trainingReminders(now);
  await setMeta("lastChecksAt", now);
  return counts;
}

// Called on page loads; runs the checks at most every 10 minutes.
export async function maybeRunScheduledChecks() {
  const last = await getMeta("lastChecksAt");
  if (last && Date.now() - new Date(last).getTime() < 10 * 60e3) return;
  try {
    await runScheduledChecks();
  } catch (err) {
    console.error("Scheduled checks failed", err);
  }
}

export async function hasData() {
  return ((await get<{ c: number }>("SELECT COUNT(*) AS c FROM users"))?.c ?? 0) > 0;
}
