import { all, get, nowIso, placeholders, run, tx, uid } from "./db";
import { TABLES } from "./schema";
import { getSettings } from "./settings";
import { hashPassword } from "./passwords";
import {
  acceptHandoff,
  addAsset,
  createItem,
  currentAttempt,
  recordStageCompletion,
  releaseToProduction,
  setChecklist,
  submitHandoff,
  type Ctx,
} from "./workflow";
import { ROLES, STAGES, type Role, type Stage } from "@/lib/domain";
import { progressOf } from "@/lib/progress";

/*
 * Workspace data management: empty the database, create accounts and load the curriculum
 * backup exported from the curriculum tracker (grade -> subjects -> units -> parts -> videos).
 * Used by `npm run db:*` scripts and by Admin, Data.
 */

// ---------------------------------------------------------------------------
// Emptying
// ---------------------------------------------------------------------------

// People records (HR) stay with the accounts.
const ACCOUNT_TABLES = new Set(["users", "role_assignments", "access_scopes", "sessions", "user_capacity", "leave_entries", "employees", "employee_private", "employee_documents", "equipment", "equipment_events", "leave_types", "leave_requests", "leave_adjustments", "job_openings", "applicants", "applicant_files", "interviews", "scorecards", "employee_checklists", "hr_goals", "review_cycles", "hr_reviews", "one_on_ones", "courses", "trainings", "hr_cases", "hr_case_notes", "api_tokens", "blocked_devices", "profiles", "profile_files", "password_resets"]);

// Removes all workspace data. Accounts and settings can be kept so people stay signed in.
export async function emptyWorkspace(opts: { keepAccounts?: boolean; keepSettings?: boolean } = {}) {
  const targets = TABLES.filter(
    (t) => !(opts.keepAccounts && ACCOUNT_TABLES.has(t)) && !(opts.keepSettings && t === "settings"),
  );
  await run(`TRUNCATE ${targets.join(", ")} RESTART IDENTITY CASCADE`);
  return targets.length;
}

export async function workspaceCounts() {
  const rows = await all<{ t: string; c: number }>(
    `SELECT 'users' AS t, COUNT(*) AS c FROM users
     UNION ALL SELECT 'grades', COUNT(*) FROM grades
     UNION ALL SELECT 'subjects', COUNT(*) FROM subjects
     UNION ALL SELECT 'units', COUNT(*) FROM units
     UNION ALL SELECT 'parts', COUNT(*) FROM lessons
     UNION ALL SELECT 'items', COUNT(*) FROM items
     UNION ALL SELECT 'recordings', COUNT(*) FROM assets WHERE kind = 'raw'
     UNION ALL SELECT 'messages', COUNT(*) FROM chat_messages`,
  );
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.c)])) as Record<string, number>;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountInput = {
  name: string;
  email: string;
  title?: string | null;
  roles: Role[];
  password: string;
  mustChangePassword?: boolean;
};

export async function upsertAccount(a: AccountInput) {
  const email = a.email.trim().toLowerCase();
  const existing = await get<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower(?)", email);
  const id = existing?.id ?? uid("usr_");
  if (existing) {
    await run("UPDATE users SET name = ?, title = ?, active = 1 WHERE id = ?", a.name, a.title ?? null, id);
  } else {
    let handle = email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase() || "user";
    for (let n = 2; await get("SELECT 1 AS x FROM users WHERE handle = ?", handle); n++) handle = `${handle.replace(/\d+$/, "")}${n}`;
    await run(
      "INSERT INTO users (id, name, email, handle, title, password_hash, must_change_password, active, created_at, prefs) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '{}')",
      id,
      a.name,
      email,
      handle,
      a.title ?? null,
      hashPassword(a.password),
      a.mustChangePassword ? 1 : 0,
      nowIso(),
    );
  }
  await run("DELETE FROM role_assignments WHERE user_id = ?", id);
  for (const r of a.roles.filter((r) => ROLES.includes(r))) await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?)", id, r);
  return { id, created: !existing };
}

