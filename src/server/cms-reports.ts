import { all, get, nowIso, parseJson, run, uid } from "./db";
import { getMeta, setMeta, getSettings } from "./settings";
import { can, loadUser, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { safeCell, csvEscape } from "./exporter";
import { LEGACY_CMS_CATEGORIES, requireCmsCategories, type LegacyCmsCategory } from "./legacy-cms";
import { addisDay, dayStart, fetchCmsRange, type CmsRangeResult } from "./cms-range";
import { buildCmsReport, cmsAmount, cmsDateColumn, cmsFiltersText, CMS_GROUP_BY, type CmsReport, type CmsReportSpec } from "@/lib/cms-report";
import { parseCmsDate } from "@/lib/cms-filters";
import { fmtDateTime } from "@/lib/format";

// Legacy CMS reports (Update 1.0, Phase 2): the rows of one date-first load, grouped and totalled, as a real
// Excel workbook, a CSV that explains itself, or the A4 PDF page (/export/cms-report). Every export is logged.
// Scheduled reports run daily or weekly for Finance and Owners and keep their rows so the links stay valid.

export type ReportMeta = { table: string; from: string; until: string; filters: string; exportedAt: string; exportedBy: string; method: string; workspace: string };
const METHOD_LABEL: Record<string, string> = { "noor-filter": "Noor date filter", "sorted-search": "Sorted range search", "full-scan": "All pages, filtered here" };
export const tableLabel = (c: string) => LEGACY_CMS_CATEGORIES.find((x) => x.key === c)?.label ?? c;

export function cleanSpec(spec: Partial<CmsReportSpec>, range: CmsRangeResult): CmsReportSpec {
  return {
    category: range.category,
    from: range.from,
    until: range.until,
    search: spec.search,
    filters: spec.filters,
    columns: Array.isArray(spec.columns) ? spec.columns.map(String).slice(0, 60) : [],
    groupBy: CMS_GROUP_BY.some(([k]) => k === spec.groupBy) ? spec.groupBy! : "none",
    sumColumn: typeof spec.sumColumn === "string" ? spec.sumColumn : undefined,
    title: String(spec.title || "").slice(0, 120) || undefined,
  };
}

export async function reportMeta(user: AppUser | null, range: CmsRangeResult, spec: CmsReportSpec): Promise<ReportMeta> {
  const s = await getSettings();
  return {
    table: tableLabel(range.category),
    from: range.from,
    until: range.until,
    filters: cmsFiltersText(spec),
    exportedAt: fmtDateTime(nowIso(), s.workspace.timezone),
    exportedBy: user?.name ?? "Scheduled report",
    method: METHOD_LABEL[range.method] ?? range.method,
    workspace: s.workspace.name,
  };
}

const header = (m: ReportMeta, report: CmsReport) => [
  ["Report", report.spec.title || `${m.table} report`],
  ["Table", m.table],
  ["Date range", `${m.from} to ${m.until}`],
  ["Filters", m.filters],
  ["Grouped by", CMS_GROUP_BY.find(([k]) => k === report.spec.groupBy)?.[1] ?? "No grouping"],
  ["Rows", String(report.totals.count)],
  ...(report.sumColumn ? [[`Total ${report.sumColumn}`, report.totals.sum.toLocaleString("en-US")]] : []),
  ["Loaded with", m.method],
  ["Exported", `${m.exportedAt} by ${m.exportedBy}`],
];

// c11: the first lines say what the file is, then a blank line, then the table.
export function reportCsv(report: CmsReport, m: ReportMeta) {
  const lines = header(m, report).map((r) => r.map(csvEscape).join(","));
  const cols = [...(report.spec.groupBy !== "none" ? ["Group"] : []), ...report.columns];
  lines.push("", cols.map(csvEscape).join(","));
  for (const g of report.groups) for (const r of g.rows) lines.push([...(report.spec.groupBy !== "none" ? [g.label] : []), ...report.columns.map((c) => r[c] ?? "")].map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n");
}

// c9: styled header, frozen first row, number and date cells, a totals row, a Summary sheet and one sheet per group.
export async function reportXlsx(report: CmsReport, m: ReportMeta) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = m.workspace;
  wb.created = new Date();
  const green = "FF074924";
  const dateCol = cmsDateColumn(report.columns);
  const numeric = new Set(report.columns.filter((c) => c === report.sumColumn || /amount|total|price|count|qty|quantity/i.test(c)));

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 26 }, { width: 70 }];
  const title = summary.addRow([report.spec.title || `${m.table} report`]);
  title.font = { bold: true, size: 16, color: { argb: green } };
  summary.addRow([m.workspace]).font = { color: { argb: "FF656F7D" } };
  summary.addRow([]);
  for (const [k, v] of header(m, report).slice(1)) {
    const r = summary.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  }
  summary.addRow([]);
  const gh = summary.addRow(["Group", "Rows", ...(report.sumColumn ? [`Total ${report.sumColumn}`] : [])]);
  gh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  gh.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: green } }));
  summary.getColumn(3).width = 20;
  for (const g of report.groups) {
    const r = summary.addRow([safeCell(g.label), g.count, ...(report.sumColumn ? [g.sum] : [])]);
    r.getCell(2).numFmt = "#,##0";
    if (report.sumColumn) r.getCell(3).numFmt = "#,##0.00";
  }
  const tr = summary.addRow(["Total", report.totals.count, ...(report.sumColumn ? [report.totals.sum] : [])]);
  tr.font = { bold: true };
  tr.getCell(2).numFmt = "#,##0";
  if (report.sumColumn) tr.getCell(3).numFmt = "#,##0.00";

  const used = new Set<string>(["Summary"]);
  const sheetName = (label: string) => {
    let base = label.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Group";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 25)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  };
  const addTable = (name: string, rows: Record<string, string>[]) => {
    const ws = wb.addWorksheet(sheetName(name), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = report.columns.map((c) => ({ header: c, key: c, width: Math.min(50, Math.max(10, c.length + 2, ...rows.slice(0, 200).map((r) => String(r[c] ?? "").length + 2))) }));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: green } }));
    for (const r of rows)
      ws.addRow(
        report.columns.map((c) => {
          const v = r[c] ?? "";
          if (numeric.has(c) && /\d/.test(v)) return cmsAmount(v);
          if (c === dateCol) {
            const d = parseCmsDate(v);
            if (d) return new Date(+d + 3 * 3600_000); // shown as Addis Ababa wall time
          }
          return safeCell(v);
        }),
      );
    report.columns.forEach((c, i) => {
      if (numeric.has(c)) ws.getColumn(i + 1).numFmt = "#,##0.00";
      if (c === dateCol) ws.getColumn(i + 1).numFmt = "yyyy-mm-dd hh:mm";
    });
    const totals = ws.addRow(report.columns.map((c, i) => (i === 0 ? `Total (${rows.length} rows)` : numeric.has(c) ? rows.reduce((s, r) => s + cmsAmount(r[c]), 0) : "")));
    totals.font = { bold: true };
    totals.eachCell((c) => (c.border = { top: { style: "thin" } }));
    if (report.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: report.columns.length } };
  };
  if (report.spec.groupBy === "none" || report.groups.length > 60) addTable("Rows", report.groups.flatMap((g) => g.rows));
  else for (const g of report.groups) addTable(g.label, g.rows);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function logReportExport(user: AppUser, format: string, report: CmsReport, m: ReportMeta) {
  await audit({ actor: user }, { action: "cms.report_export", summary: `${user.name} exported a ${format.toUpperCase()} ${m.table} report (${m.from} to ${m.until}, ${report.totals.count} rows)`, newValue: { format, table: report.spec.category, from: m.from, until: m.until, groupBy: report.spec.groupBy, rows: report.totals.count } });
}

