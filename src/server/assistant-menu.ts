// "What can you do?" (Update 1.0, phase 5): the assistant answers with buttons, grouped (Me, Tasks, Team, Finance,
// Support, Production, HR, Admin), built from what this person's role and rights allow and only for pages they can
// open. Each button does one of three things:
// - flow: a written flow in the assistant (leave, check in, start a task...);
// - go: opens the page;
// - guide: a guided session that opens the page and moves through it: it highlights each control with a short
//   note, presses navigation-only controls itself (tabs, "go online"), and leaves forms, imports and saving to the
//   person. Exports are offered only to roles that have the export on that page.

import { can, type AppUser } from "./users";
import { canOpenPath } from "./page-access";
import { abilities } from "./assistant-ai";
import { STAGES } from "@/lib/domain";
import type { Flow, ShowStep } from "@/lib/assistant";

type Viewer = AppUser & { activeRole: string };
export type MenuItem = { id: string; label: string; labelAm: string; kind: "flow" | "go" | "guide"; flow?: string; href?: string; steps?: ShowStep[] };
export type MenuGroup = { key: string; label: string; labelAm: string; items: MenuItem[] };

const GROUPS: [string, string, string][] = [
  ["me", "Me", "እኔ"],
  ["tasks", "My tasks", "ተግባሮቼ"],
  ["team", "My team", "ቡድኔ"],
  ["production", "Production", "ምርት"],
  ["finance", "Finance", "ፋይናንስ"],
  ["support", "Customer support", "የደንበኛ ድጋፍ"],
  ["hr", "HR", "የሰው ኃይል"],
  ["admin", "Admin", "አስተዳደር"],
];

