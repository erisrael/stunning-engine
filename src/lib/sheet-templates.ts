// Ready workbooks for Sheets Studio, with working formulas and styles.

import { blankSheet, type BookData, type BookSheet, type CellStyle } from "./sheet-book";

type Def = { name: string; rows: (string | number)[][]; head?: number[]; bold?: number[]; fmt?: Record<string, CellStyle>; cols?: Record<number, number>; freeze?: number; merges?: string[] };

function sheet(d: Def): BookSheet {
  const width = Math.max(8, ...d.rows.map((r) => r.length));
  const cells = Array.from({ length: Math.max(40, d.rows.length + 10) }, (_, r) => Array.from({ length: width }, (_, c) => String(d.rows[r]?.[c] ?? "")));
  const styles: Record<string, CellStyle> = {};
  for (const r of d.head ?? []) for (let c = 0; c < (d.rows[r]?.length ?? 0); c++) styles[`${r}:${c}`] = { b: true, fill: "#0f172a", color: "#ffffff" };
  for (const r of d.bold ?? []) for (let c = 0; c < (d.rows[r]?.length ?? 0); c++) styles[`${r}:${c}`] = { ...(styles[`${r}:${c}`] ?? {}), b: true, border: "thick-bottom" };
  for (const [k, v] of Object.entries(d.fmt ?? {})) {
    // "r:c" or "r1-r2:c" ranges of rows.
    const [rows, c] = k.split(":");
    const [a, b = a] = rows!.split("-").map(Number);
    for (let r = a!; r <= b!; r++) styles[`${r}:${c}`] = { ...(styles[`${r}:${c}`] ?? {}), ...v };
  }
  return { ...blankSheet(d.name), cells, styles, cols: Object.fromEntries(Object.entries(d.cols ?? {}).map(([k, v]) => [k, v])), freeze: { rows: d.freeze ?? 0, cols: 0 }, merges: d.merges ?? [] };
}
const ETB: CellStyle = { fmt: { kind: "number", decimals: 2 } };
const PCT: CellStyle = { fmt: { kind: "percent", decimals: 1 } };
const DATE: CellStyle = { fmt: { kind: "date" } };
const book = (...s: BookSheet[]): BookData => ({ v: 2, sheets: s, active: 0 });

