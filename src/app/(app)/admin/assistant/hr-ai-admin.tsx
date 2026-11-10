"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BotIcon,
  CheckCircle2Icon,
  SaveIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UsersIcon,
  ClockIcon,
  CalendarDaysIcon,
  FileTextIcon,
  BriefcaseIcon,
  Loader2Icon,
  HelpCircleIcon,
  SlidersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getHrAiConfigAction, saveHrAiConfigAction } from "@/app/actions/hr-ai";
import type { HrAiConfig } from "@/server/hr-ai";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  { key: "attendance_auditing", label: "Attendance & Daily Audits", desc: "Inspect present, late, absent staff and record corrections automatically" },
  { key: "leave_management", label: "Leave Requests & Balances", desc: "Check leave balances and process approvals according to policy limits" },
  { key: "onboarding_checklists", label: "Onboarding & Offboarding Lifecycle", desc: "Manage new hire setup and exit tasks autonomously" },
  { key: "one_on_one_recording", label: "1-on-1 Meeting Records", desc: "Log notes, actions, and follow-ups from manager check-ins" },
  { key: "goals_management", label: "Employee Goals & OKRs", desc: "Track progress, deadlines, and milestone updates" },
  { key: "training_assignment", label: "Training & Development", desc: "Assign curriculum courses and track compliance" },
  { key: "equipment_tracking", label: "Staff Asset Tracking", desc: "Record equipment issuance and returns" },
  { key: "job_posting", label: "Hiring & Job Openings", desc: "Create draft job openings and track applicant pipeline" },
  { key: "case_management", label: "Grievances & HR Cases", desc: "Open and monitor disciplinary or grievance investigations" },
];

