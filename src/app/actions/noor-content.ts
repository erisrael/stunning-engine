"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as C from "@/server/noor-content";

// Noor's academic content (Legacy CMS, Content): read, report, and changes through Noor's own forms.
const read = { revalidate: false } as const;
export const contentOverviewAction = async () => wrap(async () => C.contentOverview(await requireViewer()), read);
export const contentSubjectAction = async (id: string, refresh = false) => wrap(async () => C.contentSubject(await requireViewer(), id, { refresh }), read);
export const contentJobAction = async (id: string) => wrap(async () => C.contentJob(await requireViewer(), id), read);
export const startContentJobAction = async (input: C.ContentJobInput) => wrap(async () => C.startContentJob(await requireViewer(), input), read);
export const cancelContentJobAction = async (id: string) => wrap(async () => C.cancelContentJob(await requireViewer(), id), read);
export const parseQuestionsAction = async (text: string) => wrap(async () => (await requireViewer(), C.parseAiken(text)), read);

// A spreadsheet or CSV of questions or lessons: its first sheet's rows, read here.
export const parseImportFileAction = async (form: FormData) =>
  wrap(async () => {
    await requireViewer();
    const file = form.get("file");
    const kind = form.get("kind") === "lessons" ? "lessons" : "questions";
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) throw new Error("Choose a CSV or Excel file of at most 5 MB.");
    const rows = await sheetRows(file);
    return kind === "lessons" ? { kind, ...C.parseLessonRows(rows) } : { kind, ...C.parseQuestionRows(rows) };
  }, read);

async function sheetRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.csv$|text\/csv|text\/plain/i.test(`${file.name} ${file.type}`)) return csvRows(buf.toString("utf8").replace(/^\uFEFF/, ""));
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const head: string[] = [];
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v));
    if (n === 1) vals.forEach((v, i) => (head[i] = String(v ?? "").trim()));
    else out.push(Object.fromEntries(head.map((h, i) => [h, vals[i] ?? ""])));
  });
  return out;
}
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const sep = (text.split("\n")[0]?.match(/;/g)?.length ?? 0) > (text.split("\n")[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...rest] = rows;
  if (!head) return [];
  return rest.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}
