// The operations Claude (MCP) and ChatGPT (actions) can run for a person. Each runs as that person through the same
// functions as the Tools pages, so the same privacy and permission checks apply: their own notes, tasks and
// reminders only, and production records only within what they can already see.

import { get } from "./db";
import { WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import * as d from "./tools-data";
import { checkboxStats } from "@/lib/tools";
import { markdownToBlocks, toMarkdown } from "@/components/app/tools/doc-markdown";
import { bid, type Block, type DocData } from "@/components/app/tools/doc-model";
import { COVER_STYLES, DEFAULT_HF, layoutOf, newCover, type CoverStyle, type DocLayout } from "@/components/app/tools/page-layout";
import { cleanCustomSlide, type Slide } from "@/lib/deck";
import { cleanBook, fromTable, toBook } from "@/lib/sheet-book";

const zones = { type: "object", properties: { left: { type: "string" }, center: { type: "string" }, right: { type: "string" } }, description: "Text for the left, centre and right of the line. Fields: {page}, {pages}, {title}, {author}, {date}, {company}." } as const;
const layoutInput = {
  header_footer: { type: "string", enum: ["company", "custom", "none"], description: "company: the official letterhead (default); custom: the header and footer given here; none." },
  header: zones,
  footer: zones,
  cover: { type: "object", description: "A cover page (no header, footer or number on it).", properties: { title: { type: "string" }, subtitle: { type: "string" }, author: { type: "string" }, organisation: { type: "string" }, date: { type: "string" }, note: { type: "string" }, style: { type: "string", enum: ["classic", "band", "minimal", "framed", "split"] } } },
  contents: { type: "boolean", description: "Put a contents page (linked to the headings, with page numbers) at the start." },
  front_matter_numbers: { type: "string", enum: ["roman", "arabic", "none"], description: "How the pages before the main part are numbered (default roman: i, ii, iii)." },
  main_starts_at_heading: { type: "string", description: "The heading text where the main pages start again at 1 (the pages before it are front matter). With contents and no value, the main pages start after the contents." },
  page_numbers: { type: "boolean", default: true },
} as const;
const slideInput = {
  type: "object",
  required: ["title", "kind"],
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: ["section", "bullets", "text", "quote", "columns", "timeline", "numbers", "table", "closing"] },
    items: { type: "array", items: {}, description: "bullets: strings; timeline: {date, label, done}; numbers: {label, value, unit}" },
    text: { type: "string", description: "text, quote and closing slides" },
    subtitle: { type: "string", description: "section slides" },
    by: { type: "string", description: "who said the quote" },
    left: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } } },
    right: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } } },
    columns: { type: "array", items: { type: "string" }, description: "table slides: the column names" },
    rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "table slides" },
    notes: { type: "string", description: "speaker notes" },
  },
} as const;

const s = (v: unknown, n: number) => (v == null ? "" : String(v).slice(0, n));

