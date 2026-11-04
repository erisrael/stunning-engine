// The assistant (Phase 13): a guide in the corner of every page, built from fixed, written flows (no language
// model, nothing sent outside). Typed text is matched against each flow's keywords and synonyms; a flow either
// does the task with pickers and a summary ("do"), takes the person there and points at what to press ("show"),
// or answers ("answer"). Admin can switch flows off per role, add keywords and write short answers.

import { TUTORIALS } from "./tutorials";

export type Audience = "everyone" | "member" | "lead" | "department" | "production" | "hr" | "finance" | "admin";

export type ShowStep = { href?: string; selector?: string; text?: string; note: string };

export type Flow =
  | { key: string; kind: "do"; title: string; hint: string; audience: Audience[]; keywords: string[] }
  | { key: string; kind: "show"; title: string; hint: string; audience: Audience[]; keywords: string[]; steps: ShowStep[] }
  | { key: string; kind: "answer"; title: string; hint: string; audience: Audience[]; keywords: string[]; answer: string; href?: string }
  | { key: string; kind: "guide"; title: string; hint: string; audience: Audience[]; keywords: string[]; steps: string[]; href?: string };

// Department pages are written with "{dept}" for the person's own department (for example /dev).
export const FLOWS: Flow[] = [
  { key: "do.leave", kind: "do", title: "Ask for leave", hint: "Choose the type and the days; it goes to your manager", audience: ["everyone"], keywords: ["leave", "holiday", "vacation", "day off", "sick", "absent", "time off", "annual leave"] },
  { key: "do.start", kind: "do", title: "Start my next task", hint: "Pick from your To do; the timer starts", audience: ["department"], keywords: ["start", "begin", "work on", "my task", "next task", "timer"] },
  { key: "do.task", kind: "do", title: "Create a task", hint: "In any department you work in, for you or someone", audience: ["everyone"], keywords: ["create task", "new task", "add task", "add a task", "make a task", "todo", "to do", "remind me to", "bug", "ticket", "issue"] },
  { key: "do.checkin", kind: "do", title: "Check in or out now", hint: "Records the time now", audience: ["everyone"], keywords: ["check in", "check me in", "check out", "check me out", "clock in", "clock out", "i am here", "arrived", "going home", "leaving"] },
  { key: "do.assign", kind: "do", title: "Assign work", hint: "Pick work nobody has, then the person", audience: ["lead"], keywords: ["assign", "give", "give videos to", "allocate", "hand out", "delegate", "who does"] },
  {
    key: "show.send",
    kind: "show",
    title: "Start, finish and send my work",
    hint: "Your board on Home",
    audience: ["member", "department", "production"],
    keywords: ["finish", "done", "send", "submit", "my work", "my board", "mark done"],
    steps: [
      { href: "{home}", selector: "[data-flow-column='todo'], [data-studio-column='draft'], section[aria-label='My work']", note: "Your work is here. Press Start on a card when you begin." },
      { selector: "[data-flow-column='done'], section[aria-label='My work']", note: "When it is finished, press Done; then Send it (one or all)." },
    ],
  },
  {
    key: "show.approve",
    kind: "show",
    title: "Approve and hand over",
    hint: "The lead desk on Home",
    audience: ["lead"],
    keywords: ["approve", "hand over", "handover", "review", "return", "sent to me", "waiting for me"],
    steps: [
      { href: "{home}", selector: "[data-flow-section='approve'], [data-flow-section='checks'], section[aria-label='To approve']", note: "Work sent to you waits here. Approve it, or Return it with a note." },
      { selector: "[data-flow-section='ready'], section[aria-label='Ready for handover']", note: "Approved work is handed over to the next stage as a batch." },
    ],
  },
  {
    key: "show.accept",
    kind: "show",
    title: "Accept arrivals and assign",
    hint: "What arrives from the stage before",
    audience: ["lead"],
    keywords: ["accept", "arriving", "arrived", "incoming", "missing", "send back"],
    steps: [
      { href: "{home}", selector: "[data-flow-section='arriving'], section[aria-label^='Arriving']", note: "Accept what arrived, or send it back as missing with what is wrong." },
      { selector: "[data-flow-section='assign'], section[aria-label='To assign']", note: "Then give it to someone; their load is shown beside their name." },
    ],
  },
  {
    key: "show.checkin",
    kind: "show",
    title: "Check in or correct attendance",
    hint: "Attendance",
    audience: ["everyone"],
    keywords: ["check in", "checkin", "check out", "attendance", "clock", "late", "correction", "forgot to check"],
    steps: [
      { href: "/attendance", text: "Check in", note: "Check in here when you are on the office network, or scan the QR code at the entrance." },
      { selector: "main", note: "A day that is wrong can be corrected from its row: ask for a correction with the right times." },
    ],
  },
  {
    key: "show.claim",
    kind: "show",
    title: "Claim an expense",
    hint: "Profile, Pay and claims",
    audience: ["everyone"],
    keywords: ["claim", "expense", "receipt", "reimburse", "refund", "purchase request"],
    steps: [{ href: "/profile?tab=pay", selector: "main", note: "Add a claim with the receipt; it goes for approval and then to payroll." }],
  },
  {
    key: "show.session",
    kind: "show",
    title: "Book a studio session",
    hint: "Studio sessions",
    audience: ["production", "lead"],
    keywords: ["book", "session", "studio", "room", "schedule recording", "presenter"],
    steps: [{ href: "/sessions", text: "Book", note: "Press Book, choose the day, the time, the camera operator and the parts." }],
  },
  {
    key: "show.review",
    kind: "show",
    title: "Review a task",
    hint: "Department checks (code review, QA, subject review)",
    audience: ["department", "lead"],
    keywords: ["code review", "qa", "test", "check", "pass", "bug", "reviewer", "subject review"],
    steps: [{ href: "{home}", selector: "[data-flow-section='checks'], [data-studio-column='to-review']", note: "Work waiting for your check is here. Pass it on, or return it (as a bug with steps to reproduce)." }],
  },
  {
    key: "show.sprint",
    kind: "show",
    title: "Plan the sprint",
    hint: "Sprint page",
    audience: ["lead"],
    keywords: ["sprint", "plan the sprint", "capacity", "burndown", "velocity", "standup", "stand-up", "retro"],
    steps: [{ href: "{home}/sprint", selector: "[data-sprint-planning], [data-sprint-view]", note: "Add work from the backlog; capacity per person fills as you go." }],
  },
  {
    key: "show.request",
    kind: "show",
    title: "Ask another department",
    hint: "Requests",
    audience: ["everyone"],
    keywords: ["request", "ask dev", "ask marketing", "ask studio", "need help from", "another department", "design request", "feature request"],
    steps: [{ href: "/requests", text: "New request", note: "Press New request, choose the department and say what you need; you can follow it here." }],
  },
  {
    key: "show.email",
    kind: "show",
    title: "Read and write my email",
    hint: "Email, your company inbox",
    audience: ["everyone"],
    keywords: ["email", "mail", "inbox", "reply", "compose", "send an email", "my mail"],
    steps: [{ href: "/email", text: "Compose", note: "Your inbox is here. Press Compose to write; open a message to reply or forward." }],
  },
  {
    key: "show.chat",
    kind: "show",
    title: "Message a colleague",
    hint: "Chat",
    audience: ["everyone"],
    keywords: ["message", "chat", "talk to", "text", "dm", "call", "group"],
    steps: [{ href: "/chat", selector: "main", note: "Pick a conversation, or start a new one with the person's name." }],
  },
  {
    key: "show.approvals",
    kind: "show",
    title: "Approve leave, claims and corrections",
    hint: "Approvals",
    audience: ["lead", "hr", "finance"],
    keywords: ["approve leave", "approvals", "pending approval", "approve claim", "approve correction", "reject"],
    steps: [{ href: "/approvals", selector: "main", note: "Everything waiting for your decision is here. Open one to approve or reject it with a note." }],
  },
  {
    key: "show.hr_people",
    kind: "show",
    title: "Add or update an employee",
    hint: "HR, People",
    audience: ["hr"],
    keywords: ["employee", "add employee", "new hire", "contract", "hr record", "onboarding", "salary", "probation"],
    steps: [{ href: "/hr", selector: "main", note: "HR's people are here. Open a person to change their record, or add someone new." }],
  },
  {
    key: "show.finance",
    kind: "show",
    title: "Record a bill, payment or claim",
    hint: "Finance",
    audience: ["finance"],
    keywords: ["bill", "invoice", "payment", "pay supplier", "budget", "expense", "payroll", "finance"],
    steps: [{ href: "/finance", selector: "main", note: "Finance's work is in these tabs: bills, invoices, payments, claims, budgets and payroll." }],
  },
];

