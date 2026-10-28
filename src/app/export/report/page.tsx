import * as React from "react";
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

const CHIP: Record<SimpleStatus, React.CSSProperties> = {
  done: { background: "#dcf5e6", color: "#13773d" },
  in_process: { background: "#e7e3fd", color: "#4f3fd0" },
  missing: { background: "#fde4e8", color: "#c0283f" },
  none: { color: "#a3a9b3" },
};

// Column widths (percent) for the detail tables. Grade (or subject) is the section heading and the
// second level is a full-width row, so no tall merged cell forces a half-empty page.
const COLS = { unit: 24, part: 36, stage: 10 };

// Print-ready A4 status report. Open it from Export, PDF, or the home quick actions, then "Save as PDF".
// On screen it is laid out on a sheet of the chosen A4 width, so line breaks match the printed page.
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!can(viewer, "export.report")) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const mode = sp.mode === "subject" ? "subject" : "grade";
  const landscape = sp.orientation !== "portrait";
  const showDates = sp.dates !== "0";
  const pageBreaks = sp.breaks === "1";
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
  const groupName = (r: StructureRow) => (mode === "grade" ? r.gradeName : r.subjectName);
  const secondName = (r: StructureRow) => (mode === "grade" ? r.subjectName : r.gradeName);
  const partLabel = (r: StructureRow) => (!r.partId ? "No parts yet" : /^part \d+$/i.test(r.partTitle ?? "") ? `Part ${r.partNumber}` : `Part ${r.partNumber}: ${r.partTitle}`);
  const unitLabel = (r: StructureRow) => (/^unit \d+$/i.test(r.unitTitle) ? `Unit ${r.unitNumber}` : `Unit ${r.unitNumber}: ${r.unitTitle}`);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // One section per grade (or subject), keeping the sorted order.
  const groups: { key: string; name: string; rows: StructureRow[] }[] = [];
  for (const r of rows) {
    const key = mode === "grade" ? r.gradeId : r.subjectId;
    if (groups.at(-1)?.key !== key) groups.push({ key, name: groupName(r), rows: [] });
    groups.at(-1)!.rows.push(r);
  }

  const filterText = [
    sp.grade && tax.grades.find((g) => g.id === sp.grade)?.name,
    sp.subject && tax.subjects.find((x) => x.id === sp.subject)?.name,
    stageFilter && statusFilter && `${STAGE_LABELS[stageFilter]}: ${SIMPLE_STATUS_LABELS[statusFilter]}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const generated = new Date();
  const generatedText = generated.toLocaleString("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
  const fileTitle = `${s.workspace.name} status report ${generated.toLocaleDateString("en-CA", { timeZone: tz })}`;
  const paper = landscape ? "A4 landscape" : "A4 portrait";
  const footerText = `${s.workspace.name} · Production status report · ${generatedText}`.replace(/["\\]/g, "");

  return (
    <div className="report-screen min-h-screen bg-[#e9ebef] py-6 print:min-h-0 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4 ${landscape ? "landscape" : "portrait"};
          margin: 12mm 11mm 14mm;
          @bottom-left { content: "${footerText}"; font: 7pt sans-serif; color: #8a919c; }
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt sans-serif; color: #8a919c; }
        }
        .report-sheet, .report-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .report-sheet { width: ${landscape ? "297mm" : "210mm"}; min-height: ${landscape ? "210mm" : "297mm"}; padding: 12mm 11mm 14mm; font-size: ${landscape ? "8.5pt" : "7.5pt"}; }
        .report-sheet table { table-layout: fixed; }
        .report-sheet thead { display: table-header-group; }
        .report-sheet tr, .report-kpi { break-inside: avoid; }
        .report-group-head, .report-sub { break-after: avoid; }
        ${pageBreaks ? ".report-group + .report-group { break-before: page; }" : ""}
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .report-sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
        }
      `}</style>
      <div className="no-print mx-auto mb-4 max-w-[297mm] px-4 print:hidden">
        <ReportToolbar grades={tax.grades.map((g) => ({ id: g.id, name: g.name }))} subjects={tax.subjects.map((x) => ({ id: x.id, name: x.name }))} fileTitle={fileTitle} paper={paper} />
      </div>

      <article className="report-sheet mx-auto bg-white text-[#292d34] shadow-[0_2px_16px_rgba(15,23,42,0.12)]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#7b68ee] pb-[4mm]">
          <div className="flex items-center gap-3">
            <MyseedLogo className="size-[13mm] shrink-0" />
            <div>
              <p className="text-[7.5pt] font-semibold tracking-[0.18em] text-[#7b68ee] uppercase">{s.workspace.name}</p>
              <h1 className="text-[18pt] leading-tight font-bold">Production status report</h1>
              <p className="text-[8.5pt] text-[#656f7d]">
                {mode === "grade" ? "By grade, then subject" : "By subject, then grade"}
                {filterText ? ` · ${filterText}` : ""}
              </p>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-[7.5pt] text-[#656f7d]">
            <dt>Generated</dt>
            <dd className="font-medium text-[#292d34]">{generatedText}</dd>
            <dt>Prepared by</dt>
            <dd className="font-medium text-[#292d34]">{viewer.name}</dd>
            <dt>Timezone</dt>
            <dd className="font-medium text-[#292d34]">{tz}</dd>
            <dt>Paper</dt>
            <dd className="font-medium text-[#292d34]">{paper}</dd>
          </dl>
        </header>

        <section className="my-[4mm] grid grid-cols-5 gap-[3mm]" aria-label="Summary">
          <div className="report-kpi rounded-md border border-[#e8eaed] bg-[#f8f7ff] p-[2.5mm]">
            <p className="text-[7pt] font-semibold tracking-wide text-[#656f7d] uppercase">In this report</p>
            <p className="mt-0.5 text-[16pt] leading-none font-bold">{parts.length}</p>
            <p className="mt-1 text-[7pt] text-[#656f7d]">
              parts in {new Set(rows.map((r) => r.unitId)).size} units, {groups.length} {mode === "grade" ? "grades" : "subjects"}
            </p>
          </div>
          {STAGES.map((st) => {
            const done = parts.filter((r) => r.stages[st] === "done").length;
            const inProcess = parts.filter((r) => r.stages[st] === "in_process").length;
            const p = pct(done, parts.length);
            return (
              <div key={st} className="report-kpi rounded-md border border-[#e8eaed] p-[2.5mm]">
                <p className="text-[7pt] font-semibold tracking-wide text-[#656f7d] uppercase">{STAGE_LABELS[st]}</p>
                <p className="mt-0.5 text-[16pt] leading-none font-bold">
                  {p}%<span className="ml-1 text-[7.5pt] font-normal text-[#656f7d]">{done} of {parts.length}</span>
                </p>
                <div className="mt-1.5 h-[1.6mm] overflow-hidden rounded-full bg-[#eef0f3]">
                  <div className="h-full rounded-full bg-[#7b68ee]" style={{ width: `${p}%` }} />
                </div>
                <p className="mt-1 text-[7pt] text-[#656f7d]">{inProcess} in process</p>
              </div>
            );
          })}
        </section>

        {groups.length > 1 && (
          <section className="mb-[5mm]" aria-label={mode === "grade" ? "Progress by grade" : "Progress by subject"}>
            <h2 className="mb-[1.5mm] text-[9.5pt] font-bold">{mode === "grade" ? "Progress by grade" : "Progress by subject"}</h2>
            <table className="w-full border-collapse">
              <colgroup>
                <col style={{ width: "24%" }} />
                <col style={{ width: "12%" }} />
                {STAGES.map((st) => (
                  <col key={st} style={{ width: "16%" }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-[#f5f6f8] text-left text-[6.5pt] tracking-wide text-[#656f7d] uppercase">
                  <th className="border border-[#e8eaed] px-[1.5mm] py-[1mm]">{mode === "grade" ? "Grade" : "Subject"}</th>
                  <th className="border border-[#e8eaed] px-[1.5mm] py-[1mm] text-right">Parts</th>
                  {STAGES.map((st) => (
                    <th key={st} className="border border-[#e8eaed] px-[1.5mm] py-[1mm]">
                      {STAGE_LABELS[st]} done
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const gp = g.rows.filter((r) => r.partId);
                  return (
                    <tr key={g.key}>
                      <td className="border border-[#e8eaed] px-[1.5mm] py-[0.8mm] font-semibold">{g.name}</td>
                      <td className="border border-[#e8eaed] px-[1.5mm] py-[0.8mm] text-right tabular-nums">{gp.length}</td>
                      {STAGES.map((st) => {
                        const done = gp.filter((r) => r.stages[st] === "done").length;
                        const p = pct(done, gp.length);
                        return (
                          <td key={st} className="border border-[#e8eaed] px-[1.5mm] py-[0.8mm]">
                            <div className="flex items-center gap-[1.5mm]">
                              <div className="h-[1.4mm] flex-1 overflow-hidden rounded-full bg-[#eef0f3]">
                                <div className="h-full rounded-full bg-[#7b68ee]" style={{ width: `${p}%` }} />
                              </div>
                              <span className="w-[13mm] shrink-0 text-right text-[7pt] tabular-nums">
                                {p}% <span className="text-[#8a919c]">({done})</span>
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {groups.map((g) => {
          const gp = g.rows.filter((r) => r.partId);
          const span = (i: number, key: (r: StructureRow) => string) => {
            if (i > 0 && key(g.rows[i - 1]) === key(g.rows[i])) return 0;
            let n = 1;
            while (i + n < g.rows.length && key(g.rows[i + n]) === key(g.rows[i])) n++;
            return n;
          };
          const k2 = (r: StructureRow) => (mode === "grade" ? r.subjectId : r.gradeId);
          const k3 = (r: StructureRow) => `${k2(r)}|${r.unitId}`;
          return (
            <section key={g.key} className="report-group mb-[5mm]">
              <div className="report-group-head mb-[1.5mm] flex items-baseline justify-between gap-4 border-b border-[#e8eaed] pb-[1mm]">
                <h2 className="text-[11pt] font-bold">{g.name}</h2>
                <p className="text-[7pt] text-[#656f7d]">
                  {gp.length} parts · {new Set(g.rows.map((r) => r.unitId)).size} units ·{" "}
                  {STAGES.map((st) => `${STAGE_LABELS[st]} ${pct(gp.filter((r) => r.stages[st] === "done").length, gp.length)}%`).join(" · ")}
                </p>
              </div>
              <table className="w-full border-collapse">
                <colgroup>
                  <col style={{ width: `${COLS.unit}%` }} />
                  <col style={{ width: `${COLS.part}%` }} />
                  {STAGES.map((st) => (
                    <col key={st} style={{ width: `${COLS.stage}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-[#f5f6f8] text-left text-[6.5pt] tracking-wide text-[#656f7d] uppercase">
                    <th className="border border-[#e8eaed] px-[1.5mm] py-[1mm]">Unit</th>
                    <th className="border border-[#e8eaed] px-[1.5mm] py-[1mm]">Part</th>
                    {STAGES.map((st) => (
                      <th key={st} className="border border-[#e8eaed] px-[1mm] py-[1mm] text-center">
                        {STAGE_LABELS[st]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => {
                    const s2 = span(i, k2);
                    const s3 = span(i, k3);
                    const sub = s2 > 0 ? g.rows.slice(i, i + s2).filter((x) => x.partId).length : 0;
                    return (
                      <React.Fragment key={`${r.unitId}-${r.partId ?? "u"}`}>
                        {s2 > 0 && (
                          <tr className="report-sub">
                            <td colSpan={2 + STAGES.length} className="border border-[#e8eaed] bg-[#f8f7ff] px-[1.5mm] py-[0.8mm]">
                              <span className="font-semibold">{secondName(r)}</span>
                              <span className="ml-2 text-[6.5pt] text-[#656f7d]">
                                {sub} parts · {new Set(g.rows.slice(i, i + s2).map((x) => x.unitId)).size} units
                              </span>
                            </td>
                          </tr>
                        )}
                      <tr className="align-top">
                        {s3 > 0 && (
                          <td rowSpan={s3} className="border border-[#e8eaed] px-[1.5mm] py-[0.8mm] break-words">
                            {unitLabel(r)}
                          </td>
                        )}
                        <td className={`border border-[#e8eaed] px-[1.5mm] py-[0.8mm] break-words ${r.partId ? "" : "text-[#8a919c] italic"}`}>
                          {partLabel(r)}
                          {r.cameraCodes.length > 0 && <span className="block font-mono text-[6pt] text-[#8a919c]">{r.cameraCodes.join(" ")}</span>}
                        </td>
                        {STAGES.map((st) => (
                          <td key={st} className="border border-[#e8eaed] px-[0.8mm] py-[0.8mm] text-center">
                            <span className="inline-block w-full max-w-[19mm] rounded-[1mm] px-[0.8mm] py-[0.3mm] text-[6.5pt] font-semibold whitespace-nowrap" style={CHIP[r.stages[st]]}>
                              {SIMPLE_STATUS_LABELS[r.stages[st]]}
                            </span>
                            {showDates && r.dates[st] && <span className="block text-[6pt] text-[#656f7d] tabular-nums">{fmt(r.dates[st])}</span>}
                          </td>
                        ))}
                      </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
        {!rows.length && <p className="py-[20mm] text-center text-[10pt] text-[#656f7d]">Nothing matches these filters.</p>}

        <footer className="mt-[4mm] flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#e8eaed] pt-[2mm] text-[6.5pt] text-[#656f7d]">
          {(["done", "in_process", "missing", "none"] as SimpleStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="inline-block min-w-[10mm] rounded-[1mm] px-[0.8mm] text-center font-semibold" style={CHIP[k]}>
                {SIMPLE_STATUS_LABELS[k]}
              </span>
              {k === "done" ? "stage complete" : k === "in_process" ? "the part is in this stage now" : k === "missing" ? "nothing recorded yet" : "not reached yet"}
            </span>
          ))}
          {showDates && <span>Dates show when each stage was done.</span>}
        </footer>
      </article>
    </div>
  );
}
