import { all, get, nowIso, run } from "./db";
import {
  DEFAULT_LEAD_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  EDITORIAL_CAPABILITIES,
  NAV_CAPABILITIES,
  ROLES,
  STAGES,
  leadKey,
  type Capability,
  type PermissionMatrix,
  type Role,
  type Stage,
} from "@/lib/domain";

export type ChecklistItem = { key: string; label: string; required: boolean };

export type Settings = {
  workspace: {
    name: string;
    timezone: string;
    weekStartsOn: number;
    codePrefix: string;
    calendarDisplay: "gregorian" | "ethiopian";
  };
  calendar: {
    workdays: number[];
    dayStart: string;
    dayEnd: string;
    holidays: { date: string; name: string }[];
  };
  policies: {
    captionsRequired: boolean;
    thumbnailRequired: boolean;
    allowSelfApproval: boolean;
    requireManagerApproval: boolean;
    managerEmergencyRelease: boolean;
    requirePlaybackCheck: boolean;
    autoPauseOtherSessions: boolean;
    requireRawDuration: boolean;
  };
  checklists: Record<Stage, ChecklistItem[]>;
  destinations: { key: string; label: string; requiredByDefault: boolean; active: boolean }[];
  lists: {
    deliverableTypes: { key: string; label: string; codeSuffix: string }[];
    contentTypes: { key: string; label: string }[];
    languages: { code: string; label: string }[];
    terms: string[];
  };
  alerts: {
    dueSoonHours: number;
    blockerAgeHours: number;
    queueAgingDays: number;
    staleSessionHours: number;
    handoffWaitHours: number;
    questionDueHours: number;
  };
  reporting: {
    comparisonWeeks: number;
    minSample: number;
    agingBands: number[];
  };
};

export const DEFAULT_SETTINGS: Settings = {
  workspace: {
    name: "Myseed Content Manager",
    timezone: "Africa/Addis_Ababa",
    weekStartsOn: 1,
    codePrefix: "MY",
    calendarDisplay: "gregorian",
  },
  calendar: {
    workdays: [1, 2, 3, 4, 5],
    dayStart: "08:30",
    dayEnd: "17:30",
    holidays: [],
  },
  policies: {
    captionsRequired: true,
    thumbnailRequired: true,
    allowSelfApproval: false,
    requireManagerApproval: false,
    managerEmergencyRelease: true,
    requirePlaybackCheck: true,
    autoPauseOtherSessions: false,
    requireRawDuration: false,
  },
  checklists: {
    recording: [
      { key: "presenter_confirmed", label: "Presenter and script confirmed", required: true },
      { key: "audio_check", label: "Audio levels checked on playback", required: true },
      { key: "video_check", label: "Framing, focus and lighting checked", required: true },
      { key: "board_legible", label: "Board or slide content legible", required: false },
      { key: "files_backed_up", label: "Raw files copied to shared storage", required: true },
    ],
    editing: [
      { key: "cuts_reviewed", label: "Cuts reviewed against script", required: true },
      { key: "audio_cleaned", label: "Audio cleaned and normalised", required: true },
      { key: "graphics_checked", label: "Titles, graphics and spelling checked", required: true },
      { key: "captions_synced", label: "Captions synced and proofread", required: false },
      { key: "export_settings", label: "Exported with the standard preset", required: true },
    ],
    uploading: [
      { key: "approved_version", label: "Uploaded version matches approved master", required: true },
      { key: "metadata_mapped", label: "Title, grade, subject and unit metadata mapped", required: true },
      { key: "processing_done", label: "Platform processing finished", required: true },
      { key: "playback_verified", label: "Playback verified end to end", required: true },
      { key: "captions_attached", label: "Captions attached on platform", required: false },
    ],
    publication: [
      { key: "educational_review", label: "Educational accuracy reviewed", required: true },
      { key: "placement_checked", label: "Audience and curriculum placement checked", required: true },
      { key: "thumbnail_title", label: "Thumbnail and public title approved", required: true },
      { key: "release_window", label: "Release window confirmed", required: false },
    ],
  },
  destinations: [
    { key: "myseed_app", label: "Myseed App", requiredByDefault: true, active: true },
    { key: "youtube", label: "YouTube", requiredByDefault: false, active: true },
    { key: "telegram", label: "Telegram channel", requiredByDefault: false, active: true },
  ],
  lists: {
    deliverableTypes: [
      { key: "main_video", label: "Main lesson video", codeSuffix: "" },
      { key: "revision_clip", label: "Revision clip", codeSuffix: "REV" },
      { key: "worked_example", label: "Worked example", codeSuffix: "EX" },
      { key: "worksheet", label: "Worksheet", codeSuffix: "WS" },
    ],
    contentTypes: [
      { key: "lesson_video", label: "Lesson video" },
      { key: "lab_demo", label: "Lab demonstration" },
      { key: "exam_prep", label: "Exam preparation" },
      { key: "short_explainer", label: "Short explainer" },
    ],
    languages: [
      { code: "en", label: "English" },
      { code: "am", label: "Amharic" },
      { code: "om", label: "Afaan Oromo" },
    ],
    terms: ["Term 1", "Term 2"],
  },
  alerts: {
    dueSoonHours: 48,
    blockerAgeHours: 24,
    queueAgingDays: 5,
    staleSessionHours: 10,
    handoffWaitHours: 24,
    questionDueHours: 48,
  },
  reporting: {
    comparisonWeeks: 4,
    minSample: 5,
    agingBands: [2, 7, 14],
  },
};

