import { getViewer } from "@/server/auth";
import { requireTool } from "@/server/tools";
import { WorkflowError } from "@/server/workflow";

// Sheets Studio: POST a .xlsx, .csv or .json file and get its first sheet back as rows; PUT rows and get a .xlsx
// (rows can carry a fill colour, for the cross-check report). Only for people Admin gave the Sheets app.
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLS = 200;
// Control characters other than tab and newline are dropped from everything read in.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 32_000);

async function gate() {
  const viewer = await getViewer();
  if (!viewer) throw new WorkflowError("FORBIDDEN", "Sign in first.");
  await requireTool(viewer, "sheets");
  return viewer;
}
const fail = (e: unknown) => Response.json({ error: e instanceof WorkflowError ? e.message : "Something went wrong." }, { status: e instanceof WorkflowError && e.code === "FORBIDDEN" ? 403 : 400 });

export async function POST(req: Request) {
  try {
    await gate();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new WorkflowError("VALIDATION", "Choose a file.");
    if (file.size > MAX_BYTES) throw new WorkflowError("VALIDATION", "Files up to 10 MB.");
    if (!/\.(xlsx|csv|tsv|txt|json)$/i.test(file.name)) throw new WorkflowError("VALIDATION", "Open a .xlsx, .csv, .tsv or .json file.");
    const buf = await file.arrayBuffer();
    // An .xlsx is a zip: it must start with PK.
    if (/\.xlsx$/i.test(file.name) && !(new Uint8Array(buf.slice(0, 2))[0] === 0x50 && new Uint8Array(buf.slice(0, 2))[1] === 0x4b)) throw new WorkflowError("VALIDATION", "This is not a real .xlsx file.");
    // ?book=1: the whole workbook (every sheet, formulas, styles, widths, merged cells) for the spreadsheet.
    if (new URL(req.url).searchParams.get("book") === "1" && /\.xlsx$/i.test(file.name)) {
      const { readWorkbook } = await import("@/server/workbook-xlsx");
      const book = await readWorkbook(buf, file.name).catch(() => null);
      if (!book) throw new WorkflowError("VALIDATION", "The workbook could not be read.");
      return Response.json(book, { headers: { "Cache-Control": "no-store" } });
    }
    let sheet: { sheetName?: string; headers: string[]; rows: string[][] };
    if (/\.tsv$/i.test(file.name)) {
      const Papa = (await import("papaparse")).default;
      const [headers = [], ...rows] = Papa.parse<string[]>(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""), { delimiter: "\t", skipEmptyLines: "greedy" }).data;
      sheet = { headers: headers.map((h) => String(h ?? "").trim()), rows: rows.map((r) => r.map((c) => String(c ?? ""))) };
    } else {
      const { parseUpload } = await import("@/server/importer");
      sheet = await parseUpload(file.name, buf);
    }
    if (sheet.rows.length > MAX_ROWS) throw new WorkflowError("VALIDATION", `Up to ${MAX_ROWS.toLocaleString()} rows (this file has ${sheet.rows.length.toLocaleString()}).`);
    const width = Math.min(MAX_COLS, Math.max(sheet.headers.length, ...sheet.rows.slice(0, 1000).map((r) => r.length)));
    const headers = Array.from({ length: width }, (_, i) => clean(sheet.headers[i] ?? "") || `Column ${i + 1}`);
    return Response.json({ name: sheet.sheetName ?? file.name.replace(/\.[^.]+$/, ""), headers, rows: sheet.rows.map((r) => headers.map((_, i) => clean(String(r[i] ?? "")))) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

type Out = { title?: string; book?: unknown; sheets: { name: string; headers: string[]; rows: string[][]; fills?: (string | null)[]; notes?: string[] }[] };

export async function PUT(req: Request) {
  try {
    await gate();
    const body = (await req.json().catch(() => null)) as Out | null;
    // A whole workbook from the spreadsheet: formulas, styles, widths, frozen panes, merged cells.
    if (body?.book) {
      const { writeWorkbook } = await import("@/server/workbook-xlsx");
      const out = await writeWorkbook(body.book, clean(String(body.title ?? "Workbook")).slice(0, 120));
      const file = (clean(String(body.title || "workbook")).replace(/[^\w.-]+/g, "-").slice(0, 80) || "workbook") + ".xlsx";
      return new Response(new Uint8Array(out as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
    }
    if (!body || !Array.isArray(body.sheets) || !body.sheets.length || body.sheets.length > 10) throw new WorkflowError("VALIDATION", "Nothing to export.");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Myseed Tools hub";
    wb.created = new Date();
    for (const s of body.sheets) {
      const headers = (s.headers ?? []).slice(0, MAX_COLS).map((h) => clean(String(h)));
      const rows = (s.rows ?? []).slice(0, MAX_ROWS);
      const ws = wb.addWorksheet(clean(String(s.name || "Sheet")).replace(/[*?:\/[\]]/g, " ").slice(0, 31) || "Sheet");
      for (const n of s.notes ?? []) ws.addRow([clean(String(n))]).font = { italic: true, color: { argb: "FF64748B" } };
      if (s.notes?.length) ws.addRow([]);
      const head = ws.addRow(headers);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }));
      rows.forEach((r, i) => {
        // Text only: a cell that starts with = is kept as text, so no formula from a file ever runs.
        const row = ws.addRow(headers.map((_, j) => clean(String(r?.[j] ?? ""))));
        const fill = s.fills?.[i];
        if (fill && /^[0-9A-F]{6}$/i.test(fill)) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill.toUpperCase()}` } }));
      });
      ws.views = [{ state: "frozen", ySplit: head.number }];
      ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: Math.max(1, headers.length) } };
      headers.forEach((h, j) => (ws.getColumn(j + 1).width = Math.min(60, Math.max(10, h.length + 2, ...rows.slice(0, 200).map((r) => String(r?.[j] ?? "").length + 2)))));
    }
    const buf = await wb.xlsx.writeBuffer();
    const name = (clean(String(body.title || "sheet")).replace(/[^\w.-]+/g, "-").slice(0, 80) || "sheet") + ".xlsx";
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
