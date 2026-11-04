"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/app/multi-select";
import { saveSessionsConfigAction } from "@/app/actions/sessions";
import type { SessionsConfig } from "@/server/sessions";

// Admin: who manages studio sessions. The academic managers named here book them; planners and the Recording lead too
// only if Admin allows it.
export function SessionsManagers({ config, people }: { config: SessionsConfig; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [c, setC] = React.useState(config);
  const names = c.managers.map((id) => people.find((p) => p.id === id)?.name ?? id);
  return (
    <div className="rounded-lg border p-3 text-sm" data-sessions-managers>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1">
          Managed by: <span className="font-medium">{names.length ? names.join(", ") : "managers (no academic manager named yet)"}</span>
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          <SettingsIcon /> Who manages studio sessions
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="space-y-1">
            <Label>Academic managers</Label>
            <div className="flex flex-wrap gap-1.5">
              {c.managers.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                  {people.find((p) => p.id === id)?.name ?? id}
                  <button type="button" aria-label="Remove" onClick={() => setC({ ...c, managers: c.managers.filter((x) => x !== id) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <Combobox size="sm" className="h-8 w-60" options={people.filter((p) => !c.managers.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))} value={null} onChange={(v) => v && setC({ ...c, managers: [...c.managers, v] })} placeholder="Add a person" />
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={c.planners} onCheckedChange={(v) => setC({ ...c, planners: v })} /> Everyone who plans production (including team leads with planning rights) also books
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={c.recordingLead} onCheckedChange={(v) => setC({ ...c, recordingLead: v === true })} /> The Recording lead also books
          </label>
          <Button
            size="sm"
            onClick={async () => {
              const r = await saveSessionsConfigAction(c);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Saved");
              setOpen(false);
              router.refresh();
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
