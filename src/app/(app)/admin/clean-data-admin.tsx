"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckSquareIcon, Loader2Icon, ShieldAlertIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { purgeWorkspaceDataAction } from "@/app/actions/admin";
import type { PurgeCategory } from "@/server/workspace-data";
import { cn } from "@/lib/utils";

type DomainInfo = { key: PurgeCategory; label: string; description: string; exampleTables: string };

const DOMAINS: DomainInfo[] = [
  {
    key: "production",
    label: "Curriculum & Video Production",
    description: "Grades, subjects, units, lessons, parts/items, deliverable assets, recordings, reviews, handoffs, and sprints.",
    exampleTables: "items, assets, lessons, units, subjects, grades, recording_sessions...",
  },
  {
    key: "attendance",
    label: "Attendance & Time Records",
    description: "Daily check-ins, time events, attendance marks, shift assignments, kiosk logs, and face enrollments.",
    exampleTables: "att_events, att_marks, att_shift_assign, att_corrections, att_kiosks...",
  },
  {
    key: "finance_payroll",
    label: "Finance & Payroll",
    description: "Payroll runs, payslips, employee pay structures, transactions, bills, invoices, claims, budgets, and accounts.",
    exampleTables: "fin_payslips, fin_payroll_runs, fin_transactions, fin_bills, fin_invoices...",
  },
  {
    key: "hr_personnel",
    label: "HR & Employee Records",
    description: "Employee records, private info, documents, leave requests, leave types/balances, jobs, applicants, reviews, and presenters.",
    exampleTables: "employees, leave_requests, leave_types, job_openings, applicants, presenters...",
  },
  {
    key: "customer_support",
    label: "Customer Support Desk",
    description: "Support tickets, customer messages, call logs, customer records, and knowledge base articles.",
    exampleTables: "sup_tickets, sup_messages, sup_calls, sup_customers, sup_queues...",
  },
  {
    key: "departments_tasks",
    label: "Custom Departments & Tasks",
    description: "Custom department tasks, task links, watchers, task files, sprints, milestones, and department documents.",
    exampleTables: "dept_tasks, dept_task_links, dept_sprints, dept_docs, departments...",
  },
  {
    key: "chat_communications",
    label: "Internal Chat & Announcements",
    description: "Direct messages, group channels, chat reactions, uploaded media, announcements, and read receipts.",
    exampleTables: "chat_messages, chat_groups, chat_files, announcements...",
  },
  {
    key: "email_mailboxes",
    label: "Mail State & Inboxes",
    description: "Cached email messages, mailbox sync state, email log, and sender tracking.",
    exampleTables: "mail_state, email_log, email_senders...",
  },
  {
    key: "logs_notifications",
    label: "Audit Logs & Notifications",
    description: "System audit logs, in-app notifications, link checks, and background job telemetry.",
    exampleTables: "audit_events, notifications, page_visits, jobs...",
  },
];

export function CleanDataAdmin() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Record<PurgeCategory, boolean>>({
    production: false,
    attendance: false,
    finance_payroll: false,
    hr_personnel: false,
    customer_support: false,
    departments_tasks: false,
    chat_communications: false,
    email_mailboxes: false,
    logs_notifications: false,
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = selectedCount === DOMAINS.length;

  const toggleAll = () => {
    const nextVal = !allSelected;
    const next: Record<PurgeCategory, boolean> = { ...selected };
    for (const d of DOMAINS) next[d.key] = nextVal;
    setSelected(next);
  };

  const handlePurge = async () => {
    const categories = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k as PurgeCategory);

    if (!categories.length) {
      toast.error("Select at least one data category to clean.");
      return;
    }

    setBusy(true);
    const res = await purgeWorkspaceDataAction({ categories, confirm: confirmText });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error || "Failed to purge data");
      return;
    }

    toast.success(`Cleaned ${res.data?.purged ?? 0} data tables. User accounts and login access were preserved.`);
    setConfirmOpen(false);
    setConfirmText("");
    setSelected({
      production: false,
      attendance: false,
      finance_payroll: false,
      hr_personnel: false,
      customer_support: false,
      departments_tasks: false,
      chat_communications: false,
      email_mailboxes: false,
      logs_notifications: false,
    });
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <ShieldAlertIcon className="size-5 shrink-0 text-destructive mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-destructive">Clean System Data (Configurable Purge)</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              This tool allows user administrators to selectively or completely clean system operational data while <strong>always keeping all user accounts, passwords, sessions, and login credentials safe</strong>.
              Select the data domains you want to reset below.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Select Data to Clean</CardTitle>
            <CardDescription className="text-xs">
              {selectedCount === 0 ? "No data domains selected" : `${selectedCount} of ${DOMAINS.length} data domains selected`}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={toggleAll} className="text-xs h-8">
            {allSelected ? <SquareIcon className="size-3.5 mr-1.5" /> : <CheckSquareIcon className="size-3.5 mr-1.5" />}
            {allSelected ? "Deselect All" : "Select All (Clean All Data)"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {DOMAINS.map((d) => {
              const isChecked = !!selected[d.key];
              return (
                <div
                  key={d.key}
                  onClick={() => setSelected({ ...selected, [d.key]: !isChecked })}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors text-left",
                    isChecked ? "border-destructive/60 bg-destructive/5" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(v) => setSelected({ ...selected, [d.key]: !!v })}
                    className="mt-0.5"
                    aria-label={d.label}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium text-sm flex items-center justify-between">
                      <span className={cn(isChecked && "text-destructive font-semibold")}>{d.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-normal">{d.description}</p>
                    <p className="text-[11px] font-mono text-muted-foreground/80 truncate">Tables: {d.exampleTables}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              User logins, roles, and profiles are <strong>never</strong> deleted.
            </p>
            <Button
              variant="destructive"
              disabled={selectedCount === 0}
              onClick={() => {
                setConfirmText("");
                setConfirmOpen(true);
              }}
            >
              <Trash2Icon className="size-4 mr-1.5" />
              Clean Selected Data ({selectedCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="size-5" /> Confirm Data Clean
            </DialogTitle>
            <DialogDescription className="text-xs">
              This action is permanent and cannot be undone. All records in the selected categories will be permanently erased.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
              <span className="font-semibold block text-foreground">Categories to be purged:</span>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {DOMAINS.filter((d) => selected[d.key]).map((d) => (
                  <li key={d.key} className="text-destructive font-medium">
                    {d.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Type <span className="font-mono text-destructive font-bold">PURGE DATA</span> to confirm:
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="PURGE DATA"
                autoFocus
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmText.trim().toUpperCase() !== "PURGE DATA"}
              onClick={handlePurge}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin mr-1.5" /> : <Trash2Icon className="size-4 mr-1.5" />}
              Permanently Clean Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

