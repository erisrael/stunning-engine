"use client";

// The Sheets Studio spreadsheet: cells with formulas (lib/formula.ts), a formula bar, styles (font, size, bold,
// italic, underline, strike, colours, alignment, wrapping, borders, number formats), merged cells, frozen rows and
// columns, several sheets, sorting and filtering, find and replace, fill down and right (and a fill handle), copy and
// paste (formulas move as in Excel), inserting and deleting rows and columns (references follow), conditional
// formatting, charts, zoom, and undo and redo. Rows are drawn only where the window is, so 50,000 rows stay quick.

import * as React from "react";
import {
  AlignCenterIcon, AlignLeftIcon, AlignRightIcon, ArrowDownAZIcon, ArrowUpAZIcon, BoldIcon, ChartColumnIcon, ChevronDownIcon, EraserIcon, FilterIcon, FunctionSquareIcon, ItalicIcon, MergeIcon, MinusIcon, PaintBucketIcon, PlusIcon, Redo2Icon, ReplaceIcon, SigmaIcon, SnowflakeIcon, SquareIcon, StrikethroughIcon, TrashIcon, TypeIcon, UnderlineIcon, Undo2Icon, WrapTextIcon, XIcon, ZoomInIcon, ZoomOutIcon, PaletteIcon, ListFilterIcon, PercentIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addr, adjustRefs, Calc, colName, formatValue, FUNCTION_NAMES, isErr, literal, parseAddr, shiftFormula, type NumFormat, type Scalar } from "@/lib/formula";
import { blankSheet, rangeBounds, type BookData, type BookSheet, type CellStyle, type ChartDef, type CondRule } from "@/lib/sheet-book";
import { cn } from "@/lib/utils";

type Sel = { r: number; c: number; r2: number; c2: number };
const norm = (s: Sel) => ({ r1: Math.min(s.r, s.r2), c1: Math.min(s.c, s.c2), r2: Math.max(s.r, s.r2), c2: Math.max(s.c, s.c2) });
const ROW_H = 24;
const COL_W = 100;
const HEAD_W = 46;
const FONTS = ["Calibri", "Arial", "Times New Roman", "Georgia", "Verdana", "Courier New", "Nyala", "Noto Sans Ethiopic"];
const FORMATS: { label: string; f: NumFormat }[] = [
  { label: "General", f: { kind: "general" } },
  { label: "Number (1,234.50)", f: { kind: "number", decimals: 2 } },
  { label: "Whole number (1,235)", f: { kind: "number", decimals: 0 } },
  { label: "Currency (ETB 1,234.50)", f: { kind: "currency", decimals: 2, symbol: "ETB" } },
  { label: "Dollars ($ 1,234.50)", f: { kind: "currency", decimals: 2, symbol: "$" } },
  { label: "Accounting ((1,234.50))", f: { kind: "accounting", decimals: 2 } },
  { label: "Percent (12.50%)", f: { kind: "percent", decimals: 2 } },
  { label: "Date (2026-11-27)", f: { kind: "date" } },
  { label: "Date and time", f: { kind: "datetime" } },
  { label: "Text", f: { kind: "text" } },
];
const HINTS: Record<string, string> = {
  SUM: "SUM(A1:A10) adds numbers",
  AVERAGE: "AVERAGE(A1:A10)",
  COUNT: "COUNT(A:A) counts numbers",
  COUNTA: "COUNTA(A:A) counts filled cells",
  IF: 'IF(B2>100,"High","Low")',
  IFERROR: 'IFERROR(A1/B1,"")',
  VLOOKUP: "VLOOKUP(key, A2:D99, 3, FALSE)",
  XLOOKUP: "XLOOKUP(key, A:A, C:C, \"not found\")",
  SUMIF: 'SUMIF(A:A,"Paid",C:C)',
  COUNTIF: 'COUNTIF(A:A,">10")',
  SUMIFS: 'SUMIFS(C:C, A:A,"Paid", B:B,">=2026-01-01")',
  ROUND: "ROUND(A1, 2)",
  TODAY: "TODAY() as a date",
  TEXT: 'TEXT(A1,"0.0%")',
  CONCAT: 'CONCAT(A1," ",B1)',
  PMT: "PMT(rate/12, months, -loan)",
};
// Chart colours: a fixed order, never cycled from a random palette.
const SERIES = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

type Props = { book: BookData; onChange: (b: BookData) => void; height?: string };

