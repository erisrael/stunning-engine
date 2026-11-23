// Configure whole system (Admin): the names and pictures the whole system shows, and its look by default, in one
// place, without code. Internal admins only (users.manage). The page shows every change and asks for confirmation
// before anything is saved; the change is audited with the values before and after.
//
// - The system's name and the line under it: the sidebar, sign-in page, browser tab and the installed app.
// - The name on reports and documents: every PDF, Word and CSV export, emails and printed pages.
// - The logo (sidebar, sign-in, reports) and the favicon (browser tab).
// - Motion: off, subtle or cinematic for everyone who has not chosen, and whether people may switch cinematic on.
// - The icon pack for everyone who has not chosen one.

import { identity, saveIdentity, type Identity } from "./identity";
import { getSettings, saveSetting } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export const MOTION_MODES = ["off", "subtle", "cinematic"] as const;
export type MotionMode = (typeof MOTION_MODES)[number];
import { ICON_PACKS, isIconPack } from "@/lib/icon-packs";
export { ICON_PACKS, isIconPack };

export type SystemConfig = {
  identity: Identity;
  reportName: string;
  motionDefault: MotionMode;
  cinematicAllowed: boolean;
  iconPack: string;
};

export const canConfigureSystem = (user: AppUser) => can(user, "users.manage");

export async function systemConfig(): Promise<SystemConfig> {
  const [id, s] = await Promise.all([identity(), getSettings()]);
  const w = s.workspace;
  return {
    identity: id,
    reportName: w.name,
    motionDefault: MOTION_MODES.includes(w.motionDefault as MotionMode) ? (w.motionDefault as MotionMode) : "subtle",
    cinematicAllowed: w.cinematicAllowed !== false,
    iconPack: isIconPack(w.iconPack) ? w.iconPack : "lucide",
  };
}

export type SystemConfigInput = {
  name: string;
  tagline: string;
  shortName: string;
  color: string;
  reportName: string;
  // A data: URL to replace, null to go back to the Myseed mark, undefined to keep.
  logo?: string | null;
  favicon?: string | null;
  motionDefault: MotionMode;
  cinematicAllowed: boolean;
  iconPack: string;
};

export async function saveSystemConfig(user: AppUser, input: SystemConfigInput) {
  if (!canConfigureSystem(user)) throw new WorkflowError("FORBIDDEN", "Only an internal admin configures the whole system.");
  const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const reportName = clean(input.reportName, 80);
  if (!clean(input.name, 40)) throw new WorkflowError("VALIDATION", "Give the system a name.");
  if (!reportName) throw new WorkflowError("VALIDATION", "Give the name used on reports and documents.");
  if (!MOTION_MODES.includes(input.motionDefault)) throw new WorkflowError("VALIDATION", "Choose off, subtle or cinematic.");
  if (!isIconPack(input.iconPack)) throw new WorkflowError("VALIDATION", "Choose one of the icon packs.");
  if (input.motionDefault === "cinematic" && !input.cinematicAllowed) throw new WorkflowError("VALIDATION", "Cinematic cannot be the default while it is switched off.");

  const before = await systemConfig();
  await saveIdentity(user, { name: input.name, tagline: input.tagline, shortName: input.shortName, color: input.color, ...(input.logo !== undefined ? { logo: input.logo } : {}), ...(input.favicon !== undefined ? { favicon: input.favicon } : {}) });
  const s = await getSettings();
  await saveSetting("workspace", { ...s.workspace, name: reportName, motionDefault: input.motionDefault, cinematicAllowed: !!input.cinematicAllowed, iconPack: input.iconPack }, user.id);
  const after = await systemConfig();
  const summary = (c: SystemConfig) => ({ name: c.identity.name, tagline: c.identity.tagline, shortName: c.identity.shortName, color: c.identity.color, logo: c.identity.logo, favicon: c.identity.favicon, reportName: c.reportName, motionDefault: c.motionDefault, cinematicAllowed: c.cinematicAllowed, iconPack: c.iconPack });
  await audit({ actor: user }, { action: "settings.system", summary: `${user.name} configured the whole system`, oldValue: summary(before), newValue: summary(after) });
  return after;
}
