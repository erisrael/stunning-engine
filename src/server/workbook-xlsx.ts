// Sheets Studio workbooks to and from .xlsx (ExcelJS): every sheet, formulas (with their last results, so files
// open with values even before Excel recalculates), fonts, colours, fills, alignment, wrapping, borders, number
// formats, column widths, row heights, frozen panes and merged cells.

import type ExcelJSNs from "exceljs";
import { Calc, colName, excelFormat, isErr, numFmtCode, type Scalar } from "@/lib/formula";
import { cleanBook, exportableFormula, MAX_COLS, MAX_ROWS, rangeBounds, type BookData, type BookSheet, type CellStyle } from "@/lib/sheet-book";

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 32_000);
const argb = (hex?: string) => (hex ? `FF${hex.replace("#", "").toUpperCase()}` : undefined);
const hexOf = (c?: { argb?: string; theme?: number }) => (c?.argb && /^[0-9A-F]{8}$/i.test(c.argb) ? `#${c.argb.slice(2).toLowerCase()}` : undefined);

function textOf(v: ExcelJSNs.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as unknown as Record<string, unknown>;
  if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
  if ("text" in o && typeof o.text === "string") return o.text;
  if ("result" in o && o.result != null) return textOf(o.result as ExcelJSNs.CellValue);
  if ("error" in o) return String(o.error);
  return "";
}

export async function readWorkbook(buf: ArrayBuffer, fileName: string): Promise<BookData> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheets: BookSheet[] = [];
  for (const ws of wb.worksheets.slice(0, 30)) {
    const rows = Math.min(MAX_ROWS, Math.max(1, ws.rowCount));
    const cols = Math.min(MAX_COLS, Math.max(1, ws.columnCount));
    const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
    const styles: Record<string, CellStyle> = {};
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn > rows) return;
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        if (cn > cols) return;
        const r = rn - 1;
        const c = cn - 1;
        const v = cell.value as unknown;
        let raw = "";
        if (v && typeof v === "object" && ("formula" in (v as object) || "sharedFormula" in (v as object))) {
          const f = (v as { formula?: string }).formula ?? cell.formula;
          raw = f ? `=${f}` : textOf(cell.value);
        } else if (v instanceof Date) {
          raw = v.toISOString().slice(0, 10);
        } else raw = textOf(cell.value);
        // A text cell that looks like a formula stays text (the apostrophe Excel uses).
        if (!(v && typeof v === "object" && "formula" in (v as object)) && raw.startsWith("=")) raw = `'${raw}`;
        cells[r]![c] = clean(raw);
        const st: CellStyle = {};
        const f = cell.font ?? {};
        if (f.bold) st.b = true;
        if (f.italic) st.i = true;
        if (f.underline) st.u = true;
        if (f.strike) st.s = true;
        if (hexOf(f.color as { argb?: string }) && hexOf(f.color as { argb?: string }) !== "#000000") st.color = hexOf(f.color as { argb?: string });
        if (f.size && f.size !== 11) st.size = f.size;
        if (f.name && f.name !== "Calibri") st.font = String(f.name).slice(0, 40);
        const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
        if (fill?.type === "pattern" && hexOf(fill.fgColor)) st.fill = hexOf(fill.fgColor);
        const a = cell.alignment ?? {};
        if (a.horizontal === "left" || a.horizontal === "center" || a.horizontal === "right") st.align = a.horizontal;
        if (a.vertical === "top" || a.vertical === "middle") st.valign = a.vertical;
        if (a.wrapText) st.wrap = true;
        if (cell.numFmt && cell.numFmt !== "General") st.fmt = excelFormat(cell.numFmt);
        if (cell.border?.top || cell.border?.left) st.border = "all";
        else if (cell.border?.bottom) st.border = cell.border.bottom.style === "thick" || cell.border.bottom.style === "medium" ? "thick-bottom" : "bottom";
        if (v instanceof Date && !st.fmt) st.fmt = { kind: "date" };
        if (Object.keys(st).length) styles[`${r}:${c}`] = st;
      });
    });
    const widths: Record<string, number> = {};
    for (let c = 1; c <= cols; c++) {
      const w = ws.getColumn(c).width;
      if (w && Math.abs(w - 8.43) > 0.5) widths[c - 1] = Math.round(w * 7.5);
    }
    const rowsH: Record<string, number> = {};
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height && rn <= rows) rowsH[rn - 1] = Math.round(row.height * 1.33);
    });
    const view = ws.views?.[0] as { state?: string; ySplit?: number; xSplit?: number } | undefined;
    const merges = Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges ?? {}).map((k) => {
      const m = (ws as unknown as { _merges: Record<string, { model?: { top: number; left: number; bottom: number; right: number } }> })._merges[k]!.model;
      return m ? `${colName(m.left - 1)}${m.top}:${colName(m.right - 1)}${m.bottom}` : "";
    });
    sheets.push({
      name: ws.name,
      cells,
      styles,
      cols: widths,
      rowsH,
      freeze: { rows: view?.state === "frozen" ? Math.min(20, view.ySplit ?? 0) : 0, cols: view?.state === "frozen" ? Math.min(10, view.xSplit ?? 0) : 0 },
      merges: merges.filter(Boolean),
      charts: [],
      rules: [],
      hidden: ws.state === "hidden",
    });
  }
  if (!sheets.length) throw new Error(`${fileName} has no worksheets.`);
  return cleanBook({ v: 2, sheets, active: Math.max(0, sheets.findIndex((s) => !s.hidden)) });
}

