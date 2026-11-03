// Documents from the strategy (Phase 25), as Word files, in Myseed's look (colourful headings and tables, the brand
// banner) or an international format (formal: numbered sections, a table of contents, grey table headers, page
// numbers "Page x of y", the usual sections of plans and reports for partners, donors and government):
// - Strategic plan: vision, mission, values, pillars, the results framework, key indicators and targets, risks, and
//   how it is monitored;
// - M&E plan: the results framework, the logical framework matrix, an indicator reference sheet for each indicator,
//   the data collection plan, reporting and data quality;
// - Performance report for a period: summary, results by pillar and perspective, every indicator against its target
//   (Red, Amber, Green), activities, risks and follow-up of recommendations (a narrative by the AI when it is on);
// - KPI dictionary: the plan's indicators and the KPI library with their reference sheets;
// - Evaluation report: by the OECD-DAC criteria, findings, lessons, recommendations and the management response;
// - Logical framework: the matrix alone, on landscape pages.
// Also the indicator tracking table as an Excel workbook.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getSettings } from "./settings";
import { listKpis } from "./performance";
import { planView, type PlanView } from "./strategy";
import { askAnalysis } from "./assistant-ai";
import type { AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { DAC_CRITERIA, DAC_RATINGS, DOC_KINDS, FREQUENCIES, LEVELS, PERSPECTIVES, RAG_COLORS, RAG_LABELS, RISK_COLORS, periodLabel, type DacCriterion, type DocKind, type DocStyle, type Rag } from "@/lib/strategy";

type Theme = { style: DocStyle; font: string; heading: string; accent: string; head: string; headText: string; band: string; numbered: boolean };
const THEMES: Record<DocStyle, Theme> = {
  myseed: { style: "myseed", font: "Segoe UI", heading: "0B7A3B", accent: "1A73E8", head: "0B7A3B", headText: "FFFFFF", band: "F1F8F3", numbered: false },
  international: { style: "international", font: "Calibri", heading: "1F3864", accent: "2E75B6", head: "D9D9D9", headText: "000000", band: "FFFFFF", numbered: true },
};
const hex = (c: string) => c.replace("#", "");

class Builder {
  out: (Paragraph | Table | TableOfContents)[] = [];
  n: number[] = [0, 0, 0];
  constructor(public t: Theme) {}
  h(level: 1 | 2 | 3, text: string) {
    let label = text;
    if (this.t.numbered) {
      this.n[level - 1]!++;
      for (let i = level; i < 3; i++) this.n[i] = 0;
      label = `${this.n.slice(0, level).join(".")}${level === 1 ? "." : ""} ${text}`;
    }
    this.out.push(new Paragraph({ heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, spacing: { before: level === 1 ? 360 : 240, after: 120 }, children: [new TextRun({ text: label, bold: true, color: this.t.heading, size: level === 1 ? 32 : level === 2 ? 26 : 23, font: this.t.font })] }));
  }
  p(text: string, o: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}) {
    for (const line of (text || "").split(/\n+/)) this.out.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: line, font: this.t.font, size: o.size ?? 22, bold: o.bold, italics: o.italic, color: o.color })] }));
  }
  bullets(items: string[]) {
    for (const i of items) this.out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: i, font: this.t.font, size: 22 })] }));
  }
  kv(rows: [string, string | null | undefined][]) {
    this.table(["", ""], rows.map(([k, v]) => [k, v || "–"]), { widths: [30, 70], keyCol: true, noHead: true });
  }
  // A table: a coloured or grey header, banded rows, optional cell colours (Red, Amber, Green).
  table(head: string[], rows: (string | number | null)[][], o: { widths?: number[]; fills?: (string | null)[][]; keyCol?: boolean; noHead?: boolean; size?: number } = {}) {
    const size = o.size ?? 18;
    const cell = (text: string, opt: { fill?: string | null; bold?: boolean; color?: string; w?: number }) =>
      new TableCell({
        width: opt.w ? { size: opt.w, type: WidthType.PERCENTAGE } : undefined,
        shading: opt.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opt.fill } : undefined,
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: String(text).split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: opt.bold, color: opt.color, font: this.t.font, size })] })),
      });
    const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
    const trs: TableRow[] = [];
    if (!o.noHead) trs.push(new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { fill: this.t.head, bold: true, color: this.t.headText, w: o.widths?.[i] })) }));
    rows.forEach((r, ri) =>
      trs.push(
        new TableRow({
          children: r.map((v, ci) => {
            const f = o.fills?.[ri]?.[ci] ?? null;
            return cell(v === null || v === undefined ? "–" : String(v), { fill: f ?? (o.keyCol && ci === 0 ? (this.t.style === "myseed" ? "E6F4EA" : "F2F2F2") : ri % 2 ? this.t.band : null), bold: o.keyCol && ci === 0, color: f ? "FFFFFF" : undefined, w: o.widths?.[ci] });
          }),
        }),
      ),
    );
    this.out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trs, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } }));
    this.out.push(new Paragraph({ text: "" }));
  }
  page() {
    this.out.push(new Paragraph({ children: [new PageBreak()] }));
  }
}