// A stored scheduled run, readable by anyone allowed to see its table.
export async function reportRun(user: AppUser, id: string) {
  const row = await get<{ spec_json: string; result_json: string; name: string }>("SELECT spec_json, result_json, name FROM cms_report_runs WHERE id = ?", id);
  if (!row) throw new WorkflowError("NOT_FOUND", "This report run has expired.");
  const result = parseJson<CmsRangeResult>(row.result_json, null as never);
  await requireCmsCategories(user, [result.category]);
  return { spec: parseJson<CmsReportSpec>(row.spec_json, null as never), result, name: row.name };
}

// ---------------------------------------------------------------------------
// Scheduled reports
// ---------------------------------------------------------------------------

export type CmsSchedule = {
  id: string;
  name: string;
  active: boolean;
  category: LegacyCmsCategory;
  window: "yesterday" | "last7" | "last30" | "month";
  cadence: "daily" | "weekly";
  weekday: number; // 1 = Monday … 7 = Sunday
  hour: number; // Addis Ababa time
  groupBy: CmsReportSpec["groupBy"];
  columns: string[];
  filters: Record<string, string>;
  search: string;
  emails: string[];
  roles: string[];
  chatGroupId: string | null;
  createdBy: string;
  lastRunAt: string | null;
  lastStatus: string | null;
};
export const SCHEDULE_ROLES = [
  ["finance_manager", "Finance managers"],
  ["accountant", "Accountants"],
  ["owner", "Owners"],
  ["admin", "Admins"],
] as const;

