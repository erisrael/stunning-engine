// The import helper (Phase 23): before anything is saved, it fixes what it safely can in the uploaded rows
// (spaces, dates in other formats or as Excel numbers, numbers with commas or units, yes/no words, emails, links,
// values close to an allowed one, list separators), drops empty and repeated rows, and lists what it changed and a
// checklist of what is still wrong. The person then edits the remaining cells in a table and checks again. With
// the AI on, "Ask AI" suggests values for the cells still in error (shown to accept, never saved by itself).
// No rules are bent: the same dry run as the wizard checks the result.

import { askAnalysis } from "./assistant-ai";
import { aiAvailable } from "./assistant-ai";
import { canUseTemplate, loadLookups, runImport, TEMPLATES, type ImportMode, type ParsedSheet, type TemplateField, type TemplateKey } from "./importer";
import { WorkflowError } from "./workflow";
import type { AppUser } from "./users";

type Viewer = AppUser & { activeRole: string };
export type CellChange = { row: number; field: string; label: string; from: string; to: string; why: string };
export type CheckItem = { key: string; label: string; ok: boolean; detail: string };

import { closestOption, normalizeDate, isValidFileLocationOrUrl } from "@/lib/import-fix";
const pad = (n: number) => String(n).padStart(2, "0");

function fixValue(f: TemplateField, raw: string): { value: string; why: string } | null {
  let v = raw.replace(/[​-‍﻿]/g, "").replace(/ /g, " ");
  const why: string[] = [];
  if (v !== raw) why.push("hidden characters removed");
  const t = v.trim().replace(/\s{2,}/g, " ");
  if (t !== v) why.push("spaces tidied");
  v = t;
  if (!v) return v !== raw ? { value: v, why: why.join(", ") } : null;
  switch (f.type) {
    case "date": {
      const d = normalizeDate(v);
      if (d && d !== v) (v = d), why.push("date written as YYYY-MM-DD");
      break;
    }
    case "datetime": {
      const m = v.match(/^(.+?)[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
      const d = normalizeDate(m ? m[1]! : v);
      if (d) {
        let h = m ? +m[2]! : null;
        if (h !== null && m?.[4]) h = (h % 12) + (m[4].toLowerCase() === "pm" ? 12 : 0);
        const out = h !== null ? `${d} ${pad(h)}:${m![3]}` : d;
        if (out !== v) (v = out), why.push("written as YYYY-MM-DD HH:mm");
      }
      break;
    }
    case "int":
    case "number": {
      const n = v.replace(/(etb|birr|br|hrs?|hours?|%|\s)/gi, "").replace(/,(?=\d{3}\b)/g, "");
      const out = f.type === "int" && /^\d+\.0+$/.test(n) ? n.split(".")[0]! : n;
      if (out !== v && !Number.isNaN(Number(out))) (v = out), why.push("number cleaned");
      break;
    }
    case "bool": {
      const l = v.toLowerCase();
      const out = ["yes", "y", "true", "1", "✓", "x", "done", "ok", "አዎ"].includes(l) ? "yes" : ["no", "n", "false", "0", "-", "አይ", "አይደለም"].includes(l) ? "no" : v;
      if (out !== v) (v = out), why.push("yes or no");
      break;
    }
    case "email": {
      const out = v.replace(/^mailto:/i, "").replace(/\s+/g, "").toLowerCase();
      if (out !== v) (v = out), why.push("email cleaned");
      break;
    }
    case "url": {
      if (!isValidFileLocationOrUrl(v) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) (v = `https://${v}`), why.push("https:// added");
      break;
    }
    case "enum": {
      const opts = f.options?.() ?? [];
      if (opts.length && !opts.some((o) => o.toLowerCase() === v.toLowerCase())) {
        const c = closestOption(v, opts);
        if (c) (why.push(`closest allowed value for "${v}"`), (v = c));
      }
      break;
    }
    case "list": {
      const opts = f.options?.() ?? [];
      const parts = v.split(/[;,|/\n]+/).map((x) => x.trim()).filter(Boolean);
      const fixed = parts.map((p) => (opts.length && !opts.some((o) => o.toLowerCase() === p.toLowerCase()) ? (closestOption(p, opts) ?? p) : p));
      const out = fixed.join("; ");
      if (out !== v) (v = out), why.push("list tidied");
      break;
    }
  }
  return v !== raw ? { value: v, why: why.join(", ") || "tidied" } : null;
}

type Input = { template: TemplateKey; mode: ImportMode; sheet: ParsedSheet; mapping: Record<string, string>; fileName: string };

// Fixes, a dry run of the result, and the checklist.
export async function assistImport(user: Viewer, input: Input) {
  const template = TEMPLATES[input.template];
  if (!template) throw new WorkflowError("VALIDATION", "Unknown template.");
  if (!canUseTemplate(user, template)) throw new WorkflowError("FORBIDDEN", `You do not have permission to run the ${template.title} import.`);
  await loadLookups();
  const before = await runImport(user, { ...input, dryRun: true });
  const changes: CellChange[] = [];
  const col: Record<string, number> = {};
  for (const [field, header] of Object.entries(input.mapping)) {
    const i = input.sheet.headers.indexOf(header);
    if (i >= 0) col[field] = i;
  }
  // Empty rows out; exact repeats out (the first stays).
  const seen = new Set<string>();
  let empty = 0;
  let repeated = 0;
  const kept: string[][] = [];
  for (const r of input.sheet.rows) {
    if (!r.some((c) => String(c ?? "").trim())) {
      empty++;
      continue;
    }
    const k = JSON.stringify(r.map((c) => String(c ?? "").trim().toLowerCase()));
    if (seen.has(k)) {
      repeated++;
      continue;
    }
    seen.add(k);
    kept.push([...r]);
  }
  for (const [ri, r] of kept.entries())
    for (const f of template.fields) {
      const i = col[f.key];
      if (i === undefined) continue;
      const fx = fixValue(f, String(r[i] ?? ""));
      if (fx) {
        changes.push({ row: ri + 2, field: f.key, label: f.label, from: String(r[i] ?? ""), to: fx.value, why: fx.why });
        r[i] = fx.value;
      }
    }
  const sheet: ParsedSheet = { ...input.sheet, rows: kept };
  const after = await runImport(user, { ...input, sheet, dryRun: true });
  const errs = after.outcomes.filter((o) => o.action === "error");
  const errorText = errs.flatMap((o) => o.errors).join(" ");
  const required = template.fields.filter((f) => f.required === true || f.required === input.mode || (f.required === "create" && input.mode === "upsert"));
  const checklist: CheckItem[] = [
    { key: "mapped", label: "Required columns are matched", ok: required.every((f) => input.mapping[f.key]), detail: required.filter((f) => !input.mapping[f.key]).map((f) => f.label).join(", ") || required.map((f) => f.label).join(", ") },
    { key: "empty", label: "No empty rows", ok: true, detail: empty ? `${empty} empty rows removed` : "None found" },
    { key: "repeats", label: "No repeated rows", ok: true, detail: repeated ? `${repeated} repeated rows removed (the first kept)` : "None found" },
    { key: "dates", label: "Dates are YYYY-MM-DD", ok: !/must be a date|must be YYYY/.test(errorText), detail: `${changes.filter((c) => /date|YYYY/.test(c.why)).length} rewritten` },
    { key: "values", label: "Values are from the allowed lists", ok: !/is not one of|unknown values/.test(errorText), detail: `${changes.filter((c) => /closest|list/.test(c.why)).length} matched to the closest allowed value` },
    { key: "numbers", label: "Numbers, yes/no and emails are readable", ok: !/whole number|positive number|yes or no|valid email|https/.test(errorText), detail: `${changes.filter((c) => /number|yes or no|email|https/.test(c.why)).length} cleaned` },
    { key: "required", label: "Required cells are filled", ok: !/is required/.test(errorText), detail: `${errs.filter((o) => o.errors.some((e) => /is required/.test(e))).length} rows miss a required value` },
    { key: "rows", label: "Every row can be imported", ok: !errs.length, detail: errs.length ? `${errs.length} rows still have errors: fix them in the table below` : `${after.counts.create} to create, ${after.counts.update} to update` },
  ];
  return { sheet, changes: changes.slice(0, 2000), checklist, before: before.counts, after, ai: await aiAvailable(user) };
}

// The AI's suggestions for cells still in error: [{ row, field, value }], checked against the template's fields.
export async function aiFixImport(user: Viewer, input: Input) {
  const template = TEMPLATES[input.template];
  if (!template || !canUseTemplate(user, template)) throw new WorkflowError("FORBIDDEN", "You cannot run this import.");
  await loadLookups();
  const res = await runImport(user, { ...input, dryRun: true });
  const errs = res.outcomes.filter((o) => o.action === "error").slice(0, 60);
  if (!errs.length) return { suggestions: [] as { row: number; field: string; value: string; label: string; from: string }[] };
  const col: Record<string, number> = {};
  for (const [field, header] of Object.entries(input.mapping)) {
    const i = input.sheet.headers.indexOf(header);
    if (i >= 0) col[field] = i;
  }
  const fields = template.fields.filter((f) => col[f.key] !== undefined).map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, allowed: (f.options?.() ?? []).slice(0, 80), description: f.description }));
  const rows = errs.map((o) => ({ row: o.row, errors: o.errors, values: Object.fromEntries(fields.map((f) => [f.key, String(input.sheet.rows[o.row - 2]?.[col[f.key]!] ?? "")])) }));
  const text = await askAnalysis(user, {
    task: `Fix rows of a spreadsheet import (${template.title}). For each row with errors, suggest a corrected value only for the cells named in its errors, using the field rules and allowed values. Never invent people, codes or numbers that are not implied by the row; leave a cell out when unsure. Answer with JSON only: [{"row": <row number>, "field": "<field key>", "value": "<new value>"}].`,
    data: { fields, rows },
  });
  let parsed: { row: number; field: string; value: string }[] = [];
  try {
    const m = (text ?? "").match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : [];
  } catch {
    parsed = [];
  }
  const out = parsed
    .filter((s) => s && typeof s.row === "number" && typeof s.field === "string" && typeof s.value === "string" && col[s.field] !== undefined && errs.some((e) => e.row === s.row))
    .slice(0, 300)
    .map((s) => ({ ...s, label: template.fields.find((f) => f.key === s.field)!.label, from: String(input.sheet.rows[s.row - 2]?.[col[s.field]!] ?? "") }));
  return { suggestions: out };
}