const ragFill = (r: Rag) => (r === "none" ? null : hex(RAG_COLORS[r]));
const fmt = (v: number | null, unit?: string) => (v === null ? "–" : `${Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit === "percent" ? "%" : ""}`);

function cover(b: Builder, title: string, subtitle: string, org: string, kind: string) {
  const t = b.t;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (t.style === "myseed") {
    // The brand banner: a coloured band with the workspace name, then the title in colour.
    b.out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "0B7A3B" }, margins: { top: 300, bottom: 300, left: 300, right: 300 }, children: [new Paragraph({ children: [new TextRun({ text: org.toUpperCase(), bold: true, color: "FFFFFF", size: 36, font: t.font })] }), new Paragraph({ children: [new TextRun({ text: kind, color: "FDD663", size: 24, font: t.font })] })] })] }), new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F9AB00" }, children: [new Paragraph({ text: "" })] })] })], borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } } }));
    b.out.push(new Paragraph({ spacing: { before: 1600, after: 200 }, children: [new TextRun({ text: title, bold: true, size: 56, color: "0B7A3B", font: t.font })] }));
    b.out.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: subtitle, size: 28, color: "1A73E8", font: t.font })] }));
    b.out.push(new Paragraph({ children: [new TextRun({ text: date, size: 22, color: "6B7280", font: t.font })] }));
  } else {
    b.out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 300 }, children: [new TextRun({ text: org, size: 28, font: t.font, color: "404040" })] }));
    b.out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: title, bold: true, size: 48, font: t.font, color: "1F3864" })] }));
    b.out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200 }, children: [new TextRun({ text: subtitle, size: 26, font: t.font })] }));
    b.out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${kind} · ${date}`, size: 22, font: t.font, color: "595959" })] }));
    b.out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Version 1.0", size: 20, font: t.font, color: "595959" })] }));
  }
  b.page();
  if (t.numbered) {
    b.out.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
    b.page();
  }
}

function resultsFramework(b: Builder, v: PlanView) {
  for (const n of v.nodes) {
    const depth = ["goal", "outcome", "output", "activity"].indexOf(n.level);
    b.out.push(
      new Paragraph({
        indent: { left: depth * 400 },
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${n.code}  `, bold: true, color: b.t.accent, font: b.t.font, size: 21 }),
          new TextRun({ text: `${LEVELS[n.level]}: `, bold: true, font: b.t.font, size: 21 }),
          new TextRun({ text: n.title, font: b.t.font, size: 21 }),
          ...(n.perspective ? [new TextRun({ text: `  (${PERSPECTIVES[n.perspective]})`, italics: true, color: "6B7280", font: b.t.font, size: 18 })] : []),
        ],
      }),
    );
  }
  b.out.push(new Paragraph({ text: "" }));
}

function indicatorTable(b: Builder, v: PlanView, years: string[]) {
  const head = ["Code", "Indicator", "Unit", "Baseline", ...years.map((y) => `Target ${y}`), "Frequency"];
  const rows = v.indicators.map((i) => [i.code, i.name, i.unit, i.baseline === null ? "–" : `${fmt(i.baseline, i.unit)}${i.baselineDate ? ` (${i.baselineDate.slice(0, 4)})` : ""}`, ...years.map((y) => {
    const vals = Object.entries(i.targets).filter(([p]) => p.startsWith(y)).map(([, x]) => x);
    return vals.length ? fmt(vals[vals.length - 1]!, i.unit) : "–";
  }), FREQUENCIES[i.frequency]]);
  b.table(head, rows, { size: 17 });
}

