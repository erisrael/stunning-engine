// Noor's Filament forms (create, edit and its own pages such as Send SMS or Settings), read from the page and
// submitted through Livewire exactly as Noor's own page submits them: the signed component snapshot stays
// server-owned, only fields present in that snapshot are changed, and Noor's validation errors come back per field.

export type NoorFieldKind = "text" | "email" | "tel" | "url" | "number" | "password" | "date" | "datetime" | "time" | "color" | "textarea" | "select" | "multiselect" | "toggle" | "file" | "other";
export type NoorOption = { value: string; label: string };
export type NoorField = {
  name: string;
  // Where Livewire keeps it: data.<name> for Filament form fields, or a property of the page itself (Send SMS's message).
  path: string;
  label: string;
  kind: NoorFieldKind;
  required: boolean;
  options: NoorOption[];
  value: unknown;
  editable: boolean;
  maxLength: number | null;
  placeholder: string | null;
};
// tabs: a page that shows other fields per tab (Send SMS: students, parents, typed numbers); tab is the open one.
export type NoorForm = { title: string | null; submit: string; submitLabel: string; fields: NoorField[]; tabs?: NoorOption[]; tab?: string | null };
export type ParsedNoorForm = NoorForm & { snapshot: string; csrf: string; uri: string };

export class NoorFormError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string[]> = {}) {
    super(message);
  }
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const plain = (s: string) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const humanize = (s: string) => s.replace(/_id$/, "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
// Methods a form may be submitted with; nothing that deletes, signs out or reaches Livewire internals.
const SAFE_METHOD = /^(?!__|_|delete|forceDelete|logout|destroy)[A-Za-z]\w{0,40}$/;

// Livewire 3 keeps arrays and objects as [value, {s: "arr"}] pairs.
export function unwrap(v: unknown): unknown {
  if (Array.isArray(v)) {
    if (v.length === 2 && v[1] && typeof v[1] === "object" && !Array.isArray(v[1]) && "s" in (v[1] as object)) return unwrap(v[0]);
    return v.map(unwrap);
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)]));
  return v;
}

// Filament's own components on every page (the notifications bell, search, menus), not a page's form. Matched on the
// component's own name, so a page such as send-bulk-notification is not skipped.
const SKIP_COMPONENT = /^filament\.livewire\.|(?:^|[.-])(?:database-)?notifications$|global-search|topbar|sidebar|user-menu|tenant-menu/i;

type Snap = { at: number; raw: string; name: string; data: Record<string, unknown>; root: Record<string, unknown> };
function parseSnapshot(raw: string, at = 0): Snap | null {
  try {
    const json = JSON.parse(raw);
    const root = unwrap(json.data) as Record<string, unknown> | null;
    if (!root || typeof root !== "object" || Array.isArray(root)) return null;
    // Filament keeps form fields under data (null on a page whose form starts empty, such as Send push notification).
    const data = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? (root.data as Record<string, unknown>) : {};
    return { at, raw, name: String(json.memo?.name ?? ""), data, root };
  } catch {
    return null;
  }
}

