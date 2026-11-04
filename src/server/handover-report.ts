// The handover report: for every part handed from one team to the next, when it was sent and when it was accepted or
// rejected, by whom, and how the cross-check went. Parts handed over one at a time (outside a batch) are included.

import { all } from "./db";
import { involved, seesAllHandovers } from "./editorial";
import { isLeadOf, scopeSql, type AppUser } from "./users";
import { NEXT_STAGE, type Stage } from "@/lib/domain";

export type ReportOutcome = "waiting" | "accepted" | "in_check" | "rejected" | "overturned";

export type ReportRow = {
  key: string;
  handoverId: string | null;
  code: string | null;
  itemId: string;
  itemCode: string;
  title: string;
  place: string;
  from: Stage;
  to: Stage;
  sender: string | null;
  receiver: string | null;
  sentAt: string | null;
  outcome: ReportOutcome;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  note: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  checkNote: string | null;
  // Sent to first decision.
  hours: number | null;
};

export type ReportFilter = { from?: string | null; to?: string | null; stage?: Stage | null; outcome?: ReportOutcome | null; person?: string | null; q?: string | null };

const PLACE = `g.name AS grade, s.name AS subject, un.number AS unit_number, l.number AS part_number`;
const PLACE_JOIN = `LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
  LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
  LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id`;

type PlaceCols = { grade: string | null; subject: string | null; unit_number: number | null; part_number: number | null };
const place = (r: PlaceCols) => [r.grade, r.subject, r.unit_number != null ? `Unit ${r.unit_number}` : null, r.part_number != null ? `Part ${r.part_number}` : null].filter(Boolean).join(" · ");
const hoursBetween = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 36e5 * 10) / 10) : null);