function logframe(b: Builder, v: PlanView) {
  const rows: string[][] = [];
  for (const n of v.nodes) {
    const ins = v.indicators.filter((i) => i.nodeId === n.id);
    rows.push([
      `${n.code} ${LEVELS[n.level]}\n${n.title}`,
      ins.map((i) => `${i.code} ${i.name}`).join("\n") || "–",
      ins.map((i) => (i.baseline === null ? "–" : fmt(i.baseline, i.unit))).join("\n") || "–",
      ins.map((i) => { const last = Object.entries(i.targets).sort().pop(); return last ? `${fmt(last[1], i.unit)} (${periodLabel(last[0])})` : "–"; }).join("\n") || "–",
      ins.map((i) => i.verification || i.dataSource || "–").join("\n") || "–",
      n.assumptions || "–",
    ]);
  }
  b.table(["Results chain", "Indicators", "Baseline", "Target", "Means of verification", "Assumptions"], rows, { widths: [24, 22, 10, 12, 16, 16], size: 16 });
}

function riskTable(b: Builder, v: PlanView) {
  if (!v.risks.length) return b.p("No risks are recorded yet.", { italic: true });
  b.table(
    ["Risk", "Category", "Likelihood", "Impact", "Score", "Mitigation", "Owner", "Status"],
    v.risks.map((r) => [r.title, r.category, r.likelihood, r.impact, `${r.score} (${r.level})`, r.mitigation ?? "–", r.owner ?? "–", r.status]),
    { fills: v.risks.map((r) => [null, null, null, null, hex(RISK_COLORS[r.level]), null, null, null]), size: 16 },
  );
}

