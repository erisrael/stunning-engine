// Personal profiles: photo, cover colour, headline, about, skills with levels, education, experience, languages,
// links, study status and files (CV, certificates, portfolio). Anyone signed in sees a colleague's profile; files
// are seen by the person, their line manager or team lead, HR and Admin.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, isLeadOf, loadUser, type AppUser } from "./users";
import { STAGES, ROLE_LABELS } from "@/lib/domain";

export const COVERS = ["emerald", "indigo", "sunset", "ocean", "rose", "slate", "gold", "violet"] as const;
export type Cover = (typeof COVERS)[number];
export const PROFILE_SECTIONS = ["about", "skills", "education", "experience", "languages", "links", "files"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export const SKILL_LEVELS = ["learning", "good", "strong", "expert"] as const;
export const STUDY_STATUSES = ["not_studying", "studying_part_time", "studying_full_time", "graduated"] as const;
export const FILE_KINDS = ["cv", "certificate", "portfolio", "transcript", "other"] as const;

export type Skill = { name: string; level: (typeof SKILL_LEVELS)[number] };
export type Education = { school: string; degree: string; field: string; from: string; to: string; status: "completed" | "ongoing" };
export type Experience = { org: string; title: string; from: string; to: string; note: string };
export type Language = { name: string; level: string };
export type LinkItem = { label: string; url: string };
export const VISIBILITY = ["everyone", "team", "nobody"] as const;
export type Visibility = (typeof VISIBILITY)[number];
// Contact details, each with who may see it. The sign-in email is shown to colleagues unless hidden.
export type Contact = {
  phone: string;
  phone2: string;
  workEmail: string;
  telegram: string;
  whatsapp: string;
  office: string;
  phoneVisible: Visibility;
  emailVisible: Visibility;
  messengersVisible: Visibility;
};
export const CONTACT_DEFAULT: Contact = { phone: "", phone2: "", workEmail: "", telegram: "", whatsapp: "", office: "", phoneVisible: "team", emailVisible: "everyone", messengersVisible: "team" };

export type Profile = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  headline: string | null;
  about: string | null;
  location: string | null;
  avatar: string | null;
  cover: Cover;
  skills: Skill[];
  education: Education[];
  experience: Experience[];
  languages: Language[];
  links: LinkItem[];
  studyStatus: (typeof STUDY_STATUSES)[number] | null;
  hidden: ProfileSection[];
  // The person's own contact settings (for themselves only).
  contact: Contact | null;
  files: { id: string; kind: string; title: string; name: string; size: number; createdAt: string }[] | null;
  canEdit: boolean;
};

const MAX_AVATAR = 400 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// The line manager in HR, or a team lead of one of the person's stages.
async function isTheirLead(viewer: AppUser, userId: string) {
  const target = await loadUser(userId);
  if (!target) return false;
  if (STAGES.some((s) => isLeadOf(viewer, s) && target.roles.includes(s))) return true;
  // A department's head or lead, for people in that department.
  if (
    await get(
      "SELECT 1 AS x FROM department_positions me JOIN department_positions them ON them.department = me.department WHERE me.user_id = ? AND me.position IN ('head','lead') AND them.user_id = ?",
      viewer.id,
      userId,
    )
  )
    return true;
  return !!(await get(
    "SELECT 1 AS x FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.user_id = ? AND m.user_id = ?",
    userId,
    viewer.id,
  ));
}

async function canSeeFiles(viewer: AppUser, userId: string) {
  return viewer.id === userId || can(viewer, "hr.access") || can(viewer, "users.manage") || (await isTheirLead(viewer, userId));
}