// Grade and subject access by code. Applied after the curriculum exists.
export async function setAccountScopes(userId: string, gradeCodes: string[] = [], subjectCodes: string[] = []) {
  const ids = async (table: "grades" | "subjects", codes: string[]) =>
    (await Promise.all(codes.map((c) => get<{ id: string }>(`SELECT id FROM ${table} WHERE code = ?`, c)))).flatMap((r) => (r ? [r.id] : []));
  const grades = await ids("grades", gradeCodes);
  const subjects = await ids("subjects", subjectCodes);
  await run("DELETE FROM access_scopes WHERE user_id = ?", userId);
  if (grades.length && subjects.length) {
    for (const g of grades) for (const s of subjects) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, ?, ?)", userId, g, s);
  } else {
    for (const g of grades) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, ?, NULL)", userId, g);
    for (const s of subjects) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, NULL, ?)", userId, s);
  }
}

// Starting chat groups: everyone in General, and one group per production team.
export async function createDefaultGroups(createdBy: string | null) {
  const now = nowIso();
  const users = await all<{ id: string }>("SELECT id FROM users WHERE active = 1");
  const roles = await all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments");
  const leads = new Set(roles.filter((r) => r.role === "manager" || r.role === "admin").map((r) => r.user_id));
  const groups: { name: string; description: string; color: string; members: string[]; stage: string | null }[] = [
    { name: "General", description: "Announcements and conversation for the whole team", color: "#7b68ee", members: users.map((u) => u.id), stage: null as string | null },
    ...(["recording", "editing", "uploading", "publication"] as const).map((stage, i) => ({
      stage: stage as string | null,
      name: `${stage[0].toUpperCase()}${stage.slice(1)} team`,
      description: `Day-to-day coordination for ${stage}`,
      color: ["#f59e0b", "#3b82f6", "#06b6d4", "#22c55e"][i],
      members: [...new Set([...roles.filter((r) => r.role === stage).map((r) => r.user_id), ...leads])],
    })),
  ];
  const teamLeads = await all<{ stage: string; user_id: string }>("SELECT stage, user_id FROM team_leads");
  for (const g of groups) {
    if (await get("SELECT 1 AS x FROM chat_groups WHERE name = ?", g.name)) continue;
    const id = uid("grp_");
    await run(
      "INSERT INTO chat_groups (id, name, description, kind, color, stage, created_by, last_message_at, created_at) VALUES (?, ?, ?, 'group', ?, ?, ?, ?, ?)",
      id,
      g.name,
      g.description,
      g.color,
      g.stage,
      createdBy,
      now,
      now,
    );
    for (const m of g.members)
      await run(
        "INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        id,
        m,
        leads.has(m) || teamLeads.some((t) => t.stage === g.stage && t.user_id === m) ? "admin" : "member",
        now,
      );
    if (createdBy)
      await run(
        "INSERT INTO chat_messages (id, group_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
        uid("msg_"),
        id,
        createdBy,
        `Welcome to ${g.name}.`,
        now,
      );
  }
}

// ---------------------------------------------------------------------------
// Curriculum backup import
// ---------------------------------------------------------------------------

export type CurriculumBackup = Record<
  string,
  {
    name: string;
    type?: string;
    subjects: {
      id: string;
      name: string;
      units: {
        id: string;
        title: string;
        parts: {
          id: string;
          title: string;
          videos?: { id: string; cameraCode?: string; title?: string; description?: string }[];
          // Added by the app's tracker export; ignored by the tracker itself.
          progress?: Partial<Record<Stage, { status?: string; date?: string | null; link?: string | null }>>;
          itemCode?: string;
        }[];
      }[];
    }[];
  }
>;

export type CurriculumImportSummary = {
  grades: number;
  subjects: number;
  units: { created: number; updated: number };
  parts: { created: number; updated: number };
  items: { created: number; existing: number };
  recordings: { created: number; existing: number };
  recordedParts: number;
  warnings: string[];
};

const SUBJECT_CODES: Record<string, string> = {
  mathematics: "MATH",
  english: "ENG",
  amharic: "AMH",
  "general science": "GSCI",
  "social studies": "SOC",
  "environmental science": "ENVS",
  "enviromental science": "ENVS",
  chemistry: "CHEM",
  physics: "PHYS",
  biology: "BIO",
  history: "HIST",
  geography: "GEO",
  economics: "ECON",
  "information technology": "ICT",
  ict: "ICT",
  citizenship: "CIT",
};

// Typos in the source names are corrected for display; the code stays stable.
const SUBJECT_NAMES: Record<string, string> = { ENVS: "Environmental Science" };

