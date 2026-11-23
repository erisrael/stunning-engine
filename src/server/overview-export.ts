// Production, Overview, Export: the Overview as an Excel workbook, a print-ready report (Save as PDF) or CSV, with
// the page's filters. A production team's members get their own team's columns (src/server/overview-teams.ts), for
// every grade and subject, exactly as they see the page; managers and Admin get all four teams.

import { structureRows, type StructureRow } from "./structure";
import { overviewStagesFor } from "./overview-teams";
import { reportBrand, reportDocument, table, tiles, bar } from "./report-doc";
import { WorkflowError } from "./workflow";
import { SIMPLE_STATUS_LABELS, STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import type { AppUser } from "./users";

export type OverviewFilter = { grades?: string[]; subjects?: string[]; status?: string | null; stage?: string | null; q?: string | null; mode?: "grade" | "subject" };

const unitLabel = (r: StructureRow) => `Unit ${r.unitNumber}: ${r.unitTitle}`;
const partLabel = (r: StructureRow) => (r.partTitle ? `Part ${r.partNumber ?? ""}: ${r.partTitle}`.replace(/Part : /, "") : "");

async function rowsFor(user: AppUser & { activeRole: string }, f: OverviewFilter) {
  const stages = await overviewStagesFor(user);
  if (stages && !stages.length) throw new WorkflowError("FORBIDDEN", "The Overview is not open to your role.");
  const shown = (stages ?? [...STAGES]) as Stage[];
  let rows = await structureRows(stages ? { ...user, scopes: [], ownWorkOnly: false } : user, { gradeIds: f.grades, subjectIds: f.subjects });
  const q = f.q?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.unitTitle, r.partTitle ?? "", r.itemCode ?? "", ...r.cameraCodes].some((x) => x.toLowerCase().includes(q)));
  if (f.status) {
    const st = f.stage && shown.includes(f.stage as Stage) ? [f.stage as Stage] : shown;
    rows = rows.filter((r) => st.some((s) => r.stages[s] === f.status));
  }
  const bySubject = f.mode === "subject";
  rows.sort((a, b) => (bySubject ? a.subjectSort - b.subjectSort || a.gradeSort - b.gradeSort : a.gradeSort - b.gradeSort || a.subjectSort - b.subjectSort) || a.unitNumber - b.unitNumber || (a.partNumber ?? 0) - (b.partNumber ?? 0));
  return { rows, shown, team: !!stages };
}

const titleOf = (shown: Stage[], team: boolean) => (team && shown.length === 1 ? `${STAGE_LABELS[shown[0]!]} team overview` : team ? `${shown.map((s) => STAGE_LABELS[s]).join(" and ")} overview` : "Production overview");

export async function overviewCsv(user: AppUser & { activeRole: string }, f: OverviewFilter) {
  const { rows, shown } = await rowsFor(user, f);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Grade", "Subject", "Unit", "Part", "Item code", "Camera codes", ...shown.map((s) => STAGE_LABELS[s])];
  const lines = rows.map((r) => [r.gradeName, r.subjectName, unitLabel(r), partLabel(r), r.itemCode ?? "", r.cameraCodes.join(" "), ...shown.map((s) => SIMPLE_STATUS_LABELS[r.stages[s]])]);
  return `﻿${[head, ...lines].map((l) => l.map(cell).join(",")).join("\r\n")}\r\n`;
}

function counts(rows: StructureRow[], shown: Stage[]) {
  return shown.map((s) => {
    const c = { done: 0, in_process: 0, missing: 0, none: 0 };
    for (const r of rows) c[r.stages[s] as keyof typeof c]++;
    const total = rows.filter((r) => r.partId).length || rows.length;
    return { stage: s, ...c, total, pct: total ? Math.round((c.done / total) * 100) : 0 };
  });
}

