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
  { id: "gemini" as const, label: "Google (Gemini 2.0 & 1.5)", provider: "gemini" as AiProvider, defaultModel: "gemini-2.0-flash", baseUrl: "" },
  { id: "openai" as const, label: "OpenAI (GPT-4o & o3-mini)", provider: "openai" as AiProvider, defaultModel: "gpt-4o", baseUrl: "" },
  { id: "anthropic" as const, label: "Anthropic (Claude 3.7 & 3.5)", provider: "anthropic" as AiProvider, defaultModel: "claude-3-7-sonnet", baseUrl: "" },
  { id: "deepseek" as const, label: "DeepSeek (V3 & R1)", provider: "custom" as AiProvider, defaultModel: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "groq" as const, label: "Groq (Ultra-Fast Llama 3.3)", provider: "custom" as AiProvider, defaultModel: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter" as const, label: "OpenRouter (Multi-model)", provider: "custom" as AiProvider, defaultModel: "meta-llama/llama-3.3-70b-instruct", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "mistral" as const, label: "Mistral AI (Large & Codestral)", provider: "custom" as AiProvider, defaultModel: "mistral-large-latest", baseUrl: "https://api.mistral.ai/v1" },
  { id: "ollama" as const, label: "Ollama (Localhost)", provider: "custom" as AiProvider, defaultModel: "llama3.2:latest", baseUrl: "http://localhost:11434/v1" },
  { id: "custom" as const, label: "Custom OpenAI-Compatible", provider: "custom" as AiProvider, defaultModel: "custom-model", baseUrl: "" },
];

