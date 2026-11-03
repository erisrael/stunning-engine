// Microsoft Office from the app's data (Phase 27): any data feed as an Excel workbook (a formatted table with
// filters), a Word document (a table, landscape) or a PowerPoint deck (a title slide and table slides), in the
// company's colours. Power BI and live Excel read the same datasets through the feeds with a key.

import { AlignmentType, Document, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { DATASETS, datasetRows, isDataset, type Dataset } from "./feeds";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";

export async function officeExport(user: AppUser, dataset: string, format: "xlsx" | "docx" | "pptx") {
  if (!isDataset(dataset)) throw new WorkflowError("NOT_FOUND", "Unknown dataset.");
  if (!can(user, DATASETS[dataset as Dataset].needs as never)) throw new WorkflowError("FORBIDDEN", "You cannot see this dataset.");
  const rows = (await datasetRows(user, dataset as Dataset)) as Record<string, unknown>[];
  const title = DATASETS[dataset as Dataset].label;
  const cols = Object.keys(rows[0] ?? {});
  const date = new Date().toISOString().slice(0, 10);
  const base = `${dataset}-${date}`;
  if (format === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Myseed";
    const ws = wb.addWorksheet(dataset.slice(0, 30), { views: [{ state: "frozen", ySplit: 1 }] });
    if (cols.length) {
      ws.addTable({ name: dataset.replace(/\W/g, "_"), ref: "A1", headerRow: true, style: { theme: "TableStyleMedium7", showRowStripes: true }, columns: cols.map((c) => ({ name: c, filterButton: true })), rows: rows.map((r) => cols.map((c) => (r[c] as never) ?? null)) });
      ws.columns.forEach((c, i) => (c.width = Math.min(48, Math.max(10, cols[i]!.length + 4))));
    }
    const about = wb.addWorksheet("About");
    about.addRows([["Dataset", title], ["Made", date], ["Rows", rows.length], ["Live data", "Admin, Integrations: a key for Power BI or Excel (Data, From Web) keeps it up to date."]]);
    about.getColumn(1).width = 14;
    about.getColumn(2).width = 80;
    return { name: `${base}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
  if (format === "docx") {
    const show = cols.slice(0, 10);
    const cell = (t: string, head = false) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "0B7A3B" } : undefined, children: [new Paragraph({ children: [new TextRun({ text: t, bold: head, color: head ? "FFFFFF" : undefined, size: 16 })] })] });
    const doc = new Document({
      creator: "Myseed",
      title,
      sections: [
        {
          properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
          children: [
            new Paragraph({ children: [new TextRun({ text: "Myseed", bold: true, color: "0B7A3B", size: 22 })] }),
            new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: title, bold: true, size: 36 })] }),
            new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${rows.length} rows · ${date}${cols.length > show.length ? ` · first ${show.length} of ${cols.length} columns` : ""}`, color: "6B7280", size: 18 })] }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: show.map((c) => cell(c, true)) }), ...rows.slice(0, 1000).map((r) => new TableRow({ children: show.map((c) => cell(String(r[c] ?? ""))) }))] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 200 }, children: [new TextRun({ text: `Made by the Myseed work app, ${date}`, color: "9AA0A6", size: 14 })] }),
          ],
        },
      ],
    });
    return { name: `${base}.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: await Packer.toBuffer(doc) };
  }
  const Pptx = (await import("pptxgenjs")).default;
  const p = new Pptx();
  p.layout = "LAYOUT_WIDE";
  const cover = p.addSlide();
  cover.background = { color: "0B7A3B" };
  cover.addShape(p.ShapeType.ellipse, { x: 9.5, y: -2, w: 6, h: 6, fill: { color: "1A73E8", transparency: 45 }, line: { color: "1A73E8", transparency: 100 } });
  cover.addText(title, { x: 0.7, y: 2.4, w: 9, h: 1.6, fontSize: 36, bold: true, color: "FFFFFF" });
  cover.addText(`${rows.length} rows · ${date}`, { x: 0.7, y: 4.1, w: 9, h: 0.6, fontSize: 18, color: "FFFFFF" });
  const show = cols.slice(0, 7);
  for (let i = 0; i < Math.min(rows.length, 120); i += 12) {
    const s = p.addSlide();
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: "0B7A3B" } });
    s.addText(`${title} (${i + 1}–${Math.min(rows.length, i + 12)})`, { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 20, bold: true, color: "0B7A3B" });
    s.addTable([show.map((c) => ({ text: c, options: { bold: true, color: "FFFFFF", fill: { color: "0B7A3B" } } })), ...rows.slice(i, i + 12).map((r, ri) => show.map((c) => ({ text: String(r[c] ?? "").slice(0, 40), options: { fill: { color: ri % 2 ? "F1F8F3" : "FFFFFF" } } })))], { x: 0.5, y: 1.1, w: 12.3, fontSize: 11, border: { type: "solid", pt: 0.5, color: "D1D5DB" } });
  }
  return { name: `${base}.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", data: (await p.write({ outputType: "nodebuffer" })) as Buffer };
}