export function subjectCode(name: string) {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    SUBJECT_CODES[key] ??
    key
      .split(" ")
      .map((w) => w.slice(0, key.includes(" ") ? 2 : 4))
      .join("")
      .toUpperCase()
  );
}

function gradeCode(key: string, name: string) {
  const n = Number((key.match(/\d+/) ?? name.match(/\d+/) ?? ["0"])[0]);
  return { code: `G${String(n).padStart(2, "0")}`, sort: n };
}

const ETHIOPIC = /[ሀ-፿]/;

// "Unit 3: Forces" -> "Forces", "ምዕራፍ 1: ..." -> "...". A bare "Part 2:" becomes "Part 2" (the fallback).
function cleanTitle(raw: string, words: string[], fallback: string) {
  const t = raw.trim();
  const w = words.join("|");
  // "Unit 9: ...", a stray letter before it ("l Unit 5: ..."), a bare "2: ...", or "Unit: ...". "Unity" is left alone.
  const patterns = [
    new RegExp(`^(?:\\S\\s+)?(?:${w})\\s*\\d+\\s*[:.\\-–]?\\s*`, "i"),
    /^\d+\s*[:.\-–]\s*/,
    new RegExp(`^(?:${w})\\s*[:.\\-–]\\s*`, "i"),
  ];
  const re = patterns.find((p) => p.test(t));
  return (re ? t.replace(re, "") : t).trim() || fallback;
}

const UNIT_WORDS = /^(?:\S\s+)?(?:unit|ምዕራፍ|chapter)\s*(\d+)|^(\d+)\s*[:.\-–]/i;
const PART_WORDS = /^(?:part|par|ክፍል)\s*(\d+)/i;

// Numbers for one unit's parts (or one subject's units) from a tracker file: the number in the title when it is
// unique, otherwise the position, otherwise the next free number. Rows from other sources keep their numbers.
// This file's existing rows are parked on temporary numbers first so they can be renumbered without clashing.
async function planNumbers(table: "units" | "lessons", where: string, params: string[], rows: { id: string; title: string }[], words: RegExp) {
  if (!rows.length) return [];
  const existing = await all<{ number: number; source_ref: string | null }>(`SELECT number, source_ref FROM ${table} WHERE ${where}`, ...params);
  const mine = new Set(rows.map((r) => r.id));
  const used = new Set(existing.filter((e) => !e.source_ref || !mine.has(e.source_ref)).map((e) => e.number));
  const out: number[] = [];
  rows.forEach((r, i) => {
    const m = words.exec(r.title.trim());
    const n = m ? Number(m[1] ?? m[2]) : 0;
    if (n > 0 && !used.has(n)) {
      out[i] = n;
      used.add(n);
    }
  });
  rows.forEach((_, i) => {
    if (out[i]) return;
    const n = used.has(i + 1) ? Math.max(0, ...used) + 1 : i + 1;
    out[i] = n;
    used.add(n);
  });
  await run(
    `UPDATE ${table} SET number = number + 100000 WHERE ${where} AND source_ref IN (${placeholders(rows.length)})`,
    ...params,
    ...rows.map((r) => r.id),
  );
  return out;
}

export function isCurriculumBackup(data: unknown): data is CurriculumBackup {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const first = Object.values(data as Record<string, unknown>)[0] as { subjects?: unknown } | undefined;
  return !!first && Array.isArray(first.subjects);
}

