import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { structureRows, type StructureRow } from "@/server/structure";
import { taxonomy } from "@/server/queries";
import { can } from "@/server/users";
import { MyseedLogo } from "@/components/app/logo";
import { SIMPLE_STATUS_LABELS, STAGE_LABELS, STAGES, type SimpleStatus, type Stage } from "@/lib/domain";
import { ReportToolbar } from "./toolbar";

export const metadata = { title: "PDF report" };

const CHIP: Record<SimpleStatus, string> = {
  done: "background:#dcf5e6;color:#13773d",
  in_process: "background:#e7e3fd;color:#4f3fd0",
  missing: "background:#fde4e8;color:#c0283f",
  none: "color:#8a919c",
};

// Print-ready status report. Open it from Export, PDF, or the home quick actions, then "Save as PDF".
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!can(viewer, "export.report")) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const mode = sp.mode === "subject" ? "subject" : "grade";
  const landscape = sp.orientation !== "portrait";
  const showDates = sp.dates !== "0";
  const stageFilter = STAGES.includes(sp.stage as Stage) ? (sp.stage as Stage) : null;
  const statusFilter = (["done", "in_process", "missing"] as SimpleStatus[]).includes(sp.status as SimpleStatus) ? (sp.status as SimpleStatus) : null;
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const tax = await taxonomy();
  let rows = await structureRows(viewer, { gradeIds: sp.grade ? [sp.grade] : undefined, subjectIds: sp.subject ? [sp.subject] : undefined });
  if (sp.empty === "0") rows = rows.filter((r) => r.partId);
  if (stageFilter && statusFilter) rows = rows.filter((r) => r.stages[stageFilter] === statusFilter);
  rows.sort((a, b) =>
    mode === "grade"
      ? a.gradeSort - b.gradeSort || a.subjectSort - b.subjectSort || a.unitNumber - b.unitNumber || (a.partNumber ?? 0) - (b.partNumber ?? 0)
      : a.subjectSort - b.subjectSort || a.gradeSort - b.gradeSort || a.unitNumber - b.unitNumber || (a.partNumber ?? 0) - (b.partNumber ?? 0),
  );
  const parts = rows.filter((r) => r.partId);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "2-digit" }) : "");
  const k1 = (r: StructureRow) => (mode === "grade" ? r.gradeId : r.subjectId);
  const k2 = (r: StructureRow) => `${k1(r)}|${mode === "grade" ? r.subjectId : r.gradeId}`;
  const k3 = (r: StructureRow) => `${k2(r)}|${r.unitId}`;
  const span = (i: number, key: (r: StructureRow) => string) => {
    if (i > 0 && key(rows[i - 1]) === key(rows[i])) return 0;
    let n = 1;
    while (i + n < rows.length && key(rows[i + n]) === key(rows[i])) n++;
    return n;
  };
  const partLabel = (r: StructureRow) => (!r.partId ? "No parts yet" : /^part \d+$/i.test(r.partTitle ?? "") ? `Part ${r.partNumber}` : `Part ${r.partNumber}: ${r.partTitle}`);
  const unitLabel = (r: StructureRow) => (/^unit \d+$/i.test(r.unitTitle) ? `Unit ${r.unitNumber}` : `Unit ${r.unitNumber}: ${r.unitTitle}`);
  const filterText = [
    sp.grade && tax.grades.find((g) => g.id === sp.grade)?.name,
    sp.subject && tax.subjects.find((x) => x.id === sp.subject)?.name,
    stageFilter && statusFilter && `${STAGE_LABELS[stageFilter]}: ${SIMPLE_STATUS_LABELS[statusFilter]}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="report-page mx-auto max-w-[1200px] bg-white p-6 text-[#292d34] print:max-w-none print:p-0">
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; } @media print { .no-print { display: none !important; } body { background: #fff !important; } thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
      <ReportToolbar grades={tax.grades.map((g) => ({ id: g.id, name: g.name }))} subjects={tax.subjects.map((x) => ({ id: x.id, name: x.name }))} />

      <header className="flex items-start justify-between gap-4 border-b-2 border-[#7b68ee] pb-4">
        <div className="flex items-center gap-3">
          <MyseedLogo className="size-12" />
          <div>
            <p className="text-xs font-semibold tracking-widest text-[#7b68ee] uppercase">{s.workspace.name}</p>
            <h1 className="text-2xl font-bold">Production status report</h1>
            <p className="text-sm text-[#656f7d]">
              {mode === "grade" ? "By grade, then subject" : "By subject, then grade"}
              {filterText ? ` · ${filterText}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-[#656f7d]">
          <p>Generated {new Date().toLocaleString("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}</p>
          <p>by {viewer.name}</p>
          <p>Times in {tz}</p>
        </div>
      </header>

      <section className="my-4 grid grid-cols-4 gap-3">
        {STAGES.map((st) => {
          const done = parts.filter((r) => r.stages[st] === "done").length;
          const inProcess = parts.filter((r) => r.stages[st] === "in_process").length;
          const pct = parts.length ? Math.round((done / parts.length) * 100) : 0;
          return (
            <div key={st} className="rounded-lg border border-[#e8eaed] p-3">
              <p className="text-xs font-semibold text-[#656f7d] uppercase">{STAGE_LABELS[st]}</p>
              <p className="mt-1 text-2xl font-bold">
                {done}
                <span className="text-sm font-normal text-[#656f7d]"> / {parts.length}</span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f1f3]">
                <div className="h-full bg-[#7b68ee]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-[#656f7d]">
                {pct}% done · {inProcess} in process
              </p>
            </div>
          );
        })}
      </section>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#f5f6f8] text-left text-[10px] tracking-wide text-[#656f7d] uppercase">
            <th className="border border-[#e8eaed] px-2 py-1.5">{mode === "grade" ? "Grade" : "Subject"}</th>
            <th className="border border-[#e8eaed] px-2 py-1.5">{mode === "grade" ? "Subject" : "Grade"}</th>
            <th className="border border-[#e8eaed] px-2 py-1.5">Unit</th>
            <th className="border border-[#e8eaed] px-2 py-1.5">Part</th>
            {STAGES.map((st) => (
              <th key={st} className="border border-[#e8eaed] px-2 py-1.5 text-center">
                {STAGE_LABELS[st]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const s1 = span(i, k1);
            const s2 = span(i, k2);
            const s3 = span(i, k3);
            return (
              <tr key={`${r.unitId}-${r.partId ?? "u"}`}>
                {s1 > 0 && (
                  <td rowSpan={s1} className="border border-[#e8eaed] px-2 py-1 align-top font-semibold">
                    {mode === "grade" ? r.gradeName : r.subjectName}
                  </td>
                )}
                {s2 > 0 && (
                  <td rowSpan={s2} className="border border-[#e8eaed] px-2 py-1 align-top">
                    {mode === "grade" ? r.subjectName : r.gradeName}
                  </td>
                )}
                {s3 > 0 && (
                  <td rowSpan={s3} className="border border-[#e8eaed] px-2 py-1 align-top">
                    {unitLabel(r)}
                  </td>
                )}
                <td className="border border-[#e8eaed] px-2 py-1">
                  {partLabel(r)}
                  {r.cameraCodes.length > 0 && <span className="block font-mono text-[9px] text-[#8a919c]">{r.cameraCodes.join(" ")}</span>}
                </td>
                {STAGES.map((st) => (
                  <td key={st} className="border border-[#e8eaed] px-1 py-1 text-center">
                    <span className="inline-block min-w-14 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={Object.fromEntries(CHIP[r.stages[st]].split(";").map((d) => d.split(":") as [string, string]))}>
                      {SIMPLE_STATUS_LABELS[r.stages[st]]}
                    </span>
                    {showDates && r.dates[st] && <span className="block text-[9px] text-[#656f7d]">{fmt(r.dates[st])}</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="py-10 text-center text-sm text-[#656f7d]">Nothing matches these filters.</p>}
      <footer className="mt-4 border-t border-[#e8eaed] pt-2 text-[10px] text-[#8a919c]">
        Done: stage complete · In process: the part is in this stage now · Missing: nothing recorded yet · -: not reached yet. {parts.length} parts, {new Set(rows.map((r) => r.unitId)).size} units.
      </footer>
    </div>
  );
}