export async function getProfile(viewer: AppUser, userId: string): Promise<Profile | null> {
  const u = await loadUser(userId);
  if (!u?.active && viewer.id !== userId) return null;
  if (!u) return null;
  const p = await get<{ headline: string | null; about: string | null; location: string | null; avatar: string | null; cover: Cover; skills: string; education: string; experience: string; languages: string; links: string; study_status: Profile["studyStatus"]; hidden_sections: string; contact: string }>(
    "SELECT * FROM profiles WHERE user_id = ?",
    userId,
  );
  const self = viewer.id === userId;
  const hidden = parseJson<ProfileSection[]>(p?.hidden_sections, []);
  const files = (await canSeeFiles(viewer, userId))
    ? (await all<{ id: string; kind: string; title: string; name: string; size: number; created_at: string }>("SELECT id, kind, title, name, size, created_at FROM profile_files WHERE user_id = ? ORDER BY created_at DESC", userId)).map((f) => ({
        id: f.id,
        kind: f.kind,
        title: f.title,
        name: f.name,
        size: Number(f.size),
        createdAt: f.created_at,
      }))
    : null;
  // Sections the person hid are left out for everyone else.
  const shows = (k: ProfileSection) => self || !hidden.includes(k);
  return {
    userId,
    name: u.name,
    email: u.email,
    roles: u.roles.map((r) => ROLE_LABELS[r]),
    headline: p?.headline ?? u.title ?? null,
    about: shows("about") ? (p?.about ?? null) : null,
    location: p?.location ?? null,
    avatar: p?.avatar ?? null,
    cover: p?.cover ?? "emerald",
    skills: shows("skills") ? parseJson(p?.skills, []) : [],
    education: shows("education") ? parseJson(p?.education, []) : [],
    experience: shows("experience") ? parseJson(p?.experience, []) : [],
    languages: shows("languages") ? parseJson(p?.languages, []) : [],
    links: shows("links") ? parseJson(p?.links, []) : [],
    studyStatus: p?.study_status ?? null,
    // Sections the person hid are hidden from others, not from themselves.
    hidden,
    contact: self ? { ...CONTACT_DEFAULT, ...parseJson<Partial<Contact>>(p?.contact, {}) } : null,
    files: self || !hidden.includes("files") ? files : can(viewer, "hr.access") ? files : null,
    canEdit: self,
  };
}

export type ProfileInput = Partial<Omit<Profile, "userId" | "name" | "email" | "roles" | "files" | "canEdit" | "contact">> & { contact?: Partial<Contact> };