export async function importCurriculumBackup(
  data: CurriculumBackup,
  opts: { actorId?: string | null; createItems?: boolean; markRecorded?: boolean; fileName?: string } = {},
): Promise<CurriculumImportSummary> {
  const createItems = opts.createItems ?? true;
  const markRecorded = opts.markRecorded ?? true;
  const now = nowIso();
  const ctx: Ctx = { actor: null, now, source: "import", silent: true };
  const summary: CurriculumImportSummary = {
    grades: 0,
    subjects: 0,
    units: { created: 0, updated: 0 },
    parts: { created: 0, updated: 0 },
    items: { created: 0, existing: 0 },
    recordings: { created: 0, existing: 0 },
    recordedParts: 0,
    warnings: [],
  };

  const curriculumId = "cur_main";
  await run(
    "INSERT INTO curricula (id, name, version, cycle, active) VALUES (?, ?, ?, ?, 1) ON CONFLICT (id) DO NOTHING",
    curriculumId,
    "Ethiopian General Education Curriculum",
    opts.fileName ?? "Curriculum tracker backup",
    new Date().getFullYear().toString(),
  );

  // Taxonomy first, in one transaction.
  type Part = CurriculumBackup[string]["subjects"][number]["units"][number]["parts"][number];
  type PartRef = { lessonId: string; gradeId: string; subjectId: string; unitId: string; number: number; title: string; language: string; sourceId: string; videos: NonNullable<Part["videos"]>; progress: Part["progress"] };
  const parts: PartRef[] = [];
  const subjectSeen = new Set<string>();

  await tx(async () => {
    let subjectSort = (await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) AS n FROM subjects"))?.n ?? 0;
    for (const [gKey, g] of Object.entries(data)) {
      const { code, sort } = gradeCode(gKey, g.name);
      const gradeId = `grd_${code.toLowerCase()}`;
      await run(
        `INSERT INTO grades (id, code, name, level, sort, active) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level, sort = EXCLUDED.sort, active = 1`,
        gradeId,
        code,
        g.name,
        g.type ?? null,
        sort,
      );
      const grade = (await get<{ id: string }>("SELECT id FROM grades WHERE code = ?", code))!;
      summary.grades++;

      for (const s of g.subjects) {
        const sCode = subjectCode(s.name);
        if (!subjectSeen.has(sCode)) {
          subjectSeen.add(sCode);
          await run(
            `INSERT INTO subjects (id, code, name, sort, active) VALUES (?, ?, ?, ?, 1)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = 1`,
            `sub_${sCode.toLowerCase()}`,
            sCode,
            SUBJECT_NAMES[sCode] ?? s.name.trim(),
            ++subjectSort,
          );
        }
        const subject = (await get<{ id: string }>("SELECT id FROM subjects WHERE code = ?", sCode))!;
        await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", grade.id, subject.id);

        // Units and parts keep the number in their title ("Part 4:" is part 4), so other teams' files match them.
        const unitNos = await planNumbers(
          "units",
          "grade_id = ? AND subject_id = ?",
          [grade.id, subject.id],
          s.units.map((u) => ({ id: u.id, title: u.title })),
          UNIT_WORDS,
        );
        let unitNo = 0;
        for (const u of s.units) {
          unitNo++;
          const number = unitNos[unitNo - 1];
          const title = cleanTitle(u.title, ["unit", "ምዕራፍ", "chapter"], `Unit ${number}`);
          const am = ETHIOPIC.test(u.title);
          let unit = await get<{ id: string; number: number }>("SELECT id, number FROM units WHERE source_ref = ?", u.id);
          if (unit) {
            await run("UPDATE units SET title = ?, title_am = ?, number = ? WHERE id = ?", title, am ? title : null, number, unit.id);
            unit = { id: unit.id, number };
            summary.units.updated++;
          } else {
            const id = uid("unt_");
            await run(
              "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am, source_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              id,
              curriculumId,
              grade.id,
              subject.id,
              number,
              title,
              am ? title : null,
              u.id,
            );
            unit = { id, number };
            summary.units.created++;
          }

          const partNos = await planNumbers("lessons", "unit_id = ?", [unit.id], u.parts.map((p) => ({ id: p.id, title: p.title })), PART_WORDS);
          let partNo = 0;
          for (const p of u.parts) {
            partNo++;
            const number = partNos[partNo - 1];
            const pTitle = cleanTitle(p.title, ["part", "ክፍል"], `Part ${number}`);
            const language = ETHIOPIC.test(p.title) || am ? "am" : "en";
            let lesson = await get<{ id: string; number: number }>("SELECT id, number FROM lessons WHERE source_ref = ?", p.id);
            if (lesson) {
              await run("UPDATE lessons SET title = ?, language = ?, number = ?, unit_id = ? WHERE id = ?", pTitle, language, number, unit.id, lesson.id);
              lesson = { id: lesson.id, number };
              summary.parts.updated++;
            } else {
              const id = uid("les_");
              await run(
                "INSERT INTO lessons (id, unit_id, number, title, language, planned_deliverables, source_ref, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                id,
                unit.id,
                number,
                pTitle,
                language,
                p.id,
                now,
              );
              lesson = { id, number };
              summary.parts.created++;
            }
            parts.push({
              lessonId: lesson.id,
              gradeId: grade.id,
              subjectId: subject.id,
              unitId: unit.id,
              number: lesson.number,
              title: pTitle,
              language,
              sourceId: p.id,
              videos: p.videos ?? [],
              progress: p.progress,
            });
          }
        }
      }
    }
  });
  summary.subjects = subjectSeen.size;

  if (!createItems) return summary;

  // One production item per part. Parts with videos have been recorded: each video becomes a
  // raw recording identified by its camera code, and the Recording stage is handed to Editing.
  const settings = await getSettings();
  for (const p of parts) {
    let item = await get<{ id: string; lifecycle: string }>("SELECT id, lifecycle FROM items WHERE source_reference = ?", p.sourceId);
    if (item) summary.items.existing++;
    else {
      const created = await createItem(ctx, {
        lessonId: p.lessonId,
        gradeId: p.gradeId,
        subjectId: p.subjectId,
        title: p.title,
        titleAm: p.language === "am" ? p.title : null,
        language: p.language,
        provenance: "imported",
        sourceReference: p.sourceId,
      });
      item = { id: created.id, lifecycle: created.lifecycle };
      summary.items.created++;
    }
    const videos = p.videos.filter((v) => v.cameraCode?.trim() || v.title?.trim());
    if (!videos.length) continue;
    if (item.lifecycle === "draft") await releaseToProduction(ctx, item.id);

    const attempt = await currentAttempt(item.id);
    const inRecording = attempt?.stage === "recording";
    for (const v of videos) {
      if (await get("SELECT 1 AS x FROM assets WHERE item_id = ? AND source_ref = ?", item.id, v.id)) {
        summary.recordings.existing++;
        continue;
      }
      if (!inRecording) {
        summary.warnings.push(`${p.title}: video ${v.cameraCode ?? v.id} was not added because the item has already left Recording.`);
        continue;
      }
      await addAsset(ctx, item.id, {
        kind: "raw",
        cameraCode: v.cameraCode?.trim() || null,
        label: v.title?.trim() || null,
        notes: v.description?.trim() || null,
        url: null,
        sourceRef: v.id,
      });
      summary.recordings.created++;
    }

    if (markRecorded && inRecording) {
      for (const c of settings.checklists.recording.filter((c) => c.required)) await setChecklist(ctx, item.id, c.key, true);
      await submitHandoff(ctx, item.id, { note: "Imported from the curriculum tracker" });
      await acceptHandoff(ctx, item.id, { note: "Recording imported as complete" });
      summary.recordedParts++;
    }
    await applyProgress(ctx, item.id, p.progress, summary);
  }
  if (opts.actorId !== undefined)
    await run(
      `INSERT INTO audit_events (id, actor_id, actor_kind, action, summary, new_value, occurred_at) VALUES (?, ?, ?, 'curriculum.imported', ?, ?, ?)`,
      uid("evt_"),
      opts.actorId,
      opts.actorId ? "user" : "system",
      `Imported curriculum backup${opts.fileName ? ` ${opts.fileName}` : ""}`,
      JSON.stringify(summary),
      now,
    );
  return summary;
}

