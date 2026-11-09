"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BrainCircuitIcon,
  Loader2Icon,
  SparklesIcon,
  GlobeIcon,
  PlusIcon,
  CheckCircle2Icon,
  KeyIcon,
  Trash2Icon,
  EditIcon,
  PlayIcon,
  StarIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  saveAiConfigAction,
  testAiAction,
  saveAiModelAction,
  deleteAiModelAction,
  setDefaultAiModelAction,
  testAiModelByIdAction,
} from "@/app/actions/assistant";
import type { AiConfigView, AiProvider, StoredAiModel } from "@/server/assistant-ai";
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
  savedModels = [],
}: {
  config: AiConfigView;
  usage: Usage;
  models: { id: string; label: string; provider: string }[];
  roles: { key: string; label: string }[];
  savedModels?: StoredAiModel[];
}) {
  const router = useRouter();
  const [modelList, setModelList] = React.useState<StoredAiModel[]>(savedModels);
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

  // Model Modal State
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [mForm, setMForm] = React.useState({
    name: "",
    provider: "gemini" as AiProvider,
    model: "gemini-2.0-flash",
    apiKey: "",
    customBaseUrl: "",
    isDefault: false,
    active: true,
  });

  const keyed = config.hasKey || config.envKey || config.fake || modelList.some((m) => m.hasKey);

  const openAddModal = () => {
    setEditingId(null);
    setMForm({
      name: "",
      provider: "gemini",
      model: "gemini-2.0-flash",
      apiKey: "",
      customBaseUrl: "",
      isDefault: modelList.length === 0,
      active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (m: StoredAiModel) => {
    setEditingId(m.id);
    setMForm({
      name: m.name,
      provider: m.provider,
      model: m.model,
      apiKey: "",
      customBaseUrl: m.customBaseUrl || "",
      isDefault: m.isDefault,
      active: m.active,
    });
    setModalOpen(true);
  };

  const handleSaveModel = async () => {
    if (!mForm.name.trim()) return toast.error("Model name is required");
    if (!mForm.model.trim()) return toast.error("Model identifier is required");

    setBusy("save-model");
    const res = await saveAiModelAction({
      id: editingId || undefined,
      name: mForm.name.trim(),
      provider: mForm.provider,
      model: mForm.model.trim(),
      apiKey: mForm.apiKey || undefined,
      customBaseUrl: mForm.customBaseUrl || undefined,
      isDefault: mForm.isDefault,
      active: mForm.active,
    });
    setBusy(null);

    if (res.ok) {
      toast.success(editingId ? "AI model updated" : "AI model created");
      setModalOpen(false);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to save AI model");
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (!confirm(`Delete AI model "${name}"?`)) return;
    setBusy(`del-${id}`);
    const res = await deleteAiModelAction(id);
    setBusy(null);
    if (res.ok) {
      toast.success(`Model "${name}" deleted`);
      setModelList((prev) => prev.filter((m) => m.id !== id));
      router.refresh();
    } else {
      toast.error(res.error || "Failed to delete model");
    }
  };

  const handleSetDefault = async (id: string, name: string) => {
    setBusy(`default-${id}`);
    const res = await setDefaultAiModelAction(id);
    setBusy(null);
    if (res.ok) {
      toast.success(`Set "${name}" as default model`);
      setModelList((prev) =>
        prev.map((m) => ({
          ...m,
          isDefault: m.id === id,
        }))
      );
      router.refresh();
    } else {
      toast.error(res.error || "Failed to set default model");
    }
  };

  const handleTestModel = async (id: string, name: string) => {
    setBusy(`test-${id}`);
    const res = await testAiModelByIdAction(id);
    setBusy(null);
    if (res.ok) {
      toast.success(`Test passed for "${name}": ${res.data?.response}`);
    } else {
      toast.error(res.error || `Test failed for "${name}"`);
    }
  };

  const handleSaveGeneralConfig = async (extra: { clearKey?: boolean } = {}) => {
    setBusy("save-general");
    const r = await saveAiConfigAction({
      ...c,
      customBaseUrl: c.provider === "custom" ? c.customBaseUrl : undefined,
      key: key || null,
      ...extra,
    });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setKey("");
    toast.success("AI assistant global settings saved");
    router.refresh();
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case "gemini":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">Google Gemini</Badge>;
      case "anthropic":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">Anthropic Claude</Badge>;
      case "openai":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">OpenAI</Badge>;
      default:
        return <Badge variant="secondary">Custom API</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Models & Multiple API Keys Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <SparklesIcon className="size-4 text-primary" /> Configured AI Models & API Keys
            </CardTitle>
            <CardDescription className="text-xs">
              Manage multiple AI models and distinct provider API keys. Set defaults, test connections, and switch models on the fly.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAddModal} className="gap-1.5">
            <PlusIcon className="size-4" /> Add AI Model
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[200px]">Model Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Identifier / Endpoint</TableHead>
                  <TableHead>API Key Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      No custom AI models configured yet. Click &quot;Add AI Model&quot; to configure your Gemini, OpenAI, or Claude models.
                    </TableCell>
                  </TableRow>
                ) : (
                  modelList.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-1.5">
                          {m.name}
                          {m.isDefault && (
                            <Badge variant="outline" className="border-primary text-primary font-semibold text-[10px] py-0 px-1.5">
                              Default
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getProviderBadge(m.provider)}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                          {m.model}
                        </code>
                        {m.customBaseUrl && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {m.customBaseUrl}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.hasKey ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <KeyIcon className="size-3" /> Sealed & Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertCircleIcon className="size-3" /> Environment Key
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.isDefault ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <StarIcon className="size-3.5 fill-primary text-primary" /> Active Default
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            disabled={busy === `default-${m.id}`}
                            onClick={() => handleSetDefault(m.id, m.name)}
                          >
                            Set Default
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busy === `test-${m.id}`}
                          onClick={() => handleTestModel(m.id, m.name)}
                        >
                          {busy === `test-${m.id}` ? (
                            <Loader2Icon className="size-3 animate-spin mr-1" />
                          ) : (
                            <PlayIcon className="size-3 mr-1 text-emerald-600" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openEditModal(m)}
                        >
                          <EditIcon className="size-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          disabled={busy === `del-${m.id}`}
                          onClick={() => handleDeleteModel(m.id, m.name)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Global AI Assistant Settings */}
      <Card data-ai-admin>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuitIcon className="size-4 text-[#9334E6] dark:text-[#C58AF9]" /> Global AI Assistant Controls
          </CardTitle>
          <CardDescription>
            Configure AI reasoning depth, role access restrictions, daily question limits, and automated actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="ai-on" checked={c.on} onCheckedChange={(on) => setC({ ...c, on })} disabled={!keyed && !key} />
            <Label htmlFor="ai-on">Enable Smart AI Assistant across workspace</Label>
            {!keyed && !key && <span className="text-xs text-muted-foreground">Save an AI model with an API key first.</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Reasoning Depth */}
            <div className="space-y-1">
              <Label htmlFor="ai-effort">Reasoning Depth</Label>
              <select
                id="ai-effort"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={c.effort}
                onChange={(e) => setC({ ...c, effort: e.target.value as typeof c.effort })}
              >
                <option value="low">Low (Fastest responses)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Deep reasoning)</option>
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
              <p className="text-xs text-muted-foreground">0 for unlimited questions.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="ai-actions" checked={c.actions} onCheckedChange={(actions) => setC({ ...c, actions })} />
            <Label htmlFor="ai-actions">
              May prepare actions (always confirmed by the person, with permission checks)
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-ai-agent>
            <Switch id="ai-agent" checked={c.agent} disabled={!c.actions} onCheckedChange={(agent) => setC({ ...c, agent })} />
            <Label htmlFor="ai-agent">Agent mode: people may let it do allowed actions directly</Label>
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
            <p className="font-medium">Roles that keep keyword assistant only (restricted from AI)</p>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => {
                const off = c.offRoles.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={off}
                    onClick={() => setC({ ...c, offRoles: off ? c.offRoles.filter((x) => x !== r.key) : [...c.offRoles, r.key] })}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      off ? "border-destructive/50 bg-destructive/10 text-destructive line-through" : "hover:bg-muted"
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" disabled={busy === "save-general"} onClick={() => handleSaveGeneralConfig()}>
              {busy === "save-general" && <Loader2Icon className="animate-spin mr-1.5" />} Save Global AI Settings
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !keyed} onClick={async () => {
              setBusy("test-global");
              const r = await testAiAction();
              setBusy(null);
              if (!r.ok) return toast.error(r.error);
              toast.success(`AI answered successfully (${r.data?.model})`);
            }}>
              {busy === "test-global" && <Loader2Icon className="animate-spin mr-1.5" />} Test Active Assistant
            </Button>
          </div>

          <p className="text-xs text-muted-foreground" data-ai-usage>
            Last 30 days: {usage.questions} questions from {usage.people} people, {usage.confirmed} actions confirmed
            {usage.byRole.length ? ` (${usage.byRole.map((r) => `${roles.find((x) => x.key === r.role)?.label ?? r.role} ${r.n}`).join(", ")})` : ""}.
          </p>
        </CardContent>
      </Card>

      {/* Add / Edit AI Model Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit AI Model" : "Add AI Model & API Key"}</DialogTitle>
            <DialogDescription>
              Configure model settings and provide a dedicated API key. The key will be stored securely sealed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="space-y-1">
              <Label htmlFor="m-name">Display Name</Label>
              <Input
                id="m-name"
                placeholder="e.g. Google Gemini 2.5 Flash Production"
                value={mForm.name}
                onChange={(e) => setMForm({ ...mForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="m-provider">Provider</Label>
                <select
                  id="m-provider"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={mForm.provider}
                  onChange={(e) => {
                    const p = e.target.value as AiProvider;
                    const defaultModel = models.find((m) => m.provider === p)?.id || (p === "gemini" ? "gemini-2.0-flash" : p === "openai" ? "gpt-4o" : "claude-3-5-sonnet-latest");
                    setMForm({ ...mForm, provider: p, model: defaultModel });
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="m-model">Model Identifier</Label>
                <Input
                  id="m-model"
                  placeholder="e.g. gemini-2.0-flash, gpt-4o, claude-3-5-sonnet-latest"
                  value={mForm.model}
                  onChange={(e) => setMForm({ ...mForm, model: e.target.value })}
                />
              </div>
            </div>

            {/* Quick model suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-muted-foreground mr-1">Suggestions:</span>
              {(mForm.provider === "gemini"
                ? ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-3.8-flash"]
                : mForm.provider === "openai"
                ? ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"]
                : mForm.provider === "anthropic"
                ? ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"]
                : ["deepseek-chat", "deepseek-reasoner", "llama-3.3-70b-versatile"]
              ).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    mForm.model === sug
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted text-muted-foreground"
                  }`}
                  onClick={() => setMForm({ ...mForm, model: sug })}
                >
                  {sug}
                </button>
              ))}
            </div>

            {mForm.provider === "custom" && (
              <div className="space-y-1">
                <Label htmlFor="m-url">Custom Base URL (OpenAI-compatible)</Label>
                <Input
                  id="m-url"
                  placeholder="https://api.deepseek.com/v1 or http://localhost:11434/v1"
                  value={mForm.customBaseUrl}
                  onChange={(e) => setMForm({ ...mForm, customBaseUrl: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="m-key">API Key</Label>
              <Input
                id="m-key"
                type="password"
                autoComplete="off"
                placeholder={editingId ? "Leave blank to keep existing sealed key" : "Enter API key"}
                value={mForm.apiKey}
                onChange={(e) => setMForm({ ...mForm, apiKey: e.target.value })}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Encrypted at rest with server-side sealing.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="m-default"
                  checked={mForm.isDefault}
                  onCheckedChange={(isDefault) => setMForm({ ...mForm, isDefault })}
                />
                <Label htmlFor="m-default" className="text-xs">Set as Default Model</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="m-active"
                  checked={mForm.active}
                  onCheckedChange={(active) => setMForm({ ...mForm, active })}
                />
                <Label htmlFor="m-active" className="text-xs">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy === "save-model"} onClick={handleSaveModel}>
              {busy === "save-model" && <Loader2Icon className="animate-spin mr-1.5" />}
              {editingId ? "Update Model" : "Save Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
