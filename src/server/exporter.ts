import { all, nowIso, run, uid } from "./db";
import { getSettings, type Settings } from "./settings";
import { listItems, taxonomy, type ItemListRow } from "./queries";
import { can, isManager, type AppUser } from "./users";
import { ITEM_COLUMNS } from "@/lib/columns";
import { activeFilterCount, type Filters } from "@/lib/filters";
import {
  COMPLEXITY_LABELS,
  LIFECYCLE_LABELS,
  PRIORITY_LABELS,
  STAGE_LABELS,
  SIMPLE_STATUS_LABELS,
  STAGES,
  STATUS_LABELS,
  sheetStatusLabel,
  type Stage,
} from "@/lib/domain";
import { progressOf } from "@/lib/progress";
import { BLOCKER_CAUSE_LABELS } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDuration } from "@/lib/format";

// Spreadsheet applications execute cells beginning with these characters as formulas.
export function safeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function csvEscape(value: unknown) {
  const s = safeCell(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function userMap() {
  return new Map((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
}

export function cellValue(row: ItemListRow, key: string, users: Map<string, string>, tz: string, now: number, s: Settings): string {
  const stageStatus = (st: Stage) => {
    const c = row.stages[st];
    return c.status ? sheetStatusLabel(st, c.status, c.substate) : "Not started";
  };
  if (key.endsWith("_progress")) return SIMPLE_STATUS_LABELS[progressOf(row, key.replace("_progress", "") as Stage)];
  switch (key) {
    case "recorded_date":
      return row.recorded_at ? fmtDate(row.recorded_at, tz) : "";
    case "edited_date":
      return row.edited_at ? fmtDate(row.edited_at, tz) : "";
    case "uploaded_date":
      return row.uploaded_at ? fmtDate(row.uploaded_at, tz) : "";
    case "part":
      return row.lesson_number ? `Part ${row.lesson_number}${row.lesson_title && !/^part \d+$/i.test(row.lesson_title) ? `: ${row.lesson_title}` : ""}` : row.title;
    case "id":
      return row.id;
    case "code":
      return row.code;
    case "title":
      return row.title;
    case "title_am":
      return row.title_am ?? "";
    case "grade":
      return row.grade_name;
    case "subject":
      return row.subject_name;
    case "unit":
      return row.unit_number ? `Unit ${row.unit_number}: ${row.unit_title}` : "";
    case "lesson":
      return row.lesson_number ? String(row.lesson_number) : "";
    case "memberships":
      return String(row.membership_count);
    case "stage":
      return row.lifecycle === "in_production" && row.stage ? STAGE_LABELS[row.stage] : LIFECYCLE_LABELS[row.lifecycle as keyof typeof LIFECYCLE_LABELS] ?? row.lifecycle;
    case "status":
      return row.lifecycle === "in_production" && row.stage ? sheetStatusLabel(row.stage, row.stage_status, row.substate) : LIFECYCLE_LABELS[row.lifecycle as keyof typeof LIFECYCLE_LABELS] ?? "";
    case "recording_status":
      return stageStatus("recording");
    case "editing_status":
      return stageStatus("editing");
    case "uploading_status":
      return stageStatus("uploading");
    case "publication_status":
      return row.lifecycle === "published" ? "Published" : stageStatus("publication");
    case "owner":
      return row.next_action_owner_id ? users.get(row.next_action_owner_id) ?? "" : row.lifecycle === "in_production" ? "Unassigned" : "";
    case "recording_owner":
    case "editing_owner":
    case "uploading_owner":
    case "publication_owner": {
      const id = row.owners[key.replace("_owner", "") as Stage];
      return id ? users.get(id) ?? "" : "";
    }
    case "teacher":
      return row.teacher ?? "";
    case "next_action":
      return row.next_action ?? "";
    case "age":
      return row.lifecycle === "in_production" && row.stage_entered_at ? fmtDuration(now - new Date(row.stage_entered_at).getTime()) : "";
    case "due":
      return fmtDate(row.current_due_at, tz);
    case "original_due":
      return fmtDate(row.original_due_at, tz);
    case "planned_publish":
      return fmtDate(row.planned_publish_at, tz);
    case "scheduled_publish":
      return fmtDateTime(row.scheduled_publish_at, tz);
    case "published":
      return fmtDateTime(row.published_at, tz);
    case "priority":
      return PRIORITY_LABELS[row.priority as keyof typeof PRIORITY_LABELS] ?? row.priority;
    case "complexity":
      return COMPLEXITY_LABELS[row.complexity as keyof typeof COMPLEXITY_LABELS] ?? row.complexity;
    case "deliverable_type":
      return s.lists.deliverableTypes.find((d) => d.key === row.deliverable_type)?.label ?? row.deliverable_type;
    case "content_type":
      return s.lists.contentTypes.find((d) => d.key === row.content_type)?.label ?? row.content_type;
    case "language":
      return s.lists.languages.find((l) => l.code === row.language)?.label ?? row.language;
    case "target_duration":
      return row.target_duration_min?.toString() ?? "";
    case "actual_duration":
      return row.actual_duration_min?.toString() ?? "";
    case "tags":
      return (JSON.parse(row.tags || "[]") as string[]).join("; ");
    case "blocker":
      return row.open_blocker ? BLOCKER_CAUSE_LABELS[row.open_blocker] ?? row.open_blocker : "";
    case "rework":
      return String(row.rework_count);
    case "questions":
      return String(row.open_questions);
    case "comments":
      return String(row.comment_count);
    case "live_url":
      return row.live_url ?? "";
    case "provenance":
      return row.provenance;
    case "updated":
      return fmtDateTime(row.updated_at, tz);
    default:
      return "";
  }
}

export async function describeFilters(f: Filters) {
  const tax = await taxonomy();
  const users = await userMap();
  const parts: string[] = [];
  const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((id) => list.find((x) => x.id === id)?.name ?? id).join(" or ");
  if (f.g.length) parts.push(`Grade: ${names(f.g, tax.grades)}`);
  if (f.s.length) parts.push(`Subject: ${names(f.s, tax.subjects)}`);
  if (f.stage.length) parts.push(`Stage: ${f.stage.join(" or ")}`);
  if (f.status.length) parts.push(`Status: ${f.status.map((s) => STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s).join(" or ")}`);
  if (f.owner.length) parts.push(`Owner: ${f.owner.map((o) => (o === "me" ? "me" : o === "unassigned" ? "unassigned" : users.get(o) ?? o)).join(" or ")}`);
  if (f.pri.length) parts.push(`Priority: ${f.pri.join(" or ")}`);
  if (f.flags.length) parts.push(`Flags: ${f.flags.join(" and ")}`);
  if (f.q) parts.push(`Search: "${f.q}"`);
  if (f.from || f.to) parts.push(`${f.dateField} from ${f.from || "any"} to ${f.to || "any"}`);
  for (const k of ["lang", "ctype", "dtype", "cx", "prov", "platform", "life"] as const) if (f[k].length) parts.push(`${k}: ${f[k].join(" or ")}`);
  if (f.tag) parts.push(`Tag: ${f.tag}`);
  if (f.teacher) parts.push(`Teacher: ${f.teacher}`);
  return activeFilterCount(f) ? parts.join("; ") : "No filters (all content in your scope)";
}

export type ExportRequest = {
  // json: the rows as plain records; audit: metadata, full history and asset manifest (export.audit).
  format: "csv" | "xlsx" | "json" | "audit";
  scope: "page" | "selected" | "all";
  ids?: string[];
  columns: string[];
  filters: Filters;
  // Grade → Subject (or Subject → Grade) order with grade, subject, unit and part as the first columns.
  grouping?: "grade" | "subject" | "none";
};

export async function exportItems(user: AppUser, req: ExportRequest): Promise<{ filename: string; contentType: string; body: Buffer | string; rows: number }> {
  if (req.format !== "audit" && !can(user, "export.run")) throw new Error("Your role does not have permission to export Excel, CSV or JSON.");
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const now = nowIso();
  const users = await userMap();
  const grouping = req.grouping ?? "none";
  const filters = grouping === "none" ? req.filters : { ...req.filters, sort: grouping === "subject" ? "subject" : "curriculum", dir: "asc" as const };
  const { rows } = await listItems(user, filters, now, {
      all: req.scope !== "page",
      ids: req.scope === "selected" ? req.ids ?? [] : undefined,
    });
  const allowed = new Set([...ITEM_COLUMNS.map((c) => c.key), "part"]);
  const lead = grouping === "subject" ? ["subject", "grade", "unit", "part"] : grouping === "grade" ? ["grade", "subject", "unit", "part"] : [];
  const cols = [...lead, ...req.columns.filter((c) => allowed.has(c) && !(lead.length && ["grade", "subject", "unit", "lesson", "title", "part"].includes(c)))];
  const labels = cols.map((c) => (c === "part" ? "Part" : ITEM_COLUMNS.find((x) => x.key === c)!.label));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const meta = [
    ["Generated", `${fmtDateTime(now, tz)} (${tz})`],
    ["Generated by", user.name],
    ["Filters", await describeFilters(req.filters)],
    ["Rows", String(rows.length)],
    ["Counting rule", "One row per distinct item. Multi-grade items appear once."],
  ];
  const nowMs = Date.now();
  const data = rows.map((r) => cols.map((c) => cellValue(r, c, users, tz, nowMs, s)));

  await run(
        "INSERT INTO jobs (id, kind, template, mode, file_name, status, total_rows, actor_id, created_at, finished_at, report) VALUES (?, 'export', ?, ?, ?, 'completed', ?, ?, ?, ?, ?)",
        uid("job_"),
        req.format,
        req.scope,
        `myseed-content-${stamp}.${req.format}`,
        rows.length,
        user.id,
        now,
        now,
        JSON.stringify({ columns: cols, filters: await describeFilters(req.filters) }),
      );

  if (req.format === "csv") {
    const lines = [
      ...meta.map((m) => m.map(csvEscape).join(",")),
      "",
      labels.map(csvEscape).join(","),
      ...data.map((r) => r.map(csvEscape).join(",")),
    ];
    return { filename: `myseed-content-${stamp}.csv`, contentType: "text/csv; charset=utf-8", body: "﻿" + lines.join("\r\n"), rows: rows.length };
  }
  if (req.format === "json") {
    const records = data.map((r) => Object.fromEntries(cols.map((c, i) => [labels[i], r[i]])));
    return {
      filename: `myseed-content-${stamp}.json`,
      contentType: "application/json",
      body: JSON.stringify({ meta: Object.fromEntries(meta), columns: labels, rows: records }, null, 2),
      rows: rows.length,
    };
  }
  if (req.format === "audit") {
    if (!can(user, "export.audit")) throw new Error("Structured JSON export requires the audit export permission.");
    const ids = rows.map((r) => r.id);
    const events = ids.length
      ? await all(`SELECT * FROM audit_events WHERE item_id IN (${ids.map(() => "?").join(",")}) ORDER BY occurred_at`, ...ids)
      : [];
    const assets = ids.length
      ? await all(`SELECT item_id, kind, version_no, url, status, created_at FROM assets WHERE item_id IN (${ids.map(() => "?").join(",")})`, ...ids)
      : [];
    return {
      filename: `myseed-metadata-audit-${stamp}.json`,
      contentType: "application/json",
      body: JSON.stringify({ meta: Object.fromEntries(meta), timezone: tz, items: rows, events, assetManifest: assets }, null, 2),
      rows: rows.length,
    };
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = s.workspace.name;
  const ws = wb.addWorksheet("Content", { views: [{ state: "frozen", ySplit: 1, xSplit: Math.min(2, cols.length) }] });
  ws.columns = cols.map((c, i) => ({ header: labels[i], key: c, width: Math.max(12, Math.min(60, (ITEM_COLUMNS.find((x) => x.key === c)?.width ?? 120) / 7)) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF074924" } };
  for (const r of data) ws.addRow(r.map(safeCell));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  // In a hierarchy, grade, subject and unit cells are merged down the rows they cover.
  if (lead.length) {
    for (let c = 0; c < 3; c++) {
      let start = 0;
      for (let i = 1; i <= data.length; i++) {
        const same = i < data.length && data[i].slice(0, c + 1).join("|") === data[start].slice(0, c + 1).join("|");
        if (!same) {
          if (i - start > 1) ws.mergeCells(start + 2, c + 1, i + 1, c + 1);
          ws.getCell(start + 2, c + 1).alignment = { vertical: "top" };
          start = i;
        }
      }
    }
  }
  // Done per stage, by grade and subject.
  const progress = wb.addWorksheet("Progress by stage");
  progress.columns = [
    { header: "Grade", key: "g", width: 14 },
    { header: "Subject", key: "s", width: 22 },
    { header: "Parts", key: "n", width: 8 },
    ...STAGES.map((st) => ({ header: `${STAGE_LABELS[st]} done`, key: st, width: 16 })),
  ];
  progress.getRow(1).font = { bold: true };
  const pg = new Map<string, ItemListRow[]>();
  for (const r of rows) (pg.get(`${r.grade_name}|${r.subject_name}`) ?? pg.set(`${r.grade_name}|${r.subject_name}`, []).get(`${r.grade_name}|${r.subject_name}`)!).push(r);
  for (const [k, list] of pg) {
    const [g, sub] = k.split("|");
    progress.addRow({ g, s: sub, n: list.length, ...Object.fromEntries(STAGES.map((st) => [st, list.filter((x) => progressOf(x, st) === "done").length])) });
  }
  // Grouped summary by grade and subject.
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Grade", key: "g", width: 14 },
    { header: "Subject", key: "s", width: 22 },
    { header: "Items", key: "n", width: 10 },
    { header: "Draft", key: "d", width: 10 },
    { header: "In production", key: "p", width: 14 },
    { header: "Published", key: "pub", width: 12 },
    { header: "Blocked", key: "b", width: 10 },
  ];
  summary.getRow(1).font = { bold: true };
  const groups = new Map<string, ItemListRow[]>();
  for (const r of rows) {
    const k = `${r.grade_name}|${r.subject_name}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const [k, list] of groups) {
    const [g, sub] = k.split("|");
    summary.addRow({
      g,
      s: sub,
      n: list.length,
      d: list.filter((x) => x.lifecycle === "draft").length,
      p: list.filter((x) => x.lifecycle === "in_production").length,
      pub: list.filter((x) => x.lifecycle === "published").length,
      b: list.filter((x) => x.stage_status === "blocked" && x.lifecycle === "in_production").length,
    });
  }
  const about = wb.addWorksheet("About this export");
  about.columns = [{ header: "Field", key: "a", width: 22 }, { header: "Value", key: "b", width: 90 }];
  for (const m of meta) about.addRow(m.map(safeCell));
  about.addRow(["Primary placement", "Summary groups each item by its primary grade and subject so totals add up."]);
  const buf = await wb.xlsx.writeBuffer();
  return {
    filename: `myseed-content-${stamp}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: Buffer.from(buf as ArrayBuffer),
    rows: rows.length,
  };
}