export async function buildDoc(user: AppUser & { activeRole?: string }, input: { planId: string; kind: DocKind; style: DocStyle; period?: string | null; evaluationId?: string | null; narrative?: boolean }) {
  if (!(input.kind in DOC_KINDS)) throw new WorkflowError("VALIDATION", "Choose the document.");
  const t = THEMES[input.style] ?? THEMES.myseed;
  const v = await planView(user, input.planId);
  const org = (await getSettings()).workspace.name || "Myseed";
  const b = new Builder(t);
  const years = [...new Set(Array.from({ length: Number(v.plan.end.slice(0, 4)) - Number(v.plan.start.slice(0, 4)) + 1 }, (_, i) => String(Number(v.plan.start.slice(0, 4)) + i)))];
  const range = `${v.plan.start.slice(0, 4)}–${v.plan.end.slice(0, 4)}`;
  let title = `${DOC_KINDS[input.kind]}`;
  let landscape = false;

  if (input.kind === "plan") {
    title = v.plan.name;
    cover(b, v.plan.name, `${org} · ${range}`, org, "Strategic plan");
    b.h(1, "Introduction");
    b.p(`This plan sets out where ${org} wants to be by ${v.plan.end.slice(0, 4)}, the results it commits to, and how progress is measured and reported. It follows a results-based approach: a goal, the outcomes that lead to it, the outputs and activities that deliver them, each with indicators, baselines and targets.`);
    b.h(2, "Vision");
    b.p(v.plan.vision || "–");
    b.h(2, "Mission");
    b.p(v.plan.mission || "–");
    if (v.plan.values.length) {
      b.h(2, "Values");
      b.bullets(v.plan.values);
    }
    b.h(1, "Strategic pillars");
    for (const p of v.plan.pillars) {
      b.h(2, p);
      const ns = v.nodes.filter((n) => n.pillar === p);
      if (ns.length) b.bullets(ns.map((n) => `${n.code} ${n.title}`));
      else b.p("Results are being drafted.", { italic: true });
    }
    b.h(1, "Results framework");
    b.p("Each result is tagged with its Balanced Scorecard perspective.");
    resultsFramework(b, v);
    b.h(1, "Key performance indicators and targets");
    indicatorTable(b, v, years);
    b.h(1, "Risks");
    riskTable(b, v);
    b.h(1, "Monitoring, evaluation and learning");
    b.bullets([
      `Results are entered every period by the person responsible for each indicator, or read from ${org}'s work app, and verified by a second person.`,
      `Each indicator is rated against its target: on track (${v.plan.rag.green}% or more of the target), needs attention (${v.plan.rag.amber}% to ${v.plan.rag.green - 1}%), off track (below ${v.plan.rag.amber}%).`,
      "A performance report is prepared every quarter and every year; risks are reviewed at the same time.",
      "A mid-term review and a final evaluation follow the OECD-DAC criteria: relevance, coherence, effectiveness, efficiency, impact and sustainability.",
    ]);
  } else if (input.kind === "meplan" || input.kind === "logframe") {
    title = `${input.kind === "logframe" ? "Logical framework" : "Monitoring and evaluation plan"}: ${v.plan.name}`;
    landscape = input.kind === "logframe";
    cover(b, input.kind === "logframe" ? "Logical framework" : "Monitoring and evaluation plan", `${v.plan.name} · ${range}`, org, input.kind === "logframe" ? "Logical framework" : "M&E plan");
    if (input.kind === "meplan") {
      b.h(1, "Purpose");
      b.p(`This plan explains how the results of "${v.plan.name}" are measured: what is counted, from where, how often, by whom, and how results are checked, reported and used.`);
      b.h(1, "Results framework");
      resultsFramework(b, v);
    }
    b.h(1, "Logical framework matrix");
    logframe(b, v);
    if (input.kind === "meplan") {
      b.h(1, "Indicator reference sheets");
      for (const i of v.indicators) {
        const node = v.nodes.find((n) => n.id === i.nodeId);
        b.h(2, `${i.code} ${i.name}`);
        b.kv([
          ["Result", node ? `${node.code} ${node.title}` : "–"],
          ["Definition", i.definition],
          ["Unit of measure", i.unit],
          ["Direction", i.direction === "up" ? "Higher is better" : "Lower is better"],
          ["Calculation", i.formula],
          ["Disaggregation", i.disaggregation],
          ["Data source", i.measure ? `${org} work app (${i.measure})` : i.dataSource],
          ["Collection method", i.method],
          ["Means of verification", i.verification],
          ["Frequency", FREQUENCIES[i.frequency]],
          ["Responsible", i.responsible],
          ["Baseline", i.baseline === null ? null : `${fmt(i.baseline, i.unit)}${i.baselineDate ? ` on ${i.baselineDate}` : ""}`],
          ["Targets", Object.entries(i.targets).map(([p, x]) => `${periodLabel(p)}: ${fmt(x, i.unit)}`).join("; ")],
          ["Quality check (SMART)", i.gaps.length ? i.gaps.map((g) => `${g.key}: ${g.text}`).join(" ") : "Complete"],
        ]);
      }
      b.h(1, "Data collection plan");
      b.table(["Indicator", "Frequency", "Source", "Method", "Responsible", "Verification"], v.indicators.map((i) => [`${i.code} ${i.name}`, FREQUENCIES[i.frequency], i.measure ? "Work app" : (i.dataSource ?? "–"), i.method ?? "–", i.responsible ?? "–", i.verification ?? "–"]), { size: 16 });
      b.h(1, "Reporting and data quality");
      b.bullets([
        "Quarterly performance reports to management; a yearly report to the board and partners.",
        "Every result entered by hand is verified by a second person before it is reported. Results read from the app are verified by the app itself.",
        "Data quality is checked on validity, reliability, timeliness, precision and integrity during reviews.",
        "Findings are discussed in quarterly review meetings, and decisions and lessons are recorded.",
      ]);
    }
  } else if (input.kind === "report") {
    const periods = [...new Set(v.indicators.flatMap((i) => i.rows.filter((r) => r.actual !== null).map((r) => r.period)))].sort();
    const period = input.period || periods[periods.length - 1] || null;
    title = `Performance report${period ? ` ${periodLabel(period)}` : ""}: ${v.plan.name}`;
    cover(b, "Performance report", `${v.plan.name}${period ? ` · ${periodLabel(period)}` : ""}`, org, "Performance report");
    const rowFor = (i: PlanView["indicators"][number]) => (period ? (i.rows.find((r) => r.period === period) ?? i.rows.filter((r) => r.period <= period && r.actual !== null).pop() ?? null) : i.latest);
    const rated = v.indicators.map((i) => ({ i, r: rowFor(i) }));
    const count = (rag: Rag) => rated.filter((x) => (x.r?.rag ?? "none") === rag).length;
    b.h(1, "Executive summary");
    b.p(`Of ${v.indicators.length} indicators, ${count("green")} are on track, ${count("amber")} need attention and ${count("red")} are off track; ${count("none")} have no result for the period yet. ${v.summary.activities.done} of ${v.summary.activities.total} activities are done${v.summary.activities.late ? ` and ${v.summary.activities.late} are late` : ""}. ${v.summary.risks.high} high or critical risks are open.`);
    if (input.narrative) {
      const text = await askAnalysis(user as AppUser & { activeRole: string }, {
        task: `Write the narrative of a ${input.style === "international" ? "formal, donor-style" : "clear, friendly"} performance report for "${v.plan.name}"${period ? ` for ${periodLabel(period)}` : ""}: overall progress, what went well, what is off track and why (from the notes), the main risks, and recommended actions. 4 to 6 short paragraphs, no tables, no headings.`,
        data: { summary: v.summary, indicators: rated.map(({ i, r }) => ({ code: i.code, name: i.name, target: r?.target, actual: r?.actual, achievement: r?.achievement, rag: r?.rag, note: r?.note })), risks: v.risks.slice(0, 8), activities: v.nodes.filter((n) => n.level === "activity").map((n) => ({ title: n.title, status: n.status, overdue: n.overdue })) },
      }).catch(() => null);
      if (text) {
        b.h(2, "Narrative");
        b.p(text);
      }
    }
    b.h(1, "Results at a glance");
    b.table(["Pillar", "On track", "Needs attention", "Off track", "No data"], v.summary.byPillar.map((x) => [x.pillar, x.green, x.amber, x.red, x.none]), { size: 18 });
    b.table(["Perspective (Balanced Scorecard)", "On track", "Needs attention", "Off track", "No data"], v.summary.byPerspective.filter((x) => x.total).map((x) => [x.label, x.green, x.amber, x.red, x.none]), { size: 18 });
    b.h(1, "Indicator performance");
    b.table(
      ["Code", "Indicator", "Baseline", "Target", "Actual", "Achieved", "Status", "Comment"],
      rated.map(({ i, r }) => [i.code, i.name, fmt(i.baseline, i.unit), fmt(r?.target ?? null, i.unit), fmt(r?.actual ?? null, i.unit), r?.achievement === null || r?.achievement === undefined ? "–" : `${r.achievement}%`, RAG_LABELS[(r?.rag ?? "none") as Rag], r?.note ?? ""]),
      { fills: rated.map(({ r }) => [null, null, null, null, null, null, ragFill((r?.rag ?? "none") as Rag), null]), size: 16 },
    );
    b.h(1, "Activities");
    const acts = v.nodes.filter((n) => n.level === "activity");
    if (acts.length) b.table(["Code", "Activity", "Owner", "Status", "End"], acts.map((n) => [n.code, n.title, n.owner ?? "–", n.overdue ? `${n.status} (late)` : n.status, n.end ?? "–"]), { fills: acts.map((n) => [null, null, null, n.overdue ? hex(RAG_COLORS.red) : n.status === "done" ? hex(RAG_COLORS.green) : null, null]), size: 17 });
    else b.p("No activities are recorded.", { italic: true });
    b.h(1, "Risks");
    riskTable(b, v);
    const recs = v.evaluations.flatMap((e) => e.recommendations.map((r) => ({ e: e.title, ...r })));
    if (recs.length) {
      b.h(1, "Follow-up of recommendations");
      b.table(["Evaluation", "Recommendation", "Owner", "Due", "Status"], recs.map((r) => [r.e, r.text, r.owner ?? "–", r.due ?? "–", r.status.replace("_", " ")]), { size: 16 });
    }
    b.h(1, "Annex: method");
    b.p(`Achievement is the share of the way from the baseline to the target. On track: ${v.plan.rag.green}% or more; needs attention: ${v.plan.rag.amber}% to ${v.plan.rag.green - 1}%; off track: below ${v.plan.rag.amber}%. ${v.summary.unverified} results are not verified yet.`);
  } else if (input.kind === "kpis") {
    title = `KPI dictionary: ${org}`;
    cover(b, "KPI dictionary", `${org} · indicators and their reference sheets`, org, "KPI dictionary");
    b.h(1, "Strategic indicators");
    b.table(["Code", "Indicator", "Definition", "Unit", "Frequency", "Source", "Owner"], v.indicators.map((i) => [i.code, i.name, i.definition ?? "–", i.unit, FREQUENCIES[i.frequency], i.measure ? "Work app" : (i.dataSource ?? "–"), i.responsible ?? "–"]), { size: 16 });
    const lib = await listKpis().catch(() => []);
    if (lib.length) {
      b.h(1, "Staff KPIs (scorecards)");
      b.table(["KPI", "Description", "Unit", "Better when", "Perspective", "Formula", "Source", "Owner"], lib.filter((k) => k.active).map((k) => [k.name, k.description ?? "–", k.unit, k.direction === "up" ? "higher" : "lower", k.meta?.perspective ? (PERSPECTIVES[k.meta.perspective as keyof typeof PERSPECTIVES] ?? k.meta.perspective) : "–", k.meta?.formula ?? "–", k.source === "measure" ? "Work app" : (k.meta?.dataSource ?? "Entered by leads"), k.meta?.owner ?? "–"]), { size: 15 });
    }
  } else {
    const e = v.evaluations.find((x) => x.id === input.evaluationId) ?? v.evaluations[0];
    if (!e) throw new WorkflowError("VALIDATION", "Record an evaluation first.");
    title = e.title;
    cover(b, e.title, `${v.plan.name}${e.period ? ` · ${e.period}` : ""}`, org, "Evaluation report");
    b.h(1, "Executive summary");
    b.p(e.summary || "–");
    b.h(1, "Purpose, scope and method");
    b.p(`This ${e.kind === "midterm" ? "mid-term review" : e.kind === "final" ? "final evaluation" : `${e.kind} evaluation`} assesses "${v.plan.name}" against the OECD-DAC evaluation criteria, using the plan's monitoring data, records in the work app and the evidence noted under each criterion. Each criterion is rated on a four-point scale.`);
    b.h(1, "Findings by criterion");
    b.table(
      ["Criterion", "Question", "Rating", "Evidence"],
      (Object.keys(DAC_CRITERIA) as DacCriterion[]).map((k) => [DAC_CRITERIA[k].label, DAC_CRITERIA[k].question, e.scores[k] ? `${e.scores[k]!.rating} · ${DAC_RATINGS[e.scores[k]!.rating as 1 | 2 | 3 | 4]}` : "Not rated", e.scores[k]?.evidence || "–"]),
      { fills: (Object.keys(DAC_CRITERIA) as DacCriterion[]).map((k) => [null, null, e.scores[k] ? hex(["#D93025", "#E8710A", "#1A73E8", "#1E8E3E"][e.scores[k]!.rating - 1]!) : null, null]), widths: [14, 30, 16, 40], size: 17 },
    );
    if (e.findings) {
      b.h(2, "Other findings");
      b.p(e.findings);
    }
    b.h(1, "Lessons learned");
    b.p(e.lessons || "–");
    b.h(1, "Recommendations and management response");
    b.table(["#", "Recommendation", "Management response", "Owner", "Due", "Status"], e.recommendations.map((r, i) => [i + 1, r.text, r.response || "–", r.owner ?? "–", r.due ?? "–", r.status.replace("_", " ")]), { size: 17 });
    b.h(1, "Annex: results at the time of the evaluation");
    b.table(["Code", "Indicator", "Latest", "Target", "Status"], v.indicators.map((i) => [i.code, i.name, fmt(i.latest?.actual ?? null, i.unit), fmt(i.latest?.target ?? null, i.unit), RAG_LABELS[i.rag]]), { fills: v.indicators.map((i) => [null, null, null, null, ragFill(i.rag)]), size: 16 });
  }

  const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${org} · ${title}`, size: 16, color: "808080", font: t.font })] })] });
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: t.numbered ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: t.numbered
          ? [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, font: t.font, color: "808080" })]
          : [new TextRun({ text: `${org}  ·  `, size: 16, font: t.font, color: "0B7A3B", bold: true }), new TextRun({ children: [PageNumber.CURRENT], size: 16, font: t.font, color: "808080" })],
      }),
    ],
  });
  const doc = new Document({
    creator: org,
    title,
    description: `${DOC_KINDS[input.kind]} made by ${org}'s work app`,
    features: { updateFields: t.numbered },
    styles: { default: { document: { run: { font: t.font, size: 22 } } } },
    sections: [{ properties: { page: { size: landscape ? { orientation: PageOrientation.LANDSCAPE } : undefined, margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } }, headers: { default: header }, footers: { default: footer }, children: b.out }],
  });
  const buffer = await Packer.toBuffer(doc);
  const file = `${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Document"}${input.style === "international" ? "" : " (Myseed)"}.docx`;
  return { buffer, file };
}

