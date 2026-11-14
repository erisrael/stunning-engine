// Every settings screen with the words people search for (Admin, Search settings; Update 1.0 Phase 8). Admin's own
// tabs carry `tab`; screens elsewhere carry `href`. `need` is the right that opens it.
export type AdminEntry = { tab?: string; href?: string; group: string; label: string; description: string; keywords: string; need: "users" | "data" | "settings" | "any" };

export const ADMIN_INDEX: AdminEntry[] = [
  // People & roles
  { tab: "people", group: "People & roles", label: "People", description: "Add, edit and deactivate accounts; reset passwords; who can see whom.", keywords: "user account staff invite deactivate password reset phone email title capacity hours visibility directory", need: "users" },
  { tab: "teams", group: "People & roles", label: "Teams", description: "Stage teams, their leads and own-work-only people.", keywords: "team lead recording editing uploading publication own work", need: "users" },
  { tab: "departments", group: "People & roles", label: "Departments", description: "Departments, custom departments and their people and presenters.", keywords: "department custom archive presenter teacher member", need: "users" },
  { tab: "permissions", group: "People & roles", label: "Roles & permissions", description: "What each role may do, as a matrix.", keywords: "role permission capability matrix rights manager admin", need: "users" },
  { tab: "access", group: "People & roles", label: "Access", description: "Grades and subjects each person works on.", keywords: "scope grade subject access limit", need: "users" },
  { tab: "sidebar", group: "People & roles", label: "Sidebar", description: "Which sidebar entries each role sees by default.", keywords: "sidebar menu navigation hide show role default", need: "users" },
  // Security
  { tab: "signin", group: "Security", label: "Sign-in", description: "Sign-in methods, Google, invites, sign-up requests, two-step sign-in and the sign-in log.", keywords: "login google oauth passkey two-step 2fa mfa invite signup sign up request password policy profile fields log email confirm", need: "users" },
  { tab: "sessions", group: "Security", label: "Sessions & devices", description: "Who is signed in where; sign out devices and block them.", keywords: "session device sign out logout block ip browser", need: "users" },
  { tab: "privacy", group: "Security", label: "Privacy", description: "The privacy notice, who accepted it, and the access log.", keywords: "privacy notice consent accept gdpr data access log", need: "users" },
  // Communication & support
  { tab: "customer-support", group: "Communication & support", label: "Support setup", description: "Customer support on or off, leads, rules, mailboxes and Telegram.", keywords: "customer support helpdesk ticket sla telegram bot mailbox leads calls recording", need: "users" },
  { tab: "chat", group: "Communication & support", label: "Chat", description: "Team chat rules, file sizes and usage.", keywords: "chat message file upload size group channel", need: "users" },
  { tab: "feedback", group: "Communication & support", label: "Feedback", description: "Feedback people sent about the app.", keywords: "feedback suggestion bug idea", need: "users" },
  { tab: "reports", group: "Communication & support", label: "Safety reports", description: "Safety and conduct reports and their status.", keywords: "safety report harassment conduct incident", need: "users" },
  // Integrations
  { tab: "external-apis", group: "Integrations", label: "External APIs", description: "Chapa businesses and other outside services with their keys.", keywords: "chapa payment api key secret business noor external", need: "users" },
  { href: "/admin/integrations?tab=connections", group: "Integrations", label: "Integrations", description: "API tokens, connectors (SMS, email, payments), Notion and the call log.", keywords: "token connector sms africa talking iconic notion webhook api dataset", need: "users" },
  // System & workspace
  { tab: "system", group: "System & workspace", label: "System", description: "Health, background jobs, backups, errors and operations.", keywords: "health job backup restore error log drive render operations maintenance", need: "users" },
  { tab: "branding", group: "System & workspace", label: "Branding", description: "Name, logo, favicon, section banners and sidebar icons and colours.", keywords: "brand logo name favicon banner colour color icon tagline", need: "users" },
  { tab: "files", group: "System & workspace", label: "Files & publishing", description: "Where files are stored, the app link, and broken or outside links.", keywords: "file storage upload drive link broken publish", need: "users" },
  { tab: "usage", group: "System & workspace", label: "Usage", description: "Who uses which pages, by role.", keywords: "usage analytics pages visits adoption", need: "users" },
  { tab: "clean-data", group: "System & workspace", label: "Clean data", description: "Find and fix duplicates and leftovers.", keywords: "clean duplicate merge orphan tidy", need: "users" },
  { tab: "presentations", group: "System & workspace", label: "Presentation templates", description: "Slide templates and the default one.", keywords: "presentation slide deck template", need: "users" },
  { tab: "data", group: "System & workspace", label: "Data", description: "Workspace counts, export and reset.", keywords: "data export import reset database counts", need: "data" },
  // Elsewhere
  { href: "/settings?tab=workspace", group: "Workspace settings", label: "Workspace settings", description: "Workspace name, timezone, calendar display, colour theme for everyone, policies and team rules.", keywords: "workspace name timezone week calendar ethiopian gregorian theme preset colour policy checklist destination team rules wip holiday working hours", need: "settings" },
  { href: "/email?tab=settings", group: "Workspace settings", label: "Email settings", description: "Mail servers, senders and mailboxes.", keywords: "email smtp imap mailbox sender mail server", need: "users" },
  { href: "/admin/assistant", group: "Workspace settings", label: "Assistant", description: "The assistant per role and its AI settings.", keywords: "assistant ai bot role shown hidden", need: "users" },
  { href: "/admin/data", group: "Workspace settings", label: "Data manager", description: "Browse and edit workspace tables.", keywords: "data manager table rows database", need: "data" },
  { href: "/finance/chapa?tab=settings", group: "Workspace settings", label: "Chapa rules", description: "Chapa sync, follow-up rules and what each role may do per business.", keywords: "chapa payment follow up sync rules access action", need: "users" },
  { href: "/preferences", group: "Your settings", label: "Your settings", description: "Your theme, colours, font, language, notifications and help.", keywords: "my theme dark light preset font language amharic notification push personal appearance", need: "any" },
];

// Best matches first: label, then keywords and description; every word must match.
export function searchAdmin(q: string, list: AdminEntry[]) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return list
    .map((e) => {
      const label = e.label.toLowerCase();
      const hay = `${label} ${e.group.toLowerCase()} ${e.description.toLowerCase()} ${e.keywords}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const score = words.reduce((n, w) => n + (label.startsWith(w) ? 4 : label.includes(w) ? 3 : e.keywords.includes(w) ? 2 : 1), 0);
      return { e, score };
    })
    .filter((x): x is { e: AdminEntry; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}
