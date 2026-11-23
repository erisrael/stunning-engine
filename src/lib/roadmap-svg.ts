// Roadmap infographics as SVG, drawn the way roadmap.sh draws a learning path: a blue spine down the middle, each
// phase a yellow box on it, its topics in boxes left and right joined by dotted lines, done topics ticked green and
// what is in progress purple. Also the portfolio picture: every project on a timeline by quarter. Plain strings, so
// the Roadmap page shows them, the book prints them and they download as .svg (or .png, drawn in the browser).

export type TopicStatus = "done" | "doing" | "todo";
export type GraphicPhase = { name: string; due?: string | null; status: TopicStatus; topics: { title: string; status: TopicStatus; optional?: boolean }[] };
export type RoadmapGraphic = { title: string; subtitle?: string; progress: number; phases: GraphicPhase[]; brand?: string; date?: string };

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "font-family=\"Inter, 'Segoe UI', Roboto, Arial, sans-serif\"";

// Up to two lines of about `n` characters.
function wrap(s: string, n: number): string[] {
  const words = String(s).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0]!, `${lines.slice(1).join(" ").slice(0, n - 1)}…`];
  return lines;
}

const COLORS = {
  spine: "#2B78E4",
  phase: "#FDE047",
  phaseDone: "#86EFAC",
  topic: "#FFF5CC",
  done: "#D1FAE5",
  doneLine: "#16A34A",
  doing: "#EDE9FE",
  doingLine: "#7C3AED",
  ink: "#111827",
  muted: "#6B7280",
  line: "#2B78E4",
};

