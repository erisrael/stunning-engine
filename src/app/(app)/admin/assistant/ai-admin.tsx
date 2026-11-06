"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrainCircuitIcon, Loader2Icon, SparklesIcon, GlobeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveAiConfigAction, testAiAction } from "@/app/actions/assistant";
import type { AiConfigView, AiProvider } from "@/server/assistant-ai";
import { cn } from "@/lib/utils";

type Usage = { questions: number; confirmed: number; people: number; byRole: { role: string; n: number }[] };

const PROVIDERS = [
  { id: "anthropic" as const, label: "Anthropic (Claude)" },
  { id: "gemini" as const, label: "Google (Gemini 2.5 & 1.5)" },
  { id: "openai" as const, label: "OpenAI (GPT-4o & o3-mini)" },
  { id: "custom" as const, label: "Custom / OpenAI-Compatible (DeepSeek, Local)" },
];

export function AiAdmin({
  config,
  usage,
  models,
  roles,
}: {
  config: AiConfigView;
  usage: Usage;
  models: { id: string; label: string; provider: string }[];
  roles: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [c, setC] = React.useState({
    on: config.on,
    provider: (config.provider || "anthropic") as AiProvider,
    model: config.model,
    customBaseUrl: config.customBaseUrl || "",
    effort: config.effort,
    offRoles: config.offRoles,
    dailyLimit: config.dailyLimit,
    actions: config.actions,
    agent: config.agent,
    agentMax: config.agentMax,
  });
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const keyed = config.hasKey || config.envKey || config.fake;

  const filteredModels = React.useMemo(() => {
    return models.filter((m) => m.provider === c.provider);
  }, [models, c.provider]);

  const handleProviderChange = (newProvider: AiProvider) => {
    const defaultModel = models.find((m) => m.provider === newProvider)?.id || (newProvider === "gemini" ? "gemini-2.5-flash" : newProvider === "openai" ? "gpt-4o-mini" : "claude-opus-5-5");
    setC({ ...c, provider: newProvider, model: defaultModel });
  };

  const save = async (extra: { clearKey?: boolean } = {}) => {
    setBusy("save");
    const r = await saveAiConfigAction({
      ...c,
      customBaseUrl: c.provider === "custom" ? c.customBaseUrl : undefined,
      key: key || null,
      ...extra,
    });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setKey("");
    toast.success("AI provider and model settings saved");
    router.refresh();
  };

  const test = async () => {
    setBusy("test");
    const r = await testAiAction();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`AI answered successfully (${r.data?.model})`);
  };

  const getKeyPlaceholder = () => {
    if (config.hasKey) return "Saved (sealed). Type new key to replace.";
    if (config.envKey) return "Using environment API key from server";
    if (c.provider === "gemini") return "AIzaSy...";
    if (c.provider === "openai") return "sk-proj-...";
    if (c.provider === "custom") return "Your custom or DeepSeek API key";
    return "sk-ant-...";
  };

  return (
    <Card data-ai-admin>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuitIcon className="size-4 text-[#9334E6] dark:text-[#C58AF9]" /> Smart AI Assistant Settings
        </CardTitle>
        <CardDescription>
          Choose your AI intelligence engine: Anthropic Claude, Google Gemini, OpenAI, or Custom OpenAI-compatible endpoints. The assistant answers spoken or typed questions and prepares operational tasks with role permission checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="ai-on" checked={c.on} onCheckedChange={(on) => setC({ ...c, on })} disabled={!keyed && !key} />
          <Label htmlFor="ai-on">Enable Smart AI Assistant</Label>
          {!keyed && !key && <span className="text-xs text-muted-foreground">Save an API key first.</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Provider Selection */}
          <div className="space-y-1">
            <Label htmlFor="ai-provider">AI Provider</Label>
            <select
              id="ai-provider"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={c.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          <div className="space-y-1">
            <Label htmlFor="ai-model">Model Selection</Label>
            <select
              id="ai-model"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={c.model}
              onChange={(e) => setC({ ...c, model: e.target.value })}
            >
              {filteredModels.length > 0 ? (
                filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))
              ) : (
                <option value={c.model}>{c.model}</option>
              )}
            </select>
          </div>

          {/* Custom Base URL (if custom) */}
          {c.provider === "custom" && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ai-custom-url">Custom Base URL (OpenAI-compatible)</Label>
              <Input
                id="ai-custom-url"
                value={c.customBaseUrl}
                onChange={(e) => setC({ ...c, customBaseUrl: e.target.value })}
                placeholder="https://api.deepseek.com/v1 or http://localhost:11434/v1"
                className="h-9 font-mono text-xs"
              />
            </div>
          )}

          {/* API Key */}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ai-key">{c.provider === "gemini" ? "Google Gemini API Key" : c.provider === "openai" ? "OpenAI API Key" : c.provider === "custom" ? "Custom API Key" : "Anthropic API Key"}</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              placeholder={getKeyPlaceholder()}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-9 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Stored securely sealed in encrypted credentials. Never exposed in client code.
            </p>
          </div>

          {/* Effort */}
          <div className="space-y-1">
            <Label htmlFor="ai-effort">Reasoning Depth</Label>
            <select
              id="ai-effort"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={c.effort}
              onChange={(e) => setC({ ...c, effort: e.target.value as typeof c.effort })}
            >
              <option value="low">Low (fastest responses)</option>
              <option value="medium">Medium</option>
              <option value="high">High (deep reasoning)</option>
            </select>
          </div>

          {/* Daily Limit */}
          <div className="space-y-1">
            <Label htmlFor="ai-limit">Questions per person per day</Label>
            <Input
              id="ai-limit"
              type="number"
              min={0}
              max={1000}
              value={c.dailyLimit}
              onChange={(e) => setC({ ...c, dailyLimit: Number(e.target.value) })}
              className="h-9"
            />
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
            <Input
              aria-label="Actions per request"
              type="number"
              min={1}
              max={25}
              className="h-7 w-16"
              value={c.agentMax}
              onChange={(e) => setC({ ...c, agentMax: Number(e.target.value) })}
            />
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

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" disabled={!!busy} onClick={() => save()}>
            {busy === "save" && <Loader2Icon className="animate-spin mr-1.5" />} Save Provider Settings
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy || !keyed} onClick={test}>
            {busy === "test" && <Loader2Icon className="animate-spin mr-1.5" />} Test Connection
          </Button>
          {config.hasKey && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => save({ clearKey: true })}>
              Remove API key
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground" data-ai-usage>
          Last 30 days: {usage.questions} questions from {usage.people} people, {usage.confirmed} actions confirmed
          {usage.byRole.length ? ` (${usage.byRole.map((r) => `${roles.find((x) => x.key === r.role)?.label ?? r.role} ${r.n}`).join(", ")})` : ""}.
        </p>
      </CardContent>
    </Card>
  );
}
