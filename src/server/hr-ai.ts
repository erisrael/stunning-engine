import { get, run, nowIso } from "./db";
import { WorkflowError, audit } from "./workflow";
import { can, type AppUser } from "./users";

export type HrAiConfig = {
  autonomyMode: "full_autonomous" | "supervised" | "advisory";
  autoApproveLeaveDaysMax: number;
  autoApproveClaimsAmountMax: number;
  autoApproveAttendanceCorrections: boolean;
  lateGraceMinutes: number;
  policyNotes: string;
  enabledCapabilities: string[];
};

export const DEFAULT_HR_AI_CONFIG: HrAiConfig = {
  autonomyMode: "supervised",
  autoApproveLeaveDaysMax: 2,
  autoApproveClaimsAmountMax: 1000,
  autoApproveAttendanceCorrections: true,
  lateGraceMinutes: 15,
  policyNotes:
    "Standard company rules: 16 days annual leave per year accrued monthly; 15 min check-in grace period; expenses over 1,000 ETB require manager receipt review; equipment must be checked in upon resignation or reassignment.",
  enabledCapabilities: [
    "attendance_auditing",
    "leave_management",
    "onboarding_checklists",
    "one_on_one_recording",
    "goals_management",
    "training_assignment",
    "equipment_tracking",
    "job_posting",
    "case_management",
  ],
};

export async function getHrAiConfig(): Promise<HrAiConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.hr_ai'");
  if (!row?.value) return { ...DEFAULT_HR_AI_CONFIG };
  try {
    return { ...DEFAULT_HR_AI_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_HR_AI_CONFIG };
  }
}

export async function saveHrAiConfig(user: AppUser, input: Partial<HrAiConfig>): Promise<HrAiConfig> {
  if (!can(user, "users.manage") && !can(user, "hr.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or HR Managers can configure HR AI settings.");
  }
  const current = await getHrAiConfig();
  const updated: HrAiConfig = {
    ...current,
    ...input,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.hr_ai', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(updated),
    nowIso(),
    user.id
  );
  await audit(
    { actor: user },
    {
      action: "settings.hr_ai",
      summary: `${user.name} updated HR AI agent configuration (autonomy=${updated.autonomyMode})`,
    }
  );
  return updated;
}

