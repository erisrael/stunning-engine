"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrainCircuitIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveAiConfigAction, testAiAction } from "@/app/actions/assistant";
import type { AiConfigView } from "@/server/assistant-ai";
import { cn } from "@/lib/utils";

type Usage = { questions: number; confirmed: number; people: number; byRole: { role: string; n: number }[] };

// Admin, Assistant, AI: Claude answers typed and spoken questions from the person's own data, and prepares actions
// they confirm. Off until a key is saved and it is switched on.
export function AiAdmin({ config, usage, models, roles }: { config: AiConfigView; usage: Usage; models: { id: string; label: string }[]; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState({ on: config.on, model: config.model, effort: config.effort, offRoles: config.offRoles, dailyLimit: config.dailyLimit, actions: config.actions, agent: config.agent, agentMax: config.agentMax });
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const keyed = config.hasKey || config.envKey || config.fake;
  const save = async (extra: { clearKey?: boolean } = {}) => {
    setBusy("save");
    const r = await saveAiConfigAction({ ...c, key: key || null, ...extra });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setKey("");
    toast.success("AI settings saved");
    router.refresh();
  };
  const test = async () => {
    setBusy("test");
    const r = await testAiAction();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`The AI answered (${r.data?.model})`);
  };
  return (
    <Card data-ai-admin>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuitIcon className="size-4 text-[#9334E6] dark:text-[#C58AF9]" /> AI answers (Claude)
        </CardTitle>
        <CardDescription>
          When on, what people type or say goes to Claude (Anthropic), with the results of looking at their own work, leave and attendance (only what they may see themselves). It answers in plain words, opens pages, and prepares
          actions (leave, tasks, check-in) that the person confirms before anything happens. Without it, the assistant keeps matching keywords as before.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="ai-on" checked={c.on} onCheckedChange={(on) => setC({ ...c, on })} disabled={!keyed && !key} />
          <Label htmlFor="ai-on">Use AI answers</Label>
          {!keyed && !key && <span className="text-xs text-muted-foreground">Save an API key first.</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ai-key">Anthropic API key</Label>
            <Input id="ai-key" type="password" autoComplete="off" placeholder={config.hasKey ? "Saved (sealed). Type to replace." : config.envKey ? "Using ANTHROPIC_API_KEY from the server" : "sk-ant-..."} value={key} onChange={(e) => setKey(e.target.value)} />
            <p className="text-xs text-muted-foreground">From console.anthropic.com, API keys. Stored sealed; never shown again.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-model">Model</Label>
            <select id="ai-model" className="h-9 w-full rounded-md border bg-background px-2" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-effort">How hard it thinks</Label>
            <select id="ai-effort" className="h-9 w-full rounded-md border bg-background px-2" value={c.effort} onChange={(e) => setC({ ...c, effort: e.target.value as typeof c.effort })}>
              <option value="low">Low (quick answers, cheapest)</option>
              <option value="medium">Medium</option>
              <option value="high">High (slower, for hard questions)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-limit">Questions per person per day</Label>
            <Input id="ai-limit" type="number" min={0} max={1000} value={c.dailyLimit} onChange={(e) => setC({ ...c, dailyLimit: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">0 for no limit.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ai-actions" checked={c.actions} onCheckedChange={(actions) => setC({ ...c, actions })} />
          <Label htmlFor="ai-actions">May prepare actions (always confirmed by the person, with the same permission checks as the pages)</Label>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-ai-agent>
          <Switch id="ai-agent" checked={c.agent} disabled={!c.actions} onCheckedChange={(agent) => setC({ ...c, agent })} />
          <Label htmlFor="ai-agent">Agent mode: people may let it do the allowed actions itself, as them (each action is logged)</Label>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            up to
            <Input aria-label="Actions per request" type="number" min={1} max={25} className="h-7 w-16" value={c.agentMax} onChange={(e) => setC({ ...c, agentMax: Number(e.target.value) })} />
            actions per request
          </span>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Roles that keep the keyword assistant only</p>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => {
              const off = c.offRoles.includes(r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={off}
                  onClick={() => setC({ ...c, offRoles: off ? c.offRoles.filter((x) => x !== r.key) : [...c.offRoles, r.key] })}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs", off ? "border-destructive/50 bg-destructive/10 text-destructive line-through" : "hover:bg-muted")}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => save()}>
            {busy === "save" && <Loader2Icon className="animate-spin" />} Save
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy || !keyed} onClick={test}>
            {busy === "test" && <Loader2Icon className="animate-spin" />} Test the key
          </Button>
          {config.hasKey && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => save({ clearKey: true })}>
              Remove the key
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-ai-usage>
          Last 30 days: {usage.questions} questions from {usage.people} people, {usage.confirmed} actions confirmed{usage.byRole.length ? ` (${usage.byRole.map((r) => `${roles.find((x) => x.key === r.role)?.label ?? r.role} ${r.n}`).join(", ")})` : ""}.
        </p>
      </CardContent>
    </Card>
  );
}
