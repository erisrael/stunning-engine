// Which pages a person can open, by the same rules as the pages and the sidebar. The assistant uses it so it only
// lists, suggests and opens pages the person's role can reach.

import { can, type AppUser } from "./users";
import type { Capability } from "@/lib/domain";
import { PLACES } from "@/lib/assistant";

type Rule = { prefix: string; any?: Capability[]; check?: (u: AppUser) => Promise<boolean> | boolean };

// A department page: the department itself, and Configure, Team and Analyze by its rights.
const dept = (key: string, view?: string) => async (u: AppUser) => {
  const { workAccess } = await import("./dept-config");
  const a = await workAccess(u, key).catch(() => null);
  if (!a) return false;
  if (view === "configure") return a.rights.configure;
  if (view === "team" || view === "analyze") return a.rights.seeAll;
  return true;
};

// Longest prefix first.
const RULES: Rule[] = [
  { prefix: "/admin/data", any: ["data.manage"] },
  { prefix: "/admin", any: ["users.manage", "data.manage"] },
  { prefix: "/audit", any: ["users.manage"] },
  { prefix: "/settings", any: ["settings.manage"] },
  { prefix: "/hr", any: ["hr.access"] },
  { prefix: "/finance", any: ["finance.access", "finance.view", "finance.payroll", "finance.owner_approve"] },
  { prefix: "/company", any: ["company.view"] },
  { prefix: "/present", any: ["company.view"] },
  { prefix: "/owners", any: ["owners.view"] },
  { prefix: "/reports", any: ["reports.view"] },
  { prefix: "/coverage", any: ["nav.coverage"] },
  { prefix: "/overview", any: ["nav.overview"] },
  { prefix: "/my-work", check: () => true },
  { prefix: "/handovers/settings", any: ["settings.manage", "users.manage"] },
  { prefix: "/handovers", any: ["nav.handovers"] },
  { prefix: "/calendar", any: ["nav.calendar"] },
  { prefix: "/import-export", any: ["import.run"] },
  { prefix: "/assign", any: ["assign.bulk"] },
  { prefix: "/checklists", any: ["checklists.manage"] },
  { prefix: "/content", any: ["nav.list"] },
  { prefix: "/pipeline", any: ["nav.board"] },
  { prefix: "/sheet", any: ["nav.sheet"] },
  { prefix: "/items/new", any: ["items.create"] },
  { prefix: "/questions", any: ["nav.questions"] },
  { prefix: "/email", any: ["email.send"] },
  { prefix: "/team", any: ["nav.team", "team.view"] },
  { prefix: "/strategy", any: ["perf.library", "perf.view_company", "users.manage", "owners.view"] },
  { prefix: "/sessions", check: async (u) => can(u, "team.view") || u.roles.includes("recording") || (await (await import("./sessions")).canPlanSessions(u)) },
  { prefix: "/curriculum", check: async (u) => (await (await import("./curriculum-fix")).curriculumRights(u)).rename || (await import("./editorial")).assignableStages(u).length > 0 },
  { prefix: "/legacy", check: async (u) => {
    const { canUseLegacy, legacyConfig } = await import("./legacy");
    return canUseLegacy(u) && ((await legacyConfig()).on || can(u, "settings.manage") || can(u, "users.manage"));
  } },
  { prefix: "/support", check: async (u) => !!(await (await import("./support-desk")).supportNav(u)) },
  { prefix: "/dev", check: dept("dev") },
  { prefix: "/marketing", check: dept("marketing") },
  { prefix: "/studio", check: (u) => can(u, "studio.access") || can(u, "owners.view") },
  { prefix: "/recognition", check: async () => (await (await import("./recognition")).recognitionConfig()).enabled },
];

export async function canOpenPath(u: AppUser, href: string): Promise<boolean> {
  const path = href.split(/[?#]/)[0]!;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const d = path.match(/^\/d\/([a-z0-9-]+)(?:\/(\w+))?/) ?? path.match(/^\/(dev|marketing)(?:\/(\w+))?$/);
  if (d) return dept(d[1]!, d[2])(u);
  const rule = RULES.filter((r) => path === r.prefix || path.startsWith(`${r.prefix}/`)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!rule) return true;
  if (rule.any && rule.any.some((c) => can(u, c))) return true;
  if (rule.check) return !!(await rule.check(u));
  return false;
}

// The assistant's page list, for this person: the places they can open ({home} filled in, or left out).
export async function placesFor(u: AppUser, home: string | null) {
  const out: { name: string; href: string }[] = [];
  for (const p of PLACES) {
    if (p.href.includes("{home}") && !home) continue;
    const href = p.href.replace("{home}", home ?? "");
    if (await canOpenPath(u, href)) out.push({ name: p.name, href });
  }
  return out;
}