export const SHEET_TEMPLATES: { key: string; label: string; hint: string; book: () => BookData }[] = [
  {
    key: "budget",
    label: "Monthly budget",
    hint: "Planned against actual, with differences and totals",
    book: () =>
      book(
        sheet({
          name: "Budget",
          rows: [
            ["Category", "Planned (ETB)", "Actual (ETB)", "Difference", "% used"],
            ["Salaries", 250000, 248000, "=B2-C2", "=IFERROR(C2/B2,0)"],
            ["Rent", 60000, 60000, "=B3-C3", "=IFERROR(C3/B3,0)"],
            ["Production", 90000, 104500, "=B4-C4", "=IFERROR(C4/B4,0)"],
            ["Marketing", 40000, 31200, "=B5-C5", "=IFERROR(C5/B5,0)"],
            ["Internet and phones", 12000, 12850, "=B6-C6", "=IFERROR(C6/B6,0)"],
            ["Transport", 15000, 9800, "=B7-C7", "=IFERROR(C7/B7,0)"],
            ["Other", 10000, 6400, "=B8-C8", "=IFERROR(C8/B8,0)"],
            ["Total", "=SUM(B2:B8)", "=SUM(C2:C8)", "=B9-C9", "=IFERROR(C9/B9,0)"],
          ],
          head: [0],
          bold: [8],
          fmt: { "1-8:1": ETB, "1-8:2": ETB, "1-8:3": ETB, "1-8:4": PCT },
          cols: { 0: 180, 1: 120, 2: 120, 3: 110, 4: 80 },
          freeze: 1,
        }),
      ),
  },
  {
    key: "invoice",
    label: "Invoice",
    hint: "Items, quantity, price, VAT 15% and the total",
    book: () =>
      book(
        sheet({
          name: "Invoice",
          rows: [
            ["INVOICE"],
            ["Invoice number", "INV-0001", "", "Date", "=TODAY()"],
            ["Bill to", "", "", "Due", "=E2+30"],
            [],
            ["Item", "Description", "Quantity", "Unit price", "Amount"],
            ["1", "", 1, 0, "=C6*D6"],
            ["2", "", 1, 0, "=C7*D7"],
            ["3", "", 1, 0, "=C8*D8"],
            ["4", "", 1, 0, "=C9*D9"],
            ["5", "", 1, 0, "=C10*D10"],
            ["", "", "", "Subtotal", "=SUM(E6:E10)"],
            ["", "", "", "VAT 15%", "=ROUND(E11*0.15,2)"],
            ["", "", "", "Total (ETB)", "=E11+E12"],
          ],
          head: [4],
          bold: [12],
          fmt: { "0:0": { b: true, size: 20, color: "#16a34a" }, "1:4": DATE, "2:4": DATE, "5-12:3": ETB, "5-12:4": ETB },
          cols: { 0: 70, 1: 260, 2: 80, 3: 110, 4: 120 },
        }),
      ),
  },
  {
    key: "sales",
    label: "Sales tracker",
    hint: "Deals by month and owner, with SUMIFS and a summary",
    book: () =>
      book(
        sheet({
          name: "Deals",
          rows: [
            ["Date", "Customer", "Owner", "Stage", "Amount (ETB)"],
            ["2026-11-03", "Bole Academy", "Hana", "Won", 45000],
            ["2026-11-08", "Sunshine School", "Dawit", "Proposal", 30000],
            ["2026-11-12", "Hope Primary", "Hana", "Won", 18000],
            ["2026-11-19", "Unity College", "Selam", "Lost", 52000],
            ["2026-11-24", "Nile School", "Dawit", "Won", 26000],
          ],
          head: [0],
          fmt: { "1-5:0": DATE, "1-5:4": ETB },
          cols: { 0: 100, 1: 180, 2: 100, 3: 100, 4: 120 },
          freeze: 1,
        }),
        sheet({
          name: "Summary",
          rows: [
            ["Owner", "Won (ETB)", "Deals", "Win rate"],
            ["Hana", '=SUMIFS(Deals!E:E,Deals!C:C,A2,Deals!D:D,"Won")', "=COUNTIF(Deals!C:C,A2)", '=IFERROR(COUNTIFS(Deals!C:C,A2,Deals!D:D,"Won")/C2,0)'],
            ["Dawit", '=SUMIFS(Deals!E:E,Deals!C:C,A3,Deals!D:D,"Won")', "=COUNTIF(Deals!C:C,A3)", '=IFERROR(COUNTIFS(Deals!C:C,A3,Deals!D:D,"Won")/C3,0)'],
            ["Selam", '=SUMIFS(Deals!E:E,Deals!C:C,A4,Deals!D:D,"Won")', "=COUNTIF(Deals!C:C,A4)", '=IFERROR(COUNTIFS(Deals!C:C,A4,Deals!D:D,"Won")/C4,0)'],
            ["Total", "=SUM(B2:B4)", "=SUM(C2:C4)", ""],
          ],
          head: [0],
          bold: [4],
          fmt: { "1-4:1": ETB, "1-3:3": PCT },
          cols: { 0: 120, 1: 130, 2: 80, 3: 90 },
        }),
      ),
  },
  {
    key: "attendance",
    label: "Attendance register",
    hint: "Days present and absent per person, with a rate",
    book: () =>
      book(
        sheet({
          name: "Attendance",
          rows: [
            ["Name", "Mon", "Tue", "Wed", "Thu", "Fri", "Present", "Absent", "Rate"],
            ["Abebe", "P", "P", "A", "P", "P", '=COUNTIF(B2:F2,"P")', '=COUNTIF(B2:F2,"A")', "=G2/5"],
            ["Meron", "P", "P", "P", "P", "P", '=COUNTIF(B3:F3,"P")', '=COUNTIF(B3:F3,"A")', "=G3/5"],
            ["Yonas", "A", "P", "P", "L", "P", '=COUNTIF(B4:F4,"P")', '=COUNTIF(B4:F4,"A")', "=G4/5"],
          ],
          head: [0],
          fmt: { "1-3:8": PCT },
          cols: { 0: 160 },
          freeze: 1,
        }),
      ),
  },
  {
    key: "inventory",
    label: "Inventory",
    hint: "Stock on hand, value and what to reorder",
    book: () =>
      book(
        sheet({
          name: "Stock",
          rows: [
            ["Item", "On hand", "Reorder at", "Unit cost", "Value", "Reorder?"],
            ["Camera batteries", 14, 10, 1200, "=B2*D2", '=IF(B2<=C2,"Reorder","")'],
            ["SD cards 128 GB", 6, 8, 950, "=B3*D3", '=IF(B3<=C3,"Reorder","")'],
            ["Lapel microphones", 9, 4, 2800, "=B4*D4", '=IF(B4<=C4,"Reorder","")'],
            ["Total", "=SUM(B2:B4)", "", "", "=SUM(E2:E4)", '=COUNTIF(F2:F4,"Reorder")&" to reorder"'],
          ],
          head: [0],
          bold: [4],
          fmt: { "1-4:3": ETB, "1-4:4": ETB },
          cols: { 0: 180, 5: 110 },
          freeze: 1,
        }),
      ),
  },
  {
    key: "loan",
    label: "Loan calculator",
    hint: "Monthly payment and total interest (PMT)",
    book: () =>
      book(
        sheet({
          name: "Loan",
          rows: [
            ["Loan amount (ETB)", 500000],
            ["Interest per year", 0.13],
            ["Years", 5],
            ["Monthly payment", "=-PMT(B2/12,B3*12,B1)"],
            ["Total paid", "=B4*B3*12"],
            ["Total interest", "=B5-B1"],
          ],
          bold: [3],
          fmt: { "0:1": ETB, "1:1": PCT, "3-5:1": ETB, "0-5:0": { b: true } },
          cols: { 0: 180, 1: 140 },
        }),
      ),
  },
  {
    key: "payroll",
    label: "Payroll summary",
    hint: "Gross, pension 7%, income tax by band (check the bands against the current law) and net pay",
    book: () =>
      book(
        sheet({
          name: "Payroll",
          rows: [
            ["Name", "Gross (ETB)", "Pension 7%", "Taxable", "Income tax", "Net pay"],
            ["Employee 1", 12000, "=B2*0.07", "=B2", "=IF(D2<=2000,0,IF(D2<=4000,D2*0.15-300,IF(D2<=7000,D2*0.2-500,IF(D2<=10000,D2*0.25-850,IF(D2<=14000,D2*0.3-1350,D2*0.35-2050)))))", "=B2-C2-E2"],
            ["Employee 2", 8500, "=B3*0.07", "=B3", "=IF(D3<=2000,0,IF(D3<=4000,D3*0.15-300,IF(D3<=7000,D3*0.2-500,IF(D3<=10000,D3*0.25-850,IF(D3<=14000,D3*0.3-1350,D3*0.35-2050)))))", "=B3-C3-E3"],
            ["Total", "=SUM(B2:B3)", "=SUM(C2:C3)", "", "=SUM(E2:E3)", "=SUM(F2:F3)"],
          ],
          head: [0],
          bold: [3],
          fmt: { "1-3:1": ETB, "1-3:2": ETB, "1-3:3": ETB, "1-3:4": ETB, "1-3:5": ETB },
          cols: { 0: 160, 1: 110, 2: 100, 3: 100, 4: 100, 5: 110 },
          freeze: 1,
        }),
      ),
  },
];
