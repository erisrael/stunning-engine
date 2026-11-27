import Link from "next/link";
import { SectionTabs } from "@/components/app/section-tabs";

type Rights = { admin: boolean; audit: boolean; template?: boolean; workflow?: boolean; create?: boolean; issue?: boolean };

// The tab bar across the Correspondence pages (only those the person may open).
export function CorrNav({ active, rights }: { active: string; rights: Rights }) {
  const tabs = [
    { key: "registry", label: "Letters", href: "/correspondence" },
    { key: "inbox", label: "My approvals", href: "/correspondence/inbox" },
    { key: "dashboard", label: "Dashboard", href: "/correspondence/dashboard" },
    { key: "directory", label: "Directory", href: "/correspondence/directory" },
    { key: "signatures", label: "Signatures", href: "/correspondence/signatures" },
    ...(rights.template || rights.admin ? [{ key: "templates", label: "Templates", href: "/correspondence/templates" }] : []),
    ...(rights.admin || rights.audit ? [{ key: "organisation", label: "Organisation", href: "/correspondence/organisation" }] : []),
    ...(rights.workflow || rights.admin ? [{ key: "workflows", label: "Workflows", href: "/correspondence/workflows" }] : []),
    ...(rights.admin || rights.audit ? [{ key: "setup", label: rights.admin ? "Setup" : "Number register", href: "/correspondence/setup" }] : []),
  ];
  return <SectionTabs label="Correspondence" active={active} tabs={tabs} end={<Link href="/verify" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Verify a letter</Link>} />;
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
