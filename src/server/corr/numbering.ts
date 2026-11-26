// Official reference numbers. A number is taken from a database sequence by one atomic statement (insert the
// sequence or add one to it, returning the value), inside the transaction that issues the letter, so two people
// issuing at the same moment can never get the same number; the reference column is also unique. A number, once
// given, is recorded in corr_numbers for ever and never handed out again, even if its letter is voided.

import { get, run } from "../db";
import { WorkflowError } from "../workflow";
import type { Category, Entity } from "./setup";

const pad = (n: number, w: number) => String(n).padStart(w, "0");

// The calendar or fiscal year of a date (a fiscal year named by the year it ends in, as in "FY2027").
function years(date: Date, fyStartMonth: number) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const fyEnd = m >= fyStartMonth && fyStartMonth > 1 ? y + 1 : y;
  return { yyyy: String(y), yy: String(y).slice(2), fy: `FY${fyEnd}`, mm: pad(m, 2) };
}

const deptCode = (d: string | null | undefined) => (d ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "GEN";

// The sequence a number is counted in: per category, per department within the category, or per entity; reset
// every calendar year, fiscal year, or never.
export function sequenceKey(c: Category, e: Entity, department: string | null, date: Date) {
  const y = years(date, c.config.fyStartMonth ?? 7);
  const base = c.scope === "entity" ? `e:${e.id}` : c.scope === "department" ? `c:${c.id}:d:${deptCode(department)}` : `c:${c.id}`;
  return c.reset === "never" ? base : c.reset === "fiscal" ? `${base}:${y.fy}` : `${base}:${y.yyyy}`;
}

export function formatRef(c: Category, e: Entity, parent: Entity | null, department: string | null, date: Date, value: number) {
  const y = years(date, c.config.fyStartMonth ?? 7);
  return c.pattern
    .replaceAll("{ENTITY}", e.code)
    .replaceAll("{PARENT}", parent?.code ?? e.code)
    .replaceAll("{DEPT}", deptCode(department))
    .replaceAll("{CAT}", c.code)
    .replaceAll("{YYYY}", y.yyyy)
    .replaceAll("{YY}", y.yy)
    .replaceAll("{FY}", y.fy)
    .replaceAll("{MM}", y.mm)
    .replaceAll("{SEQ}", pad(value, c.padding));
}

// What the next number would look like (for the setup screen); it reserves nothing.
export async function previewRef(c: Category, e: Entity, parent: Entity | null, department: string | null, date = new Date()) {
  const key = sequenceKey(c, e, department, date);
  const next = Number((await get<{ next_value: number }>("SELECT next_value FROM corr_sequences WHERE key = ?", key))?.next_value ?? 1);
  return formatRef(c, e, parent, department, date, next);
}

// Takes the next number. Must run inside the issuing transaction (the caller holds the document's lock).
export async function allocateRef(input: { category: Category; entity: Entity; parent: Entity | null; department: string | null; documentId: string; userId: string; date?: Date }) {
  const date = input.date ?? new Date();
  const key = sequenceKey(input.category, input.entity, input.department, date);
  const now = date.toISOString();
  // A changed pattern could produce a number that already exists: such values are skipped (and recorded), never reused.
  for (let tries = 0; tries < 1000; tries++) {
    const row = await get<{ v: number }>(
      "INSERT INTO corr_sequences (key, next_value, updated_at) VALUES (?, 2, ?) ON CONFLICT (key) DO UPDATE SET next_value = corr_sequences.next_value + 1, updated_at = excluded.updated_at RETURNING next_value - 1 AS v",
      key,
      now,
    );
    const value = Number(row!.v);
    const ref = formatRef(input.category, input.entity, input.parent, input.department, date, value);
    if (await get("SELECT 1 AS x FROM corr_numbers WHERE ref_number = ?", ref)) continue;
    await run("INSERT INTO corr_numbers (ref_number, sequence_key, value, document_id, state, allocated_by, allocated_at) VALUES (?, ?, ?, ?, 'issued', ?, ?)", ref, key, value, input.documentId, input.userId, now);
    return { ref, key, value };
  }
  throw new WorkflowError("INVALID_STATE", "No free reference number could be found for this pattern. Check the category's numbering.");
}