// Tutorials (lib/tutorials.ts): numbered steps with the page, for every department.
FLOWS.push(...TUTORIALS.map((t): Flow => ({ key: t.key, kind: "guide", title: t.title, hint: `${t.steps.length} steps`, audience: t.audience ?? ["everyone"], keywords: t.keywords, steps: t.steps, href: t.href })));

// "Where is ...?": every main page by name.
export const PLACES: { name: string; href: string; words: string[] }[] = [
  { name: "Home", href: "/dashboard", words: ["home", "today", "dashboard", "start page"] },
  { name: "Attendance", href: "/attendance", words: ["attendance", "check in", "timesheet", "shift"] },
  { name: "Approvals", href: "/approvals", words: ["approvals", "approve", "pending"] },
  { name: "Leave", href: "/profile?tab=leave", words: ["leave", "holiday", "balance"] },
  { name: "Pay and claims", href: "/profile?tab=pay", words: ["pay", "payslip", "salary", "claims"] },
  { name: "My record", href: "/profile?tab=record", words: ["my record", "documents", "contract", "hr record"] },
  { name: "Account and password", href: "/profile?tab=account", words: ["password", "two-step", "account", "sessions", "devices"] },
  { name: "Notifications", href: "/notifications", words: ["notifications", "notices", "alerts"] },
  { name: "Chat", href: "/chat", words: ["chat", "messages", "group", "call"] },
  { name: "Email", href: "/email", words: ["email", "mail", "send email"] },
  { name: "Requests", href: "/requests", words: ["requests", "ask another department"] },
  { name: "People", href: "/people", words: ["people", "directory", "colleagues", "phone number"] },
  { name: "Studio sessions", href: "/sessions", words: ["sessions", "recording schedule", "studio booking"] },
  { name: "Overview", href: "/overview", words: ["overview", "progress", "curriculum progress", "presentation"] },
  { name: "Help", href: "/profile/help", words: ["help", "guide", "manual", "how to"] },
  { name: "Board", href: "{home}/board", words: ["board", "kanban"] },
  { name: "Sprint", href: "{home}/sprint", words: ["sprint", "burndown"] },
  { name: "Roadmap", href: "{home}/roadmap", words: ["roadmap", "projects health", "dora"] },
  { name: "Specs and docs", href: "{home}/docs", words: ["docs", "srs", "spec", "requirements", "documents"] },
  { name: "Configure", href: "{home}/configure", words: ["configure", "settings of the department", "flow", "statuses"] },
  { name: "Admin", href: "/admin", words: ["admin", "users", "roles", "sign-in settings"] },
  { name: "HR", href: "/hr", words: ["hr", "human resources", "employees", "staff records"] },
  { name: "Finance", href: "/finance", words: ["finance", "accounts", "bills", "invoices", "budget"] },
  { name: "Dev team", href: "/dev", words: ["dev", "developers", "dev team", "software"] },
  { name: "Marketing", href: "/marketing", words: ["marketing", "campaigns", "social media"] },
  { name: "Studio", href: "/studio", words: ["studio", "content studio", "notes", "exams", "flash cards", "question bank"] },
  { name: "Handovers", href: "/handovers", words: ["handovers", "batches", "incoming work"] },
  { name: "Coverage", href: "/coverage", words: ["coverage", "curriculum", "what is missing"] },
  { name: "Reports", href: "/reports", words: ["reports", "statistics", "numbers"] },
  { name: "Calendar", href: "/calendar", words: ["calendar", "schedule", "events"] },
  { name: "Company", href: "/company", words: ["company", "owners", "whole company"] },
];

