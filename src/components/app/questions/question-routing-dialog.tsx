"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SettingsIcon, CheckIcon, SaveIcon, RefreshCwIcon, ShieldIcon } from "lucide-react";
import { toast } from "sonner";
import { getQuestionRoutingAction, saveQuestionRoutingAction } from "@/app/actions/question-routing";
import type { QuestionRoutingConfig } from "@/server/question-routing";

const AVAILABLE_ROLES = [
  { key: "admin", label: "System Admin" },
  { key: "owner", label: "System Owner" },
  { key: "manager", label: "Operations Manager" },
  { key: "publication", label: "Publication Team Lead" },
  { key: "uploading", label: "Uploading Team Lead" },
  { key: "recording", label: "Recording Team" },
  { key: "editing", label: "Editing Team" },
  { key: "finance_manager", label: "Finance Manager" },
  { key: "accountant", label: "Accountant" },
  { key: "developer", label: "Development Lead" },
  { key: "staff", label: "Customer Support / Staff" },
  { key: "support", label: "Customer Support" },
  { key: "sales", label: "Sales" },
  { key: "operations", label: "Operations" },
];

export function QuestionRoutingConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [roles,setRoles]=React.useState(AVAILABLE_ROLES);
  const [config, setConfig] = React.useState<QuestionRoutingConfig | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedSender, setSelectedSender] = React.useState("support");

  React.useEffect(() => {
    if (open) {
      setLoading(true);
      getQuestionRoutingAction()
        .then((res) => {
          setLoading(false);
          if (res.ok && res.config) {setConfig(res.config);if(res.roles)setRoles(res.roles.map(r=>({key:r.key,label:r.label})));}
          else toast.error(res.error || "Failed to load routing rules");
        })
        .catch(() => setLoading(false));
    }
  }, [open]);

  const handleToggleRecipientRole = (targetRole: string) => {
    if (!config) return;
    const currentList = config.allowedRolesBySenderRole[selectedSender] || [];
    let updatedList: string[];
    if (currentList.includes(targetRole)) {
      updatedList = currentList.filter((r) => r !== targetRole);
    } else {
      updatedList = [...currentList, targetRole];
    }
    setConfig({
      ...config,
      allowedRolesBySenderRole: {
        ...config.allowedRolesBySenderRole,
        [selectedSender]: updatedList,
      },
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await saveQuestionRoutingAction(config);
      setSaving(false);
      if (res.ok) {
        toast.success("Question recipient routing updated successfully!");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Failed to save configuration");
      }
    } catch (err: any) {
      setSaving(false);
      toast.error(String(err?.message || err));
    }
  };

  const activeRecipients = config?.allowedRolesBySenderRole[selectedSender] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ShieldIcon className="size-4 text-emerald-500" />
            Configure Question Recipient Routing
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure which staff, leads, and departments can be reached when a question is raised by each team.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            <RefreshCwIcon className="size-5 animate-spin mx-auto mb-2 text-primary" />
            Loading routing rules...
          </div>
        ) : (
          <div className="space-y-4 py-2 text-xs">
            {/* SENDER TEAM SELECTOR TABS */}
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">When Question is Raised By (Sender Role):</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1 bg-muted/40 rounded-lg border">
                {roles.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelectedSender(s.key)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium text-left truncate transition-colors ${
                      selectedSender === s.key
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ALLOWED RECIPIENTS CHECKBOXES */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">
                  Allowed Recipients for <span className="text-primary uppercase font-bold">{selectedSender}</span>:
                </Label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {activeRecipients.length} roles allowed
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border rounded-lg bg-card">
                {roles.map((r) => {
                  const isChecked = activeRecipients.includes(r.key);
                  return (
                    <div
                      key={r.key}
                      onClick={() => handleToggleRecipientRole(r.key)}
                      className={`flex items-center justify-between p-2 rounded-md border cursor-pointer select-none text-xs transition-colors ${
                        isChecked
                          ? "bg-primary/10 border-primary/30 text-primary font-medium"
                          : "hover:bg-muted/50 border-border text-muted-foreground"
                      }`}
                    >
                      <span>{r.label}</span>
                      <div
                        className={`size-4 rounded flex items-center justify-center border ${
                          isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background"
                        }`}
                      >
                        {isChecked && <CheckIcon className="size-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {config && <fieldset className="space-y-2 rounded border p-3 text-xs"><legend>Restrict recipient roles to team leads</legend>{activeRecipients.filter(r=>r!=="*").map(role=><label key={role} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={config.leadOnlyBySenderRole?.[selectedSender]?.includes(role)??false} onChange={e=>{const current=config.leadOnlyBySenderRole?.[selectedSender]??[];setConfig({...config,leadOnlyBySenderRole:{...config.leadOnlyBySenderRole,[selectedSender]:e.target.checked?[...current,role]:current.filter(r=>r!==role)}});}}/>{roles.find(r=>r.key===role)?.label||role}</label>)}</fieldset>}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading} className="gap-1.5">
            <SaveIcon className="size-3.5" />
            {saving ? "Saving..." : "Save Routing Rules"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

