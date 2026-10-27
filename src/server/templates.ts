import { loadLookups, TEMPLATES, type TemplateDef, type TemplateKey } from "./importer";
import { getSettings } from "./settings";
import { csvEscape } from "./exporter";

export function templateCsv(key: TemplateKey) {
  const t = TEMPLATES[key];
  const lines = [t.fields.map((f) => f.key).join(",")];
  for (const ex of t.examples()) lines.push(t.fields.map((f) => csvEscape(ex[f.key] ?? "")).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const GREEN = "FF074924";
const IVORY = "FFF8FAF4";

export async function templateXlsx(key: TemplateKey): Promise<Buffer> {
  await loadLookups();
  const ExcelJS = (await import("exceljs")).default;
  const t: TemplateDef = TEMPLATES[key];
  const s = await getSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = s.workspace.name;
  wb.created = new Date();

  const sheet = wb.addWorksheet("Template", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = t.fields.map((f) => ({ header: f.key, key: f.key, width: Math.min(48, Math.max(14, f.label.length + 6)) }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  t.fields.forEach((f, i) => {
    const cell = header.getCell(i + 1);
    const req = f.required === true ? "Required" : f.required ? `Required in ${f.required} mode` : "Optional";
    cell.note = `${f.label}\n${req}\n${f.description}`;
  });
  for (const ex of t.examples()) sheet.addRow(t.fields.map((f) => ex[f.key] ?? ""));
  for (let i = 2; i <= t.examples().length + 1; i++) {
    const r = sheet.getRow(i);
    r.font = { italic: true, color: { argb: "FF4B5563" } };
  }

  // Allowed values live on a Lists sheet and drive dropdown validation on 500 rows.
  const lists = wb.addWorksheet("Lists");
  let col = 1;
  t.fields.forEach((f, i) => {
    const opts = f.options?.() ?? [];
    if (!opts.length) return;
    lists.getCell(1, col).value = f.key;
    lists.getCell(1, col).font = { bold: true };
    opts.forEach((o, r) => (lists.getCell(r + 2, col).value = o));
    lists.getColumn(col).width = Math.max(14, f.key.length + 4);
    if (f.type === "enum" || f.type === "bool") {
      const letter = lists.getColumn(col).letter;
      const range = `Lists!$${letter}$2:$${letter}$${opts.length + 1}`;
      for (let r = 2; r <= 501; r++) {
        sheet.getCell(r, i + 1).dataValidation = {
          type: "list",
          allowBlank: f.required !== true,
          formulae: [range],
          showErrorMessage: true,
          errorTitle: f.label,
          error: `Choose one of the allowed values for ${f.label}.`,
        };
      }
    }
    col++;
  });

  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Column", key: "key", width: 26 },
    { header: "Label", key: "label", width: 30 },
    { header: "Required", key: "req", width: 20 },
    { header: "Type", key: "type", width: 12 },
    { header: "Description", key: "desc", width: 70 },
    { header: "Allowed values", key: "opts", width: 50 },
  ];
  info.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  info.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  for (const f of t.fields)
    info.addRow({
      key: f.key,
      label: f.label,
      req: f.required === true ? "Required" : f.required ? `In ${f.required} mode` : "Optional",
      type: f.type,
      desc: f.description,
      opts: (f.options?.() ?? []).join(", "),
    });
  info.addRow({});
  const title = info.addRow({ key: t.title });
  title.font = { bold: true, size: 13 };
  info.addRow({ key: t.summary });
  info.addRow({ key: `Supported modes: ${t.modes.join(", ")}. Timezone: ${s.workspace.timezone}.` });
  for (const n of t.notes) info.addRow({ key: `- ${n}` });
  info.addRow({ key: "Delete the example rows before importing. Header names must stay unchanged, or map them in the import wizard." });
  info.eachRow((r, n) => {
    if (n > 1) r.alignment = { wrapText: true, vertical: "top" };
  });
  info.properties.tabColor = { argb: IVORY };
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