const CURATED_MODELS: Record<string, { id: string; label: string; desc: string }[]> = {
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Recommended · Ultra fast, multimodal, 1M context" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite", desc: "High throughput, cost efficient" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", desc: "Deep reasoning, large 2M context" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", desc: "Fast general-purpose assistant" },
    { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B", desc: "High frequency, economical" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Advanced reasoning preview" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Experimental preview" },
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", desc: "Next-gen experimental preview" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o", desc: "Flagship omni multimodal model" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Fast, lightweight & smart" },
    { id: "o3-mini", label: "o3-mini", desc: "High-speed STEM, coding & math reasoning" },
    { id: "o1", label: "o1", desc: "Full deep reasoning & complex problem solving" },
    { id: "o1-mini", label: "o1-mini", desc: "Fast reasoning model" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", desc: "128k context, broad knowledge" },
    { id: "gpt-4", label: "GPT-4", desc: "Standard reliable" },
    { id: "chatgpt-4o-latest", label: "ChatGPT-4o Latest", desc: "Dynamic checkpoint" },
  ],
  anthropic: [
    { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet", desc: "Hybrid instant + extended thinking" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", desc: "Leading coding & analysis" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", desc: "Ultra-fast & responsive" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus", desc: "Comprehensive reasoning & writing" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3 (deepseek-chat)", desc: "High performance general & coding" },
    { id: "deepseek-reasoner", label: "DeepSeek R1 (deepseek-reasoner)", desc: "Chain-of-thought reasoning" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", desc: "Groq ultra-low latency (300+ tok/s)" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", desc: "Groq instant responses" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", desc: "Groq 32k context" },
  ],
  openrouter: [
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", desc: "OpenRouter versatile" },
    { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B Instruct", desc: "OpenRouter top performer" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large", desc: "Flagship top-tier reasoning" },
    { id: "mistral-small-latest", label: "Mistral Small", desc: "Fast cost-effective" },
    { id: "codestral-latest", label: "Codestral", desc: "Specialized code assistant" },
  ],
  ollama: [
    { id: "llama3.2:latest", label: "Llama 3.2", desc: "Local Ollama 3.2" },
    { id: "deepseek-r1:latest", label: "DeepSeek R1", desc: "Local Ollama R1" },
    { id: "qwen2.5-coder:latest", label: "Qwen 2.5 Coder", desc: "Local Ollama coding" },
    { id: "mistral:latest", label: "Mistral", desc: "Local Ollama general" },
  ],
  custom: [
    { id: "deepseek-chat", label: "DeepSeek V3", desc: "Compatible chat endpoint" },
    { id: "deepseek-reasoner", label: "DeepSeek R1", desc: "Compatible reasoning endpoint" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", desc: "Compatible endpoint" },
  ],
};

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
    presetId: "gemini",
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
      name: "Google Gemini 2.0 Flash",
      presetId: "gemini",
      provider: "gemini",
      model: "gemini-2.0-flash",
      apiKey: "",
      customBaseUrl: "",
      isDefault: modelList.length === 0,
      active: true,
    });
    setModalOpen(true);
  };

  const detectPreset = (m: StoredAiModel) => {
    const url = (m.customBaseUrl || "").toLowerCase();
    if (url.includes("deepseek")) return "deepseek";
    if (url.includes("groq")) return "groq";
    if (url.includes("openrouter")) return "openrouter";
    if (url.includes("mistral")) return "mistral";
    if (url.includes("localhost") || url.includes("11434")) return "ollama";
    if (m.provider === "gemini") return "gemini";
    if (m.provider === "openai") return "openai";
    if (m.provider === "anthropic") return "anthropic";
    return "custom";
  };

  const openEditModal = (m: StoredAiModel) => {
    setEditingId(m.id);
    setMForm({
      name: m.name,
      presetId: detectPreset(m),
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

          {/* Global Fallback Provider & Model Engine */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs">Global Fallback Engine & Key</span>
              <span className="text-[11px] text-muted-foreground">Used when no dedicated model is active</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ai-glob-provider" className="text-xs">Provider</Label>
                <select
                  id="ai-glob-provider"
                  className="h-8 w-full rounded border bg-background px-2 text-xs"
                  value={c.provider}
                  onChange={(e) => {
                    const p = e.target.value as AiProvider;
                    const def = p === "gemini" ? "gemini-2.0-flash" : p === "openai" ? "gpt-4o" : p === "anthropic" ? "claude-3-7-sonnet" : "deepseek-chat";
                    setC({ ...c, provider: p, model: def });
                  }}
                >
                  <option value="gemini">Google (Gemini 2.0 & 1.5)</option>
                  <option value="openai">OpenAI (GPT-4o & o3-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.7 & 3.5)</option>
                  <option value="custom">Custom / OpenAI-Compatible (DeepSeek, Groq, Ollama)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="ai-glob-model-select" className="text-xs">Model Catalog</Label>
                <select
                  id="ai-glob-model-select"
                  className="h-8 w-full rounded border bg-background px-2 text-xs"
                  value={
                    (CURATED_MODELS[c.provider] || []).some((m) => m.id === c.model)
                      ? c.model
                      : "__custom__"
                  }
                  onChange={(e) => {
                    if (e.target.value === "__custom__") return;
                    setC({ ...c, model: e.target.value });
                  }}
                >
                  {(CURATED_MODELS[c.provider] || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                  <option value="__custom__">-- Custom Model Identifier --</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ai-glob-model-id" className="text-xs">Model Identifier</Label>
                <Input
                  id="ai-glob-model-id"
                  className="h-8 font-mono text-xs"
                  placeholder="e.g. gemini-2.0-flash, gpt-4o, claude-3-7-sonnet"
                  value={c.model}
                  onChange={(e) => setC({ ...c, model: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="ai-glob-key" className="text-xs">Global API Key {config.hasKey ? "(Sealed key saved)" : ""}</Label>
                <Input
                  id="ai-glob-key"
                  type="password"
                  autoComplete="off"
                  className="h-8 font-mono text-xs"
                  placeholder={config.hasKey ? "Leave blank to keep saved key" : "Enter API key"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </div>
            </div>

            {c.provider === "custom" && (
              <div className="space-y-1">
                <Label htmlFor="ai-glob-base" className="text-xs">Custom Base URL</Label>
                <Input
                  id="ai-glob-base"
                  className="h-8 font-mono text-xs"
                  placeholder="https://api.deepseek.com/v1 or http://localhost:11434/v1"
                  value={c.customBaseUrl}
                  onChange={(e) => setC({ ...c, customBaseUrl: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" disabled={busy === "save-general"} onClick={() => handleSaveGeneralConfig()}>
              {busy === "save-general" && <Loader2Icon className="animate-spin mr-1.5" />} Save Global AI Settings
            </Button>
            {config.hasKey && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => handleSaveGeneralConfig({ clearKey: true })}>
                Remove Global Key
              </Button>
            )}
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
                <Label htmlFor="m-provider">Provider Platform</Label>
                <select
                  id="m-provider"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={mForm.presetId}
                  onChange={(e) => {
                    const preset = PROVIDERS.find((p) => p.id === e.target.value) || PROVIDERS[0];
                    const curated = CURATED_MODELS[preset.id] || [];
                    const defaultModel = curated[0]?.id || preset.defaultModel;
                    const defaultName = curated[0]?.label || `${preset.label} Model`;
                    setMForm({
                      ...mForm,
                      presetId: preset.id,
                      provider: preset.provider,
                      customBaseUrl: preset.baseUrl,
                      model: defaultModel,
                      name: defaultName,
                    });
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
                <Label htmlFor="m-model-select">Select Catalog Model</Label>
                <select
                  id="m-model-select"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={
                    (CURATED_MODELS[mForm.presetId] || []).some((m) => m.id === mForm.model)
                      ? mForm.model
                      : "__custom__"
                  }
                  onChange={(e) => {
                    if (e.target.value === "__custom__") return;
                    const picked = (CURATED_MODELS[mForm.presetId] || []).find((m) => m.id === e.target.value);
                    if (picked) {
                      setMForm({
                        ...mForm,
                        model: picked.id,
                        name: picked.label,
                      });
                    }
                  }}
                >
                  {(CURATED_MODELS[mForm.presetId] || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                  <option value="__custom__">-- Custom Model Identifier --</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="m-model">Model Identifier (editable)</Label>
                <span className="text-[11px] text-muted-foreground font-mono">Any valid identifier</span>
              </div>
              <Input
                id="m-model"
                placeholder="e.g. gemini-2.0-flash, gpt-4o, claude-3-7-sonnet, deepseek-chat"
                value={mForm.model}
                onChange={(e) => setMForm({ ...mForm, model: e.target.value })}
                className="font-mono text-xs"
              />
            </div>

            {/* Quick model suggestions */}
            <div className="space-y-1 pt-0.5">
              <span className="text-[11px] text-muted-foreground">Available Models ({mForm.presetId}):</span>
              <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded border bg-muted/20">
                {(CURATED_MODELS[mForm.presetId] || []).map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    title={sug.desc}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                      mForm.model === sug.id
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}
                    onClick={() => setMForm({ ...mForm, model: sug.id, name: sug.label })}
                  >
                    {sug.id}
                  </button>
                ))}
              </div>
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
