"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveRoleOptionsAction, saveRoutinesConfigAction } from "@/app/actions/assistant";
import type { RoleOptions } from "@/server/assistant";
import type { RoutinesConfig } from "@/server/routines";
import { cn } from "@/lib/utils";

const DEFAULT: RoleOptions = { ai: true, voice: true, routines: true, agent: true, actions: null, suggestions: [], dailyLimit: null };

// Admin, Assistant, per role: AI answers, voice, routines, which actions the AI may prepare, the suggestions shown
// first, and a daily limit. And how routine runs are approved.
export function RolesAdmin({ roles, ops, options, routines }: { roles: { key: string; label: string }[]; ops: { key: string; label: string; group: string }[]; options: Record<string, RoleOptions>; routines: RoutinesConfig }) {
  const router = useRouter();
  const [role, setRole] = React.useState(roles[0]?.key ?? "");
  const [all, setAll] = React.useState<Record<string, RoleOptions>>(options);
  const [rc, setRc] = React.useState(routines);
  const [busy, setBusy] = React.useState<string | null>(null);
  const o = { ...DEFAULT, ...(all[role] ?? {}) };
  const set = (patch: Partial<RoleOptions>) => setAll({ ...all, [role]: { ...o, ...patch } });
  const groups = [...new Set(ops.map((x) => x.group))];
  const on = (k: string) => !o.actions || o.actions.includes(k);
  const toggle = (k: string) => {
    const cur = o.actions ?? ops.map((x) => x.key);
    set({ actions: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  const save = async () => {
    setBusy("roles");
    const r = await saveRoleOptionsAction(all);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Options per role saved");
    router.refresh();
  };
  const saveRc = async () => {
    setBusy("routines");
    const r = await saveRoutinesConfigAction(rc);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Routines saved");
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <Card data-roles-admin>
        <CardHeader>
          <CardTitle className="text-base">Options per role</CardTitle>
          <CardDescription>What the assistant offers each role: AI answers, voice, routines, the actions the AI may prepare (always confirmed by the person), the suggestions shown first, and a daily limit for AI questions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <button key={r.key} type="button" onClick={() => setRole(r.key)} aria-pressed={role === r.key} className={cn("rounded-full border px-2.5 py-0.5 text-xs", role === r.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {r.label}
                {all[r.key] ? " •" : ""}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["ai", "voice", "routines", "agent"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <Switch id={`ro-${k}`} checked={o[k]} onCheckedChange={(v) => set({ [k]: v })} />
                <Label htmlFor={`ro-${k}`}>{k === "ai" ? "AI answers" : k === "voice" ? "Voice (microphone)" : k === "agent" ? "Agent mode (does the allowed actions itself)" : "Routines"}</Label>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="font-medium">Actions the AI may prepare</p>
            {groups.map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 text-xs text-muted-foreground">{g}</span>
                {ops
                  .filter((x) => x.group === g)
                  .map((x) => (
                    <button key={x.key} type="button" aria-pressed={on(x.key)} onClick={() => toggle(x.key)} className={cn("rounded-full border px-2 py-0.5 text-xs", on(x.key) ? "border-[#188038]/40 bg-[#188038]/10" : "text-muted-foreground line-through")} data-op={x.key}>
                      {x.label}
                    </button>
                  ))}
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => set({ actions: null })}>
              Allow all
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ro-sugg">Suggestions shown first (one per line)</Label>
              <Textarea id="ro-sugg" rows={3} value={o.suggestions.join("\n")} onChange={(e) => set({ suggestions: e.target.value.split("\n") })} placeholder="What should I edit today?" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ro-limit">AI questions per day for this role</Label>
              <Input id="ro-limit" type="number" min={0} placeholder="Admin's general limit" value={o.dailyLimit ?? ""} onChange={(e) => set({ dailyLimit: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
          </div>
          <Button size="sm" disabled={!!busy} onClick={save}>
            {busy === "roles" && <Loader2Icon className="animate-spin" />} Save options
          </Button>
        </CardContent>
      </Card>
      <Card data-routines-admin>
        <CardHeader>
          <CardTitle className="text-base">Routines</CardTitle>
          <CardDescription>People record how they do something; the assistant does it again for them in their own browser (no AI key needed). Each run needs approval as set here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="rc-on" checked={rc.on} onCheckedChange={(v) => setRc({ ...rc, on: v })} />
            <Label htmlFor="rc-on">Routines on</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-approval">Who approves a run</Label>
            <select id="rc-approval" className="h-9 w-full rounded-md border bg-background px-2 sm:w-80" value={rc.approval} onChange={(e) => setRc({ ...rc, approval: e.target.value as RoutinesConfig["approval"] })}>
              <option value="self">The person confirms it</option>
              <option value="lead">Their line manager first</option>
              <option value="admin">Admin first</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rc-step" checked={rc.confirmEachStep} onCheckedChange={(v) => setRc({ ...rc, confirmEachStep: v })} />
            <Label htmlFor="rc-step">The person presses &quot;Do it&quot; for each step</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rc-share" checked={rc.sharing} onCheckedChange={(v) => setRc({ ...rc, sharing: v })} />
            <Label htmlFor="rc-share">People may share routines with their departments or everyone</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-max">Most steps in a routine</Label>
            <Input id="rc-max" type="number" min={5} max={200} className="w-32" value={rc.maxSteps} onChange={(e) => setRc({ ...rc, maxSteps: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rc-import" checked={rc.imports} onCheckedChange={(v) => setRc({ ...rc, imports: v })} />
            <Label htmlFor="rc-import">People may import routines, and fill a routine&apos;s form from a file</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-rows">Most rows in one file</Label>
            <Input id="rc-rows" type="number" min={1} max={1000} className="w-32" value={rc.maxImportRows} onChange={(e) => setRc({ ...rc, maxImportRows: Number(e.target.value) })} />
          </div>
          <Button size="sm" disabled={!!busy} onClick={saveRc}>
            {busy === "routines" && <Loader2Icon className="animate-spin" />} Save routines
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
