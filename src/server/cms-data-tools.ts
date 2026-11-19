import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// Noor stored-data tools (Legacy CMS): what Noor sends once is kept, and the tables are read, filtered,
// merged and exported from that saved copy, never by asking Noor again (Noor is fragile). Admin turns each
// tool on or off (cfg.cms_data_tools).

export type CmsDataTools = {
  // Rows read live from Noor also update the saved copy, so the next visit opens them without a request.
  snapshotLive: boolean;
  // Filter by column values (pick values, contains, empty / not empty) on the saved rows.
  columnFilters: boolean;
  // Export the shown rows, chosen rows or a row range, with chosen columns.
  export: boolean;
  // The Families table: students with their parent, students on their own, parents with no student.
  families: boolean;
  // A copy button beside phone numbers and "copy phones" for chosen rows.
  copyPhone: boolean;
};
export const DEFAULT_CMS_DATA_TOOLS: CmsDataTools = { snapshotLive: true, columnFilters: true, export: true, families: true, copyPhone: true };

export async function cmsDataTools(): Promise<CmsDataTools> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.cms_data_tools'");
  return { ...DEFAULT_CMS_DATA_TOOLS, ...parseJson<Partial<CmsDataTools>>(row?.value ?? "{}", {}) };
}

export async function saveCmsDataTools(user: AppUser, input: Partial<CmsDataTools>) {
  if (!can(user, "users.manage") && !can(user, "cms.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets the Noor data tools.");
  const cur = await cmsDataTools();
  const next = Object.fromEntries(Object.keys(DEFAULT_CMS_DATA_TOOLS).map((k) => [k, typeof input[k as keyof CmsDataTools] === "boolean" ? input[k as keyof CmsDataTools] : cur[k as keyof CmsDataTools]])) as CmsDataTools;
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.cms_data_tools', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "configure.legacy_cms_data", summary: `${user.name} changed the Noor data tools` });
  return next;
}

// What the person may do with the saved rows (export needs the Noor export permission as well).
export async function cmsToolRights(user: AppUser) {
  const t = await cmsDataTools();
  const { canManageCmsData } = await import("./legacy-cms");
  const manage = await canManageCmsData(user);
  return { ...t, export: t.export && (manage || can(user, "cms.export") || can(user, "export.run")), configure: can(user, "users.manage") || can(user, "cms.manage") };
}

const extOf = (r: Record<string, string>) => String(r._recordId || r.ID || r.Id || r.id || "");

// Rows that came back from a live read are merged into the saved copy (added, or replaced by id). Rows
// without an id are left out: they cannot be matched next time.
export async function snapshotLiveRows(category: string, rows: Record<string, string>[]) {
  if (!rows.length || !(await cmsDataTools()).snapshotLive) return 0;
  const keyed = rows.filter((r) => extOf(r));
  if (!keyed.length) return 0;
  const at = nowIso();
  await tx(async () => {
    for (let i = 0; i < keyed.length; i += 200) {
      const chunk = keyed.slice(i, i + 200);
      const ids = chunk.map(extOf);
      await run(`DELETE FROM legacy_cms_records WHERE category = ? AND external_id IN (${ids.map(() => "?").join(",")})`, category, ...ids);
      const args = chunk.flatMap((r) => { const ext = extOf(r); return [uid(), category, ext, String(r.Name || r.name || r.Student || r.Parent || ext), JSON.stringify(r), at]; });
      await run(`INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`, ...args);
    }
  });
  return keyed.length;
}

export type FamilyRow = Record<string, string>;

// Families from the saved copy: every student with their parent (matched by the parent's name, then by
// phone), students on their own, and parents no student points to.
export async function cmsFamilies(user: AppUser): Promise<{ headers: string[]; rows: FamilyRow[]; summary: { withParent: number; studentsOnOwn: number; parentsOnly: number; families: number } }> {
  if (!(await cmsDataTools()).families) throw new WorkflowError("FORBIDDEN", "Families is switched off by Admin.");
  const { allowedCategoriesForUser, cleanPhone } = await import("./legacy-cms");
  const allowed = new Set((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat());
  if (!allowed.has("students") || !allowed.has("parents")) throw new WorkflowError("FORBIDDEN", "Families needs both the Students and Parents tables.");
  const [students, parents, subs] = await Promise.all(
    ["students", "parents", "subscriptions"].map((c) => all<{ external_id: string; title: string; data_json: string }>("SELECT external_id, title, data_json FROM legacy_cms_records WHERE category = ?", c)),
  );
  const s = (d: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = d[k]; if (v !== undefined && v !== null && String(v).trim() && String(v).trim() !== "—") return String(v).trim(); } return ""; };
  const P = parents.map((p) => { const d = parseJson<Record<string, unknown>>(p.data_json, {}); return { id: p.external_id, name: s(d, "Name", "name") || p.title, phone: cleanPhone(s(d, "Phone", "phone", "Phone Number")), email: s(d, "Email", "email"), city: s(d, "City", "city"), created: s(d, "Created At", "Created at", "created_at") }; });
  const byName = new Map(P.filter((p) => p.name).map((p) => [p.name.toLowerCase(), p]));
  const byPhone = new Map(P.filter((p) => p.phone).map((p) => [p.phone.replace(/\D/g, "").slice(-9), p]));
  const subBy = new Map<string, { plan: string; status: string; end: string }>();
  for (const x of subs) { const d = parseJson<Record<string, unknown>>(x.data_json, {}); const n = s(d, "Student", "Name").toLowerCase(); if (n) subBy.set(n, { plan: s(d, "Plan"), status: s(d, "Status"), end: s(d, "End Date", "End date") }); }
  const used = new Set<string>();
  const rows: FamilyRow[] = [];
  let withParent = 0, onOwn = 0;
  for (const st of students) {
    const d = parseJson<Record<string, unknown>>(st.data_json, {});
    const name = s(d, "Name", "name") || st.title;
    const rawParent = s(d, "Parent", "parent", "Parent Name");
    const ownPhone = cleanPhone(s(d, "Phone", "phone", "Phone Number"));
    const parent = (rawParent && byName.get(rawParent.toLowerCase())) || (ownPhone && byPhone.get(ownPhone.replace(/\D/g, "").slice(-9))) || null;
    if (parent) used.add(parent.id);
    const sub = subBy.get(name.toLowerCase());
    const linked = !!parent || !!rawParent;
    if (linked) withParent++; else onOwn++;
    rows.push({
      _recordId: `s:${st.external_id}`,
      Kind: linked ? "Student with parent" : "Student on own",
      "Family key": parent ? `P${parent.id}` : rawParent ? `N:${rawParent}` : `S${st.external_id}`,
      Student: name,
      "Student ID": st.external_id,
      Grade: s(d, "Grade", "grade"),
      Gender: s(d, "Gender", "gender"),
      City: s(d, "City", "city") || parent?.city || "",
      "Student phone": ownPhone,
      Parent: parent?.name || rawParent || "",
      "Parent ID": parent?.id ?? "",
      "Parent phone": parent?.phone ?? "",
      "Parent email": parent?.email ?? "",
      "Contact phone": parent?.phone || ownPhone || "",
      Subscription: s(d, "Subscription", "Subscription status", "Subscription Status") || sub?.status || "",
      Plan: sub?.plan ?? "",
      "Subscription end": sub?.end ?? "",
      "Student created": s(d, "Created At", "Created at", "created_at"),
    });
  }
  let parentsOnly = 0;
  const named = new Set(rows.map((r) => r.Parent.toLowerCase()).filter(Boolean));
  for (const p of P) {
    if (used.has(p.id)) continue;
    // A parent named by a student but not matched by id still counts as used.
    if (named.has(p.name.toLowerCase())) continue;
    parentsOnly++;
    rows.push({ _recordId: `p:${p.id}`, Kind: "Parent without student", "Family key": `P${p.id}`, Student: "", "Student ID": "", Grade: "", Gender: "", City: p.city, "Student phone": "", Parent: p.name, "Parent ID": p.id, "Parent phone": p.phone, "Parent email": p.email, "Contact phone": p.phone, Subscription: "", Plan: "", "Subscription end": "", "Student created": "" });
  }
  rows.sort((a, b) => a["Family key"].localeCompare(b["Family key"]) || a.Student.localeCompare(b.Student));
  const headers = Object.keys(rows[0] ?? { Kind: "" }).filter((k) => !k.startsWith("_"));
  return { headers, rows, summary: { withParent, studentsOnOwn: onOwn, parentsOnly, families: new Set(rows.map((r) => r["Family key"])).size } };
}

// An export made in the browser from saved rows is recorded like the server exports.
export async function auditCmsExport(user: AppUser, input: { table: string; rows: number; columns: number }) {
  const r = await cmsToolRights(user);
  if (!r.export) throw new WorkflowError("FORBIDDEN", "Exporting Noor records needs the Noor export permission.");
  await audit({ actor: user }, { action: "cms.export", summary: `${user.name} exported ${input.rows.toLocaleString()} saved Noor ${input.table} rows (${input.columns} columns)` });
}