// "What does ... mean?": the app's words.
export const GLOSSARY: { term: string; words: string[]; meaning: string }[] = [
  { term: "Done, not sent", words: ["done not sent", "not sent"], meaning: "You marked it finished but have not sent it to your lead yet. Send it from your board." },
  { term: "With the lead", words: ["with the lead", "with lead", "lead review"], meaning: "You sent it; your lead approves it or returns it with a note." },
  { term: "Handover", words: ["handover", "hand over", "batch"], meaning: "Approved work moved to the next team as a batch; that team's lead accepts it or sends it back as missing." },
  { term: "Arriving", words: ["arriving", "arrival"], meaning: "Work handed to your stage that someone must accept first." },
  { term: "Returned", words: ["returned", "sent back"], meaning: "The lead or the next stage sent it back with what to change. The note is on the card." },
  { term: "Blocked", words: ["blocked", "blocker"], meaning: "Work that cannot go on until something else happens; the lead is told." },
  { term: "Code review", words: ["code review", "pull request", "pr"], meaning: "A lead looks at the pull request and its checks, then passes it to QA or returns it." },
  { term: "QA", words: ["qa", "quality", "testing"], meaning: "Testers accept what arrives, test it, and pass it or send it back as a bug with steps to reproduce." },
  { term: "Story points", words: ["story points", "points", "estimate"], meaning: "A rough size for a task. The sprint's capacity and velocity are counted in them." },
  { term: "Velocity", words: ["velocity"], meaning: "How much the team finished per sprint, the average of the last three." },
  { term: "Burndown", words: ["burndown", "burnup"], meaning: "The work left in the sprint day by day, against an even line to zero. The burnup shows done against the total." },
  { term: "Master", words: ["master", "edited master"], meaning: "The final edited video. It is linked or handed over on an external disk, as Settings say." },
  { term: "Grace", words: ["grace", "late"], meaning: "Minutes after the shift start before a check-in counts as late." },
  { term: "Two-step sign-in", words: ["two-step", "2fa", "authenticator", "code"], meaning: "After the password, a code from an app or email, so a stolen password is not enough." },
];