export function Spreadsheet({ book, onChange, height = "62vh" }: Props) {
  const sheet = book.sheets[book.active]!;
  const [sel, setSel] = React.useState<Sel>({ r: 0, c: 0, r2: 0, c2: 0 });
  const [edit, setEdit] = React.useState<{ value: string; bar?: boolean } | null>(null);
  const [scroll, setScroll] = React.useState({ top: 0, left: 0, h: 600, w: 1200 });
  const [zoom, setZoom] = React.useState(1);
  const [filters, setFilters] = React.useState<Record<number, string>>({});
  const [find, setFind] = React.useState(false);
  const [chartOpen, setChartOpen] = React.useState(false);
  const [ruleOpen, setRuleOpen] = React.useState(false);
  const [fill, setFill] = React.useState<{ to: { r: number; c: number } } | null>(null);
  const dragging = React.useRef(false);
  const box = React.useRef<HTMLDivElement>(null);
  const past = React.useRef<BookData[]>([]);
  const future = React.useRef<BookData[]>([]);
  const clip = React.useRef<{ text: string; cells: string[][]; styles: (CellStyle | undefined)[][]; r: number; c: number; cut: boolean } | null>(null);

  // Every change goes through here, so it can be undone.
  const commit = React.useCallback(
    (next: BookData) => {
      past.current.push(book);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      onChange(next);
    },
    [book, onChange],
  );
  const putSheet = (s: BookSheet) => commit({ ...book, sheets: book.sheets.map((x, i) => (i === book.active ? s : x)) });
  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(book);
    onChange(p);
  };
  const redo = () => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(book);
    onChange(f);
  };

  const calc = React.useMemo(() => new Calc(book.sheets.map((s) => ({ name: s.name, cells: s.cells }))), [book.sheets]);
  const rows = sheet.cells.length;
  const cols = Math.max(1, sheet.cells[0]?.length ?? 1);
  const colW = (c: number) => Math.round((sheet.cols[c] ?? COL_W) * zoom);
  const rowH = (r: number) => Math.round((sheet.rowsH?.[r] ?? ROW_H) * zoom);

  // Rows shown after the column filters.
  const order = React.useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    const all = Array.from({ length: rows }, (_, i) => i);
    if (!active.length) return all;
    const head = sheet.freeze.rows;
    return all.filter((r) => r < head || active.every(([c, v]) => display(calc, book.active, sheet, r, Number(c)).toLowerCase().includes(v.toLowerCase())));
  }, [filters, rows, sheet, calc, book.active]);
  const tops = React.useMemo(() => {
    const out = new Array<number>(order.length + 1);
    out[0] = 0;
    for (let i = 0; i < order.length; i++) out[i + 1] = out[i]! + rowH(order[i]!);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, sheet.rowsH, zoom]);
  const lefts = React.useMemo(() => {
    const out = new Array<number>(cols + 1);
    out[0] = 0;
    for (let c = 0; c < cols; c++) out[c + 1] = out[c]! + colW(c);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, sheet.cols, zoom]);
  const first = Math.max(0, upper(tops, scroll.top) - 5);
  const last = Math.min(order.length, upper(tops, scroll.top + scroll.h) + 5);
  const headH = Math.round(ROW_H * zoom);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => setScroll({ top: el.scrollTop, left: el.scrollLeft, h: el.clientHeight, w: el.clientWidth });
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Merged cells: the top-left cell spans; the others are covered.
  const merges = React.useMemo(() => {
    const top = new Map<string, { rs: number; cs: number }>();
    const covered = new Set<string>();
    for (const m of sheet.merges) {
      const b = rangeBounds(m);
      top.set(`${b.r1}:${b.c1}`, { rs: b.r2 - b.r1 + 1, cs: b.c2 - b.c1 + 1 });
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) if (r !== b.r1 || c !== b.c1) covered.add(`${r}:${c}`);
    }
    return { top, covered };
  }, [sheet.merges]);

  // Conditional formatting: what each rule needs worked out once (the duplicates in a range, a range's lowest and highest).
  const ruleData = React.useMemo(
    () =>
      (sheet.rules ?? []).map((rule) => {
        const b = rangeBounds(rule.range);
        const vals: Scalar[] = [];
        for (let r = b.r1; r <= Math.min(b.r2, rows - 1); r++) for (let c = b.c1; c <= Math.min(b.c2, cols - 1); c++) vals.push(calc.value(book.active, r, c));
        const nums = vals.filter((v): v is number => typeof v === "number");
        const counts = new Map<string, number>();
        if (rule.op === "duplicate") for (const v of vals) if (v !== null && v !== "") counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
        return { rule, b, min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0, counts };
      }),
    [sheet.rules, calc, rows, cols, book.active],
  );
  const ruleStyle = (r: number, c: number, v: Scalar): React.CSSProperties | null => {
    for (const d of ruleData) {
      if (r < d.b.r1 || r > d.b.r2 || c < d.b.c1 || c > d.b.c2) continue;
      const { rule } = d;
      const n = typeof v === "number" ? v : null;
      const a = literal(rule.a ?? "");
      const bb = literal(rule.b ?? "");
      let hit = false;
      if (rule.op === "scale" && n !== null && d.max > d.min) return { background: mix("#ffffff", rule.fill, (n - d.min) / (d.max - d.min)) };
      if (rule.op === ">") hit = n !== null && typeof a === "number" && n > a;
      if (rule.op === "<") hit = n !== null && typeof a === "number" && n < a;
      if (rule.op === "=") hit = String(v ?? "").toLowerCase() === String(rule.a ?? "").toLowerCase() || (n !== null && n === a);
      if (rule.op === "between") hit = n !== null && typeof a === "number" && typeof bb === "number" && n >= a && n <= bb;
      if (rule.op === "contains") hit = !!rule.a && String(v ?? "").toLowerCase().includes(rule.a.toLowerCase());
      if (rule.op === "negative") hit = n !== null && n < 0;
      if (rule.op === "blank") hit = v === null || v === "";
      if (rule.op === "duplicate") hit = v !== null && v !== "" && (d.counts.get(String(v)) ?? 0) > 1;
      if (hit) return { background: rule.fill, color: rule.color };
    }
    return null;
  };

  const raw = (r: number, c: number) => sheet.cells[r]?.[c] ?? "";
  const n = norm(sel);
  const styleAt = (r: number, c: number) => sheet.styles[`${r}:${c}`];

  // Writes cells (and optionally styles) into a copy of the sheet, growing it when needed.
  const writeCells = (s: BookSheet, list: { r: number; c: number; v?: string; st?: CellStyle | null }[]) => {
    let cells = s.cells;
    let styles = s.styles;
    const maxR = Math.max(cells.length - 1, ...list.map((x) => x.r));
    const maxC = Math.max((cells[0]?.length ?? 1) - 1, ...list.map((x) => x.c));
    if (maxR >= cells.length || maxC >= (cells[0]?.length ?? 0)) {
      const w = Math.min(200, maxC + 1);
      cells = Array.from({ length: Math.min(50_000, maxR + 1) }, (_, r) => {
        const row = cells[r] ?? [];
        return row.length >= w ? row : [...row, ...Array(w - row.length).fill("")];
      });
    } else cells = cells.slice();
    const touched = new Set<number>();
    for (const x of list) {
      if (x.r >= cells.length || x.c >= (cells[0]?.length ?? 0)) continue;
      if (x.v !== undefined) {
        if (!touched.has(x.r)) {
          cells[x.r] = cells[x.r]!.slice();
          touched.add(x.r);
        }
        cells[x.r]![x.c] = x.v;
      }
      if (x.st !== undefined) {
        if (styles === s.styles) styles = { ...styles };
        if (x.st) styles[`${x.r}:${x.c}`] = x.st;
        else delete styles[`${x.r}:${x.c}`];
      }
    }
    return { ...s, cells, styles };
  };
  const setValue = (r: number, c: number, v: string) => putSheet(writeCells(sheet, [{ r, c, v }]));

  const move = (dr: number, dc: number, extend = false) => {
    const idx = order.indexOf(extend ? sel.r2 : sel.r);
    const nr = order[Math.min(order.length - 1, Math.max(0, idx + dr))] ?? 0;
    const nc = Math.min(cols - 1, Math.max(0, (extend ? sel.c2 : sel.c) + dc));
    setSel(extend ? { ...sel, r2: nr, c2: nc } : { r: nr, c: nc, r2: nr, c2: nc });
    reveal(extend ? nr : nr, nc);
  };
  const reveal = (r: number, c: number) => {
    const el = box.current;
    if (!el) return;
    const i = order.indexOf(r);
    if (i < 0) return;
    const y = tops[i]!;
    const y2 = tops[i + 1]!;
    const fz = tops[Math.min(sheet.freeze.rows, order.length)] ?? 0;
    if (y - fz < el.scrollTop) el.scrollTop = y - fz;
    else if (y2 + headH > el.scrollTop + el.clientHeight) el.scrollTop = y2 + headH - el.clientHeight;
    const x = lefts[c]!;
    const x2 = lefts[c + 1]!;
    if (x < el.scrollLeft) el.scrollLeft = x;
    else if (x2 + HEAD_W > el.scrollLeft + el.clientWidth) el.scrollLeft = x2 + HEAD_W - el.clientWidth;
  };

  // The edit in progress, also as a ref: the cell's blur and the next click both end it, and only one may write.
  const editRef = React.useRef(edit);
  editRef.current = edit;
  const startEdit = (value?: string) => setEdit({ value: value ?? raw(sel.r, sel.c) });
  const finishEdit = (dr = 1, dc = 0) => {
    const cur = editRef.current;
    if (!cur) return;
    editRef.current = null;
    if (cur.value !== raw(sel.r, sel.c)) setValue(sel.r, sel.c, cur.value);
    setEdit(null);
    box.current?.focus();
    if (dr || dc) requestAnimationFrame(() => move(dr, dc));
  };

  const styleSel = (patch: Partial<CellStyle> | ((s: CellStyle) => CellStyle)) => {
    const list: { r: number; c: number; st: CellStyle | null }[] = [];
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const cur = styleAt(r, c) ?? {};
        const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
        for (const k of Object.keys(next) as (keyof CellStyle)[]) if (next[k] === undefined || next[k] === false) delete next[k];
        list.push({ r, c, st: Object.keys(next).length ? next : null });
      }
    putSheet(writeCells(sheet, list));
  };
  const toggle = (k: "b" | "i" | "u" | "s" | "wrap") => {
    const on = !styleAt(sel.r, sel.c)?.[k];
    styleSel({ [k]: on || undefined });
  };
  const clearSel = (what: "contents" | "formats" | "all" = "contents") => {
    const list: { r: number; c: number; v?: string; st?: null }[] = [];
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) list.push({ r, c, ...(what !== "formats" ? { v: "" } : {}), ...(what !== "contents" ? { st: null } : {}) });
    putSheet(writeCells(sheet, list));
  };

  // Fill down or right from the first row or column of the selection (formulas move, numbers in a series continue).
  const fillRange = (from: { r1: number; c1: number; r2: number; c2: number }, to: { r1: number; c1: number; r2: number; c2: number }) => {
    const list: { r: number; c: number; v: string; st?: CellStyle | null }[] = [];
    const down = to.r2 > from.r2 || to.r1 < from.r1;
    if (down) {
      for (let c = to.c1; c <= to.c2; c++) {
        const src = Array.from({ length: from.r2 - from.r1 + 1 }, (_, i) => raw(from.r1 + i, c));
        const nums = src.map((v) => literal(v));
        const series = src.length >= 2 && nums.every((x) => typeof x === "number") ? ((nums[nums.length - 1] as number) - (nums[0] as number)) / (src.length - 1) : null;
        for (let r = to.r1; r <= to.r2; r++) {
          if (r >= from.r1 && r <= from.r2) continue;
          const k = (((r - from.r1) % src.length) + src.length) % src.length;
          const base = src[k]!;
          const v = series !== null ? String(Number(((nums[0] as number) + series * (r - from.r1)).toPrecision(12))) : shiftFormula(base, r - (from.r1 + k), 0);
          list.push({ r, c, v, st: styleAt(from.r1 + k, c) ?? null });
        }
      }
    } else {
      for (let r = to.r1; r <= to.r2; r++) {
        const src = Array.from({ length: from.c2 - from.c1 + 1 }, (_, i) => raw(r, from.c1 + i));
        const nums = src.map((v) => literal(v));
        const series = src.length >= 2 && nums.every((x) => typeof x === "number") ? ((nums[nums.length - 1] as number) - (nums[0] as number)) / (src.length - 1) : null;
        for (let c = to.c1; c <= to.c2; c++) {
          if (c >= from.c1 && c <= from.c2) continue;
          const k = (((c - from.c1) % src.length) + src.length) % src.length;
          const v = series !== null ? String(Number(((nums[0] as number) + series * (c - from.c1)).toPrecision(12))) : shiftFormula(src[k]!, 0, c - (from.c1 + k));
          list.push({ r, c, v, st: styleAt(r, from.c1 + k) ?? null });
        }
      }
    }
    putSheet(writeCells(sheet, list));
  };
  const fillDown = () => n.r2 > n.r1 && fillRange({ r1: n.r1, c1: n.c1, r2: n.r1, c2: n.c2 }, n);
  const fillRight = () => n.c2 > n.c1 && fillRange({ r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c1 }, n);

  // Rows and columns: insert and delete (styles, merges and references follow).
  const structural = (axis: "row" | "col", at: number, count: number) => {
    const s = sheet;
    const cells =
      axis === "row"
        ? count > 0
          ? [...s.cells.slice(0, at), ...Array.from({ length: count }, () => Array(cols).fill("")), ...s.cells.slice(at)]
          : [...s.cells.slice(0, at), ...s.cells.slice(at - count)]
        : s.cells.map((row) => (count > 0 ? [...row.slice(0, at), ...Array(count).fill(""), ...row.slice(at)] : [...row.slice(0, at), ...row.slice(at - count)]));
    const shift = (i: number) => (i < at ? i : count < 0 && i < at - count ? -1 : i + count);
    const styles: Record<string, CellStyle> = {};
    for (const [k, v] of Object.entries(s.styles)) {
      const [r, c] = k.split(":").map(Number) as [number, number];
      const nr = axis === "row" ? shift(r) : r;
      const nc = axis === "col" ? shift(c) : c;
      if (nr >= 0 && nc >= 0) styles[`${nr}:${nc}`] = v;
    }
    const merges = s.merges.flatMap((m) => {
      const b = rangeBounds(m);
      const a1 = axis === "row" ? { ...b, r1: shift(b.r1), r2: shift(b.r2) } : { ...b, c1: shift(b.c1), c2: shift(b.c2) };
      return a1.r1 < 0 || a1.r2 < 0 || a1.c1 < 0 || a1.c2 < 0 ? [] : [`${addr(a1.r1, a1.c1)}:${addr(a1.r2, a1.c2)}`];
    });
    const colsW: Record<string, number> = {};
    if (axis === "col") for (const [k, v] of Object.entries(s.cols)) (shift(Number(k)) >= 0 ? (colsW[String(shift(Number(k)))] = v) : null);
    const fix = (name: string, mine: boolean) => (row: string[]) => row.map((v) => (v.startsWith("=") ? adjustRefs(v, axis, at, count, mine ? undefined : name) : v));
    const sheets = book.sheets.map((x, i) => {
      if (i === book.active) return { ...s, cells: (cells.length ? cells : [Array(Math.max(1, cols)).fill("")]).map(fix(s.name, true)), styles, merges, cols: axis === "col" ? colsW : s.cols };
      // Other sheets' references to this one move too.
      return x.cells.some((r) => r.some((v) => v.startsWith("=") && v.toLowerCase().includes(`${s.name.toLowerCase()}!`))) ? { ...x, cells: x.cells.map((row) => row.map((v) => (v.startsWith("=") ? adjustRefsOther(v, axis, at, count, s.name) : v))) } : x;
    });
    commit({ ...book, sheets });
  };

  const sortSel = (dir: 1 | -1) => {
    // The data block: the selection when it is several rows, otherwise every row below the frozen ones.
    const r1 = n.r2 > n.r1 ? n.r1 : sheet.freeze.rows;
    const r2 = n.r2 > n.r1 ? n.r2 : lastUsedRow(sheet);
    if (r2 <= r1) return;
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const idx = Array.from({ length: r2 - r1 + 1 }, (_, i) => r1 + i);
    const key = (r: number) => calc.value(book.active, r, sel.c);
    idx.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return dir * (x - y);
      return dir * coll.compare(String(x), String(y));
    });
    const cells = sheet.cells.slice();
    const styles = { ...sheet.styles };
    const old = idx.map((r) => ({ row: sheet.cells[r]!, st: Array.from({ length: cols }, (_, c) => sheet.styles[`${r}:${c}`]) }));
    old.forEach((o, i) => {
      const r = r1 + i;
      const from = idx[i]!;
      cells[r] = o.row.map((v) => (v.startsWith("=") ? shiftFormula(v, r - from, 0) : v));
      o.st.forEach((st, c) => (st ? (styles[`${r}:${c}`] = st) : delete styles[`${r}:${c}`]));
    });
    putSheet({ ...sheet, cells, styles });
  };

  const autoSum = (fn = "SUM") => {
    if (n.r2 > n.r1 || n.c2 > n.c1) {
      // A block: the totals go in the row below it.
      const r = n.r2 + 1;
      putSheet(writeCells(sheet, Array.from({ length: n.c2 - n.c1 + 1 }, (_, i) => ({ r, c: n.c1 + i, v: `=${fn}(${addr(n.r1, n.c1 + i)}:${addr(n.r2, n.c1 + i)})` }))));
      return;
    }
    let r = sel.r - 1;
    while (r >= 0 && typeof calc.value(book.active, r, sel.c) === "number") r--;
    const from = r + 1;
    if (from < sel.r) setValue(sel.r, sel.c, `=${fn}(${addr(from, sel.c)}:${addr(sel.r - 1, sel.c)})`);
    else {
      let c = sel.c - 1;
      while (c >= 0 && typeof calc.value(book.active, sel.r, c) === "number") c--;
      if (c + 1 < sel.c) setValue(sel.r, sel.c, `=${fn}(${addr(sel.r, c + 1)}:${addr(sel.r, sel.c - 1)})`);
      else startEdit(`=${fn}(`);
    }
  };

  const merge = () => {
    const inside = sheet.merges.filter((m) => {
      const b = rangeBounds(m);
      return !(b.r2 < n.r1 || b.r1 > n.r2 || b.c2 < n.c1 || b.c1 > n.c2);
    });
    if (inside.length) return putSheet({ ...sheet, merges: sheet.merges.filter((m) => !inside.includes(m)) });
    if (n.r1 === n.r2 && n.c1 === n.c2) return;
    const s = writeCells(sheet, [{ r: n.r1, c: n.c1, st: { ...(styleAt(n.r1, n.c1) ?? {}), align: "center", valign: "middle" } }]);
    putSheet({ ...s, merges: [...s.merges, `${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`] });
  };

  // Copy, cut and paste (Excel and Google Sheets paste as tab-separated text; our own copies keep formulas and styles).
  React.useEffect(() => {
    const focused = () => document.activeElement === box.current;
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (!focused() || edit) return;
      const cells: string[][] = [];
      const styles: (CellStyle | undefined)[][] = [];
      const text: string[] = [];
      for (let r = n.r1; r <= n.r2; r++) {
        cells.push(Array.from({ length: n.c2 - n.c1 + 1 }, (_, i) => raw(r, n.c1 + i)));
        styles.push(Array.from({ length: n.c2 - n.c1 + 1 }, (_, i) => styleAt(r, n.c1 + i)));
        text.push(Array.from({ length: n.c2 - n.c1 + 1 }, (_, i) => display(calc, book.active, sheet, r, n.c1 + i)).join("\t"));
      }
      const t = text.join("\n");
      clip.current = { text: t, cells, styles, r: n.r1, c: n.c1, cut };
      e.clipboardData?.setData("text/plain", t);
      e.preventDefault();
      if (cut) clearSel("all");
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cutF = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (!focused() || edit) return;
      const t = e.clipboardData?.getData("text/plain") ?? "";
      e.preventDefault();
      const own = clip.current && clip.current.text === t ? clip.current : null;
      const list: { r: number; c: number; v: string; st?: CellStyle | null }[] = [];
      if (own) {
        own.cells.forEach((row, i) => row.forEach((v, j) => list.push({ r: n.r1 + i, c: n.c1 + j, v: own.cut ? v : shiftFormula(v, n.r1 - own.r, n.c1 - own.c), st: own.styles[i]![j] ?? null })));
      } else {
        const lines = t.replace(/\r/g, "").replace(/\n$/, "").split("\n").slice(0, 20_000);
        lines.forEach((line, i) => line.split("\t").slice(0, 200).forEach((v, j) => list.push({ r: n.r1 + i, c: n.c1 + j, v: v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") })));
      }
      if (!list.length) return;
      putSheet(writeCells(sheet, list));
      const lr = Math.max(...list.map((x) => x.r));
      const lc = Math.max(...list.map((x) => x.c));
      setSel({ r: n.r1, c: n.c1, r2: lr, c2: lc });
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cutF);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cutF);
      document.removeEventListener("paste", paste);
    };
  });

  React.useEffect(() => {
    const up = () => {
      dragging.current = false;
      if (fill) {
        const to = fill.to;
        const target = { r1: Math.min(n.r1, to.r), c1: Math.min(n.c1, to.c), r2: Math.max(n.r2, to.r), c2: Math.max(n.c2, to.c) };
        // The direction with the longer pull wins (as Excel: down or right, or up or left).
        const dRows = Math.max(n.r1 - to.r, to.r - n.r2, 0);
        const dCols = Math.max(n.c1 - to.c, to.c - n.c2, 0);
        const t = dRows >= dCols ? { ...target, c1: n.c1, c2: n.c2 } : { ...target, r1: n.r1, r2: n.r2 };
        if (dRows || dCols) {
          fillRange(n, t);
          setSel({ r: t.r1, c: t.c1, r2: t.r2, c2: t.c2 });
        }
        setFill(null);
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  });

  const onKey = (e: React.KeyboardEvent) => {
    if (edit) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
    if (mod && k.toLowerCase() === "y") return e.preventDefault(), redo();
    if (mod && k.toLowerCase() === "b") return e.preventDefault(), toggle("b");
    if (mod && k.toLowerCase() === "i") return e.preventDefault(), toggle("i");
    if (mod && k.toLowerCase() === "u") return e.preventDefault(), toggle("u");
    if (mod && k.toLowerCase() === "d") return e.preventDefault(), fillDown();
    if (mod && k.toLowerCase() === "r") return e.preventDefault(), fillRight();
    if (mod && k.toLowerCase() === "f") return e.preventDefault(), setFind(true);
    if (mod && k.toLowerCase() === "h") return e.preventDefault(), setFind(true);
    if (mod && k.toLowerCase() === "a") return e.preventDefault(), setSel({ r: 0, c: 0, r2: rows - 1, c2: cols - 1 });
    if (mod && (k === "c" || k === "x" || k === "v")) return;
    if (k === "ArrowDown" || k === "ArrowUp" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      const d = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k] as [number, number];
      if (mod) {
        // To the edge of the data, as Ctrl+arrow in Excel.
        let r = e.shiftKey ? sel.r2 : sel.r;
        let c = e.shiftKey ? sel.c2 : sel.c;
        const filled = (rr: number, cc: number) => raw(rr, cc) !== "";
        const start = filled(r, c);
        for (;;) {
          const nr = r + d[0];
          const nc = c + d[1];
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) break;
          if (start && !filled(nr, nc)) break;
          r = nr;
          c = nc;
          if (!start && filled(r, c)) break;
        }
        setSel(e.shiftKey ? { ...sel, r2: r, c2: c } : { r, c, r2: r, c2: c });
        reveal(r, c);
        return;
      }
      return move(d[0], d[1], e.shiftKey);
    }
    if (k === "Enter") return e.preventDefault(), e.shiftKey ? move(-1, 0) : startEdit();
    if (k === "Tab") return e.preventDefault(), move(0, e.shiftKey ? -1 : 1);
    if (k === "F2") return e.preventDefault(), startEdit();
    if (k === "Delete" || k === "Backspace") return e.preventDefault(), clearSel();
    if (k === "Home") return e.preventDefault(), setSel({ r: mod ? 0 : sel.r, c: 0, r2: mod ? 0 : sel.r, c2: 0 }), reveal(mod ? 0 : sel.r, 0);
    if (k === "PageDown" || k === "PageUp") return e.preventDefault(), move((k === "PageDown" ? 1 : -1) * Math.max(1, Math.floor(scroll.h / rowH(0)) - 1), 0, e.shiftKey);
    if (k.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      startEdit(k);
    }
  };

  const onCellDown = (e: React.MouseEvent, r: number, c: number) => {
    // Building a formula: a click puts the cell's address in (shift-click a range).
    if (edit && edit.value.startsWith("=") && /[=+\-*/(,:^&<>]$/.test(edit.value)) {
      e.preventDefault();
      setEdit({ ...edit, value: edit.value + addr(r, c) });
      return;
    }
    if (edit) finishEdit(0, 0);
    if (e.shiftKey) setSel({ ...sel, r2: r, c2: c });
    else setSel({ r, c, r2: r, c2: c });
    dragging.current = true;
    box.current?.focus();
  };
  const onCellEnter = (r: number, c: number) => {
    if (fill) setFill({ to: { r, c } });
    else if (dragging.current) setSel((s) => ({ ...s, r2: r, c2: c }));
  };

  const resizeCol = (e: React.MouseEvent, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = sheet.cols[c] ?? COL_W;
    let w = w0;
    const mv = (ev: MouseEvent) => {
      w = Math.min(800, Math.max(24, Math.round(w0 + (ev.clientX - x0) / zoom)));
      const th = box.current?.querySelector<HTMLElement>(`[data-col="${c}"]`);
      if (th) th.style.width = `${w * zoom}px`;
      box.current?.querySelectorAll<HTMLElement>(`col[data-c="${c}"]`).forEach((el) => (el.style.width = `${w * zoom}px`));
    };
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      if (w !== w0) putSheet({ ...sheet, cols: { ...sheet.cols, [c]: w } });
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };
  const autoFit = (c: number) => {
    let w = 40;
    for (let r = 0; r < Math.min(rows, 2000); r++) w = Math.max(w, display(calc, book.active, sheet, r, c).length * 7.2 + 14);
    putSheet({ ...sheet, cols: { ...sheet.cols, [c]: Math.min(600, Math.round(w)) } });
  };

  const cur = styleAt(sel.r, sel.c) ?? {};
  const selNums = React.useMemo(() => {
    const out: number[] = [];
    let count = 0;
    if ((n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1) > 200_000) return { out, count: 0 };
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const v = calc.value(book.active, r, c);
        if (v !== null && v !== "") count++;
        if (typeof v === "number") out.push(v);
      }
    return { out, count };
  }, [calc, n.r1, n.r2, n.c1, n.c2, book.active]);

  const frozenTop = (i: number) => (i < sheet.freeze.rows ? headH + tops[i]! : undefined);
  const frozenLeft = (c: number) => (c < sheet.freeze.cols ? HEAD_W + lefts[c]! : undefined);
  const visibleCols = React.useMemo(() => {
    const a = Math.max(0, upper(lefts, scroll.left) - 2);
    const b = Math.min(cols, upper(lefts, scroll.left + scroll.w) + 2);
    const set = new Set<number>();
    for (let c = 0; c < sheet.freeze.cols; c++) set.add(c);
    for (let c = a; c < b; c++) set.add(c);
    return [...set].sort((x, y) => x - y);
  }, [lefts, scroll.left, scroll.w, cols, sheet.freeze.cols]);

  const rowList: number[] = [];
  for (let i = 0; i < Math.min(sheet.freeze.rows, order.length); i++) rowList.push(i);
  for (let i = Math.max(first, sheet.freeze.rows); i < last; i++) rowList.push(i);

  // Columns between the drawn ones are spacers, so horizontal scrolling stays right with 200 columns.
  const colRuns: ({ c: number } | { gap: number })[] = [];
  let prev = -1;
  for (const c of visibleCols) {
    if (c > prev + 1) colRuns.push({ gap: lefts[c]! - lefts[prev + 1]! });
    colRuns.push({ c });
    prev = c;
  }
  if (prev < cols - 1) colRuns.push({ gap: lefts[cols]! - lefts[prev + 1]! });

  const selLabel = n.r1 === n.r2 && n.c1 === n.c2 ? addr(sel.r, sel.c) : `${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`;
  const tb = "h-7 w-7 shrink-0 rounded hover:bg-muted inline-flex items-center justify-center disabled:opacity-40";

  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-background">
      {/* Ribbon */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <button type="button" className={tb} title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!past.current.length}><Undo2Icon className="size-4" /></button>
        <button type="button" className={tb} title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo} disabled={!future.current.length}><Redo2Icon className="size-4" /></button>
        <Sep />
        <select className="h-7 w-32 rounded border bg-background px-1 text-xs" value={cur.font ?? "Calibri"} onChange={(e) => styleSel({ font: e.target.value === "Calibri" ? undefined : e.target.value })} aria-label="Font">
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="h-7 w-14 rounded border bg-background px-1 text-xs" value={cur.size ?? 11} onChange={(e) => styleSel({ size: Number(e.target.value) === 11 ? undefined : Number(e.target.value) })} aria-label="Font size">
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className={cn(tb, cur.b && "bg-muted")} title="Bold (Ctrl+B)" aria-label="Bold" onClick={() => toggle("b")}><BoldIcon className="size-4" /></button>
        <button type="button" className={cn(tb, cur.i && "bg-muted")} title="Italic (Ctrl+I)" aria-label="Italic" onClick={() => toggle("i")}><ItalicIcon className="size-4" /></button>
        <button type="button" className={cn(tb, cur.u && "bg-muted")} title="Underline (Ctrl+U)" aria-label="Underline" onClick={() => toggle("u")}><UnderlineIcon className="size-4" /></button>
        <button type="button" className={cn(tb, cur.s && "bg-muted")} title="Strike through" aria-label="Strike through" onClick={() => toggle("s")}><StrikethroughIcon className="size-4" /></button>
        <ColorButton icon={TypeIcon} label="Text colour" value={cur.color} onPick={(color) => styleSel({ color })} />
        <ColorButton icon={PaintBucketIcon} label="Fill colour" value={cur.fill} onPick={(fill) => styleSel({ fill })} />
        <Sep />
        {(["left", "center", "right"] as const).map((a) => {
          const I = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon }[a];
          return <button key={a} type="button" className={cn(tb, cur.align === a && "bg-muted")} title={`Align ${a}`} aria-label={`Align ${a}`} onClick={() => styleSel({ align: cur.align === a ? undefined : a })}><I className="size-4" /></button>;
        })}
        <select className="h-7 w-20 rounded border bg-background px-1 text-xs" value={cur.valign ?? "bottom"} onChange={(e) => styleSel({ valign: e.target.value === "bottom" ? undefined : (e.target.value as "top") })} aria-label="Vertical alignment">
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
        <button type="button" className={cn(tb, cur.wrap && "bg-muted")} title="Wrap text" aria-label="Wrap text" onClick={() => toggle("wrap")}><WrapTextIcon className="size-4" /></button>
        <button type="button" className={tb} title="Merge and centre (again to unmerge)" aria-label="Merge cells" onClick={merge}><MergeIcon className="size-4" /></button>
        <Menu icon={SquareIcon} label="Borders">
          {([["all", "All borders"], ["outer", "Outside border"], ["bottom", "Bottom border"], ["thick-bottom", "Thick bottom border"], ["none", "No border"]] as const).map(([k, l]) => (
            <MenuItem key={k} onClick={() => styleSel({ border: k === "none" ? undefined : k })}>{l}</MenuItem>
          ))}
        </Menu>
        <Sep />
        <select className="h-7 w-36 rounded border bg-background px-1 text-xs" value={FORMATS.findIndex((f) => JSON.stringify(f.f) === JSON.stringify(cur.fmt ?? { kind: "general" }))} onChange={(e) => styleSel({ fmt: Number(e.target.value) <= 0 ? undefined : FORMATS[Number(e.target.value)]!.f })} aria-label="Number format">
          <option value={-1} hidden>Custom</option>
          {FORMATS.map((f, i) => <option key={i} value={i}>{f.label}</option>)}
        </select>
        <button type="button" className={tb} title="Percent" aria-label="Percent" onClick={() => styleSel({ fmt: { kind: "percent", decimals: 0 } })}><PercentIcon className="size-4" /></button>
        <button type="button" className={cn(tb, "w-auto px-1 text-[11px]")} title="Fewer decimals" onClick={() => styleSel((s) => ({ ...s, fmt: { ...(s.fmt && s.fmt.kind !== "general" ? s.fmt : { kind: "number" as const }), decimals: Math.max(0, (s.fmt?.decimals ?? 2) - 1) } }))}>.0←</button>
        <button type="button" className={cn(tb, "w-auto px-1 text-[11px]")} title="More decimals" onClick={() => styleSel((s) => ({ ...s, fmt: { ...(s.fmt && s.fmt.kind !== "general" ? s.fmt : { kind: "number" as const }), decimals: Math.min(10, (s.fmt?.decimals ?? 2) + 1) } }))}>.00→</button>
        <Sep />
        <Menu icon={SigmaIcon} label="AutoSum">
          {["SUM", "AVERAGE", "COUNT", "MIN", "MAX"].map((f) => <MenuItem key={f} onClick={() => autoSum(f)}>{f[0] + f.slice(1).toLowerCase()}</MenuItem>)}
        </Menu>
        <Menu icon={FunctionSquareIcon} label="Insert a function" wide>
          <div className="grid max-h-72 grid-cols-2 gap-0.5 overflow-auto">
            {FUNCTION_NAMES.map((f) => (
              <MenuItem key={f} title={HINTS[f]} onClick={() => startEdit(`${edit?.value && edit.value.startsWith("=") ? edit.value : "="}${f}(`)}>{f}</MenuItem>
            ))}
          </div>
        </Menu>
        <Menu icon={PlusIcon} label="Insert rows and columns">
          <MenuItem onClick={() => structural("row", n.r1, n.r2 - n.r1 + 1)}>Insert {n.r2 - n.r1 + 1 > 1 ? `${n.r2 - n.r1 + 1} rows` : "row"} above</MenuItem>
          <MenuItem onClick={() => structural("row", n.r2 + 1, n.r2 - n.r1 + 1)}>Insert row below</MenuItem>
          <MenuItem onClick={() => structural("col", n.c1, n.c2 - n.c1 + 1)}>Insert column left</MenuItem>
          <MenuItem onClick={() => structural("col", n.c2 + 1, n.c2 - n.c1 + 1)}>Insert column right</MenuItem>
          <MenuItem onClick={() => putSheet(writeCells(sheet, [{ r: Math.max(rows, 1) + 49, c: 0, v: "" }]))}>Add 50 rows at the end</MenuItem>
        </Menu>
        <Menu icon={MinusIcon} label="Delete rows and columns">
          <MenuItem onClick={() => rows > n.r2 - n.r1 + 1 && structural("row", n.r1, -(n.r2 - n.r1 + 1))}>Delete {n.r2 - n.r1 + 1 > 1 ? `${n.r2 - n.r1 + 1} rows` : "row"}</MenuItem>
          <MenuItem onClick={() => cols > n.c2 - n.c1 + 1 && structural("col", n.c1, -(n.c2 - n.c1 + 1))}>Delete {n.c2 - n.c1 + 1 > 1 ? `${n.c2 - n.c1 + 1} columns` : "column"}</MenuItem>
        </Menu>
        <Menu icon={EraserIcon} label="Clear">
          <MenuItem onClick={() => clearSel("contents")}>Clear contents</MenuItem>
          <MenuItem onClick={() => clearSel("formats")}>Clear formats</MenuItem>
          <MenuItem onClick={() => clearSel("all")}>Clear all</MenuItem>
        </Menu>
        <Sep />
        <button type="button" className={tb} title="Sort A to Z by this column" aria-label="Sort ascending" onClick={() => sortSel(1)}><ArrowDownAZIcon className="size-4" /></button>
        <button type="button" className={tb} title="Sort Z to A by this column" aria-label="Sort descending" onClick={() => sortSel(-1)}><ArrowUpAZIcon className="size-4" /></button>
        <Menu icon={FilterIcon} label="Filter" wide>
          <p className="mb-1 text-xs text-muted-foreground">Show rows whose column contains (frozen rows always show).</p>
          <div className="max-h-64 space-y-1 overflow-auto">
            {Array.from({ length: Math.min(cols, 40) }, (_, c) => (
              <label key={c} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate">{colName(c)} {sheet.freeze.rows ? `· ${display(calc, book.active, sheet, 0, c)}` : ""}</span>
                <Input className="h-7 text-xs" value={filters[c] ?? ""} onChange={(e) => setFilters({ ...filters, [c]: e.target.value })} />
              </label>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={() => setFilters({})}>Clear filters</Button>
        </Menu>
        <Menu icon={SnowflakeIcon} label="Freeze">
          <MenuItem onClick={() => putSheet({ ...sheet, freeze: { rows: 0, cols: 0 } })}>No frozen rows or columns</MenuItem>
          <MenuItem onClick={() => putSheet({ ...sheet, freeze: { rows: 1, cols: sheet.freeze.cols } })}>Freeze the top row</MenuItem>
          <MenuItem onClick={() => putSheet({ ...sheet, freeze: { rows: sheet.freeze.rows, cols: 1 } })}>Freeze the first column</MenuItem>
          <MenuItem onClick={() => putSheet({ ...sheet, freeze: { rows: Math.min(20, sel.r), cols: Math.min(10, sel.c) } })}>Freeze above and left of {addr(sel.r, sel.c)}</MenuItem>
        </Menu>
        <button type="button" className={tb} title="Conditional formatting" aria-label="Conditional formatting" onClick={() => setRuleOpen(true)}><PaletteIcon className="size-4" /></button>
        <button type="button" className={tb} title="Insert a chart from the selection" aria-label="Insert chart" onClick={() => setChartOpen(true)}><ChartColumnIcon className="size-4" /></button>
        <button type="button" className={tb} title="Find and replace (Ctrl+F)" aria-label="Find and replace" onClick={() => setFind(true)}><ReplaceIcon className="size-4" /></button>
        <Sep />
        <button type="button" className={tb} title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}><ZoomOutIcon className="size-4" /></button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className={tb} title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}><ZoomInIcon className="size-4" /></button>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-1 border-b px-1.5 py-1">
        <Input
          className="h-7 w-28 font-mono text-xs"
          aria-label="Cell address"
          key={selLabel}
          defaultValue={selLabel}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const v = (e.target as HTMLInputElement).value.toUpperCase().trim();
            const [a, b] = v.split(":");
            const p1 = a ? parseAddr(a) : null;
            const p2 = b ? parseAddr(b) : p1;
            if (p1 && p2) {
              setSel({ r: p1.r, c: p1.c, r2: p2.r, c2: p2.c });
              reveal(p1.r, p1.c);
              box.current?.focus();
            }
          }}
        />
        <span className="px-1 text-xs font-semibold text-muted-foreground italic">fx</span>
        <Input
          className="h-7 flex-1 font-mono text-xs"
          aria-label="Formula bar"
          value={edit ? edit.value : raw(sel.r, sel.c)}
          onFocus={() => !edit && setEdit({ value: raw(sel.r, sel.c), bar: true })}
          onChange={(e) => setEdit({ value: e.target.value, bar: true })}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), finishEdit(1, 0));
            if (e.key === "Escape") (setEdit(null), box.current?.focus());
            if (e.key === "Tab") (e.preventDefault(), finishEdit(0, 1));
          }}
        />
      </div>

      {/* Grid */}
      <div
        ref={box}
        tabIndex={0}
        role="grid"
        aria-label={`Sheet ${sheet.name}`}
        aria-rowcount={rows}
        aria-colcount={cols}
        onKeyDown={onKey}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ top: el.scrollTop, left: el.scrollLeft, h: el.clientHeight, w: el.clientWidth });
        }}
        className="relative overflow-auto outline-none select-none"
        style={{ height, fontSize: `${12 * zoom}px` }}
      >
        <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed", width: HEAD_W + lefts[cols]! }}>
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {colRuns.map((x, i) => ("gap" in x ? <col key={`g${i}`} style={{ width: x.gap }} /> : <col key={x.c} data-c={x.c} style={{ width: colW(x.c) }} />))}
          </colgroup>
          <thead>
            <tr style={{ height: headH }}>
              <th className="sticky top-0 left-0 z-30 border-r border-b bg-muted" onClick={() => setSel({ r: 0, c: 0, r2: rows - 1, c2: cols - 1 })} aria-label="Select all" />
              {colRuns.map((x, i) =>
                "gap" in x ? (
                  <th key={`g${i}`} className="sticky top-0 z-20 border-b bg-muted" />
                ) : (
                  <th
                    key={x.c}
                    data-col={x.c}
                    className={cn("group sticky top-0 z-20 border-r border-b bg-muted px-1 text-center font-medium text-muted-foreground", x.c >= n.c1 && x.c <= n.c2 && "bg-primary/15 text-foreground")}
                    style={{ left: frozenLeft(x.c), zIndex: x.c < sheet.freeze.cols ? 25 : undefined }}
                    onMouseDown={(e) => {
                      if (e.shiftKey) setSel({ ...sel, c2: x.c, r2: rows - 1 });
                      else setSel({ r: 0, c: x.c, r2: rows - 1, c2: x.c });
                    }}
                  >
                    {colName(x.c)}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize group-hover:bg-primary/30" onMouseDown={(e) => resizeCol(e, x.c)} onDoubleClick={() => autoFit(x.c)} aria-hidden />
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {first > sheet.freeze.rows && <tr style={{ height: tops[first]! - tops[Math.min(sheet.freeze.rows, order.length)]! }} aria-hidden />}
            {rowList.map((i) => {
              const r = order[i]!;
              const top = frozenTop(i);
              return (
                <tr key={r} style={{ height: rowH(r) }}>
                  <th
                    className={cn("sticky left-0 z-10 border-r border-b bg-muted px-1 text-right font-normal text-muted-foreground tabular-nums", r >= n.r1 && r <= n.r2 && "bg-primary/15 text-foreground", top !== undefined && "z-20")}
                    style={{ top }}
                    onMouseDown={(e) => (e.shiftKey ? setSel({ ...sel, r2: r, c2: cols - 1 }) : setSel({ r, c: 0, r2: r, c2: cols - 1 }))}
                  >
                    {r + 1}
                  </th>
                  {colRuns.map((x, j) => {
                    if ("gap" in x) return <td key={`g${j}`} className="border-b" />;
                    const c = x.c;
                    const key = `${r}:${c}`;
                    if (merges.covered.has(key)) return null;
                    const span = merges.top.get(key);
                    const st = sheet.styles[key];
                    const v = calc.value(book.active, r, c);
                    const isEditing = edit && !edit.bar && sel.r === r && sel.c === c;
                    const inSel = r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2;
                    const active = sel.r === r && sel.c === c;
                    const cond = ruleStyle(r, c, v);
                    const left = frozenLeft(c);
                    const fillTarget = fill && r >= Math.min(n.r1, fill.to.r) && r <= Math.max(n.r2, fill.to.r) && c >= Math.min(n.c1, fill.to.c) && c <= Math.max(n.c2, fill.to.c);
                    return (
                      <td
                        key={c}
                        rowSpan={span?.rs}
                        colSpan={span?.cs}
                        role="gridcell"
                        aria-selected={inSel}
                        onMouseDown={(e) => onCellDown(e, r, c)}
                        onMouseEnter={() => onCellEnter(r, c)}
                        onDoubleClick={() => startEdit()}
                        className={cn("relative overflow-hidden border-r border-b border-border/60 px-1", !st?.wrap && "whitespace-nowrap", st?.wrap && "break-words whitespace-pre-wrap", (top !== undefined || left !== undefined) && "sticky z-[5] bg-background", inSel && !active && "bg-primary/10", fillTarget && "outline-1 outline-primary outline-dashed")}
                        style={{ ...cellCss(st, v, zoom), ...(cond ?? {}), top, left, ...(inSel && !active && !cond ? { backgroundColor: undefined } : {}) }}
                        title={isErr(v) ? errHint(v.error) : undefined}
                      >
                        {isEditing ? (
                          <CellInput value={edit!.value} onChange={(value) => setEdit({ value })} onDone={finishEdit} onCancel={() => (setEdit(null), box.current?.focus())} />
                        ) : (
                          shown(v, raw(r, c), st)
                        )}
                        {active && !isEditing && <span className="pointer-events-none absolute inset-0 ring-2 ring-primary ring-inset" />}
                        {r === n.r2 && c === n.c2 && !edit && (
                          <span
                            className="absolute right-0 bottom-0 z-10 size-2 cursor-crosshair bg-primary"
                            title="Drag to fill"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setFill({ to: { r, c } });
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {last < order.length && <tr style={{ height: tops[order.length]! - tops[last]! }} aria-hidden />}
          </tbody>
        </table>
      </div>

      {/* Status bar and sheet tabs */}
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-1.5 py-1 text-xs">
        <SheetTabs book={book} onChange={commit} onSwitch={(i) => (onChange({ ...book, active: i }), setSel({ r: 0, c: 0, r2: 0, c2: 0 }), setFilters({}))} />
        {Object.values(filters).some((v) => v.trim()) && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">
            <ListFilterIcon className="size-3" /> {order.length - sheet.freeze.rows} of {rows - sheet.freeze.rows} rows
            <button type="button" aria-label="Clear filters" onClick={() => setFilters({})}><XIcon className="size-3" /></button>
          </span>
        )}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {selNums.out.length > 0 ? `Sum ${fmt(selNums.out.reduce((a, b) => a + b, 0))} · Average ${fmt(selNums.out.reduce((a, b) => a + b, 0) / selNums.out.length)} · Min ${fmt(Math.min(...selNums.out))} · Max ${fmt(Math.max(...selNums.out))} · ` : ""}
          Count {selNums.count}
        </span>
      </div>

      <Charts sheet={sheet} calc={calc} sheetIndex={book.active} onChange={(charts) => putSheet({ ...sheet, charts })} />
      <FindDialog open={find} onClose={() => setFind(false)} sheet={sheet} calc={calc} sheetIndex={book.active} onSelect={(r, c) => (setSel({ r, c, r2: r, c2: c }), reveal(r, c))} onReplaceAll={(s) => putSheet(s)} />
      <ChartDialog open={chartOpen} onClose={() => setChartOpen(false)} range={`${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`} onAdd={(c) => putSheet({ ...sheet, charts: [...sheet.charts, c] })} />
      <RuleDialog open={ruleOpen} onClose={() => setRuleOpen(false)} range={`${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`} rules={sheet.rules ?? []} onChange={(rules) => putSheet({ ...sheet, rules })} />
    </div>
  );
}

// Other sheets' references into the changed sheet move (only those prefixed with its name).
function adjustRefsOther(v: string, axis: "row" | "col", at: number, n: number, name: string) {
  // adjustRefs moves unprefixed references too; protect them by marking this sheet's name as the only one to move.
  const mark = "\u0002_";
  const protectedText = v.replace(/(^|[^A-Za-z0-9_.!'])(\$?[A-Za-z]{1,3}\$?\d{1,7})(?![\w(!])/g, (_m, a: string, b: string) => `${a}${mark}${b}`);
  return adjustRefs(protectedText, axis, at, n, name).split(mark).join("");
}

function upper(arr: number[], x: number) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}
const fmt = (x: number) => (Number.isInteger(x) ? x.toLocaleString() : x.toLocaleString(undefined, { maximumFractionDigits: 4 }));
function lastUsedRow(s: BookSheet) {
  for (let r = s.cells.length - 1; r >= 0; r--) if (s.cells[r]!.some((v) => v !== "")) return r;
  return 0;
}
export function usedRange(s: BookSheet) {
  let r2 = 0;
  let c2 = 0;
  s.cells.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== "" || s.styles[`${r}:${c}`]?.fill) {
        r2 = Math.max(r2, r);
        c2 = Math.max(c2, c);
      }
    }),
  );
  return { r2, c2 };
}
const errHint = (e: string) =>
  ({ "#DIV/0!": "Division by zero", "#VALUE!": "A value of the wrong kind (text where a number is needed)", "#REF!": "A reference to a cell that does not exist", "#NAME?": "A function name that is not known", "#N/A": "Not found", "#NUM!": "A number out of range", "#CYCLE!": "The formula refers to itself", "#ERROR!": "The formula could not be read" })[e] ?? e;

export function display(calc: Calc, sheetIndex: number, s: BookSheet, r: number, c: number) {
  const raw = s.cells[r]?.[c] ?? "";
  const st = s.styles[`${r}:${c}`];
  if (!raw.startsWith("=") && !st?.fmt) return raw.startsWith("'") ? raw.slice(1) : raw;
  return formatValue(calc.value(sheetIndex, r, c), st?.fmt);
}
function shown(v: Scalar, raw: string, st?: CellStyle) {
  if (!raw.startsWith("=") && !(st?.fmt && typeof v === "number")) return raw.startsWith("'") ? raw.slice(1) : raw;
  return formatValue(v, st?.fmt);
}
export function cellCss(st: CellStyle | undefined, v: Scalar, zoom = 1): React.CSSProperties {
  const css: React.CSSProperties = {};
  const numeric = typeof v === "number";
  css.textAlign = st?.align ?? (numeric ? "right" : isErr(v) || typeof v === "boolean" ? "center" : "left");
  css.verticalAlign = st?.valign ?? "bottom";
  if (st?.b) css.fontWeight = 700;
  if (st?.i) css.fontStyle = "italic";
  if (st?.u || st?.s) css.textDecoration = [st.u && "underline", st.s && "line-through"].filter(Boolean).join(" ");
  if (st?.color) css.color = st.color;
  else if (isErr(v)) css.color = "#b91c1c";
  if (st?.fill) css.backgroundColor = st.fill;
  if (st?.font) css.fontFamily = `"${st.font}", Calibri, Arial, sans-serif`;
  if (st?.size) css.fontSize = `${st.size * (12 / 11) * zoom}px`;
  if (st?.border === "all" || st?.border === "outer") css.boxShadow = "inset 0 0 0 1px #334155";
  if (st?.border === "bottom") css.boxShadow = "inset 0 -1px 0 #334155";
  if (st?.border === "thick-bottom") css.boxShadow = "inset 0 -2px 0 #0f172a";
  return css;
}
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * Math.min(1, Math.max(0, t)))).join(",")})`;
}

function CellInput({ value, onChange, onDone, onCancel }: { value: string; onChange: (v: string) => void; onDone: (dr?: number, dc?: number) => void; onCancel: () => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      aria-label="Cell"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        // A click on another cell while building a formula keeps the edit open (the cell's address is put in).
        if ((e.relatedTarget as HTMLElement | null)?.getAttribute?.("role") === "grid" && value.startsWith("=")) return;
        onDone(0, 0);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.preventDefault(), onDone(e.shiftKey ? -1 : 1, 0));
        else if (e.key === "Tab") (e.preventDefault(), onDone(0, e.shiftKey ? -1 : 1));
        else if (e.key === "Escape") (e.preventDefault(), onCancel());
      }}
      className="absolute inset-0 z-20 w-full min-w-full bg-background px-1 font-mono outline-2 outline-primary"
      style={{ minWidth: "12rem" }}
    />
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

function Menu({ icon: Icon, label, children, wide }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={label} aria-label={label} className="inline-flex h-7 shrink-0 items-center rounded px-1 hover:bg-muted">
          <Icon className="size-4" />
          <ChevronDownIcon className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-1", wide ? "w-80" : "w-56")} onClick={(e) => (e.target as HTMLElement).closest("[data-menu-item]") && setOpen(false)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
function MenuItem({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" data-menu-item title={title} onClick={onClick} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted">
      {children}
    </button>
  );
}

const SWATCHES = ["#000000", "#434343", "#666666", "#999999", "#d9d9d9", "#ffffff", "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0", "#fde2e2", "#fff2cc", "#e2efda", "#ddebf7", "#ede7f6", "#f1f5f9"];
export function ColorButton({ icon: Icon, label, value, onPick, allowClear = true }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string; onPick: (v: string | undefined) => void; allowClear?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={label} aria-label={label} className="relative inline-flex h-7 w-8 shrink-0 flex-col items-center justify-center rounded hover:bg-muted">
          <Icon className="size-3.5" />
          <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value ?? "transparent", boxShadow: value ? undefined : "inset 0 0 0 1px #cbd5e1" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2 p-2">
        <div className="grid grid-cols-6 gap-1">
          {SWATCHES.map((c) => (
            <button key={c} type="button" aria-label={c} className="size-7 rounded border" style={{ background: c }} onClick={() => (onPick(c), setOpen(false))} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={value ?? "#000000"} onChange={(e) => onPick(e.target.value)} aria-label="Any colour" className="h-7 w-10 cursor-pointer" />
          <span className="text-xs text-muted-foreground">Any colour</span>
          {allowClear && (
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => (onPick(undefined), setOpen(false))}>
              None
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SheetTabs({ book, onChange, onSwitch }: { book: BookData; onChange: (b: BookData) => void; onSwitch: (i: number) => void }) {
  const names = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  const fresh = (base: string) => {
    let i = book.sheets.length + 1;
    while (names.has(`${base}${i}`.toLowerCase())) i++;
    return `${base}${i}`;
  };
  const rename = (i: number) => {
    const name = prompt("Sheet name", book.sheets[i]!.name)?.replace(/[*?:\\/[\]]/g, " ").trim().slice(0, 31);
    if (!name) return;
    if (book.sheets.some((s, j) => j !== i && s.name.toLowerCase() === name.toLowerCase())) return alert("Another sheet has that name.");
    const old = book.sheets[i]!.name;
    // Formulas that name the sheet follow the new name.
    const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`('${esc.replace(/'/g, "''")}'|\\b${esc}\\b)!`, "gi");
    const ref = /^[A-Za-z_][\w.]*$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`;
    onChange({ ...book, sheets: book.sheets.map((s, j) => ({ ...s, name: j === i ? name : s.name, cells: s.cells.map((row) => row.map((v) => (v.startsWith("=") ? v.replace(re, ref) : v))) })) });
  };
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      <button type="button" title="Add a sheet" aria-label="Add a sheet" className="rounded p-1 hover:bg-muted" onClick={() => onChange({ ...book, sheets: [...book.sheets, blankSheet(fresh("Sheet"))], active: book.sheets.length })}>
        <PlusIcon className="size-3.5" />
      </button>
      {book.sheets.map((s, i) => (
        <span key={i} className={cn("group inline-flex shrink-0 items-center rounded-t border-b-2 px-2 py-0.5", i === book.active ? "border-primary bg-background font-medium" : "border-transparent hover:bg-muted")} style={s.tab ? { borderBottomColor: s.tab } : undefined}>
          <button type="button" onClick={() => onSwitch(i)} onDoubleClick={() => rename(i)} title="Double-click to rename">
            {s.name}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label={`Options for ${s.name}`} className="ml-0.5 rounded opacity-50 group-hover:opacity-100">
                <ChevronDownIcon className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <MenuItem onClick={() => rename(i)}>Rename</MenuItem>
              <MenuItem onClick={() => onChange({ ...book, sheets: [...book.sheets.slice(0, i + 1), { ...structuredClone(s), name: fresh(`${s.name.slice(0, 20)} copy `) }, ...book.sheets.slice(i + 1)], active: i + 1 })}>Duplicate</MenuItem>
              <MenuItem onClick={() => i > 0 && onChange({ ...book, sheets: book.sheets.map((x, j) => (j === i - 1 ? s : j === i ? book.sheets[i - 1]! : x)), active: i - 1 })}>Move left</MenuItem>
              <MenuItem onClick={() => i < book.sheets.length - 1 && onChange({ ...book, sheets: book.sheets.map((x, j) => (j === i + 1 ? s : j === i ? book.sheets[i + 1]! : x)), active: i + 1 })}>Move right</MenuItem>
              <div className="flex flex-wrap gap-1 px-2 py-1">
                {[undefined, "#dc2626", "#f59e0b", "#16a34a", "#2563eb", "#7c3aed"].map((c) => (
                  <button key={c ?? "none"} type="button" aria-label={c ? `Tab colour ${c}` : "No tab colour"} className="size-5 rounded border" style={{ background: c ?? "transparent" }} onClick={() => onChange({ ...book, sheets: book.sheets.map((x, j) => (j === i ? { ...x, tab: c } : x)) })} />
                ))}
              </div>
              <MenuItem
                onClick={() => {
                  if (book.sheets.length < 2) return alert("A workbook keeps at least one sheet.");
                  if (!confirm(`Delete the sheet ${s.name}?`)) return;
                  onChange({ ...book, sheets: book.sheets.filter((_, j) => j !== i), active: Math.max(0, Math.min(book.active, book.sheets.length - 2)) });
                }}
              >
                <span className="text-destructive">Delete</span>
              </MenuItem>
            </PopoverContent>
          </Popover>
        </span>
      ))}
    </div>
  );
}

function FindDialog({ open, onClose, sheet, calc, sheetIndex, onSelect, onReplaceAll }: { open: boolean; onClose: () => void; sheet: BookSheet; calc: Calc; sheetIndex: number; onSelect: (r: number, c: number) => void; onReplaceAll: (s: BookSheet) => void }) {
  const [q, setQ] = React.useState("");
  const [rep, setRep] = React.useState("");
  const [cs, setCs] = React.useState(false);
  const [whole, setWhole] = React.useState(false);
  const pos = React.useRef(-1);
  const hits = React.useMemo(() => {
    if (!q) return [];
    const out: { r: number; c: number }[] = [];
    const needle = cs ? q : q.toLowerCase();
    sheet.cells.forEach((row, r) =>
      row.forEach((_, c) => {
        const v = display(calc, sheetIndex, sheet, r, c);
        const t = cs ? v : v.toLowerCase();
        if (whole ? t === needle : t.includes(needle)) out.push({ r, c });
      }),
    );
    return out;
  }, [q, cs, whole, sheet, calc, sheetIndex]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Find and replace</DialogTitle>
          <DialogDescription>{q ? `${hits.length} found` : "Searches what the cells show."}</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => ((pos.current = -1), setQ(e.target.value))} placeholder="Find" autoFocus />
        <Input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Replace with" />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Match case</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole cell</label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={!hits.length} onClick={() => {
            pos.current = (pos.current + 1) % hits.length;
            const h = hits[pos.current]!;
            onSelect(h.r, h.c);
          }}>Find next</Button>
          <Button disabled={!hits.length} onClick={() => {
            const flags = cs ? "g" : "gi";
            const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
            const cells = sheet.cells.map((row) => row.slice());
            let changed = 0;
            for (const h of hits) {
              const raw = cells[h.r]![h.c]!;
              if (raw.startsWith("=")) continue;
              cells[h.r]![h.c] = whole ? rep : raw.replace(re, rep);
              changed++;
            }
            onReplaceAll({ ...sheet, cells });
            alert(`${changed} cell${changed === 1 ? "" : "s"} changed${changed < hits.length ? " (formulas are left as they are)" : ""}.`);
          }}>Replace all</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChartDialog({ open, onClose, range, onAdd }: { open: boolean; onClose: () => void; range: string; onAdd: (c: ChartDef) => void }) {
  const [type, setType] = React.useState<ChartDef["type"]>("column");
  const [title, setTitle] = React.useState("");
  const [r, setR] = React.useState(range);
  const [rowsSeries, setRowsSeries] = React.useState(false);
  React.useEffect(() => setR(range), [range, open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert a chart</DialogTitle>
          <DialogDescription>The first column holds the labels and the first row the series names.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-1">
          {(["column", "bar", "line", "area", "pie"] as const).map((t) => (
            <button key={t} type="button" className={cn("rounded border px-2 py-2 text-xs capitalize", type === t && "border-primary bg-primary/10")} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chart title" />
        <Input value={r} onChange={(e) => setR(e.target.value.toUpperCase())} placeholder="Range, for example A1:C8" aria-label="Range" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rowsSeries} onChange={(e) => setRowsSeries(e.target.checked)} /> Series are in rows</label>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!/^[A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7}$/.test(r)) return alert("Write a range such as A1:C8.");
              onAdd({ id: Math.random().toString(36).slice(2, 10), type, range: r, title, seriesInRows: rowsSeries });
              onClose();
            }}
          >
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({ open, onClose, range, rules, onChange }: { open: boolean; onClose: () => void; range: string; rules: CondRule[]; onChange: (r: CondRule[]) => void }) {
  const [r, setR] = React.useState(range);
  const [op, setOp] = React.useState<CondRule["op"]>(">");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [fillC, setFillC] = React.useState("#fee2e2");
  React.useEffect(() => setR(range), [range, open]);
  const LABEL: Record<CondRule["op"], string> = { ">": "Greater than", "<": "Less than", "=": "Equal to", between: "Between", contains: "Text contains", negative: "Negative numbers", blank: "Blank cells", duplicate: "Duplicate values", scale: "Colour scale (low to high)" };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conditional formatting</DialogTitle>
          <DialogDescription>Colour cells by their value. The first rule that matches wins.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {rules.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded border px-2 py-1">
              <span className="size-4 rounded" style={{ background: x.fill }} />
              <span className="font-mono text-xs">{x.range}</span> {LABEL[x.op]} {x.a ?? ""} {x.op === "between" ? `and ${x.b}` : ""}
              <button type="button" className="ml-auto" aria-label="Remove rule" onClick={() => onChange(rules.filter((y) => y.id !== x.id))}><TrashIcon className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Input value={r} onChange={(e) => setR(e.target.value.toUpperCase())} aria-label="Range" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={op} onChange={(e) => setOp(e.target.value as CondRule["op"])} aria-label="Rule">
            {Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {[">", "<", "=", "between", "contains"].includes(op) && <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Value" />}
          {op === "between" && <Input value={b} onChange={(e) => setB(e.target.value)} placeholder="And" />}
          <label className="flex items-center gap-2 text-sm">Colour <input type="color" value={fillC} onChange={(e) => setFillC(e.target.value)} /></label>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!/^[A-Z]{1,3}\d{1,7}(:[A-Z]{1,3}\d{1,7})?$/.test(r)) return alert("Write a range such as B2:B40.");
              onChange([...rules, { id: Math.random().toString(36).slice(2, 10), range: r, op, a: a || undefined, b: b || undefined, fill: fillC }]);
            }}
          >
            Add rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Charts from ranges of the sheet, drawn as SVG (download as PNG).
function Charts({ sheet, calc, sheetIndex, onChange }: { sheet: BookSheet; calc: Calc; sheetIndex: number; onChange: (c: ChartDef[]) => void }) {
  if (!sheet.charts.length) return null;
  return (
    <div className="grid gap-3 border-t p-3 md:grid-cols-2">
      {sheet.charts.map((c) => (
        <div key={c.id} data-chart className="rounded-md border p-2">
          <div className="mb-1 flex items-center gap-2">
            <p className="flex-1 truncate text-sm font-medium">{c.title || `Chart of ${c.range}`}</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={(e) => {
                const svg = e.currentTarget.closest("[data-chart]")?.querySelector("svg");
                if (svg) void downloadSvg(svg, c.title || "chart");
              }}
            >
              PNG
            </Button>
            <button type="button" aria-label="Remove chart" onClick={() => onChange(sheet.charts.filter((x) => x.id !== c.id))}><XIcon className="size-4" /></button>
          </div>
          <ChartSvg def={c} data={chartData(c, sheet, calc, sheetIndex)} />
        </div>
      ))}
    </div>
  );
}

export function chartData(c: ChartDef, sheet: BookSheet, calc: Calc, sheetIndex: number) {
  const b = rangeBounds(c.range);
  const grid: Scalar[][] = [];
  for (let r = b.r1; r <= b.r2 && r < sheet.cells.length; r++) {
    const row: Scalar[] = [];
    for (let col = b.c1; col <= b.c2; col++) row.push(calc.value(sheetIndex, r, col));
    grid.push(row);
  }
  const g = c.seriesInRows ? grid[0]?.map((_, i) => grid.map((r) => r[i] ?? null)) ?? [] : grid;
  const hasHead = g[0]?.slice(1).some((v) => typeof v === "string") ?? false;
  const head = hasHead ? g[0]!.slice(1).map((v) => String(v ?? "")) : (g[0]?.slice(1) ?? []).map((_, i) => `Series ${i + 1}`);
  const body = hasHead ? g.slice(1) : g;
  return { labels: body.map((r) => String(r[0] ?? "")), series: head.map((name, i) => ({ name, values: body.map((r) => (typeof r[i + 1] === "number" ? (r[i + 1] as number) : 0)) })) };
}

export function ChartSvg({ def, data }: { def: ChartDef; data: ReturnType<typeof chartData> }) {
  const W = 520;
  const H = 280;
  const pad = { l: 48, r: 12, t: 12, b: 40 };
  const all = data.series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const n = data.labels.length || 1;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span);
  const x0 = pad.l;
  const pw = W - pad.l - pad.r;
  if (def.type === "pie") {
    const s = data.series[0];
    const total = s ? s.values.reduce((a, b) => a + Math.max(0, b), 0) : 0;
    let a0 = -Math.PI / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={def.title || "Pie chart"}>
        <rect width={W} height={H} fill="#ffffff" />
        {s && total > 0 && s.values.map((v, i) => {
          const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const cx = 150, cy = H / 2, R = 110;
          const p = `M${cx},${cy} L${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} Z`;
          a0 = a1;
          return <path key={i} d={p} fill={SERIES[i % SERIES.length]} stroke="#fff" strokeWidth={2} />;
        })}
        {data.labels.slice(0, 12).map((l, i) => (
          <g key={i} transform={`translate(300,${24 + i * 20})`}>
            <rect width={12} height={12} rx={2} fill={SERIES[i % SERIES.length]} />
            <text x={18} y={10} fontSize={12} fill="#334155">{l.slice(0, 28)} ({s ? Math.round(((s.values[i] ?? 0) / (total || 1)) * 100) : 0}%)</text>
          </g>
        ))}
      </svg>
    );
  }
  const ticks = 5;
  const bandW = pw / n;
  const k = data.series.length || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={def.title || "Chart"}>
      <rect width={W} height={H} fill="#ffffff" />
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + (span * i) / ticks;
        return (
          <g key={i}>
            <line x1={x0} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={x0 - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="#64748b">{Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v * 100) / 100}</text>
          </g>
        );
      })}
      {def.type === "column" || def.type === "bar"
        ? data.series.map((s, si) =>
            s.values.map((v, i) => {
              const bw = (bandW * 0.7) / k;
              const x = x0 + i * bandW + bandW * 0.15 + si * bw;
              return <rect key={`${si}-${i}`} x={x} y={Math.min(y(v), y(0))} width={Math.max(1, bw - 2)} height={Math.abs(y(v) - y(0))} rx={3} fill={SERIES[si % SERIES.length]} />;
            }),
          )
        : data.series.map((s, si) => {
            const pts = s.values.map((v, i) => `${x0 + i * bandW + bandW / 2},${y(v)}`).join(" ");
            return (
              <g key={si}>
                {def.type === "area" && <polygon points={`${x0 + bandW / 2},${y(0)} ${pts} ${x0 + (n - 1) * bandW + bandW / 2},${y(0)}`} fill={SERIES[si % SERIES.length]} opacity={0.18} />}
                <polyline points={pts} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth={2} />
              </g>
            );
          })}
      {data.labels.map((l, i) => (n <= 16 || i % Math.ceil(n / 16) === 0 ? <text key={i} x={x0 + i * bandW + bandW / 2} y={H - pad.b + 14} fontSize={10} textAnchor="middle" fill="#475569">{l.slice(0, 12)}</text> : null))}
      {data.series.length > 1 && data.series.map((s, i) => (
        <g key={i} transform={`translate(${x0 + i * 110},${H - 14})`}>
          <rect width={10} height={10} rx={2} fill={SERIES[i % SERIES.length]} />
          <text x={14} y={9} fontSize={11} fill="#334155">{s.name.slice(0, 14)}</text>
        </g>
      ))}
    </svg>
  );
}

export async function svgToPng(svg: SVGSVGElement | string, width = 1040, type: "image/png" | "image/jpeg" = "image/png", background = "#ffffff") {
  const text = typeof svg === "string" ? svg : new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => ((img.onload = () => ok()), (img.onerror = () => bad(new Error("svg"))), (img.src = url)));
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = Math.round(width * ratio);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error("png"))), type, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function downloadSvg(svg: SVGSVGElement, name: string) {
  const blob = await svgToPng(svg);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "chart"}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