function result(v: Scalar): ExcelJSNs.CellValue {
  if (v === null) return null;
  if (isErr(v)) return { error: v.error === "#CYCLE!" || v.error === "#ERROR!" ? "#VALUE!" : v.error } as ExcelJSNs.CellErrorValue;
  return v;
}

export async function writeWorkbook(input: unknown, title = "Workbook") {
  void title;
  const book = cleanBook(input);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Myseed Sheets Studio";
  wb.created = new Date();
  const calc = new Calc(book.sheets.map((s) => ({ name: s.name, cells: s.cells })));
  book.sheets.forEach((s, si) => {
    const ws = wb.addWorksheet(s.name, { state: s.hidden ? "hidden" : "visible", properties: { tabColor: s.tab ? { argb: argb(s.tab)! } : undefined } });
    // The used part of the sheet only.
    let r2 = -1;
    let c2 = -1;
    s.cells.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v !== "" || s.styles[`${r}:${c}`]) {
          r2 = Math.max(r2, r);
          c2 = Math.max(c2, c);
        }
      }),
    );
    for (let r = 0; r <= r2; r++) {
      for (let c = 0; c <= c2; c++) {
        const raw = s.cells[r]?.[c] ?? "";
        const st = s.styles[`${r}:${c}`];
        if (!raw && !st) continue;
        const cell = ws.getCell(r + 1, c + 1);
        if (raw.startsWith("=")) {
          const f = exportableFormula(raw);
          cell.value = f ? ({ formula: f, result: result(calc.value(si, r, c)) } as ExcelJSNs.CellFormulaValue) : raw;
        } else if (raw.startsWith("'")) cell.value = raw.slice(1);
        else {
          const v = calc.value(si, r, c);
          cell.value = typeof v === "number" || typeof v === "boolean" ? v : raw;
        }
        if (!st) continue;
        cell.font = { name: st.font ?? "Calibri", size: st.size ?? 11, bold: !!st.b, italic: !!st.i, underline: !!st.u, strike: !!st.s, color: st.color ? { argb: argb(st.color)! } : undefined };
        if (st.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(st.fill)! } };
        if (st.align || st.valign || st.wrap) cell.alignment = { horizontal: st.align, vertical: st.valign ?? "bottom", wrapText: !!st.wrap };
        const code = numFmtCode(st.fmt);
        if (code) cell.numFmt = code;
        if (st.border === "all" || st.border === "outer") cell.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        if (st.border === "bottom") cell.border = { bottom: { style: "thin" } };
        if (st.border === "thick-bottom") cell.border = { bottom: { style: "medium" } };
      }
    }
    for (const [k, w] of Object.entries(s.cols)) ws.getColumn(Number(k) + 1).width = Math.max(2, Math.round((w / 7.5) * 10) / 10);
    for (const [k, h] of Object.entries(s.rowsH ?? {})) ws.getRow(Number(k) + 1).height = Math.round((h / 1.33) * 10) / 10;
    if (s.freeze.rows || s.freeze.cols) ws.views = [{ state: "frozen", ySplit: s.freeze.rows, xSplit: s.freeze.cols }];
    for (const m of s.merges) {
      const b = rangeBounds(m);
      try {
        ws.mergeCells(b.r1 + 1, b.c1 + 1, b.r2 + 1, b.c2 + 1);
      } catch {
        /* overlapping merges are left out */
      }
    }
  });
  return wb.xlsx.writeBuffer();
}