export async function saveProfile(user: AppUser, input: ProfileInput) {
  const cur = await getProfile(user, user.id);
  if (!cur) throw new WorkflowError("NOT_FOUND", "Your account was not found.");
  const pick = <T>(v: T | undefined, d: T) => (v === undefined ? d : v);
  const avatar = pick(input.avatar, cur.avatar);
  if (avatar && (!/^data:image\/(png|jpe?g|webp);base64,/.test(avatar) || avatar.length > MAX_AVATAR * 1.4)) throw new WorkflowError("VALIDATION", "The photo must be a PNG, JPEG or WebP under 400 KB.");
  const skills = pick(input.skills, cur.skills)
    .map((s) => ({ name: str(s.name, 60), level: SKILL_LEVELS.includes(s.level) ? s.level : "good" }))
    .filter((s) => s.name)
    .slice(0, 40);
  const education = pick(input.education, cur.education)
    .map((e) => ({ school: str(e.school, 120), degree: str(e.degree, 80), field: str(e.field, 120), from: str(e.from, 10), to: str(e.to, 10), status: e.status === "ongoing" ? ("ongoing" as const) : ("completed" as const) }))
    .filter((e) => e.school)
    .slice(0, 15);
  const experience = pick(input.experience, cur.experience)
    .map((e) => ({ org: str(e.org, 120), title: str(e.title, 120), from: str(e.from, 10), to: str(e.to, 10), note: str(e.note, 500) }))
    .filter((e) => e.org)
    .slice(0, 20);
  const languages = pick(input.languages, cur.languages)
    .map((l) => ({ name: str(l.name, 40), level: str(l.level, 30) }))
    .filter((l) => l.name)
    .slice(0, 10);
  const links = pick(input.links, cur.links)
    .map((l) => ({ label: str(l.label, 40), url: str(l.url, 300) }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 10);
  const cover = COVERS.includes(input.cover as Cover) ? (input.cover as Cover) : cur.cover;
  const study = input.studyStatus === undefined ? cur.studyStatus : STUDY_STATUSES.includes(input.studyStatus as never) ? input.studyStatus : null;
  const hidden = pick(input.hidden, cur.hidden).filter((h) => PROFILE_SECTIONS.includes(h));
  const vis = (v: unknown, d: Visibility) => (VISIBILITY.includes(v as Visibility) ? (v as Visibility) : d);
  const cc = { ...(cur.contact ?? CONTACT_DEFAULT), ...(input.contact ?? {}) };
  const contact: Contact = {
    phone: str(cc.phone, 40),
    phone2: str(cc.phone2, 40),
    workEmail: str(cc.workEmail, 120),
    telegram: str(cc.telegram, 60).replace(/^@/, ""),
    whatsapp: str(cc.whatsapp, 40),
    office: str(cc.office, 120),
    phoneVisible: vis(cc.phoneVisible, "team"),
    emailVisible: vis(cc.emailVisible, "everyone"),
    messengersVisible: vis(cc.messengersVisible, "team"),
  };
  await run(
    `INSERT INTO profiles (user_id, headline, about, location, avatar, cover, skills, education, experience, languages, links, study_status, hidden_sections, contact, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET headline = excluded.headline, about = excluded.about, location = excluded.location, avatar = excluded.avatar, cover = excluded.cover,
       skills = excluded.skills, education = excluded.education, experience = excluded.experience, languages = excluded.languages, links = excluded.links,
       study_status = excluded.study_status, hidden_sections = excluded.hidden_sections, contact = excluded.contact, updated_at = excluded.updated_at`,
    user.id,
    str(pick(input.headline, cur.headline) ?? "", 120) || null,
    str(pick(input.about, cur.about) ?? "", 2000) || null,
    str(pick(input.location, cur.location) ?? "", 80) || null,
    avatar,
    cover,
    JSON.stringify(skills),
    JSON.stringify(education),
    JSON.stringify(experience),
    JSON.stringify(languages),
    JSON.stringify(links),
    study,
    JSON.stringify(hidden),
    JSON.stringify(contact),
    nowIso(),
  );
}

export async function addProfileFile(user: AppUser, input: { kind: string; title?: string; file: { name: string; mime: string; base64: string } }) {
  const size = Math.floor((input.file.base64.length * 3) / 4);
  if (size > MAX_FILE) throw new WorkflowError("VALIDATION", "Files are limited to 8 MB.");
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM profile_files WHERE user_id = ?", user.id))?.c ?? 0);
  if (n >= 30) throw new WorkflowError("VALIDATION", "Keep at most 30 files; remove some first.");
  const kind = FILE_KINDS.includes(input.kind as never) ? input.kind : "other";
  const name = input.file.name.replace(/[\\/]/g, "_").slice(0, 160) || "file";
  await run(
    "INSERT INTO profile_files (id, user_id, kind, title, name, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    uid("pf_"),
    user.id,
    kind,
    str(input.title ?? "", 120) || name,
    name,
    input.file.mime.slice(0, 100) || "application/octet-stream",
    size,
    input.file.base64,
    nowIso(),
  );
}

export async function deleteProfileFile(user: AppUser, id: string) {
  const f = await get<{ user_id: string; name: string }>("SELECT user_id, name FROM profile_files WHERE id = ?", id);
  if (!f) return;
  if (f.user_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can remove only your own files.");
  await run("DELETE FROM profile_files WHERE id = ?", id);
  await audit({ actor: user }, { action: "profile.file", summary: `${user.name} removed ${f.name} from their profile` });
}

export async function readProfileFile(viewer: AppUser, id: string) {
  const f = await get<{ user_id: string; name: string; mime: string; data: string }>("SELECT user_id, name, mime, data FROM profile_files WHERE id = ?", id);
  if (!f || !(await canSeeFiles(viewer, f.user_id))) return null;
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

// Small avatars for the people list and the top bar.
export async function avatarsFor(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await all<{ user_id: string; avatar: string | null }>(`SELECT user_id, avatar FROM profiles WHERE avatar IS NOT NULL AND user_id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return Object.fromEntries(rows.map((r) => [r.user_id, r.avatar!]));
}

// Everyone in the workspace with a headline and top skills, for the people directory.
export async function directory() {
  const rows = await all<{ id: string; name: string; title: string | null; headline: string | null; avatar: string | null; skills: string | null; cover: string | null }>(
    "SELECT u.id, u.name, u.title, p.headline, p.avatar, p.skills, p.cover FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.active = 1 ORDER BY u.name",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, headline: r.headline ?? r.title, avatar: r.avatar, cover: (r.cover ?? "emerald") as Cover, skills: parseJson<Skill[]>(r.skills, []).slice(0, 5).map((s) => s.name) }));
}

// Someone in the same team: a shared production stage, a shared department, or their lead or line manager.
async function sameTeam(viewer: AppUser, userId: string) {
  if (viewer.id === userId) return true;
  const target = await loadUser(userId);
  if (!target) return false;
  if (STAGES.some((st) => viewer.roles.includes(st) && target.roles.includes(st))) return true;
  if (await isTheirLead(viewer, userId)) return true;
  return !!(await get(
    "SELECT 1 AS x FROM department_positions a JOIN department_positions b ON b.department = a.department WHERE a.user_id = ? AND b.user_id = ?",
    viewer.id,
    userId,
  ));
}

export type ContactCard = {
  userId: string;
  name: string;
  handle: string;
  avatar: string | null;
  cover: Cover;
  headline: string | null;
  roles: string[];
  lastActiveAt: string | null;
  email: string | null;
  workEmail: string | null;
  phone: string | null;
  phone2: string | null;
  telegram: string | null;
  whatsapp: string | null;
  office: string | null;
  location: string | null;
  isSelf: boolean;
};

// What a colleague sees when they tap someone in chat: each detail as far as the person allows.
export async function contactCard(viewer: AppUser, userId: string): Promise<ContactCard | null> {
  const u = await loadUser(userId);
  if (!u?.active) return null;
  const p = await get<{ headline: string | null; avatar: string | null; cover: Cover | null; contact: string | null; location: string | null }>("SELECT headline, avatar, cover, contact, location FROM profiles WHERE user_id = ?", userId);
  const c = { ...CONTACT_DEFAULT, ...parseJson<Partial<Contact>>(p?.contact, {}) };
  const team = await sameTeam(viewer, userId);
  const admin = can(viewer, "users.manage") || can(viewer, "hr.access");
  const allowed = (v: Visibility) => viewer.id === userId || admin || v === "everyone" || (v === "team" && team);
  const last = await get<{ last_active_at: string | null; handle: string }>("SELECT last_active_at, handle FROM users WHERE id = ?", userId);
  return {
    userId,
    name: u.name,
    handle: last?.handle ?? u.handle,
    avatar: p?.avatar ?? null,
    cover: p?.cover ?? "emerald",
    headline: p?.headline ?? u.title ?? null,
    roles: u.roles.map((r) => ROLE_LABELS[r]),
    lastActiveAt: last?.last_active_at ?? null,
    email: allowed(c.emailVisible) ? u.email : null,
    workEmail: allowed(c.emailVisible) && c.workEmail ? c.workEmail : null,
    phone: allowed(c.phoneVisible) && c.phone ? c.phone : null,
    phone2: allowed(c.phoneVisible) && c.phone2 ? c.phone2 : null,
    telegram: allowed(c.messengersVisible) && c.telegram ? c.telegram : null,
    whatsapp: allowed(c.messengersVisible) && c.whatsapp ? c.whatsapp : null,
    office: c.office || null,
    location: p?.location ?? null,
    isSelf: viewer.id === userId,
  };
}