export const OPERATIONS = {
  list_user_notes: {
    description: "List the person's own notes in the Myseed Tools hub (newest first), with checklist progress and open tasks. Optionally filter by text.",
    input: { type: "object", properties: { query: { type: "string", description: "Words to look for in titles, text and tags" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }, include_body: { type: "boolean", default: true } } },
  },
  create_note: {
    description: "Create a note in the person's Notes & Checklists. Markdown is kept; lines like '- [ ] task' become tick boxes.",
    input: { type: "object", required: ["title"], properties: { title: { type: "string", maxLength: 200 }, body: { type: "string", maxLength: 200000 }, tags: { type: "array", items: { type: "string" }, maxItems: 20 } } },
  },
  list_reminders: {
    description: "List the person's reminders and dated tasks between two dates (default: the next 30 days, plus anything overdue).",
    input: { type: "object", properties: { from: { type: "string", description: "ISO date, e.g. 2026-11-01" }, to: { type: "string", description: "ISO date" }, include_done: { type: "boolean", default: false } } },
  },
  add_checklist_item: {
    description: "Add a checklist item: a tick box at the end of a note (note_id) or, without note_id, a task in the person's task list. A due date makes it show in the calendar.",
    input: { type: "object", required: ["title"], properties: { title: { type: "string", maxLength: 300 }, note_id: { type: "string" }, due: { type: "string", description: "ISO date" }, description: { type: "string", maxLength: 5000 } } },
  },
  list_files: {
    description: "List the person's saved files in the Tools hub: documents, presentations, sheets or letters (newest first), or their templates.",
    input: { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["document", "presentation", "sheet", "letter", "document_template", "presentation_template", "sheet_template", "letter_template"] }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 25 } } },
  },
  read_document: {
    description: "Read one of the person's documents as Markdown, with its page layout (header and footer, cover, numbering).",
    input: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  create_document: {
    description: "Create a document in the person's Documents (Word-style: opens and saves .docx and PDF). Write the content as Markdown (# headings, lists, | tables |, > quotes, **bold**, *italic*). Optionally set the header and footer, a cover page, a contents page and book-style page numbering (cover without a number, front matter in i, ii, iii, main pages from 1). Can start from one of their document templates.",
    input: { type: "object", required: ["title"], properties: { title: { type: "string", maxLength: 200 }, markdown: { type: "string", maxLength: 400000 }, template_id: { type: "string", description: "A document template's id (list_files kind document_template); its content comes first." }, ...layoutInput } },
  },
  update_document: {
    description: "Change one of the person's documents: replace its content (markdown), add to its end (append_markdown), rename it, or change its layout (same options as create_document).",
    input: { type: "object", required: ["id"], properties: { id: { type: "string" }, title: { type: "string" }, markdown: { type: "string", maxLength: 400000 }, append_markdown: { type: "string", maxLength: 200000 }, ...layoutInput } },
  },
  create_presentation: {
    description: "Create a presentation in the person's Slides (presented full screen; exports to PowerPoint .pptx and PDF). Give the slides in order.",
    input: { type: "object", required: ["title", "slides"], properties: { title: { type: "string" }, subtitle: { type: "string" }, slides: { type: "array", items: slideInput, maxItems: 60 } } },
  },
  read_presentation: {
    description: "Read one of the person's presentations: its slides' titles and text.",
    input: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  create_sheet: {
    description: "Create a workbook in the person's Sheets (a real spreadsheet; formulas starting with = work as in Excel, e.g. =SUM(B2:B9); exports to .xlsx). The first row of each sheet is its column names.",
    input: { type: "object", required: ["title", "sheets"], properties: { title: { type: "string" }, sheets: { type: "array", maxItems: 20, items: { type: "object", required: ["name", "rows"], properties: { name: { type: "string" }, rows: { type: "array", items: { type: "array", items: { type: ["string", "number"] } }, maxItems: 5000 } } } } } },
  },
  read_sheet: {
    description: "Read one of the person's workbooks: each sheet's cells as rows (formulas as written).",
    input: { type: "object", required: ["id"], properties: { id: { type: "string" }, max_rows: { type: "integer", minimum: 1, maximum: 2000, default: 200 } } },
  },
  create_letter: {
    description: "Draft a letter on the company letterhead in the person's Letters (they review, sign and export it as PDF or Word).",
    input: { type: "object", required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string", description: "Paragraphs separated by blank lines" }, recipient_name: { type: "string" }, recipient_title: { type: "string" }, organisation: { type: "string" }, address: { type: "string" }, salutation: { type: "string" }, closing: { type: "string" }, cc: { type: "string" }, enclosures: { type: "string" } } },
  },
  crosscheck_code_or_teacher: {
    description: "Look up production records (lesson parts) by code, title or teacher, within what the person may see. With code plus title or teacher, also says whether they match.",
    input: { type: "object", properties: { code: { type: "string" }, title: { type: "string" }, teacher: { type: "string" } } },
  },
} as const;
export type Operation = keyof typeof OPERATIONS;

const KINDS: Record<string, d.FileKind> = { document: "doc", presentation: "deck", sheet: "sheet", letter: "letter", document_template: "tpl_doc", presentation_template: "tpl_deck", sheet_template: "tpl_sheet", letter_template: "tpl_letter" };
const urlOf = (kind: d.FileKind, id: string) => (kind === "doc" ? `/tools/docs?file=${id}` : kind === "deck" ? `/tools/decks?file=${id}` : kind === "sheet" ? `/tools/sheets?file=${id}` : kind === "letter" ? `/tools/letters?file=${id}` : null);

// The layout options of create_document and update_document onto the document.
function applyLayout(doc: DocData, args: Record<string, unknown>, author: string, title: string): DocData {
  const l: DocLayout = layoutOf(doc.layout);
  const zone = (v: unknown) => ({ left: s((v as Record<string, unknown>)?.left, 300), center: s((v as Record<string, unknown>)?.center, 300), right: s((v as Record<string, unknown>)?.right, 300) });
  if (args.header_footer === "company" || args.header_footer === "none") l.source = args.header_footer;
  if (args.header_footer === "custom" || args.header || args.footer) {
    l.source = "custom";
    l.hf = { ...DEFAULT_HF, ...l.hf, ...(args.header ? { header: zone(args.header) } : {}), ...(args.footer ? { footer: zone(args.footer) } : {}) };
  }
  if (args.cover && typeof args.cover === "object") {
    const c = args.cover as Record<string, unknown>;
    const style = COVER_STYLES.some((x) => x.key === c.style) ? (c.style as CoverStyle) : "classic";
    l.cover = { ...newCover(s(c.title, 200) || title, s(c.author, 200) || author, s(c.organisation, 200), "#16a34a"), style, subtitle: s(c.subtitle, 300), note: s(c.note, 300), ...(c.date ? { date: s(c.date, 40) } : {}) };
    l.numbering.cover = true;
  }
  let blocks: Block[] = doc.blocks;
  if (args.contents === true && !blocks.some((b) => b.type === "toc")) {
    const brk: Block = { id: bid(), type: "pagebreak" };
    blocks = [{ id: bid(), type: "toc", title: "Contents" }, brk, ...blocks];
    if (!args.main_starts_at_heading) l.numbering.mainStartsAt = brk.id;
  }
  if (typeof args.main_starts_at_heading === "string" && args.main_starts_at_heading.trim()) {
    const want = args.main_starts_at_heading.trim().toLowerCase();
    const h = blocks.find((b) => b.type === "heading" && b.text.replace(/\*\*|__/g, "").trim().toLowerCase() === want);
    if (!h) throw new WorkflowError("VALIDATION", `No heading "${args.main_starts_at_heading}" in the document.`);
    l.numbering.mainStartsAt = h.id;
  }
  if (args.front_matter_numbers === "roman" || args.front_matter_numbers === "arabic" || args.front_matter_numbers === "none") l.numbering.front = args.front_matter_numbers;
  const page = doc.page ?? { size: "A4" as const, orientation: "portrait" as const, margins: { top: 20, right: 18, bottom: 20, left: 18 }, header: "", footer: "", pageNumbers: true, watermark: "" };
  if (typeof args.page_numbers === "boolean") page.pageNumbers = args.page_numbers;
  return { ...doc, blocks, layout: l, page };
}

export async function runOperation(user: AppUser, op: string, args: Record<string, unknown>) {
  switch (op as Operation) {
    case "list_user_notes": {
      const q = s(args.query, 200).toLowerCase();
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
      const [notes, tasks] = await Promise.all([d.listNotes(user), d.listTasks(user)]);
      const hits = notes.filter((n) => !q || `${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(q)).slice(0, limit);
      return {
        notes: hits.map((n) => {
          const st = checkboxStats(n.body);
          return {
            id: n.id,
            title: n.title,
            tags: n.tags,
            updated_at: n.updatedAt,
            linked_record: n.link?.label ?? null,
            checklist: st.total ? `${st.done}/${st.total} done` : null,
            open_tasks: tasks.filter((t) => t.noteId === n.id && !t.done).map((t) => ({ id: t.id, title: t.title, due: t.dueAt?.slice(0, 10) ?? null })),
            ...(args.include_body === false ? {} : { body: n.body.slice(0, 20000) }),
          };
        }),
        total: notes.length,
      };
    }
    case "create_note": {
      const title = s(args.title, 200).trim();
      if (!title) throw new WorkflowError("VALIDATION", "title is required.");
      const id = await d.saveNote(user, { title, body: s(args.body, 200000), tags: Array.isArray(args.tags) ? args.tags.map((t) => s(t, 40)) : [] });
      return { id, title, url_path: `/tools/notes?note=${id}` };
    }
    case "list_reminders": {
      const from = args.from ? new Date(s(args.from, 40)) : new Date();
      const to = args.to ? new Date(s(args.to, 40)) : new Date(Date.now() + 30 * 864e5);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new WorkflowError("VALIDATION", "from and to must be dates.");
      const includeDone = !!args.include_done;
      const [rem, tasks] = await Promise.all([d.listReminders(user), d.listTasks(user).catch(() => [])]);
      const inRange = (iso: string, done: boolean) => (includeDone || !done) && (iso <= to.toISOString()) && (iso >= from.toISOString() || (!done && iso < new Date().toISOString()));
      return {
        reminders: rem.filter((r) => inRange(r.at, r.done)).map((r) => ({ id: r.id, title: r.title, at: r.at, all_day: r.allDay, done: r.done, notes: r.notes || null, linked_record: r.link?.label ?? null })),
        tasks: tasks.filter((t) => t.dueAt && inRange(t.dueAt, t.done)).map((t) => ({ id: t.id, title: t.title, due: t.dueAt!.slice(0, 10), done: t.done, overdue: !t.done && t.dueAt! < new Date().toISOString(), linked_record: t.link?.label ?? null })),
      };
    }
    case "add_checklist_item": {
      const title = s(args.title, 300).replace(/[\r\n]+/g, " ").trim();
      if (!title) throw new WorkflowError("VALIDATION", "title is required.");
      if (args.note_id) {
        const n = await get<{ id: string; title: string; body: string; tags: string; pinned: number; link_kind: string | null; link_id: string | null }>("SELECT id, title, body, tags, pinned, link_kind, link_id FROM tool_notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", s(args.note_id, 40), user.id);
        if (!n) throw new WorkflowError("NOT_FOUND", "Note not found.");
        const body = `${n.body.replace(/\s+$/, "")}\n- [ ] ${title}`;
        await d.saveNote(user, { id: n.id, title: n.title, body, tags: JSON.parse(n.tags || "[]"), pinned: !!n.pinned, link: n.link_kind && n.link_id ? { kind: n.link_kind, id: n.link_id } : null });
        if (args.due) await d.saveTask(user, { noteId: n.id, title, dueAt: s(args.due, 40), description: s(args.description, 5000) });
        return { added_to_note: n.id, checklist: checkboxStats(body) };
      }
      const id = await d.saveTask(user, { title, dueAt: args.due ? s(args.due, 40) : null, description: s(args.description, 5000) });
      return { task_id: id };
    }
    case "list_files": {
      const kind = KINDS[s(args.kind, 40)];
      if (!kind) throw new WorkflowError("VALIDATION", "kind must be document, presentation, sheet or letter (or one of their templates).");
      const q = s(args.query, 200).toLowerCase();
      const files = (await d.listFiles(user, kind)).filter((f) => !q || f.title.toLowerCase().includes(q));
      return { files: files.slice(0, Math.min(100, Math.max(1, Number(args.limit) || 25))).map((f) => ({ id: f.id, title: f.title, updated_at: f.updated_at, url_path: urlOf(kind, f.id) })), total: files.length };
    }
    case "read_document": {
      const f = await d.getFile(user, "doc", s(args.id, 60));
      const data = f.data as DocData;
      const l = layoutOf(data.layout);
      return { id: f.id, title: f.title, markdown: toMarkdown(f.title, data.blocks ?? []).slice(0, 200000), layout: { header_footer: l.source, header: l.hf.header, footer: l.hf.footer, cover: l.cover, numbering: l.numbering }, url_path: urlOf("doc", f.id) };
    }
    case "create_document": {
      const title = s(args.title, 200).trim();
      if (!title) throw new WorkflowError("VALIDATION", "title is required.");
      let base: DocData | null = null;
      if (args.template_id) base = (await d.getFile(user, "tpl_doc", s(args.template_id, 60))).data as DocData;
      const blocks = [...(base?.blocks ?? []).map((b) => ({ ...b, id: bid() })), ...(args.markdown ? markdownToBlocks(s(args.markdown, 400000)) : [])];
      const doc: DocData = { template: base ? "imported" : "blank", blocks: blocks.length ? blocks : [{ id: bid(), type: "paragraph", text: "" }], meta: { author: user.name, date: new Date().toISOString().slice(0, 10) }, page: base?.page, layout: base?.layout };
      const out = applyLayout(doc, args, user.name, title);
      const id = await d.saveFile(user, "doc", { title, data: out });
      return { id, title, parts: out.blocks.length, url_path: urlOf("doc", id) };
    }
    case "update_document": {
      const f = await d.getFile(user, "doc", s(args.id, 60));
      const data = f.data as DocData;
      let blocks = data.blocks ?? [];
      if (typeof args.markdown === "string") blocks = markdownToBlocks(s(args.markdown, 400000));
      if (typeof args.append_markdown === "string") blocks = [...blocks, ...markdownToBlocks(s(args.append_markdown, 200000))];
      const title = s(args.title, 200).trim() || f.title;
      const out = applyLayout({ ...data, blocks }, args, user.name, title);
      await d.saveFile(user, "doc", { id: f.id, title, data: out });
      return { id: f.id, title, parts: out.blocks.length, url_path: urlOf("doc", f.id) };
    }
    case "create_presentation": {
      const title = s(args.title, 200).trim();
      if (!title) throw new WorkflowError("VALIDATION", "title is required.");
      const list = Array.isArray(args.slides) ? args.slides.slice(0, 60) : [];
      const slides: Slide[] = list.flatMap((x) => {
        const v = (x ?? {}) as Record<string, unknown>;
        const kind = s(v.kind, 20);
        if (kind === "table") {
          const columns = (Array.isArray(v.columns) ? v.columns : []).map((c) => s(c, 80)).slice(0, 8);
          const rows = (Array.isArray(v.rows) ? v.rows : []).slice(0, 20).map((r) => (Array.isArray(r) ? r : []).slice(0, 8).map((c) => s(c, 200)));
          return [{ key: `custom:${bid()}`, group: "Deck", title: s(v.title, 120) || "Table", body: { kind: "table" as const, columns, rows }, say: "", note: s(v.notes, 1000) || undefined }];
        }
        const body = kind === "bullets" ? { kind, items: v.items } : kind === "section" ? { kind, subtitle: v.subtitle } : kind === "quote" ? { kind, text: v.text, by: v.by } : kind === "columns" ? { kind, left: v.left, right: v.right } : kind === "timeline" || kind === "numbers" ? { kind, items: v.items } : kind === "closing" ? { kind, text: v.text } : { kind: "text", text: v.text };
        const c = cleanCustomSlide({ title: s(v.title, 120), body: body as never, note: s(v.notes, 1000) });
        return c ? [{ ...c, group: "Deck" }] : [];
      });
      if (!slides.length) throw new WorkflowError("VALIDATION", "Give at least one slide.");
      const id = await d.saveFile(user, "deck", { title, data: { title, subtitle: s(args.subtitle, 200), template: "", slides, free: null, mode: "layouts" } });
      return { id, title, slides: slides.length, url_path: urlOf("deck", id) };
    }
    case "read_presentation": {
      const f = await d.getFile(user, "deck", s(args.id, 60));
      const deck = f.data as { title?: string; subtitle?: string; slides?: Slide[]; free?: { pages?: { elements?: { type?: string; text?: string }[] }[] } | null };
      const slides = (deck.slides ?? []).map((x, i) => ({ n: i + 1, title: x.title, kind: x.body.kind, content: x.body, notes: x.note ?? null }));
      const free = (deck.free?.pages ?? []).map((p, i) => ({ n: i + 1, text: (p.elements ?? []).filter((e) => e.type === "text" && e.text).map((e) => String(e.text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) }));
      return { id: f.id, title: f.title, subtitle: deck.subtitle ?? "", slides, designed_slides: free.length ? free : undefined, url_path: urlOf("deck", f.id) };
    }
    case "create_sheet": {
      const title = s(args.title, 200).trim();
      if (!title) throw new WorkflowError("VALIDATION", "title is required.");
      const list = (Array.isArray(args.sheets) ? args.sheets : []).slice(0, 20) as { name?: unknown; rows?: unknown }[];
      if (!list.length) throw new WorkflowError("VALIDATION", "Give at least one sheet.");
      const sheets = list.map((x, i) => {
        const rows = (Array.isArray(x.rows) ? x.rows : []).slice(0, 5000).map((r) => (Array.isArray(r) ? r : []).slice(0, 200).map((c) => s(c, 32000)));
        return fromTable(s(x.name, 31) || `Sheet${i + 1}`, rows[0] ?? [], rows.slice(1)).sheets[0]!;
      });
      const book = cleanBook({ v: 2, sheets, active: 0 });
      const id = await d.saveFile(user, "sheet", { title, data: book });
      return { id, title, sheets: book.sheets.map((x) => ({ name: x.name, rows: x.cells.length })), url_path: urlOf("sheet", id) };
    }
    case "read_sheet": {
      const f = await d.getFile(user, "sheet", s(args.id, 60));
      const book = toBook(f.data);
      const max = Math.min(2000, Math.max(1, Number(args.max_rows) || 200));
      return {
        id: f.id,
        title: f.title,
        sheets: book.sheets.map((x) => {
          const used = x.cells.filter((r) => r.some((c) => String(c ?? "").trim()));
          return { name: x.name, rows: used.slice(0, max).map((r) => { const last = r.reduce((n, c, i) => (String(c ?? "").trim() ? i : n), -1); return r.slice(0, last + 1); }), total_rows: used.length };
        }),
        url_path: urlOf("sheet", f.id),
      };
    }
    case "create_letter": {
      const subject = s(args.subject, 300).trim();
      if (!subject || !s(args.body, 1).trim()) throw new WorkflowError("VALIDATION", "subject and body are required.");
      const data = {
        ref: "",
        date: new Date().toISOString().slice(0, 10),
        recipientName: s(args.recipient_name, 200),
        recipientTitle: s(args.recipient_title, 200),
        organisation: s(args.organisation, 200),
        address: s(args.address, 600),
        subject,
        salutation: s(args.salutation, 200) || "Dear Sir/Madam,",
        body: s(args.body, 30000),
        closing: s(args.closing, 120) || "Sincerely,",
        signName: user.name,
        signTitle: user.title ?? "",
        cc: s(args.cc, 400),
        enclosures: s(args.enclosures, 400),
      };
      const id = await d.saveFile(user, "letter", { title: subject, data });
      return { id, title: subject, url_path: urlOf("letter", id), note: "A draft: the person reviews, adds the reference number and signs it in Letters." };
    }
    case "crosscheck_code_or_teacher": {
      const code = s(args.code, 80).trim();
      const title = s(args.title, 400).trim();
      const teacher = s(args.teacher, 200).trim();
      if (!code && !title && !teacher) throw new WorkflowError("VALIDATION", "Give a code, a title or a teacher.");
      if (!d.seesProduction(user)) throw new WorkflowError("FORBIDDEN", "This person cannot see production records.");
      if (code && (title || teacher)) {
        const r = await d.crossCheck(user, [{ row: 1, code, title, teacher }], false);
        return { result: r.results[0] };
      }
      const hits = await d.searchRecords(user, code || title || teacher);
      return { records: hits };
    }
  }
  throw new WorkflowError("NOT_FOUND", `Unknown operation ${op}.`);
}