// Settings change rarely; a short cache saves a database round trip on almost every request.
const CACHE_MS = 10_000;
let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = structuredClone(DEFAULT_SETTINGS) as Settings;
  // One query for every section: on a hosted database each query is a network round trip.
  const rows = new Map(
    (await all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'cfg.%'")).map((r) => [r.key, r]),
  );
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const row = rows.get(`cfg.${key}`);
    if (row) {
      try {
        const stored = JSON.parse(row.value);
        // Shallow merge keeps newly added defaults when older settings are stored.
        (value as Record<string, unknown>)[key] =
          Array.isArray(stored) ? stored : { ...(value[key] as object), ...stored };
      } catch {
        /* keep default */
      }
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K], actorId?: string) {
  await run(
        `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        `cfg.${key}`,
        JSON.stringify(value),
        nowIso(),
        actorId ?? null,
      );
  cache = null;
}

export async function getMeta(key: string): Promise<string | null> {
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", `meta.${key}`))?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  await run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        `meta.${key}`,
        value,
        nowIso(),
      );
}

// Role and team-lead permission matrix (Admin, Roles and permissions). Missing entries fall back to defaults.
const MATRIX_VERSION = 4;
// Version 2 made managers view-only, moved item creation to Admin and the Recording lead, and added sidebar switches.
const V2_MANAGER_REMOVED: Capability[] = ["items.create", "items.plan", "items.close", "work.override", "release.emergency", "import.run", "import.stage"];
const V2_ADMIN_ADDED: Capability[] = ["items.create", "items.plan", "items.close", "import.tracker"];

function migrateMatrix(stored: Partial<Record<Role, Capability[]>>): Partial<Record<Role, Capability[]>> {
  const out: Partial<Record<Role, Capability[]>> = {};
  for (const r of ROLES) {
    const caps = stored[r];
    if (!caps) continue;
    let next = [...caps, ...NAV_CAPABILITIES];
    if (caps.includes("export.run")) next.push("export.report", "export.tracker");
    if (r === "manager") next = next.filter((c) => !V2_MANAGER_REMOVED.includes(c));
    if (r === "admin") next.push(...V2_ADMIN_ADDED);
    out[r] = [...new Set(next)];
  }
  return out;
}

// Version 3 added the Handovers page for everyone and the editorial tools for Admin and team leads.
function migrateV3(stored: Partial<PermissionMatrix>): Partial<PermissionMatrix> {
  const out: Partial<PermissionMatrix> = { ...stored };
  for (const r of ROLES) if (out[r]) out[r] = [...new Set([...out[r]!, "nav.handovers" as Capability, ...(r === "admin" ? EDITORIAL_CAPABILITIES : [])])];
  for (const st of STAGES) {
    const k = leadKey(st);
    if (out[k]) out[k] = [...new Set([...out[k]!, ...EDITORIAL_CAPABILITIES])];
  }
  return out;
}

// Version 4 added channel creation for Admin, Managers and team leads.
function migrateV4(stored: Partial<PermissionMatrix>): Partial<PermissionMatrix> {
  const out: Partial<PermissionMatrix> = { ...stored };
  for (const k of ["admin", "manager", ...STAGES.map(leadKey)] as (keyof PermissionMatrix)[]) if (out[k]) out[k] = [...new Set([...out[k]!, "chat.channels" as Capability])];
  return out;
}

// Read on every request (signed-in user's permissions), so cached briefly; concurrent callers share one query.
let matrixCache: { at: number; value: Promise<PermissionMatrix> } | null = null;

export function getPermissionMatrix(): Promise<PermissionMatrix> {
  if (matrixCache && Date.now() - matrixCache.at < CACHE_MS) return matrixCache.value;
  const value = loadPermissionMatrix();
  matrixCache = { at: Date.now(), value };
  value.catch(() => (matrixCache = null));
  return value;
}

async function loadPermissionMatrix(): Promise<PermissionMatrix> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.permissions'");
  let stored: Partial<PermissionMatrix> & { _v?: number } = {};
  try {
    stored = row ? JSON.parse(row.value) : {};
  } catch {
    stored = {};
  }
  const version = stored._v ?? 1;
  if (version < 2) stored = migrateMatrix(stored);
  if (version < 3) stored = migrateV3(stored);
  if (version < 4) stored = migrateV4(stored);
  const keys = [...ROLES, ...STAGES.map(leadKey)] as (keyof PermissionMatrix)[];
  const defaults: PermissionMatrix = { ...DEFAULT_PERMISSIONS, ...DEFAULT_LEAD_PERMISSIONS };
  return Object.fromEntries(keys.map((k) => [k, stored[k] ?? defaults[k]])) as PermissionMatrix;
}

export async function savePermissionMatrix(matrix: PermissionMatrix, actorId?: string) {
  await run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.permissions', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    JSON.stringify({ ...matrix, _v: MATRIX_VERSION }),
    nowIso(),
    actorId ?? null,
  );
  matrixCache = null;
}
