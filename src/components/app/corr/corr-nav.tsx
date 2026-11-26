import Link from "next/link";
import { cn } from "@/lib/utils";

type Rights = { admin: boolean; audit: boolean; template?: boolean; workflow?: boolean; create?: boolean; issue?: boolean };

// The tab bar across the Correspondence pages (only those the person may open).
export function CorrNav({ active, rights }: { active: string; rights: Rights }) {
  const tabs = [
    { key: "registry", label: "Letters", href: "/correspondence" },
    { key: "inbox", label: "My approvals", href: "/correspondence/inbox" },
    { key: "dashboard", label: "Dashboard", href: "/correspondence/dashboard" },
    { key: "directory", label: "Directory", href: "/correspondence/directory" },
    { key: "signatures", label: "Signatures and stamps", href: "/correspondence/signatures" },
    ...(rights.template || rights.admin ? [{ key: "templates", label: "Templates", href: "/correspondence/templates" }] : []),
    ...(rights.admin || rights.audit ? [{ key: "organisation", label: "Organisation and authority", href: "/correspondence/organisation" }] : []),
    ...(rights.workflow || rights.admin ? [{ key: "workflows", label: "Workflows and rules", href: "/correspondence/workflows" }] : []),
    ...(rights.admin || rights.audit ? [{ key: "setup", label: rights.admin ? "Setup and numbering" : "Number register", href: "/correspondence/setup" }] : []),
  ];
  return (
    <nav aria-label="Correspondence" data-page-tabs className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm", active === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {t.label}
        </Link>
      ))}
      <Link href="/verify" className="ml-auto shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
        Verify a letter
      </Link>
    </nav>
  );
}

export const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  pending_approval: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  pending_signature: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  approved: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  signed: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  issued: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  dispatched: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-200",
  delivered: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  acknowledged: "bg-emerald-600/20 text-emerald-900 dark:text-emerald-100",
  archived: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  void: "bg-red-500/15 text-red-700 dark:text-red-300",
};