export async function handoverReport(user: AppUser, f: ReportFilter = {}) {
  const sc = scopeSql(user, "i");
  // Batches.
  const batch = await all<
    PlaceCols & { handover_id: string; code: string; item_id: string; item_code: string; title: string; from_stage: Stage; to_stage: Stage; from_user: string | null; to_user: string | null; created_by: string | null; sender: string | null; receiver: string | null; created_at: string; status: string; decided_at: string | null; decided_by_id: string | null; decided_by: string | null; reason: string | null; note: string | null; check_status: string | null; checked_at: string | null; checked_by_id: string | null; checked_by: string | null; check_note: string | null }
  >(
    `SELECT x.handover_id, h.code, x.item_id, i.code AS item_code, i.title, h.from_stage, h.to_stage, h.from_user, h.to_user, h.created_by, fu.name AS sender, tu.name AS receiver, h.created_at,
        x.status, x.decided_at, x.decided_by AS decided_by_id, du.name AS decided_by, x.reason, x.note, x.check_status, x.checked_at, x.checked_by AS checked_by_id, cu.name AS checked_by, x.check_note, ${PLACE}
     FROM handover_items x JOIN handovers h ON h.id = x.handover_id JOIN items i ON i.id = x.item_id
     LEFT JOIN users fu ON fu.id = h.from_user LEFT JOIN users tu ON tu.id = h.to_user LEFT JOIN users du ON du.id = x.decided_by LEFT JOIN users cu ON cu.id = x.checked_by
     ${PLACE_JOIN}
     WHERE h.status <> 'cancelled' AND ${sc.sql} ORDER BY h.created_at DESC LIMIT 3000`,
    ...sc.params,
  );
  const rows: (ReportRow & { people: (string | null)[] })[] = batch
    .filter((r) => involved(user, r))
    .map((r) => ({
      key: `${r.handover_id}:${r.item_id}`,
      handoverId: r.handover_id,
      code: r.code,
      itemId: r.item_id,
      itemCode: r.item_code,
      title: r.title,
      place: place(r),
      from: r.from_stage,
      to: r.to_stage,
      sender: r.sender,
      receiver: r.decided_by ?? r.receiver,
      sentAt: r.created_at,
      outcome: r.check_status === "overturned" ? "overturned" : r.status === "accepted" ? "accepted" : r.status === "missing" ? "rejected" : r.status === "rejected" ? "in_check" : "waiting",
      decidedAt: r.decided_at,
      decidedBy: r.decided_by,
      reason: r.reason,
      note: r.note,
      checkedAt: r.checked_at,
      checkedBy: r.checked_by,
      checkNote: r.check_note,
      hours: hoursBetween(r.created_at, r.decided_at),
      people: [r.from_user, r.to_user, r.created_by, r.decided_by_id, r.checked_by_id],
    }));

  // Handoffs accepted or returned one at a time. A person's decision only (imports are not handovers), and not the
  // ones a batch above already shows.
  const single = await all<PlaceCols & { attempt_id: string; item_id: string; item_code: string; title: string; stage: Stage; sender_id: string | null; sender: string | null; sent_at: string | null; decision: string; decided_at: string; decided_by_id: string; decided_by: string | null; reason: string | null; note: string | null }>(
    `SELECT a.id AS attempt_id, r.item_id, i.code AS item_code, i.title, a.stage, a.owner_id AS sender_id, fu.name AS sender, a.handoff_submitted_at AS sent_at, r.decision, r.created_at AS decided_at, r.reviewer_id AS decided_by_id, du.name AS decided_by, r.reason_category AS reason, r.note, ${PLACE}
     FROM handoff_reviews r JOIN stage_attempts a ON a.id = r.attempt_id JOIN items i ON i.id = r.item_id
     LEFT JOIN users fu ON fu.id = a.owner_id LEFT JOIN users du ON du.id = r.reviewer_id
     ${PLACE_JOIN}
     WHERE r.kind = 'handoff' AND r.decision IN ('accepted','returned') AND r.reviewer_id IS NOT NULL AND COALESCE(r.note, '') NOT LIKE '%in handover HO-%' AND ${sc.sql}
     ORDER BY r.created_at DESC LIMIT 2000`,
    ...sc.params,
  );
  const waiting = await all<PlaceCols & { attempt_id: string; item_id: string; item_code: string; title: string; stage: Stage; sender_id: string | null; sender: string | null; sent_at: string | null }>(
    `SELECT a.id AS attempt_id, i.id AS item_id, i.code AS item_code, i.title, a.stage, a.owner_id AS sender_id, fu.name AS sender, a.handoff_submitted_at AS sent_at, ${PLACE}
     FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id LEFT JOIN users fu ON fu.id = a.owner_id
     ${PLACE_JOIN}
     WHERE i.lifecycle = 'in_production' AND a.status = 'awaiting_handoff' AND NOT EXISTS (SELECT 1 FROM handover_items x JOIN handovers h ON h.id = x.handover_id WHERE x.item_id = i.id AND h.from_stage = a.stage AND x.status IN ('pending','rejected') AND h.status <> 'cancelled') AND ${sc.sql}
     ORDER BY a.handoff_submitted_at DESC LIMIT 1000`,
    ...sc.params,
  );
  const canSeeSingle = (stage: Stage, people: (string | null)[]) => seesAllHandovers(user) || isLeadOf(user, stage) || (NEXT_STAGE[stage] ? isLeadOf(user, NEXT_STAGE[stage]!) : false) || people.includes(user.id);
  for (const r of single) {
    const to = NEXT_STAGE[r.stage];
    if (!to || !canSeeSingle(r.stage, [r.sender_id, r.decided_by_id])) continue;
    rows.push({
      key: `direct:${r.attempt_id}:${r.decided_at}`,
      handoverId: null,
      code: null,
      itemId: r.item_id,
      itemCode: r.item_code,
      title: r.title,
      place: place(r),
      from: r.stage,
      to,
      sender: r.sender,
      receiver: r.decided_by,
      sentAt: r.sent_at,
      outcome: r.decision === "accepted" ? "accepted" : "rejected",
      decidedAt: r.decided_at,
      decidedBy: r.decided_by,
      reason: r.decision === "returned" ? r.reason : null,
      note: r.note,
      checkedAt: null,
      checkedBy: null,
      checkNote: null,
      hours: hoursBetween(r.sent_at, r.decided_at),
      people: [r.sender_id, r.decided_by_id],
    });
  }
  for (const r of waiting) {
    const to = NEXT_STAGE[r.stage];
    if (!to || !canSeeSingle(r.stage, [r.sender_id])) continue;
    rows.push({ key: `waiting:${r.attempt_id}`, handoverId: null, code: null, itemId: r.item_id, itemCode: r.item_code, title: r.title, place: place(r), from: r.stage, to, sender: r.sender, receiver: null, sentAt: r.sent_at, outcome: "waiting", decidedAt: null, decidedBy: null, reason: null, note: null, checkedAt: null, checkedBy: null, checkNote: null, hours: null, people: [r.sender_id] });
  }

  const needle = f.q?.trim().toLowerCase();
  const list = rows
    .filter(
      (r) =>
        (!f.from || (r.sentAt ?? r.decidedAt ?? "") >= f.from) &&
        (!f.to || (r.sentAt ?? r.decidedAt ?? "") <= f.to) &&
        (!f.stage || r.from === f.stage || r.to === f.stage) &&
        (!f.outcome || r.outcome === f.outcome) &&
        (!f.person || r.people.includes(f.person)) &&
        (!needle || `${r.code ?? ""} ${r.itemCode} ${r.title} ${r.place} ${r.note ?? ""}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => (b.sentAt ?? b.decidedAt ?? "").localeCompare(a.sentAt ?? a.decidedAt ?? ""))
    .map(({ people: _p, ...r }) => r);
  const decided = list.filter((r) => r.hours != null);
  return {
    rows: list,
    totals: {
      sent: list.length,
      waiting: list.filter((r) => r.outcome === "waiting").length,
      accepted: list.filter((r) => r.outcome === "accepted" || r.outcome === "overturned").length,
      rejected: list.filter((r) => r.outcome === "rejected").length,
      inCheck: list.filter((r) => r.outcome === "in_check").length,
      avgHours: decided.length ? Math.round((decided.reduce((a, r) => a + r.hours!, 0) / decided.length) * 10) / 10 : null,
    },
  };
}