function formSnapshot(html: string) {
  const submitAt = html.search(/wire:submit(?:\.prevent)?="/);
  const found = [...html.matchAll(/wire:snapshot="([^"]+)"/g)]
    .map((m) => parseSnapshot(decode(m[1]), m.index ?? 0))
    .filter((x): x is Snap => !!x && ("data" in x.root || Object.keys(x.data).length > 0) && !SKIP_COMPONENT.test(x.name));
  if (!found.length) return null;
  // The component around the form: the last one that opens before the form's submit.
  return (submitAt >= 0 ? found.filter((f) => f.at < submitAt).at(-1) : null) ?? found[0];
}

// Page properties Livewire and Filament keep for themselves: never offered as fields.
const INTERNAL = /^(data|activeTab|mounted\w*|componentFileAttachments|savedDataHash|paginators|table\w*|isTable\w*|defaultAction\w*|activeRelationManager|record|previousUrl)$/;

function optionsIn(selectHtml: string): NoorOption[] {
  return [...selectHtml.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({ value: decode(m[1].match(/value="([^"]*)"/)?.[1] ?? plain(m[2])), label: plain(m[2]) }))
    .filter((o) => o.value !== "");
}

function jsOptions(context: string): NoorOption[] {
  const m = decode(context).match(/options:\s*(\[[\s\S]*?\])\s*,\s*\w+:/);
  if (!m) return [];
  try {
    const list = JSON.parse(m[1]) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((o) => (o && typeof o === "object" && "value" in o ? [{ value: String((o as { value: unknown }).value), label: String((o as { label?: unknown }).label ?? (o as { value: unknown }).value) }] : []));
  } catch {
    return [];
  }
}

// The whole opening tag around a position, reading quoted attribute values as a unit (Alpine data holds ">").
function tagAround(html: string, pos: number) {
  const start = html.lastIndexOf("<", pos);
  let quote = "";
  let i = start + 1;
  for (; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") break;
  }
  return html.slice(Math.max(0, start), i + 1);
}

function fieldOf(html: string, name: string, value: unknown, path = `data.${name}`): NoorField | null {
  const key = path;
  const k = esc(key);
  const labelHtml = html.match(new RegExp(`<label\\b[^>]*for="${k}"[^>]*>([\\s\\S]*?)</label>`, "i"))?.[1] ?? "";
  const label = plain(labelHtml).replace(/\s*\*\s*$/, "").trim() || humanize(name);
  const required =/<sup\b[^>]*>\s*\*/i.test(labelHtml);
  const base = { name, path, label, required, options: [] as NoorOption[], value, editable: true, maxLength: null as number | null, placeholder: null as string | null };
  const attrs = (tag: string) => ({
    max: Number(tag.match(/maxlength="(\d+)"/i)?.[1]) || null,
    placeholder: tag.match(/placeholder="([^"]*)"/i)?.[1] ? decode(tag.match(/placeholder="([^"]*)"/i)![1]) : null,
    required: /\srequired(?:\s|=|>|\/)/i.test(tag),
  });
  const model = `(?:wire:model(?:\\.[\\w.]+)?|id)="${k}"`;

  // A list of checkboxes on the same field (a checkbox list, such as a role's permissions).
  const boxes = [...html.matchAll(new RegExp(`<input\\b[^>]*type="checkbox"[^>]*wire:model(?:\\.[\\w.]+)?="${k}"[^>]*>`, "gi"))];
  if (boxes.length > 1 || (boxes.length === 1 && /\svalue="/.test(boxes[0][0]))) {
    const options = boxes.map((b) => {
      const v = decode(b[0].match(/value="([^"]*)"/)?.[1] ?? "");
      const after = html.slice((b.index ?? 0) + b[0].length, (b.index ?? 0) + b[0].length + 400);
      return { value: v, label: plain(after.match(/^[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "") || humanize(v) };
    });
    return { ...base, kind: "multiselect", options, value: Array.isArray(value) ? value.map(String) : [] };
  }

  const select = html.match(new RegExp(`<select\\b[^>]*${model}[^>]*>([\\s\\S]*?)</select>`, "i"));
  if (select) {
    const a = attrs(select[0]);
    return { ...base, required: required || a.required, kind: /\smultiple\b/i.test(select[0]) ? "multiselect" : "select", options: optionsIn(select[1]) };
  }
  const textarea = html.match(new RegExp(`<textarea\\b[^>]*${model}[^>]*>`, "i"));
  if (textarea) {
    const a = attrs(textarea[0]);
    return { ...base, required: required || a.required, kind: "textarea", maxLength: a.max, placeholder: a.placeholder, value: value ?? "" };
  }
  const input = html.match(new RegExp(`<input\\b[^>]*${model}[^>]*>`, "i"));
  if (input) {
    const a = attrs(input[0]);
    const type = (input[0].match(/type="([^"]+)"/i)?.[1] ?? "text").toLowerCase();
    if (type === "hidden") return null;
    const kind: NoorFieldKind =
      type === "checkbox" ? "toggle" : type === "file" ? "file" : type === "datetime-local" ? "datetime" : (["email", "tel", "url", "number", "password", "date", "time", "color"] as const).find((t) => t === type) ?? "text";
    return { ...base, required: required || a.required, kind, maxLength: a.max, placeholder: a.placeholder, editable: kind !== "file", value: kind === "toggle" ? !!value : value };
  }

  // Alpine-driven components that entangle the field (toggles, searchable selects, rich editors, uploads).
  const ent = html.search(new RegExp(`entangle\\(\\s*(?:&#0?39;|'|&quot;|")${k}(?:&#0?39;|'|&quot;|")`));
  if (ent >= 0) {
    // The component is the element whose Alpine data entangles the field.
    const tag = tagAround(html, ent);
    if (/fi-fo-file-upload|fileUploadFormComponent/.test(tag)) return { ...base, kind: "file", editable: false };
    if (/fi-fo-toggle|role="switch"/.test(tag) || typeof value === "boolean") return { ...base, kind: "toggle", value: !!value };
    if (/fi-fo-(rich|markdown)-editor|richEditorFormComponent|markdownEditorFormComponent/.test(tag)) return { ...base, kind: "textarea", value: value ?? "" };
    if (/selectFormComponent|fi-fo-select/.test(tag)) {
      const multi = /isMultiple:\s*true/.test(decode(tag)) || Array.isArray(value);
      return { ...base, kind: multi ? "multiselect" : "select", options: jsOptions(tag), value: multi ? (Array.isArray(value) ? value.map(String) : []) : value };
    }
    if (/dateTimePickerFormComponent/.test(tag)) return { ...base, kind: /hasTime:\s*false/.test(decode(tag)) ? "date" : "datetime" };
    if (value !== null && typeof value === "object") return { ...base, kind: "other", editable: false };
    return { ...base, kind: typeof value === "number" ? "number" : "text" };
  }
  return null;
}

// ctx: a component re-rendered by Livewire (after switching a tab) comes without the page's snapshot, token and
// address; they are passed in.
export function readNoorForm(html: string, ctx?: { snapshot: string; csrf: string; uri: string }): ParsedNoorForm {
  const snap = ctx ? parseSnapshot(ctx.snapshot) : formSnapshot(html);
  const csrf = ctx?.csrf ?? html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri = ctx?.uri ?? html.match(/data-update-uri="([^"]+)"/)?.[1];
  if (!snap || !csrf || !uri) throw new NoorFormError("This Noor page has no form your login can use.");
  const submitMatch = html.match(/<form\b[^>]*wire:submit(?:\.prevent)?="([^"(]+)(?:\(\))?"[^>]*>/);
  const submit = submitMatch?.[1]?.trim() ?? "";
  if (!ctx && !SAFE_METHOD.test(submit)) throw new NoorFormError("This Noor page has no form your login can submit.");
  const formHtml = submitMatch ? html.slice(submitMatch.index ?? 0) : html;
  const buttons = [...formHtml.matchAll(/<button\b[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/gi)].map((b) => plain(b[1])).filter(Boolean);
  // Form fields: those in the snapshot's data, and those the page binds to data.<name> while data is still empty.
  const bound = (re: RegExp) => [...html.matchAll(re)].map((m) => decode(m[1]));
  const dataNames = new Set([...Object.keys(snap.data), ...bound(/(?:wire:model(?:\.[\w.]+)?="|statePath:\s*(?:'|&#0?39;)|entangle\(\s*(?:'|&#0?39;|&quot;))data\.([\w-]{1,80})(?=["'&)])/g)]);
  const fields: NoorField[] = [];
  for (const name of dataNames) {
    if (!/^[\w-]{1,80}$/.test(name)) continue;
    const f = fieldOf(html, name, snap.data[name] ?? null);
    if (f) fields.push(f);
  }
  // Page properties bound directly (wire:model="message"), not Livewire's own.
  for (const name of new Set(bound(/wire:model(?:\.[\w.]+)?="([\w-]{1,80})"/g))) {
    if (INTERNAL.test(name) || dataNames.has(name) || !(name in snap.root)) continue;
    const f = fieldOf(html, name, snap.root[name] ?? null, name);
    if (f) fields.push(f);
  }
  const tabs = [...html.matchAll(/<button\b[^>]*wire:click="setActiveTab\((?:'|&#0?39;)([\w-]{1,40})(?:'|&#0?39;)\)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({ value: m[1], label: plain(m[2]) || humanize(m[1]) }));
  const title = plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || null;
  return {
    title,
    submit,
    submitLabel: buttons[0] || humanize(submit),
    fields,
    ...(tabs.length ? { tabs: [...new Map(tabs.map((t) => [t.value, t])).values()], tab: typeof snap.root.activeTab === "string" ? snap.root.activeTab : tabs[0].value } : {}),
    snapshot: snap.raw,
    csrf: decode(csrf),
    uri: decode(uri),
  };
}

// Calls one of the page's own methods (setActiveTab) and reads the form Noor renders after it.
export async function callNoorForm(baseUrl: string, cookie: string, form: ParsedNoorForm, method: string, params: unknown[]): Promise<ParsedNoorForm> {
  if (!SAFE_METHOD.test(method)) throw new NoorFormError("Not a method this page offers.");
  const endpoint = new URL(form.uri, baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new NoorFormError("Unexpected Noor endpoint.");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": form.csrf, Cookie: cookie },
    body: JSON.stringify({ _token: form.csrf, components: [{ snapshot: form.snapshot, updates: {}, calls: [{ path: "", method, params }] }] }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 419 || r.status === 401) throw new NoorFormError("The Noor session ended. Try again.");
  if (!r.ok) throw new NoorFormError(`Noor did not open that part of the page (HTTP ${r.status}).`);
  const c = (await r.json())?.components?.[0];
  if (!c?.snapshot || typeof c.effects?.html !== "string") throw new NoorFormError("Noor did not show that part of the page.");
  const next = readNoorForm(c.effects.html, { snapshot: c.snapshot, csrf: form.csrf, uri: form.uri });
  // The re-rendered part may leave out the form tag: keep the page's own submit, title and tabs.
  return { ...next, submit: next.submit && SAFE_METHOD.test(next.submit) ? next.submit : form.submit, submitLabel: next.submit ? next.submitLabel : form.submitLabel, title: next.title ?? form.title, tabs: next.tabs ?? form.tabs, tab: next.tab ?? (method === "setActiveTab" ? String(params[0]) : form.tab) };
}

// Checks each value against the form Noor sent and turns it into what Noor's field expects.
export function noorUpdates(form: NoorForm, values: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    const f = form.fields.find((x) => x.name === name);
    if (!f || !f.editable) throw new NoorFormError(`${f?.label ?? name} cannot be changed here.`);
    let v: unknown;
    if (f.kind === "toggle") v = raw === true || raw === "true" || raw === 1 || raw === "1";
    else if (f.kind === "multiselect") {
      const list = (Array.isArray(raw) ? raw : []).map(String);
      if (f.options.length && list.some((x) => !f.options.some((o) => o.value === x))) throw new NoorFormError(`Choose ${f.label} from the list.`);
      v = list;
    } else if (f.kind === "select") {
      const s = raw === null || raw === undefined ? "" : String(raw);
      if (s && f.options.length && !f.options.some((o) => o.value === s)) throw new NoorFormError(`Choose ${f.label} from the list.`);
      v = s || null;
    } else if (f.kind === "number") {
      const s = raw === null || raw === undefined ? "" : String(raw).trim();
      if (s && !Number.isFinite(Number(s))) throw new NoorFormError(`${f.label} must be a number.`);
      v = s === "" ? null : Number(s);
    } else {
      const s = raw === null || raw === undefined ? "" : String(raw);
      const max = f.maxLength ?? 20000;
      if (s.length > max) throw new NoorFormError(`${f.label} is longer than ${max} characters.`);
      v = s === "" ? null : s;
    }
    if (f.required && (v === null || (Array.isArray(v) && !v.length))) throw new NoorFormError(`${f.label} is required.`, { [name]: [`${f.label} is required.`] });
    updates[f.path] = v;
  }
  return updates;
}

export async function sendNoorForm(baseUrl: string, cookie: string, form: ParsedNoorForm, values: Record<string, unknown>) {
  const updates = noorUpdates(form, values);
  const endpoint = new URL(form.uri, baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new NoorFormError("Unexpected Noor endpoint.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": form.csrf, Cookie: cookie },
    body: JSON.stringify({ _token: form.csrf, components: [{ snapshot: form.snapshot, updates, calls: [{ path: "", method: form.submit, params: [] }] }] }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 419 || response.status === 401) throw new NoorFormError("The Noor session ended. Try again.");
  if (response.status === 403) throw new NoorFormError("Your Noor login is not allowed to do this.");
  if (!response.ok) throw new NoorFormError(`Noor did not accept the form (HTTP ${response.status}).`);
  const component = (await response.json())?.components?.[0];
  if (!component?.snapshot) throw new NoorFormError("Noor did not confirm the form.");
  const state = JSON.parse(component.snapshot);
  const errors = unwrap(state.memo?.errors ?? {}) as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(errors)) fieldErrors[k.replace(/^data\./, "")] = (Array.isArray(v) ? v : [v]).map(String);
  if (Object.keys(fieldErrors).length) {
    const first = Object.entries(fieldErrors)[0];
    throw new NoorFormError(`Noor refused the form: ${first[1][0] ?? first[0]}`, fieldErrors);
  }
  const redirect = typeof component.effects?.redirect === "string" ? (component.effects.redirect as string) : null;
  const createdId = redirect?.match(/\/admin\/[\w/-]+?\/([\w-]+)(?:\/edit)?\/?$/)?.[1] ?? null;
  return { redirect, createdId: createdId && !/^(create|edit)$/.test(createdId) ? createdId : null, sent: Object.keys(updates).map((k) => k.slice(5)) };
}
