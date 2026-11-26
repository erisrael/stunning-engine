// A Sheets Studio workbook: several sheets of cells (text as typed, formulas starting with "="), cell styles, column
// widths, frozen rows and columns, merged cells and charts. Shared by the browser editor and the .xlsx export.

import { FUNCTION_NAMES, type NumFormat } from "./formula";

export type CellStyle = {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  font?: string;
  size?: number;
  fmt?: NumFormat;
  border?: "all" | "outer" | "bottom" | "thick-bottom" | "none";
};
export type ChartDef = { id: string; type: "column" | "bar" | "line" | "pie" | "area"; range: string; title: string; seriesInRows?: boolean };
export type CondRule = { id: string; range: string; op: ">" | "<" | "=" | "between" | "contains" | "negative" | "blank" | "duplicate" | "scale"; a?: string; b?: string; fill: string; color?: string };
export type BookSheet = {
  name: string;
  cells: string[][];
  styles: Record<string, CellStyle>;
  cols: Record<string, number>;
  rowsH?: Record<string, number>;
  freeze: { rows: number; cols: number };
  merges: string[];
  charts: ChartDef[];
  rules?: CondRule[];
  hidden?: boolean;
  tab?: string;
};
export type BookData = { v: 2; sheets: BookSheet[]; active: number };

export const MAX_ROWS = 50_000;
export const MAX_COLS = 200;
const HEX = /^#[0-9a-f]{6}$/i;

export const blankSheet = (name = "Sheet1", rows = 50, cols = 12): BookSheet => ({
  name,
  cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
  styles: {},
  cols: {},
  freeze: { rows: 0, cols: 0 },
  merges: [],
  charts: [],
  rules: [],
});
export const blankBook = (): BookData => ({ v: 2, sheets: [blankSheet()], active: 0 });

// A plain table (column names and rows) as a workbook: the names are a bold, frozen first row.
export function fromTable(name: string, headers: string[], rows: string[][]): BookData {
  const width = Math.max(headers.length, ...rows.slice(0, 1000).map((r) => r.length), 1);
  const cells = [headers, ...rows].map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? "")));
  const styles: Record<string, CellStyle> = {};
  for (let c = 0; c < width; c++) styles[`0:${c}`] = { b: true, fill: "#f1f5f9" };
  return { v: 2, sheets: [{ ...blankSheet(name || "Sheet1"), cells, styles, freeze: { rows: 1, cols: 0 } }], active: 0 };
}

// Saved sheets from before workbooks ({ name, headers, rows }) open as workbooks.
export function toBook(data: unknown): BookData {
  const d = (data ?? {}) as Partial<BookData> & { name?: string; headers?: string[]; rows?: string[][] };
  if (d.v === 2 && Array.isArray(d.sheets)) return cleanBook(d);
  if (Array.isArray(d.headers)) return fromTable(d.name ?? "Sheet1", d.headers, d.rows ?? []);
  return blankBook();
}

const str = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, n);