export function HrAiAdmin({ initialConfig }: { initialConfig: HrAiConfig }) {
  const [cfg, setCfg] = React.useState<HrAiConfig>(initialConfig);
  const [busy, setBusy] = React.useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      const res = await saveHrAiConfigAction(cfg);
      if (res.ok && res.data) {
        setCfg(res.data);
        toast.success("HR AI configuration and policy rules saved");
      } else {
        toast.error(res.error || "Failed to save HR AI configuration");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleCap = (key: string) => {
    setCfg((prev) => ({
      ...prev,
      enabledCapabilities: prev.enabledCapabilities.includes(key)
        ? prev.enabledCapabilities.filter((k) => k !== key)
        : [...prev.enabledCapabilities, key],
    }));
  };

  return (
    <div className="space-y-6" data-hr-ai-admin>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <SparklesIcon className="size-4 text-purple-600" />
              HR Autonomous AI Agent &amp; Operational Rules
            </CardTitle>
            <CardDescription className="text-xs">
              Configure how the HR AI assistant manages staff records, automates approvals, enforces leave policies, and navigates HR operations.
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleSave} disabled={busy} className="gap-1.5 text-xs">
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <SaveIcon className="size-3.5" />}
            Save HR AI Rules
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 text-xs">
          {/* Autonomy Mode Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Agent Autonomy Level</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              <div
                onClick={() => setCfg({ ...cfg, autonomyMode: "full_autonomous" })}
                className={cn(
                  "cursor-pointer rounded-lg border p-3.5 transition-all space-y-1.5",
                  cfg.autonomyMode === "full_autonomous"
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <BotIcon className="size-3.5 text-emerald-600" /> Full Autonomous
                  </span>
                  {cfg.autonomyMode === "full_autonomous" && (
                    <Badge variant="default" className="text-[10px]">Active</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The agent carries out eligible operations directly within set safety thresholds without requiring human confirmation clicks.
                </p>
              </div>

              <div
                onClick={() => setCfg({ ...cfg, autonomyMode: "supervised" })}
                className={cn(
                  "cursor-pointer rounded-lg border p-3.5 transition-all space-y-1.5",
                  cfg.autonomyMode === "supervised"
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <SlidersIcon className="size-3.5 text-blue-600" /> Supervised (Recommended)
                  </span>
                  {cfg.autonomyMode === "supervised" && (
                    <Badge variant="default" className="text-[10px]">Active</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Prepares actions with clear summaries, navigation links, and parameters, executing only when confirmed by an authorized user.
                </p>
              </div>

              <div
                onClick={() => setCfg({ ...cfg, autonomyMode: "advisory" })}
                className={cn(
                  "cursor-pointer rounded-lg border p-3.5 transition-all space-y-1.5",
                  cfg.autonomyMode === "advisory"
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <HelpCircleIcon className="size-3.5 text-amber-600" /> Advisory Only
                  </span>
                  {cfg.autonomyMode === "advisory" && (
                    <Badge variant="default" className="text-[10px]">Active</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Read-only analysis and guidance. Does not propose or execute state mutations.
                </p>
              </div>
            </div>
          </div>

          {/* Thresholds and Auto-Approvals */}
          <div className="space-y-3 pt-2 border-t">
            <h3 className="font-semibold text-xs">Autonomous Approval Limits &amp; Thresholds</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-limit" className="text-xs">Auto-approve Leave (Max Days)</Label>
                <Input
                  id="leave-limit"
                  type="number"
                  min="0"
                  max="30"
                  value={cfg.autoApproveLeaveDaysMax}
                  onChange={(e) => setCfg({ ...cfg, autoApproveLeaveDaysMax: Number(e.target.value) })}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">Requests up to this limit are approved automatically if balance exists.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="claims-limit" className="text-xs">Auto-approve Claims (Max ETB)</Label>
                <Input
                  id="claims-limit"
                  type="number"
                  min="0"
                  value={cfg.autoApproveClaimsAmountMax}
                  onChange={(e) => setCfg({ ...cfg, autoApproveClaimsAmountMax: Number(e.target.value) })}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">Expense claims below this amount are auto-approved.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grace-limit" className="text-xs">Check-in Grace Period (Minutes)</Label>
                <Input
                  id="grace-limit"
                  type="number"
                  min="0"
                  max="60"
                  value={cfg.lateGraceMinutes}
                  onChange={(e) => setCfg({ ...cfg, lateGraceMinutes: Number(e.target.value) })}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">Arrivals within this window are marked Present rather than Late.</p>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 mt-2">
              <div className="space-y-0.5">
                <Label htmlFor="att-corr" className="text-xs font-medium cursor-pointer">Auto-Approve Reasonable Attendance Corrections</Label>
                <p className="text-[11px] text-muted-foreground">Automatically resolves missed punch requests when supported by manager note</p>
              </div>
              <Switch
                id="att-corr"
                checked={cfg.autoApproveAttendanceCorrections}
                onCheckedChange={(val) => setCfg({ ...cfg, autoApproveAttendanceCorrections: val })}
              />
            </div>
          </div>

          {/* Company Policy & Rule Engine Knowledge Base */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="policy-notes" className="text-xs font-semibold">
              HR Policy Knowledge Base &amp; Company Rules Prompt
            </Label>
            <p className="text-[11px] text-muted-foreground">
              These guidelines are injected into the HR AI agent prompt to dictate policy interpretation on leaves, probation reviews, and employee relations.
            </p>
            <Textarea
              id="policy-notes"
              rows={4}
              value={cfg.policyNotes}
              onChange={(e) => setCfg({ ...cfg, policyNotes: e.target.value })}
              className="text-xs font-mono"
            />
          </div>

          {/* Enabled Capabilities */}
          <div className="space-y-3 pt-2 border-t">
            <h3 className="font-semibold text-xs">Enabled Autonomous Capabilities</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {CAPABILITIES.map((cap) => {
                const checked = cfg.enabledCapabilities.includes(cap.key);
                return (
                  <div
                    key={cap.key}
                    onClick={() => toggleCap(cap.key)}
                    className={cn(
                      "flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      checked ? "bg-accent/40 border-primary/40" : "opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold text-xs">{cap.label}</p>
                      <p className="text-[11px] text-muted-foreground">{cap.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