// ---------------------------------------------------------------------------
// Full backup (every table as JSON). Restore with `npm run db:restore`.
// ---------------------------------------------------------------------------

export async function backupSnapshot() {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await all(`SELECT * FROM ${t}`);
  return { format: "myseed-backup", version: 1, createdAt: nowIso(), tables };
}

// Stage progress carried in a tracker JSON exported by this app (part.progress). Stages are applied in order;
// a stage already done only has its date corrected.
async function applyProgress(ctx: Ctx, itemId: string, progress: Partial<Record<Stage, { status?: string; date?: string | null; link?: string | null }>> | undefined, summary: CurriculumImportSummary) {
  if (!progress) return;
  for (const st of STAGES) {
    const p = progress[st];
    if (!p || p.status !== "done") break;
    const doneAt = p.date && !Number.isNaN(Date.parse(p.date)) ? new Date(p.date).toISOString() : nowIso();
    try {
      await recordStageCompletion(ctx, itemId, st, { doneAt, liveUrl: st === "publication" ? p.link ?? null : null, note: "Imported from tracker JSON" });
    } catch (err) {
      summary.warnings.push(`${itemId}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Tracker JSON export: the same structure as the curriculum tracker backup, with progress added.
// ---------------------------------------------------------------------------

export async function exportTrackerBackup(user: import("./users").AppUser): Promise<CurriculumBackup> {
  const { scopeAllowsGradeSubject, scopeSql } = await import("./users");
  const grades = await all<{ id: string; code: string; name: string; level: string | null; sort: number }>("SELECT id, code, name, level, sort FROM grades WHERE active = 1 ORDER BY sort");
  const subjects = await all<{ id: string; code: string; name: string; sort: number }>("SELECT id, code, name, sort FROM subjects WHERE active = 1 ORDER BY sort");
  const offered = await all<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM grade_subjects");
  const units = await all<{ id: string; grade_id: string; subject_id: string; number: number; title: string; source_ref: string | null }>("SELECT id, grade_id, subject_id, number, title, source_ref FROM units ORDER BY number");
  const lessons = await all<{ id: string; unit_id: string; number: number; title: string; source_ref: string | null }>("SELECT id, unit_id, number, title, source_ref FROM lessons ORDER BY number");
  const sc = scopeSql(user, "i");
  const items = await all<{ id: string; code: string; lesson_id: string; lifecycle: string; stage: Stage | null; recorded_at: string | null; edited_at: string | null; uploaded_at: string | null; published_at: string | null; live_url: string | null }>(
    `SELECT i.id, i.code, i.lesson_id, i.lifecycle, i.stage, i.recorded_at, i.edited_at, i.uploaded_at, i.published_at, i.live_url FROM items i
     WHERE i.lesson_id IS NOT NULL AND i.lifecycle NOT IN ('archived','cancelled') AND i.revision_of_id IS NULL AND ${sc.sql} ORDER BY i.created_at`,
    ...sc.params,
  );
  const assets = await all<{ id: string; item_id: string; kind: string; camera_code: string | null; label: string | null; notes: string | null; url: string | null; source_ref: string | null; status: string }>(
    "SELECT id, item_id, kind, camera_code, label, notes, url, source_ref, status FROM assets WHERE kind IN ('raw', 'master') ORDER BY created_at",
  );
  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const out: CurriculumBackup = {};
  for (const g of grades) {
    const n = Number(g.code.replace(/\D/g, "")) || g.sort;
    const subs = subjects.filter((s) => offered.some((o) => o.grade_id === g.id && o.subject_id === s.id) && scopeAllowsGradeSubject(user, g.id, s.id));
    if (!subs.length) continue;
    out[`grade-${n}`] = {
      name: g.name,
      type: g.level ?? undefined,
      subjects: subs.map((s) => ({
        id: `g${n}-${s.code.toLowerCase()}`,
        name: s.name,
        units: units
          .filter((u) => u.grade_id === g.id && u.subject_id === s.id)
          .map((u) => ({
            id: u.source_ref ?? u.id,
            title: /^unit \d+$/i.test(u.title) ? `Unit ${u.number}:` : `Unit ${u.number}: ${u.title}`,
            parts: lessons
              .filter((l) => l.unit_id === u.id)
              .map((l) => {
                const item = items.find((i) => i.lesson_id === l.id);
                const vids = item ? assets.filter((a) => a.item_id === item.id && a.kind === "raw" && a.status !== "superseded") : [];
                const master = item ? assets.find((a) => a.item_id === item.id && a.kind === "master" && a.status === "current") : undefined;
                const st = (x: Stage) => (item ? progressOf(item, x) : x === "recording" ? "missing" : "none");
                return {
                  id: l.source_ref ?? l.id,
                  title: /^part \d+$/i.test(l.title) ? `Part ${l.number}:` : `Part ${l.number}: ${l.title}`,
                  videos: vids.map((v) => ({ id: v.source_ref ?? v.id, cameraCode: v.camera_code ?? "", title: v.label ?? "", description: v.notes ?? "" })),
                  ...(item
                    ? {
                        itemCode: item.code,
                        progress: {
                          recording: { status: st("recording"), date: date(item.recorded_at) },
                          editing: { status: st("editing"), date: date(item.edited_at), link: master?.url ?? null },
                          uploading: { status: st("uploading"), date: date(item.uploaded_at) },
                          publication: { status: st("publication"), date: date(item.published_at), link: item.live_url },
                        },
                      }
                    : {}),
                };
              }),
          })),
      })),
    };
  }
  return out;
}