export function cleanStyle(x: unknown): CellStyle | null {
  const s = (x ?? {}) as CellStyle;
  const out: CellStyle = {};
  if (s.b) out.b = true;
  if (s.i) out.i = true;
  if (s.u) out.u = true;
  if (s.s) out.s = true;
  if (s.color && HEX.test(s.color)) out.color = s.color;
  if (s.fill && HEX.test(s.fill)) out.fill = s.fill;
  if (s.align === "left" || s.align === "center" || s.align === "right") out.align = s.align;
  if (s.valign === "top" || s.valign === "middle" || s.valign === "bottom") out.valign = s.valign;
  if (s.wrap) out.wrap = true;
  if (typeof s.font === "string" && /^[\w '-]{1,40}$/.test(s.font)) out.font = s.font;
  if (Number.isFinite(Number(s.size)) && Number(s.size) >= 6 && Number(s.size) <= 72) out.size = Number(s.size);
  if (s.fmt && typeof s.fmt === "object" && ["general", "number", "percent", "currency", "date", "datetime", "text", "accounting"].includes(String(s.fmt.kind))) out.fmt = { kind: s.fmt.kind, decimals: Math.min(10, Math.max(0, Number(s.fmt.decimals ?? 2) || 0)), symbol: s.fmt.symbol ? str(s.fmt.symbol, 6) : undefined, thousands: s.fmt.thousands !== false };
  if (s.border && ["all", "outer", "bottom", "thick-bottom", "none"].includes(s.border)) out.border = s.border;
  return Object.keys(out).length ? out : null;
}

const RANGE = /^[A-Z]{1,3}\d{1,7}(:[A-Z]{1,3}\d{1,7})?$/;
export function cleanBook(input: unknown): BookData {
  const b = (input ?? {}) as Partial<BookData>;
  const sheets = (Array.isArray(b.sheets) ? b.sheets : []).slice(0, 30).map((s0, i): BookSheet => {
    const s = (s0 ?? {}) as Partial<BookSheet>;
    const rows = (Array.isArray(s.cells) ? s.cells : []).slice(0, MAX_ROWS);
    const width = Math.min(MAX_COLS, Math.max(1, ...rows.slice(0, 2000).map((r) => (Array.isArray(r) ? r.length : 0))));
    const cells = rows.map((r) => Array.from({ length: width }, (_, c) => str(Array.isArray(r) ? r[c] : "", 32_000)));
    const styles: Record<string, CellStyle> = {};
    let n = 0;
    for (const [k, v] of Object.entries(s.styles ?? {})) {
      if (n > 100_000 || !/^\d{1,7}:\d{1,3}$/.test(k)) continue;
      const cs = cleanStyle(v);
      if (cs) (styles[k] = cs), n++;
    }
    const cols: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.cols ?? {})) if (/^\d{1,3}$/.test(k) && Number(v) >= 24 && Number(v) <= 800) cols[k] = Math.round(Number(v));
    const rowsH: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.rowsH ?? {})) if (/^\d{1,7}$/.test(k) && Number(v) >= 16 && Number(v) <= 400) rowsH[k] = Math.round(Number(v));
    return {
      name: str(s.name, 31).replace(/[*?:\\/[\]]/g, " ").trim() || `Sheet${i + 1}`,
      cells: cells.length ? cells : blankSheet().cells,
      styles,
      cols,
      rowsH,
      freeze: { rows: Math.min(20, Math.max(0, Number(s.freeze?.rows) || 0)), cols: Math.min(10, Math.max(0, Number(s.freeze?.cols) || 0)) },
      merges: (Array.isArray(s.merges) ? s.merges : []).filter((m) => typeof m === "string" && RANGE.test(m) && m.includes(":")).slice(0, 2000),
      charts: (Array.isArray(s.charts) ? s.charts : [])
        .slice(0, 20)
        .map((c) => ({ id: str(c?.id, 20) || Math.random().toString(36).slice(2, 10), type: (["column", "bar", "line", "pie", "area"].includes(String(c?.type)) ? c.type : "column") as ChartDef["type"], range: RANGE.test(String(c?.range)) ? String(c.range) : "A1:B2", title: str(c?.title, 120), seriesInRows: !!c?.seriesInRows })),
      rules: (Array.isArray(s.rules) ? s.rules : [])
        .slice(0, 50)
        .filter((r) => RANGE.test(String(r?.range)) && ["<", ">", "=", "between", "contains", "negative", "blank", "duplicate", "scale"].includes(String(r?.op)))
        .map((r) => ({ id: str(r.id, 20) || Math.random().toString(36).slice(2, 10), range: String(r.range), op: r.op, a: r.a == null ? undefined : str(r.a, 200), b: r.b == null ? undefined : str(r.b, 200), fill: HEX.test(String(r.fill)) ? r.fill : "#fee2e2", color: r.color && HEX.test(r.color) ? r.color : undefined })),
      hidden: !!s.hidden,
      tab: s.tab && HEX.test(s.tab) ? s.tab : undefined,
    };
  });
  if (!sheets.length) sheets.push(blankSheet());
  return { v: 2, sheets, active: Math.min(sheets.length - 1, Math.max(0, Number(b.active) || 0)) };
}

// Formulas written to .xlsx only when every function in them is one Myseed works out too; anything else is written
// as text (a file from elsewhere cannot smuggle in a formula that reaches the network when opened in Excel).
const KNOWN = new Set(FUNCTION_NAMES);
export function exportableFormula(raw: string) {
  if (!raw.startsWith("=")) return null;
  const body = raw.slice(1);
  const calls = [...body.replace(/"(?:[^"]|"")*"/g, '""').matchAll(/([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.toUpperCase());
  if (calls.some((f) => !KNOWN.has(f))) return null;
  return body;
}

// The cells a range covers, as row and column numbers from 0.
export function rangeBounds(range: string) {
  const [a, b = a] = range.split(":");
  const p = (x: string) => {
    const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(x)!;
    let c = 0;
    for (const ch of m[1]!) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { r: Number(m[2]) - 1, c: c - 1 };
  };
  const x = p(a!);
  const y = p(b!);
  return { r1: Math.min(x.r, y.r), c1: Math.min(x.c, y.c), r2: Math.max(x.r, y.r), c2: Math.max(x.c, y.c) };
}