// The indicator tracking table as Excel: one row per indicator, then target, actual and achievement for each
// period, coloured Red, Amber or Green.
export async function trackingWorkbook(user: AppUser, planId: string) {
  const v = await planView(user, planId);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Myseed";
  const ws = wb.addWorksheet("Indicator tracking", { views: [{ state: "frozen", xSplit: 4, ySplit: 2 }] });
  const periods = [...new Set(v.indicators.flatMap((i) => i.rows.map((r) => r.period)))].sort();
  ws.addRow(["Code", "Result", "Indicator", "Unit", "Baseline", ...periods.flatMap((p) => [periodLabel(p), "", ""])]);
  ws.addRow(["", "", "", "", "", ...periods.flatMap(() => ["Target", "Actual", "%"])]);
  periods.forEach((_, k) => ws.mergeCells(1, 6 + k * 3, 1, 8 + k * 3));
  for (const r of [1, 2]) ws.getRow(r).eachCell((c) => ((c.font = { bold: true, color: { argb: "FFFFFFFF" } }), (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B7A3B" } }), (c.alignment = { horizontal: "center" })));
  for (const i of v.indicators) {
    const node = v.nodes.find((n) => n.id === i.nodeId);
    const row = ws.addRow([i.code, node?.title ?? "", i.name, i.unit, i.baseline, ...periods.flatMap((p) => {
      const x = i.rows.find((r) => r.period === p);
      return [x?.target ?? null, x?.actual ?? null, x?.achievement === null || x?.achievement === undefined ? null : x.achievement / 100];
    })]);
    periods.forEach((p, k) => {
      const x = i.rows.find((r) => r.period === p);
      const cell = row.getCell(8 + k * 3);
      cell.numFmt = "0%";
      if (x && x.rag !== "none") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex(RAG_COLORS[x.rag])}` } };
    });
  }
  ws.columns.forEach((c, n) => (c.width = n === 1 || n === 2 ? 36 : n < 5 ? 12 : 10));
  const risks = wb.addWorksheet("Risks");
  risks.addRow(["Risk", "Category", "Likelihood", "Impact", "Score", "Level", "Mitigation", "Owner", "Status", "Review"]);
  risks.getRow(1).eachCell((c) => ((c.font = { bold: true, color: { argb: "FFFFFFFF" } }), (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B7A3B" } })));
  for (const r of v.risks) {
    const row = risks.addRow([r.title, r.category, r.likelihood, r.impact, r.score, r.level, r.mitigation, r.owner, r.status, r.reviewDate]);
    row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex(RISK_COLORS[r.level])}` } };
  }
  risks.columns.forEach((c, n) => (c.width = n === 0 || n === 6 ? 40 : 12));
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), file: `${v.plan.name.replace(/[^\w\- ]+/g, "").trim() || "Plan"} indicator tracking.xlsx` };
}
