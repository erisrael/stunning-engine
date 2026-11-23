"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveOverviewTeamsAction } from "@/app/actions/overview-teams";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";

// Admin, on the Overview: which teams' columns each role sees. A role with no teams ticked keeps its usual access
// (all teams if it has the Overview permission, none otherwise).
export function OverviewTeamsAdmin({ value, roles }: { value: Record<string, Stage[]>; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<Record<string, Stage[]>>(value);
  const [busy, setBusy] = React.useState(false);
  const toggle = (role: string, s: Stage) => setV((cur) => {
    const has = (cur[role] ?? []).includes(s);
    const next = has ? (cur[role] ?? []).filter((x) => x !== s) : [...(cur[role] ?? []), s];
    return { ...cur, [role]: next };
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-overview-teams>
        <Settings2Icon /> Who sees which teams
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Who sees which teams on the Overview</DialogTitle>
            <DialogDescription>Tick the teams each role sees. A ticked role opens the Overview with only those columns, for every grade and subject. Leave a role empty to keep its usual access: all teams for managers and Admin.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-overview-grid>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Role</th>
                  {STAGES.map((s) => (
                    <th key={s} className="px-2 py-1.5 text-center font-medium">{STAGE_LABELS[s]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="py-1.5 pr-2">{r.label}</td>
                    {STAGES.map((s) => (
                      <td key={s} className="px-2 py-1.5 text-center">
                        <input type="checkbox" className="size-4 accent-[var(--primary)]" aria-label={`${r.label}: ${STAGE_LABELS[s]}`} checked={(v[r.key] ?? []).includes(s)} onChange={() => toggle(r.key, s)} data-overview-cell={`${r.key}:${s}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              data-overview-save
              onClick={async () => {
                setBusy(true);
                const r = await saveOverviewTeamsAction(Object.fromEntries(Object.entries(v).filter(([, s]) => s.length)));
                setBusy(false);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Saved: the Overview shows each role its teams");
                setOpen(false);
                router.refresh();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
