// Face check-in at the kiosk (docs/FACE-CHECKIN.md). The kiosk turns a face into a face code (128 numbers) in the
// browser after a blink, and sends only that code; no picture leaves the device. Enrolled codes are stored sealed
// (encrypted with the workspace key), never exported or included in backups, and deleted when consent is
// withdrawn or the person leaves. Enrolment needs the person's written consent, recorded by HR.

import { all, get, nowIso, run } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { myEmployeeId } from "./hr";
import { FACE_CONSENT_VERSION as CONSENT_VERSION } from "@/lib/attendance";

const LEN = 128;
const validCode = (d: unknown): d is number[] => Array.isArray(d) && d.length === LEN && d.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 5);

function needHr(u: AppUser) {
  if (!can(u, "attendance.manage")) throw new WorkflowError("FORBIDDEN", "Only HR enrols faces.");
}

// HR records consent and the face codes taken with the person present.
export async function enrollFace(user: AppUser, employeeId: string, input: { codes: number[][]; consent: boolean; consentNote?: string | null }) {
  needHr(user);
  if (!input.consent) throw new WorkflowError("VALIDATION", "Record the person's written consent first.");
  const codes = (input.codes ?? []).filter(validCode);
  if (codes.length < 3) throw new WorkflowError("VALIDATION", "Take at least three captures of the face.");
  // The captures must be of one person: each one close to the others.
  const avg = mean(codes);
  if (codes.some((c) => dist(c, avg) > 0.45)) throw new WorkflowError("VALIDATION", "The captures do not look like the same person. Take them again, with one face in view.");
  const emp = await get<{ full_name: string; status: string }>("SELECT full_name, status FROM employees WHERE id = ?", employeeId);
  if (!emp || emp.status === "left") throw new WorkflowError("VALIDATION", "Choose a current employee.");
  const now = nowIso();
  await run(
    `INSERT INTO att_faces (employee_id, data_enc, samples, consent_at, consent_by, consent_version, consent_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id) DO UPDATE SET data_enc = excluded.data_enc, samples = excluded.samples, consent_at = excluded.consent_at, consent_by = excluded.consent_by,
       consent_version = excluded.consent_version, consent_note = excluded.consent_note, updated_at = excluded.updated_at`,
    employeeId,
    await seal(JSON.stringify(codes.map((c) => c.map((x) => Math.round(x * 1e5) / 1e5)))),
    codes.length,
    now,
    user.id,
    CONSENT_VERSION,
    String(input.consentNote ?? "").trim().slice(0, 300) || null,
    now,
    now,
  );
  cache = null;
  // The face code itself is never written to the audit log.
  await audit({ actor: user }, { itemId: employeeId, action: "attendance.face", summary: `${user.name} enrolled ${emp.full_name}'s face for kiosk check-in, with written consent (version ${CONSENT_VERSION})` });
}

export async function deleteFace(user: AppUser, employeeId: string, reason: "withdrawn" | "hr" | "left") {
  const own = (await myEmployeeId(user)) === employeeId;
  if (!own && !can(user, "attendance.manage")) throw new WorkflowError("FORBIDDEN", "Only you or HR can delete your face data.");
  const r = await run("DELETE FROM att_faces WHERE employee_id = ?", employeeId);
  cache = null;
  if (r.changes)
    await audit({ actor: user }, { itemId: employeeId, action: "attendance.face", summary: `${user.name} deleted face data (${reason === "withdrawn" ? "consent withdrawn" : reason === "left" ? "person left" : "by HR"})` });
}

export async function faceStatus(employeeId: string) {
  const r = await get<{ consent_at: string; samples: number }>("SELECT consent_at, samples FROM att_faces WHERE employee_id = ?", employeeId);
  return r ? { enrolledAt: r.consent_at, samples: Number(r.samples) } : null;
}

export async function enrolledIds() {
  return (await all<{ employee_id: string }>("SELECT employee_id FROM att_faces")).map((r) => r.employee_id);
}

// Matching happens here, never on the kiosk: the stored codes stay on the server.
let cache: { at: number; list: { employeeId: string; codes: number[][] }[] } | null = null;

async function enrolled() {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const rows = await all<{ employee_id: string; data_enc: string }>("SELECT f.employee_id, f.data_enc FROM att_faces f JOIN employees e ON e.id = f.employee_id WHERE e.status <> 'left'");
  const list: { employeeId: string; codes: number[][] }[] = [];
  for (const r of rows) {
    const json = await unseal(r.data_enc);
    if (json) list.push({ employeeId: r.employee_id, codes: JSON.parse(json) });
  }
  cache = { at: Date.now(), list };
  return list;
}

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s);
}
function mean(codes: number[][]) {
  return codes[0]!.map((_, i) => codes.reduce((s, c) => s + c[i]!, 0) / codes.length);
}

// The closest enrolled person, accepted only when close enough and clearly closer than anyone else.
export async function matchFace(code: unknown, threshold: number) {
  if (!validCode(code)) throw new WorkflowError("VALIDATION", "No face code.");
  const scored = (await enrolled())
    .map((p) => ({ employeeId: p.employeeId, d: Math.min(...p.codes.map((c) => dist(c, code))) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0];
  if (!best || best.d > threshold) return null;
  if (scored[1] && scored[1].d - best.d < 0.05) return null;
  return best.employeeId;
}

// With the scheduled checks: people who have left lose their face data.
export async function faceCleanup() {
  const gone = await all<{ employee_id: string }>("SELECT f.employee_id FROM att_faces f JOIN employees e ON e.id = f.employee_id WHERE e.status = 'left'");
  for (const g of gone) {
    await run("DELETE FROM att_faces WHERE employee_id = ?", g.employee_id);
    await audit({ actor: null }, { itemId: g.employee_id, action: "attendance.face", summary: "Face data deleted because the person left" });
  }
  if (gone.length) cache = null;
}