export function roadmapSvg(g: RoadmapGraphic): string {
  const W = 1000;
  const SPINE = W / 2;
  const TW = 250;
  const parts: string[] = [];
  let y = 0;

  // Header: title, subtitle, progress and the legend.
  parts.push(`<text x="${W / 2}" y="58" text-anchor="middle" font-size="34" font-weight="800" fill="${COLORS.ink}">${esc(g.title)}</text>`);
  if (g.subtitle) parts.push(`<text x="${W / 2}" y="88" text-anchor="middle" font-size="15" fill="${COLORS.muted}">${esc(g.subtitle)}</text>`);
  const pw = 360;
  parts.push(`<rect x="${W / 2 - pw / 2}" y="104" width="${pw}" height="10" rx="5" fill="#E5E7EB"/><rect x="${W / 2 - pw / 2}" y="104" width="${(pw * Math.max(0, Math.min(100, g.progress))) / 100}" height="10" rx="5" fill="${COLORS.doneLine}"/>`);
  parts.push(`<text x="${W / 2}" y="134" text-anchor="middle" font-size="13" fill="${COLORS.muted}">${Math.round(g.progress)}% done</text>`);
  const legend: [string, string, string, boolean][] = [
    ["Done", COLORS.done, COLORS.doneLine, false],
    ["In progress", COLORS.doing, COLORS.doingLine, false],
    ["To do", COLORS.topic, COLORS.ink, false],
    ["Optional", "#FFFFFF", COLORS.muted, true],
  ];
  legend.forEach(([label, fill, stroke, dash], i) => {
    const lx = 40 + i * 120;
    parts.push(`<rect x="${lx}" y="160" width="18" height="14" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash ? ' stroke-dasharray="4 3"' : ""}/><text x="${lx + 26}" y="172" font-size="12" fill="${COLORS.ink}">${label}</text>`);
  });
  y = 220;
  const spineTop = y - 20;

  g.phases.forEach((ph, i) => {
    const left = ph.topics.filter((_, k) => k % 2 === 0);
    const right = ph.topics.filter((_, k) => k % 2 === 1);
    const boxH = (t: { title: string }) => (wrap(t.title, 30).length > 1 ? 50 : 36);
    const colH = (list: { title: string }[]) => list.reduce((n, t) => n + boxH(t) + 12, 0);
    const blockH = Math.max(70, colH(left), colH(right));
    const phaseY = y + blockH / 2 - 24;
    // Topics, joined to the phase by dotted lines.
    const drawCol = (list: GraphicPhase["topics"], side: "l" | "r") => {
      let ty = y + (blockH - colH(list)) / 2;
      for (const t of list) {
        const h = boxH(t);
        const x = side === "l" ? 40 : W - 40 - TW;
        const fill = t.status === "done" ? COLORS.done : t.status === "doing" ? COLORS.doing : t.optional ? "#FFFFFF" : COLORS.topic;
        const stroke = t.status === "done" ? COLORS.doneLine : t.status === "doing" ? COLORS.doingLine : t.optional ? COLORS.muted : COLORS.ink;
        const cx = side === "l" ? x + TW : x;
        parts.push(`<path d="M ${cx} ${ty + h / 2} C ${(cx + SPINE) / 2} ${ty + h / 2}, ${(cx + SPINE) / 2} ${phaseY + 24}, ${side === "l" ? SPINE - 120 : SPINE + 120} ${phaseY + 24}" fill="none" stroke="${COLORS.line}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`);
        parts.push(`<rect x="${x}" y="${ty}" width="${TW}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.8"${t.optional && t.status === "todo" ? ' stroke-dasharray="5 4"' : ""}/>`);
        const lines = wrap(t.title, 30);
        lines.forEach((ln, k) => parts.push(`<text x="${x + 14}" y="${ty + (lines.length > 1 ? 20 + k * 17 : 23)}" font-size="14" fill="${COLORS.ink}">${esc(ln)}</text>`));
        if (t.status === "done") parts.push(`<circle cx="${x + TW - 16}" cy="${ty + h / 2}" r="9" fill="${COLORS.doneLine}"/><path d="M ${x + TW - 20} ${ty + h / 2} l 3 3 l 6 -6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`);
        else if (t.status === "doing") parts.push(`<circle cx="${x + TW - 16}" cy="${ty + h / 2}" r="5" fill="${COLORS.doingLine}"/>`);
        ty += h + 12;
      }
    };
    drawCol(left, "l");
    drawCol(right, "r");
    // The phase on the spine.
    const fill = ph.status === "done" ? COLORS.phaseDone : COLORS.phase;
    parts.push(`<rect x="${SPINE - 120}" y="${phaseY}" width="240" height="48" rx="7" fill="${fill}" stroke="${COLORS.ink}" stroke-width="2.5"/>`);
    parts.push(`<text x="${SPINE}" y="${phaseY + (ph.due ? 22 : 30)}" text-anchor="middle" font-size="17" font-weight="700" fill="${COLORS.ink}">${i + 1}. ${esc(ph.name.slice(0, 26))}</text>`);
    if (ph.due) parts.push(`<text x="${SPINE}" y="${phaseY + 39}" text-anchor="middle" font-size="11" fill="#374151">by ${esc(ph.due)}</text>`);
    y += blockH + 46;
  });
  const spineBottom = y - 20;
  // The spine goes under everything else.
  parts.unshift(`<line x1="${SPINE}" y1="${spineTop}" x2="${SPINE}" y2="${spineBottom}" stroke="${COLORS.spine}" stroke-width="5" stroke-linecap="round"/>`);
  if (!g.phases.length) {
    parts.push(`<text x="${W / 2}" y="${y + 20}" text-anchor="middle" font-size="15" fill="${COLORS.muted}">No phases yet: add milestones, or generate the roadmap from a template.</text>`);
    y += 60;
  }
  const H = y + 40;
  parts.push(`<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="11" fill="#9CA3AF">${esc([g.brand, g.date].filter(Boolean).join(" · "))}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT} role="img" aria-label="${esc(g.title)} roadmap"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${parts.join("")}</svg>`;
}

// Every project on a timeline: one row each (sub-projects under their parent), a bar from start to finish filled to
// its progress, coloured by health, with the quarters across the top and today marked.
export type PortfolioRow = { key: string; name: string; type: "full" | "sub"; start: string | null; due: string | null; progress: number; health: "on_track" | "at_risk" | "late" | "done"; lead?: string | null };
export function portfolioSvg(rows: PortfolioRow[], opts: { title?: string; brand?: string; date?: string } = {}): string {
  const W = 1100;
  const LABEL = 300;
  const ROW = 38;
  const today = new Date().toISOString().slice(0, 10);
  const dates = rows.flatMap((r) => [r.start, r.due]).filter((d): d is string => !!d).sort();
  const first = new Date(`${(dates[0] ?? today).slice(0, 7)}-01T00:00:00Z`);
  const lastD = new Date(`${(dates.at(-1) ?? today) > today ? dates.at(-1)! : today}T00:00:00Z`);
  // From the start of the first quarter to the end of the last.
  const q0 = new Date(Date.UTC(first.getUTCFullYear(), Math.floor(first.getUTCMonth() / 3) * 3, 1));
  const q1 = new Date(Date.UTC(lastD.getUTCFullYear(), Math.floor(lastD.getUTCMonth() / 3) * 3 + 3, 1));
  const span = Math.max(1, q1.getTime() - q0.getTime());
  const xOf = (d: string) => LABEL + ((Date.parse(`${d}T00:00:00Z`) - q0.getTime()) / span) * (W - LABEL - 30);
  const health: Record<PortfolioRow["health"], string> = { on_track: "#16A34A", at_risk: "#D97706", late: "#DC2626", done: "#2B78E4" };
  const top = 110;
  const H = top + rows.length * ROW + 70;
  const parts: string[] = [];
  parts.push(`<text x="30" y="48" font-size="28" font-weight="800" fill="#111827">${esc(opts.title ?? "Projects roadmap")}</text>`);
  parts.push(`<text x="30" y="74" font-size="13" fill="#6B7280">${rows.length} projects · by quarter · bars show progress</text>`);
  // Quarters.
  for (let d = new Date(q0); d < q1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) {
    const x = xOf(d.toISOString().slice(0, 10));
    const xe = xOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)).toISOString().slice(0, 10));
    parts.push(`<rect x="${x}" y="${top - 26}" width="${xe - x}" height="${rows.length * ROW + 26}" fill="${Math.floor(d.getUTCMonth() / 3) % 2 ? "#F9FAFB" : "#FFFFFF"}"/>`);
    parts.push(`<text x="${(x + xe) / 2}" y="${top - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}</text>`);
  }
  rows.forEach((r, i) => {
    const y = top + i * ROW;
    const indent = r.type === "sub" ? 22 : 0;
    parts.push(`<line x1="20" y1="${y + ROW}" x2="${W - 20}" y2="${y + ROW}" stroke="#F3F4F6"/>`);
    if (r.type === "sub") parts.push(`<path d="M 34 ${y + 4} v 14 h 10" fill="none" stroke="#9CA3AF" stroke-width="1.5"/>`);
    parts.push(`<text x="${30 + indent}" y="${y + 17}" font-size="13" font-weight="${r.type === "full" ? 700 : 500}" fill="#111827">${esc(`${r.key} · ${r.name}`.slice(0, 38))}</text>`);
    parts.push(`<text x="${30 + indent}" y="${y + 31}" font-size="10.5" fill="#6B7280">${esc([r.type === "full" ? "Full project" : "Sub-project", r.lead].filter(Boolean).join(" · "))}</text>`);
    const s = r.start ?? r.due;
    const e = r.due ?? r.start;
    if (s && e) {
      const x = xOf(s);
      const w = Math.max(10, xOf(e) - x);
      parts.push(`<rect x="${x}" y="${y + 9}" width="${w}" height="20" rx="10" fill="${health[r.health]}" fill-opacity="0.18" stroke="${health[r.health]}" stroke-width="1.5"/>`);
      parts.push(`<rect x="${x}" y="${y + 9}" width="${(w * Math.max(0, Math.min(100, r.progress))) / 100}" height="20" rx="10" fill="${health[r.health]}"/>`);
      parts.push(`<text x="${x + w + 8}" y="${y + 23}" font-size="11" fill="#374151">${r.progress}%</text>`);
    } else parts.push(`<text x="${LABEL}" y="${y + 23}" font-size="11" fill="#9CA3AF">No dates yet</text>`);
  });
  const tx = xOf(today);
  parts.push(`<line x1="${tx}" y1="${top - 26}" x2="${tx}" y2="${top + rows.length * ROW}" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${tx + 4}" y="${top + rows.length * ROW + 16}" font-size="11" fill="#DC2626">Today</text>`);
  const leg: [string, string][] = [["On track", health.on_track], ["At risk", health.at_risk], ["Late", health.late], ["Done", health.done]];
  leg.forEach(([l, c], i) => parts.push(`<rect x="${30 + i * 110}" y="${H - 34}" width="14" height="14" rx="7" fill="${c}"/><text x="${50 + i * 110}" y="${H - 23}" font-size="12" fill="#374151">${l}</text>`));
  parts.push(`<text x="${W - 30}" y="${H - 23}" text-anchor="end" font-size="11" fill="#9CA3AF">${esc([opts.brand, opts.date].filter(Boolean).join(" · "))}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT} role="img" aria-label="${esc(opts.title ?? "Projects roadmap")}"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${parts.join("")}</svg>`;
}