export async function overviewXlsx(user: AppUser & { activeRole: string; name: string }, f: OverviewFilter) {
  const { rows, shown, team } = await rowsFor(user, f);
  const brand = await reportBrand();
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.name;
  const ws = wb.addWorksheet("Overview", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Grade", width: 12 },
    { header: "Subject", width: 18 },
    { header: "Unit", width: 34 },
    { header: "Part", width: 36 },
    { header: "Item code", width: 14 },
    { header: "Camera codes", width: 18 },
    ...shown.map((s) => ({ header: STAGE_LABELS[s], width: 14 })),
  ];
  const fill: Record<string, string> = { done: "FFD7F5DD", in_process: "FFFFF1C2", missing: "FFFBD5D5", none: "FFF1F1F1" };
  for (const r of rows) {
    const row = ws.addRow([r.gradeName, r.subjectName, unitLabel(r), partLabel(r), r.itemCode ?? "", r.cameraCodes.join(" "), ...shown.map((s) => SIMPLE_STATUS_LABELS[r.stages[s]])]);
    shown.forEach((s, i) => (row.getCell(7 + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill[r.stages[s]] ?? "FFFFFFFF" } }));
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 + shown.length } };
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Team", width: 16 }, { header: "Done", width: 10 }, { header: "In process", width: 12 }, { header: "Missing", width: 10 }, { header: "Not reached", width: 12 }, { header: "Done %", width: 10 }];
  for (const c of counts(rows, shown)) sum.addRow([STAGE_LABELS[c.stage], c.done, c.in_process, c.missing, c.none, c.pct / 100]);
  sum.getColumn(6).numFmt = "0%";
  sum.getRow(1).font = { bold: true };
  const about = wb.addWorksheet("About");
  about.addRows([[titleOf(shown, team)], [brand.name], [`Prepared for ${user.name}`], [`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`], [`${rows.length} rows`]]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function overviewReportHtml(user: AppUser & { activeRole: string; name: string }, f: OverviewFilter) {
  const { rows, shown, team } = await rowsFor(user, f);
  const brand = await reportBrand();
  const title = titleOf(shown, team);
  const c = counts(rows, shown);
  const groups = new Map<string, StructureRow[]>();
  for (const r of rows) {
    const k = f.mode === "subject" ? `${r.subjectName} · ${r.gradeName}` : `${r.gradeName} · ${r.subjectName}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const date = new Date().toISOString().slice(0, 10);
  return reportDocument({
    brand,
    title,
    kind: "Overview report",
    ref: `OVERVIEW-${shown.map((s) => s.slice(0, 3).toUpperCase()).join("")}-${date.replace(/-/g, "")}`,
    landscape: shown.length > 2,
    control: [
      ["Teams", shown.map((s) => STAGE_LABELS[s]).join(", ")],
      ["Order", f.mode === "subject" ? "Subject, then grade" : "Grade, then subject"],
      ["Filters", [f.q && `Search: “${f.q}”`, f.status && `Status: ${SIMPLE_STATUS_LABELS[f.status as keyof typeof SIMPLE_STATUS_LABELS] ?? f.status}`].filter(Boolean).join(" · ") || "None"],
      ["Prepared for", user.name],
      ["Generated", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
    ],
    sections: [
      {
        id: "summary",
        title: "Summary",
        html:
          tiles(c.flatMap((x) => [[`${STAGE_LABELS[x.stage]}: done`, `${x.done} of ${x.total}`] as [string, string | number], [`${STAGE_LABELS[x.stage]}: in process`, x.in_process] as [string, string | number]])) +
          table(["Team", "Done", "In process", "Missing", "Not reached", "Progress"], c.map((x) => [STAGE_LABELS[x.stage], x.done, x.in_process, x.missing, x.none, bar(x.pct)]), [1, 2, 3, 4], [5]),
      },
      ...[...groups].map(([k, list], i) => ({
        id: `g${i}`,
        title: k,
        html: table(["Unit", "Part", "Item code", ...shown.map((s) => STAGE_LABELS[s])], list.map((r) => [unitLabel(r), partLabel(r), r.itemCode ?? "", ...shown.map((s) => SIMPLE_STATUS_LABELS[r.stages[s]])])),
      })),
    ],
  });
}
