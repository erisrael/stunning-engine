import { run } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { STAGES, type Role } from "@/lib/domain";

// Import & export rules Admin sets (Update 1.0, phase 6): how long an import can be undone (per import kind, 0 turns
// undo off), who approves an undo, and whether members, teams and departments may be imported or exported. The
// importer and the exports check these on the server.

export type UndoApproval = "role" | "admin" | "none";
export type UndoConfig = { hours: number; kinds: Record<string, number>; approval: UndoApproval };
export type IoEntity = "members" | "teams" | "departments";
export type IoPermissions = Record<IoEntity, { import: boolean; export: boolean }>;

export const IO_ENTITIES: { key: IoEntity; label: string; hint: string }[] = [
  { key: "members", label: "Members", hint: "People's accounts: name, email, title, scope, capacity and active." },
  { key: "teams", label: "Teams", hint: "Who is on the Recording, Editing, Uploading and Publication teams." },
  { key: "departments", label: "Departments", hint: "Who is in Marketing, Finance, HR, Support and the other departments." },
];

const DEFAULT_UNDO: UndoConfig = { hours: 24, kinds: {}, approval: "role" };
const DEFAULT_IO: IoPermissions = { members: { import: true, export: true }, teams: { import: true, export: true }, departments: { import: true, export: true } };

const hrs = (n: unknown, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.min(24 * 90, Math.round(v * 10) / 10) : d;
};
const isAdmin = (u: AppUser) => u.roles.includes("admin") || can(u, "users.manage");

function parse<T>(raw: string | null, d: T): T {
  if (!raw) return d;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return d;
  }
}

export async function undoConfig(): Promise<UndoConfig> {
  const c = parse<Partial<UndoConfig>>(await getMeta("io.undo"), {});
  const kinds: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.kinds ?? {})) if (/^[a-z_]{2,40}$/.test(k)) kinds[k] = hrs(v, DEFAULT_UNDO.hours);
  return { hours: hrs(c.hours, DEFAULT_UNDO.hours), kinds, approval: c.approval === "admin" || c.approval === "none" ? c.approval : "role" };
}

export async function saveUndoConfig(user: AppUser, c: Partial<UndoConfig>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets the undo window.");
  const cur = await undoConfig();
  const next: UndoConfig = {
    hours: c.hours === undefined ? cur.hours : hrs(c.hours, cur.hours),
    kinds: c.kinds === undefined ? cur.kinds : Object.fromEntries(Object.entries(c.kinds).filter(([k, v]) => /^[a-z_]{2,40}$/.test(k) && v !== null && String(v) !== "").map(([k, v]) => [k, hrs(v, cur.hours)])),
    approval: c.approval === "admin" || c.approval === "none" || c.approval === "role" ? c.approval : cur.approval,
  };
  await setMeta("io.undo", JSON.stringify(next));
  await audit({ actor: user }, { action: "settings.io_undo", summary: `${user.name} set import undo to ${next.hours} hours (${next.approval === "none" ? "no approval" : next.approval === "admin" ? "Admin approves" : "Admin or the import's role approves"})`, newValue: next });
  return next;
}

export async function undoHoursFor(template: string | null) {
  const c = await undoConfig();
  return template && c.kinds[template] !== undefined ? c.kinds[template] : c.hours;
}

export async function ioPermissions(): Promise<IoPermissions> {
  const c = parse<Partial<IoPermissions>>(await getMeta("io.permissions"), {});
  const out = structuredClone(DEFAULT_IO);
  for (const e of IO_ENTITIES) {
    const v = c[e.key];
    if (v) out[e.key] = { import: v.import !== false, export: v.export !== false };
  }
  return out;
}

export async function saveIoPermissions(user: AppUser, p: Partial<IoPermissions>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets what can be imported and exported.");
  const cur = await ioPermissions();
  for (const e of IO_ENTITIES) {
    const v = p[e.key];
    if (v) cur[e.key] = { import: v.import !== false, export: v.export !== false };
  }
  await setMeta("io.permissions", JSON.stringify(cur));
  const off = IO_ENTITIES.flatMap((e) => [!cur[e.key].import && `${e.label} import`, !cur[e.key].export && `${e.label} export`].filter(Boolean));
  await audit({ actor: user }, { action: "settings.io_permissions", summary: `${user.name} set import and export switches${off.length ? `: off for ${off.join(", ")}` : ": all on"}`, newValue: cur });
  return cur;
}

export async function assertIo(entity: IoEntity, dir: "import" | "export") {
  const p = await ioPermissions();
  if (!p[entity][dir]) throw new WorkflowError("FORBIDDEN", `Admin has turned off ${dir === "import" ? "importing" : "exporting"} ${IO_ENTITIES.find((e) => e.key === entity)!.label.toLowerCase()}.`);
}

// Roles are teams (the production stages), access (Admin, Manager, Owner, Developer) or departments (the rest).
const ACCESS: Role[] = ["admin", "manager", "owner", "developer"];
export const roleGroup = (r: Role): IoEntity => ((STAGES as readonly string[]).includes(r) ? "teams" : ACCESS.includes(r) ? "members" : "departments");

// Change records are kept a week past the longest undo window, then removed.
export async function pruneJobChanges() {
  const c = await undoConfig();
  const hours = Math.max(c.hours, ...Object.values(c.kinds), 0) + 24 * 7;
  const before = new Date(Date.now() - hours * 3600_000).toISOString();
  await run("DELETE FROM job_changes WHERE created_at < ?", before);
}