const canSchedule = (u: AppUser) => can(u, "finance.access") || can(u, "users.manage");
async function readSchedules(): Promise<CmsSchedule[]> {
  return parseJson<CmsSchedule[]>((await getMeta("cmsReportSchedules")) || "[]", []);
}

export async function listSchedules(user: AppUser) {
  if (!canSchedule(user)) throw new WorkflowError("FORBIDDEN", "Only Finance or Admin can schedule CMS reports.");
  return readSchedules();
}

export async function saveSchedule(user: AppUser, input: Partial<CmsSchedule> & { remove?: boolean }) {
  if (!canSchedule(user)) throw new WorkflowError("FORBIDDEN", "Only Finance or Admin can schedule CMS reports.");
  const list = await readSchedules();
  if (input.remove) {
    const next = list.filter((s) => s.id !== input.id);
    await setMeta("cmsReportSchedules", JSON.stringify(next));
    await audit({ actor: user }, { action: "cms.report_schedule", summary: `${user.name} removed a scheduled CMS report` });
    return next;
  }
  if (!LEGACY_CMS_CATEGORIES.some((c) => c.key === input.category)) throw new WorkflowError("VALIDATION", "Choose a table.");
  await requireCmsCategories(user, [input.category!]);
  const emails = [...new Set((input.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new WorkflowError("VALIDATION", "Check the email addresses.");
  const roles = (input.roles || []).filter((r) => SCHEDULE_ROLES.some(([k]) => k === r));
  if (!emails.length && !roles.length && !input.chatGroupId) throw new WorkflowError("VALIDATION", "Choose who receives the report: roles, email addresses or a team chat.");
  const prev = list.find((s) => s.id === input.id);
  const s: CmsSchedule = {
    id: prev?.id ?? uid("crs_"),
    name: String(input.name || "").trim().slice(0, 80) || `${tableLabel(input.category!)} report`,
    active: input.active !== false,
    category: input.category!,
    window: (["yesterday", "last7", "last30", "month"] as const).includes(input.window as never) ? input.window! : "yesterday",
    cadence: input.cadence === "weekly" ? "weekly" : "daily",
    weekday: Math.min(7, Math.max(1, Math.trunc(Number(input.weekday) || 1))),
    hour: Math.min(23, Math.max(0, Math.trunc(Number(input.hour ?? 7)))),
    groupBy: CMS_GROUP_BY.some(([k]) => k === input.groupBy) ? input.groupBy! : "day",
    columns: (input.columns || []).map(String).slice(0, 60),
    filters: input.filters || {},
    search: String(input.search || "").slice(0, 200),
    emails,
    roles,
    chatGroupId: input.chatGroupId || null,
    createdBy: prev?.createdBy ?? user.id,
    lastRunAt: prev?.lastRunAt ?? null,
    lastStatus: prev?.lastStatus ?? null,
  };
  const next = prev ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
  await setMeta("cmsReportSchedules", JSON.stringify(next));
  await audit({ actor: user }, { action: "cms.report_schedule", summary: `${user.name} ${prev ? "updated" : "scheduled"} the CMS report "${s.name}" (${s.cadence})` });
  return next;
}

export function scheduleWindow(w: CmsSchedule["window"], now = Date.now()) {
  const today = addisDay(now);
  const back = (n: number) => addisDay(dayStart(today) - n * 86400_000 + 3600_000);
  const yesterday = back(1);
  if (w === "last7") return { from: back(7), until: yesterday };
  if (w === "last30") return { from: back(30), until: yesterday };
  if (w === "month") return { from: `${yesterday.slice(0, 7)}-01`, until: yesterday };
  return { from: yesterday, until: yesterday };
}

function due(s: CmsSchedule, now: number) {
  if (!s.active) return false;
  const local = new Date(now + 3 * 3600_000);
  if (local.getUTCHours() < s.hour) return false;
  if (s.cadence === "weekly" && ((local.getUTCDay() + 6) % 7) + 1 !== s.weekday) return false;
  return !s.lastRunAt || addisDay(Date.parse(s.lastRunAt)) !== addisDay(now);
}

async function recipients(s: CmsSchedule) {
  const byRole = s.roles.length
    ? await all<{ email: string }>(
        `SELECT DISTINCT u.email FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE u.active = 1 AND COALESCE(u.email,'') <> '' AND r.role IN (${s.roles.map(() => "?").join(",")})`,
        ...s.roles,
      )
    : [];
  return [...new Set([...s.emails, ...byRole.map((r) => r.email.toLowerCase())])];
}

export async function runSchedule(s: CmsSchedule, now = Date.now()) {
  const actor = (await loadUser(s.createdBy)) ?? null;
  if (!actor?.active) throw new Error("The person who scheduled this report is no longer active. Save it again.");
  const { from, until } = scheduleWindow(s.window, now);
  const range = await fetchCmsRange(actor, { category: s.category, from, until, search: s.search, filters: s.filters }, async () => {}, now);
  const spec = cleanSpec({ columns: s.columns, groupBy: s.groupBy, search: s.search, filters: s.filters, title: s.name }, range);
  const report = buildCmsReport(range.records, range.headers, spec);
  const id = uid("crr_");
  await run("INSERT INTO cms_report_runs (id, schedule_id, name, spec_json, result_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, s.id, s.name, JSON.stringify(spec), JSON.stringify(range), actor.id, nowIso());
  const base = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
  const links = { pdf: `${base}/export/cms-report?run=${id}`, xlsx: `${base}/api/legacy-cms/report?run=${id}&format=xlsx`, csv: `${base}/api/legacy-cms/report?run=${id}&format=csv` };
  const m = await reportMeta(null, range, spec);
  const top = report.groups.slice(0, 30);
  const sum = report.sumColumn ? ` · total ${report.totals.sum.toLocaleString("en-US")}` : "";
  const text = [
    `${s.name}: ${m.table}, ${from}${from === until ? "" : ` to ${until}`}`,
    `${report.totals.count} rows${sum}`,
    "",
    ...top.map((g) => `${g.label}: ${g.count}${report.sumColumn ? ` · ${g.sum.toLocaleString("en-US")}` : ""}`),
    "",
    `PDF: ${links.pdf}`,
    `Excel: ${links.xlsx}`,
    `CSV: ${links.csv}`,
  ].join("\n");
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:system-ui,sans-serif;color:#292d34"><h2 style="color:#074924;margin:0 0 4px">${esc(s.name)}</h2><p style="margin:0 0 12px;color:#656f7d">${esc(m.table)} · ${from}${from === until ? "" : ` to ${until}`} · ${report.totals.count} rows${esc(sum)}</p><table style="border-collapse:collapse;font-size:13px"><tr><th style="text-align:left;padding:4px 12px 4px 0;border-bottom:2px solid #074924">Group</th><th style="text-align:right;padding:4px 0;border-bottom:2px solid #074924">Rows</th>${report.sumColumn ? `<th style="text-align:right;padding:4px 0 4px 12px;border-bottom:2px solid #074924">${esc(report.sumColumn)}</th>` : ""}</tr>${top.map((g) => `<tr><td style="padding:3px 12px 3px 0;border-bottom:1px solid #eee">${esc(g.label)}</td><td style="text-align:right;border-bottom:1px solid #eee">${g.count}</td>${report.sumColumn ? `<td style="text-align:right;padding-left:12px;border-bottom:1px solid #eee">${g.sum.toLocaleString("en-US")}</td>` : ""}</tr>`).join("")}</table><p style="margin-top:16px"><a href="${links.pdf}">Open the PDF report</a> · <a href="${links.xlsx}">Excel</a> · <a href="${links.csv}">CSV</a></p><p style="color:#8a919c;font-size:12px">The links need a sign-in with access to ${esc(m.table)}.</p></div>`;
  const { sendSystemEmail } = await import("./email");
  const to = await recipients(s);
  let sent = 0;
  for (const addr of to) {
    try {
      await sendSystemEmail(addr, `${m.workspace}: ${s.name} (${from}${from === until ? "" : ` to ${until}`})`, text, html);
      sent++;
    } catch (e) {
      console.error("CMS report email failed", addr, e);
    }
  }
  if (s.chatGroupId) {
    const { postCard } = await import("./chat");
    await postCard(s.chatGroupId, actor.id, { kind: "system", body: text });
  }
  return { runId: id, rows: report.totals.count, sent, recipients: to.length, chat: !!s.chatGroupId };
}

// Called every minute with the CMS timer; each schedule runs at most once per Addis day.
export async function scheduledCmsReports(now = Date.now()) {
  const list = await readSchedules();
  if (!list.some((s) => due(s, now))) return;
  const { acquireLease, releaseLease } = await import("./ops");
  if (!(await acquireLease("cms-reports", 30 * 60_000))) return;
  try {
    for (const s of await readSchedules()) {
      if (!due(s, now)) continue;
      let status: string;
      try {
        const r = await runSchedule(s, now);
        status = `Sent ${r.rows} rows to ${r.sent} of ${r.recipients} addresses${r.chat ? " and the team chat" : ""}`;
      } catch (e) {
        status = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      const fresh = await readSchedules();
      await setMeta("cmsReportSchedules", JSON.stringify(fresh.map((x) => (x.id === s.id ? { ...x, lastRunAt: new Date(now).toISOString(), lastStatus: status } : x))));
    }
    await run("DELETE FROM cms_report_runs WHERE created_at < ?", new Date(now - 90 * 86400_000).toISOString());
  } finally {
    await releaseLease("cms-reports");
  }
}

export async function runScheduleNow(user: AppUser, id: string) {
  const s = (await listSchedules(user)).find((x) => x.id === id);
  if (!s) throw new WorkflowError("NOT_FOUND", "Scheduled report not found.");
  const r = await runSchedule(s);
  const fresh = await readSchedules();
  const status = `Sent ${r.rows} rows to ${r.sent} of ${r.recipients} addresses${r.chat ? " and the team chat" : ""}`;
  await setMeta("cmsReportSchedules", JSON.stringify(fresh.map((x) => (x.id === s.id ? { ...x, lastRunAt: nowIso(), lastStatus: status } : x))));
  await audit({ actor: user }, { action: "cms.report_schedule", summary: `${user.name} ran the CMS report "${s.name}" now` });
  return { ...r, status };
}

// c15: the Unable-to-verify contact list, as a report (same Excel, CSV and PDF files).
export async function unableReport(user: AppUser, f: { search?: string; verifier?: string; ids?: string[] } = {}) {
  const { listInvoiceReviews } = await import("./cms-invoices");
  const { UNABLE_REASON_LABEL } = await import("@/lib/cms-invoices");
  const s = await getSettings();
  const list = await listInvoiceReviews(user, { state: "unable", search: f.search, verifier: f.verifier, ids: f.ids?.length ? f.ids : undefined });
  const headers = ["Invoice", "Student", "Contact", "Phone", "Grade", "Plan", "Amount", "Method", "Invoice date", "Reason", "Note", "Marked by", "Marked at"];
  const rows = list.map((r) => ({
    Invoice: r.invoiceId,
    Student: r.student,
    Contact: r.contactName,
    Phone: r.phone || "No phone",
    Grade: r.grade,
    Plan: r.plan,
    Amount: r.amount ? String(r.amount) : "",
    Method: r.method,
    "Invoice date": r.invoiceDate,
    Reason: UNABLE_REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "",
    Note: r.note ?? "",
    "Marked by": r.updatedByName ?? "",
    "Marked at": fmtDateTime(r.updatedAt, s.workspace.timezone),
  }));
  const dates = list.map((r) => r.updatedAt.slice(0, 10)).sort();
  const spec: CmsReportSpec = { category: "invoices", from: dates[0] ?? addisDay(Date.now()), until: dates.at(-1) ?? addisDay(Date.now()), search: f.search, columns: headers, groupBy: "none", sumColumn: "Amount", title: "Invoices unable to verify" };
  const report = buildCmsReport(rows, headers, spec);
  const m: ReportMeta = { table: "Invoices unable to verify", from: spec.from, until: spec.until, filters: cmsFiltersText(spec), exportedAt: fmtDateTime(nowIso(), s.workspace.timezone), exportedBy: user.name, method: "Finance verification list", workspace: s.workspace.name };
  return { report, meta: m, missingPhone: list.filter((r) => !r.phone).length };
}