export async function assistantMenu(user: Viewer, ctx: { flows: Flow[]; home: { base: string } | null }): Promise<MenuGroup[]> {
  const ab = await abilities(user).catch(() => null);
  const base = ctx.home?.base ?? null;
  const has = (key: string) => ctx.flows.some((f) => f.key === key);
  const out = new Map<string, MenuItem[]>(GROUPS.map(([k]) => [k, []]));
  const add = async (group: string, item: MenuItem) => {
    const href = item.href ?? item.steps?.find((s) => s.href)?.href;
    if (href && !(await canOpenPath(user, href.replace("{home}", base ?? "/dashboard").split("?")[0]!))) return;
    out.get(group)!.push(item);
  };
  const flow = (group: string, key: string, label: string, labelAm: string) => (has(key) ? add(group, { id: key, label, labelAm, kind: "flow", flow: key }) : Promise.resolve());
  const production = (STAGES as readonly string[]).includes(user.activeRole);

  // Me: what everyone does for themselves.
  await flow("me", "do.checkin", "Check in or out", "መግቢያ ወይም መውጫ");
  await flow("me", "do.leave", "Ask for leave", "ፈቃድ መጠየቅ");
  await add("me", { id: "go.attendance", label: "My attendance", labelAm: "የእኔ መገኘት", kind: "go", href: "/attendance" });
  await flow("me", "show.claim", "Claim an expense", "ወጪ መጠየቅ");
  await add("me", { id: "go.leave", label: "Leave balance", labelAm: "የቀረኝ ፈቃድ", kind: "go", href: "/profile?tab=leave" });

  // Tasks: a member's own work. Creating a task opens the form on the page, filled in (the person presses Save).
  await flow("tasks", "do.task", ab?.lead ? "Create a task (for me or my team)" : "Create a task for me", ab?.lead ? "ተግባር ፍጠር (ለራሴ ወይም ለቡድኔ)" : "ለራሴ ተግባር ፍጠር");
  await flow("tasks", "do.start", "Start my next task", "ቀጣዩን ተግባሬን ጀምር");
  await flow("tasks", "show.send", "Finish and send my work", "ሥራዬን ጨርሼ ላክ");
  await add("tasks", { id: "go.mywork", label: "Open my work", labelAm: "ሥራዬን ክፈት", kind: "go", href: "/my-work" });
  await flow("tasks", "show.request", "Ask another department", "ሌላ ክፍል ጠይቅ");

  // Team: leads.
  if (ab?.lead) {
    await flow("team", "do.assign", "Assign work", "ሥራ መድብ");
    await flow("team", "show.approve", "Approve sent work", "የተላከ ሥራ አጽድቅ");
    await flow("team", "show.accept", "Accept arrivals", "የደረሰ ሥራ ተቀበል");
    await add("team", { id: "go.team", label: "How my team is doing", labelAm: "የቡድኔ ሁኔታ", kind: "go", href: "/team" });
  }
  if (ab?.approver) await flow("team", "show.approvals", "Leave, claims and corrections", "ፈቃድ፣ ወጪ እና እርማቶች");

  // Production: the stage teams.
  if (production || user.leads.length) {
    await add("production", {
      id: "guide.take",
      label: "Take parts to work on",
      labelAm: "የምሠራቸውን ክፍሎች ውሰድ",
      kind: "guide",
      steps: [
        { href: "/my-work?view=table", selector: "[data-take-work]", note: "Filter the parts, tick the ones you will do, then press Take. You can take several at once." },
      ],
    });
    await flow("production", "show.session", "Book a studio session", "የስቱዲዮ ቀጠሮ ያዝ");
    if (user.leads.length)
      await add("production", {
        id: "guide.approve-parts",
        label: "Approve or return parts",
        labelAm: "ክፍሎችን አጽድቅ ወይም መልስ",
        kind: "guide",
        steps: [{ href: "/approvals", selector: "[data-approve-row], main", note: "Tick the parts, then Approve or Return with a note: many at once." }],
      });
    if (user.roles.includes("recording" as never))
      await add("production", { id: "guide.handoff", label: "Hand off a batch", labelAm: "ክፍሎችን በአንድ ላይ አስረክብ", kind: "guide", steps: [{ href: "/legacy?view=ready", selector: "[data-legacy-ready]", note: "Filter, tick the parts that are ready, then Hand off. The lead hands them over to Editing." }] });
  }

  // Finance.
  if (ab?.finance) {
    await add("finance", { id: "guide.invoices", label: "Unverified invoices", labelAm: "ያልተረጋገጡ ደረሰኞች", kind: "guide", steps: [{ href: "/legacy-cms?view=invoices", selector: "main", note: "Each invoice: Verify it, or mark Unable to verify with the reason. Cases go to Support or stay with Finance." }] });
    await add("finance", { id: "go.chapa-daily", label: "Today's failed and pending payments", labelAm: "የዛሬ ያልተሳኩ እና በመጠባበቅ ያሉ ክፍያዎች", kind: "go", href: "/finance/chapa?tab=daily" });
    await add("finance", { id: "go.chapa", label: "Chapa summary", labelAm: "የቻፓ ማጠቃለያ", kind: "go", href: "/finance/chapa" });
    await add("finance", { id: "go.followups", label: "Send follow-ups to Support", labelAm: "ክትትሎችን ለድጋፍ ላክ", kind: "go", href: "/finance/chapa?tab=followup" });
    await flow("finance", "show.finance", "Bills, payments and claims", "ሂሳቦች፣ ክፍያዎች እና ወጪዎች");
  }

  // Customer support agents.
  if (ab?.support) {
    await add("support", {
      id: "guide.next-ticket",
      label: "Next ticket for me",
      labelAm: "ቀጣዩ ጥያቄ ለእኔ",
      kind: "guide",
      steps: [
        { href: "/support?tab=desk&view=mine", selector: "[data-status='online']", note: "Going online so new tickets come to you.", act: "click" },
        { selector: "[data-ticket-row]", note: "Your next ticket. Open it to read and reply." },
      ],
    });
    await add("support", { id: "guide.transfer", label: "Move a ticket to Finance", labelAm: "ጥያቄን ወደ ፋይናንስ አስተላልፍ", kind: "guide", steps: [{ href: "/support?tab=desk&view=mine", selector: "[data-ticket-row]", note: "Open the ticket, choose the Finance queue in Queue and write a note for them. The customer keeps one conversation." }] });
    await add("support", { id: "go.followup-queue", label: "Payment follow-ups", labelAm: "የክፍያ ክትትሎች", kind: "go", href: "/support?tab=desk&view=all" });
    await add("support", { id: "go.kb", label: "Help articles", labelAm: "የእርዳታ ጽሑፎች", kind: "go", href: "/support?tab=kb" });
  }

  // HR.
  if (ab?.hr) {
    await flow("hr", "show.hr_people", "Add or update an employee", "ሠራተኛ ጨምር ወይም አዘምን");
    await add("hr", { id: "go.hr-leave", label: "Leave waiting for HR", labelAm: "ለሰው ኃይል የሚጠብቅ ፈቃድ", kind: "go", href: "/approvals" });
    if (ab.announce) await add("hr", { id: "go.announce", label: "Post an announcement", labelAm: "ማስታወቂያ ለጥፍ", kind: "go", href: "/announcements" });
    if (ab.attendanceHr) await add("hr", { id: "go.attendance-team", label: "Who is in today", labelAm: "ዛሬ ማን መጣ", kind: "go", href: "/attendance?tab=team" });
  }

  // Admin.
  if (can(user, "users.manage")) {
    await add("admin", { id: "go.health", label: "Health checks", labelAm: "የስርዓት ጤና", kind: "go", href: "/admin?tab=system" });
    await add("admin", { id: "go.people", label: "People and roles", labelAm: "ሰዎች እና ሚናዎች", kind: "go", href: "/admin?tab=people" });
    await add("admin", { id: "go.assistant", label: "Assistant usage and refusals", labelAm: "የረዳቱ አጠቃቀም", kind: "go", href: "/admin/assistant" });
  }

  return GROUPS.map(([key, label, labelAm]) => ({ key, label, labelAm, items: out.get(key)! })).filter((g) => g.items.length);
}