export type AssistantConfig = {
  // Flows switched off, for everyone ("*") or for some roles.
  off: Record<string, string[]>;
  // Extra keywords per flow, written by Admin.
  keywords: Record<string, string[]>;
  // Short answers to common questions.
  answers: { q: string; words: string[]; a: string }[];
};
export const DEFAULT_ASSISTANT: AssistantConfig = { off: {}, keywords: {}, answers: [] };

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9ሀ-፿]+/g, " ")
    .trim()} `;

// Two words alike enough to be a typo of each other (one letter added, missing, changed or swapped).
export function nearly(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Scores a phrase against keywords: a whole keyword counts most, single shared words a little, and words with a
// typo ("leav", "assgin") count almost as much as the right spelling.
export function score(text: string, words: string[]) {
  const t = norm(text);
  const tokens = t.trim().split(" ").filter(Boolean);
  let s = 0;
  for (const w of words) {
    const k = norm(w);
    const parts = k.trim().split(" ").filter(Boolean);
    if (!parts.length) continue;
    if (t.includes(k)) s += 3 + parts.length;
    else if (parts.every((p) => tokens.some((x) => nearly(x, p)))) s += 2 + parts.length;
    else for (const part of parts) if (part.length > 3 && tokens.some((x) => nearly(x, part))) s += 1;
  }
  return s;
}

export type Match =
  | { type: "flow"; flow: Flow; score: number }
  | { type: "place"; place: (typeof PLACES)[number]; score: number }
  | { type: "term"; term: (typeof GLOSSARY)[number]; score: number }
  | { type: "answer"; answer: AssistantConfig["answers"][number]; score: number };

// The best matches for what someone typed, among the flows open to them.
export function matchText(text: string, flows: Flow[], cfg: AssistantConfig, places?: string[]): Match[] {
  const t = norm(text);
  const asksWhere = /\b(where|find|open|go to|page)\b/.test(t);
  const asksMeaning = /\b(what (does|is)|mean|meaning)\b/.test(t);
  const out: Match[] = [];
  for (const f of flows) out.push({ type: "flow", flow: f, score: score(text, [...f.keywords, ...(cfg.keywords[f.key] ?? []), f.title]) });
  for (const p of PLACES.filter((x) => !places || places.includes(x.name))) out.push({ type: "place", place: p, score: score(text, [...p.words, p.name]) + (asksWhere ? 2 : 0) });
  for (const g of GLOSSARY) out.push({ type: "term", term: g, score: score(text, [...g.words, g.term]) + (asksMeaning ? 3 : 0) });
  for (const a of cfg.answers) out.push({ type: "answer", answer: a, score: score(text, [...a.words, a.q]) + 1 });
  return out.filter((m) => m.score >= 3).sort((x, y) => y.score - x.score).slice(0, 4);
}

// The flows open to someone: by their audience, minus what Admin switched off for their role.
export function flowsFor(who: { role: string; lead: boolean; department: boolean; production: boolean; hr: boolean; finance?: boolean; admin: boolean }, cfg: AssistantConfig): Flow[] {
  const has = (a: Audience) =>
    a === "everyone" || (a === "lead" && who.lead) || (a === "member" && !who.lead) || (a === "department" && who.department) || (a === "production" && who.production) || (a === "hr" && who.hr) || (a === "finance" && !!who.finance) || (a === "admin" && who.admin);
  return FLOWS.filter((f) => f.audience.some(has)).filter((f) => {
    const off = cfg.off[f.key] ?? [];
    return !off.includes("*") && !off.includes(who.role);
  });
}
