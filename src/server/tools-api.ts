// The operations Claude (MCP) and ChatGPT (actions) can run for a person. Each runs as that person through the same
// functions as the Tools pages, so the same privacy and permission checks apply: their own notes, tasks and
// reminders only, and production records only within what they can already see.

import { get } from "./db";
import { WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import * as d from "./tools-data";
import { checkboxStats } from "@/lib/tools";

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
  crosscheck_code_or_teacher: {
    description: "Look up production records (lesson parts) by code, title or teacher, within what the person may see. With code plus title or teacher, also says whether they match.",
    input: { type: "object", properties: { code: { type: "string" }, title: { type: "string" }, teacher: { type: "string" } } },
  },
} as const;
export type Operation = keyof typeof OPERATIONS;

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
