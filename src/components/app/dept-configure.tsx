"use client";

// The department's Configure tab: names, statuses, task types, priorities, labels, custom fields, project statuses,
// KPIs, rights per position, features and notifications. Edits are collected and saved together as a new version;
// earlier versions can be restored. Items in use can be switched off but not removed.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, DownloadIcon, HistoryIcon, Loader2Icon, PlusIcon, RotateCcwIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { deptConfigUsageAction, deptConfigVersionsAction, restoreDeptConfigAction, saveDeptConfigAction } from "@/app/actions/departments";
import {
  CONFIG_POSITIONS,
  FEATURES,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  RIGHTS,
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  colorAt,
  makeKey,
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  type ChecklistLine,
  type DeptAutomation,
  type DeptTemplate,
  type DeptConfig,
  type DeptField,
  type FieldType,
  type StatusCategory,
} from "@/lib/dept-config";
import { POSITION_LABELS } from "@/lib/domain";
import { deptPath, type WorkDept } from "@/lib/work";
import { cn } from "@/lib/utils";

type Usage = Record<"statuses" | "types" | "priorities" | "projectStatuses" | "kpis", Record<string, number>>;
type Item = { key: string; label: string; active: boolean; color?: string };

export function DeptConfigure({ dept, config, version, people = [] }: { dept: WorkDept; config: DeptConfig; version: number; people?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState<DeptConfig>(config);
  const [busy, setBusy] = React.useState(false);
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  React.useEffect(() => setC(config), [config]);
  React.useEffect(() => {
    void deptConfigUsageAction(dept).then((r) => r.ok && setUsage(r.data as Usage));
  }, [dept, version]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const set = <K extends keyof DeptConfig>(k: K, v: DeptConfig[K]) => setC((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    const r = await saveDeptConfigAction(dept, c, version);
    setBusy(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });
    toast.success(`Saved as version ${r.data}`);
    router.refresh();
  };
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }));
    a.download = `${dept}-configuration-v${version}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      setC({ ...c, ...data });
      toast.info("Configuration loaded. Check it, then Save changes.");
    } catch {
      toast.error("That file is not a configuration export.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-3 pb-20">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => router.push(deptPath(dept))}>
          <ArrowLeftIcon /> Back to {c.names.tasks.toLowerCase()}
        </Button>
        <span className="text-sm text-muted-foreground">Configuration, version {version}</span>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <UploadIcon /> Import
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson}>
            <DownloadIcon /> Export
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="gap-3">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="priorities">Priorities and labels</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="projects">{c.names.projects}</TabsTrigger>
          <TabsTrigger value="rights">Rights</TabsTrigger>
          <TabsTrigger value="notify">Notifications</TabsTrigger>
          <TabsTrigger value="history">
            <HistoryIcon className="size-3.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Names</CardTitle>
              <CardDescription>What this department calls its work. Used on every screen, in notices and in exports.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Section title">
                <Input value={c.title} onChange={(e) => set("title", e.target.value)} />
              </Field>
              <Field label="Code prefix" hint={`For ${c.names.tasks.toLowerCase()} without a ${c.names.project.toLowerCase()}, e.g. ${c.codePrefix}-12`}>
                <Input value={c.codePrefix} maxLength={8} onChange={(e) => set("codePrefix", e.target.value.toUpperCase())} />
              </Field>
              <div className="hidden lg:block" />
              {(["project", "projects", "task", "tasks", "milestone"] as const).map((k) => (
                <Field key={k} label={{ project: "A project is called", projects: "Projects (plural)", task: "A task is called", tasks: "Tasks (plural)", milestone: "A milestone is called" }[k]}>
                  <Input value={c.names[k]} onChange={(e) => set("names", { ...c.names, [k]: e.target.value })} />
                </Field>
              ))}
              <Field label="Description" className="sm:col-span-2 lg:col-span-3">
                <Textarea rows={2} value={c.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle className="text-base">Features</CardTitle>
              <CardDescription>Switch parts of the {c.names.task.toLowerCase()} and {c.names.project.toLowerCase()} forms on or off. Data already entered is kept.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <Switch checked={c.features[f.key]} onCheckedChange={(v) => set("features", { ...c.features, [f.key]: v })} /> {f.label}
                </label>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statuses">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statuses</CardTitle>
              <CardDescription>
                The workflow, in board order. The category tells reports what a status means, so counts stay right when you rename or add statuses. A limit warns when a column holds too many
                {" " + c.names.tasks.toLowerCase()}; restricted statuses can be left only by positions with that right (see Rights).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ListEditor
                items={c.statuses}
                usage={usage?.statuses}
                onChange={(v) => set("statuses", v)}
                make={(label, key, i) => ({ key, label, category: "active" as StatusCategory, color: colorAt(i), limit: null, restricted: false, onBoard: true, active: true })}
                extra={(s, patch) => (
                  <>
                    <Select value={s.category} onValueChange={(v) => patch({ category: v as StatusCategory, onBoard: v !== "cancelled" })}>
                      <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_CATEGORIES.map((k) => (
                          <SelectItem key={k} value={k}>
                            {STATUS_CATEGORY_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      aria-label="Limit"
                      placeholder="No limit"
                      className="h-8 w-24 text-xs"
                      value={s.limit ?? ""}
                      onChange={(e) => patch({ limit: e.target.value ? Number(e.target.value) : null })}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <Switch checked={s.onBoard} onCheckedChange={(v) => patch({ onBoard: v })} /> On board
                    </label>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <Switch checked={s.restricted} onCheckedChange={(v) => patch({ restricted: v })} /> Only with the right
                    </label>
                  </>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.names.task} types</CardTitle>
              <CardDescription>For example Bug and Feature, or Social post and Design. Custom fields can be limited to some types (Fields tab).</CardDescription>
            </CardHeader>
            <CardContent>
              <ListEditor items={c.types} usage={usage?.types} onChange={(v) => set("types", v)} make={(label, key, i) => ({ key, label, color: colorAt(i), active: true, checklist: [] })} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="priorities" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Priorities</CardTitle>
              <CardDescription>Highest first; sorting by priority follows this order.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListEditor items={c.priorities} usage={usage?.priorities} onChange={(v) => set("priorities", v)} make={(label, key, i) => ({ key, label, color: colorAt(i), active: true })} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggested labels</CardTitle>
              <CardDescription>Offered while typing labels on a {c.names.task.toLowerCase()}. People can still type new ones. One per line or separated by commas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={3} value={c.labels.join(", ")} onChange={(e) => set("labels", e.target.value.split(/[,\n]/).map((l) => l.trim().toLowerCase()).filter(Boolean))} placeholder="mobile, api, urgent-fix" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields">
          <FieldsEditor config={c} onChange={(v) => set("fields", v)} />
        </TabsContent>

        <TabsContent value="checklists">
          <ChecklistsEditor config={c} onChange={(v) => set("types", v)} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesEditor config={c} onChange={(v) => set("templates", v)} />
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsEditor config={c} people={people} onChange={(v) => set("automations", v)} />
        </TabsContent>

        <TabsContent value="requests">
          <IntakeEditor config={c} onChange={(intake, requests) => setC((x) => ({ ...x, intake, features: { ...x.features, requests } }))} />
        </TabsContent>

        <TabsContent value="projects" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.names.project} statuses</CardTitle>
              <CardDescription>Done and Cancelled ones count as finished: they move to the end of the list and leave the Owners dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListEditor
                items={c.projectStatuses}
                usage={usage?.projectStatuses}
                onChange={(v) => set("projectStatuses", v)}
                make={(label, key) => ({ key, label, category: "active" as const, active: true })}
                extra={(s, patch) => (
                  <Select value={s.category} onValueChange={(v) => patch({ category: v as (typeof PROJECT_CATEGORIES)[number] })}>
                    <SelectTrigger size="sm" className="h-8 w-32 text-xs" aria-label="Category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CATEGORIES.map((k) => (
                        <SelectItem key={k} value={k}>
                          {PROJECT_CATEGORY_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">KPIs</CardTitle>
              <CardDescription>
                Numbers tracked per {c.names.project.toLowerCase()}, with a target each.
                {!c.features.kpis && " Switch on KPIs and targets in General to use them."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ListEditor
                items={c.kpis}
                usage={usage?.kpis}
                onChange={(v) => set("kpis", v)}
                make={(label, key) => ({ key, label, unit: "", higherIsBetter: true, active: true })}
                extra={(k, patch) => (
                  <>
                    <Input aria-label="Unit" placeholder="Unit" className="h-8 w-20 text-xs" value={k.unit} onChange={(e) => patch({ unit: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <Switch checked={k.higherIsBetter} onCheckedChange={(v) => patch({ higherIsBetter: v })} /> Higher is better
                    </label>
                  </>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rights">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rights per position</CardTitle>
              <CardDescription>Positions are set per person in Admin, Departments. Admin can always do everything; owners can always read everything.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium" />
                    {CONFIG_POSITIONS.map((p) => (
                      <th key={p} className="p-2 text-center font-medium">
                        {POSITION_LABELS[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RIGHTS.map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="p-2">
                        {r.label}
                        {"hint" in r && <span className="block text-xs text-muted-foreground">{r.hint}</span>}
                      </td>
                      {CONFIG_POSITIONS.map((p) => (
                        <td key={p} className="p-2 text-center">
                          <Switch
                            aria-label={`${POSITION_LABELS[p]}: ${r.label}`}
                            checked={c.rights[p][r.key]}
                            disabled={p === "head" && r.key === "configure"}
                            onCheckedChange={(v) => set("rights", { ...c.rights, [p]: { ...c.rights[p], [r.key]: v } })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notify">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription>Which events send a notice (in the app, and as a push notification to people who turned those on).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ["assigned", `Tell people when a ${c.names.task.toLowerCase()} is assigned to them`],
                  ["comments", "Tell the assignee and the creator about new comments"],
                  ["statusToReporter", `Tell the creator when their ${c.names.task.toLowerCase()} changes status`],
                  ["reviewToManagers", `Tell heads and leads when a ${c.names.task.toLowerCase()} reaches a status in the In review category`],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Switch checked={c.notify[k]} onCheckedChange={(v) => set("notify", { ...c.notify, [k]: v })} /> {label}
                </label>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <History dept={dept} version={version} dirty={dirty} />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-xl border bg-popover px-4 py-2 shadow-lg">
          <span className="text-sm">Unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={() => setC(config)} disabled={busy}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />} Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

// A labelled control; the label is tied to the control so it is announced and clickable.
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  const id = React.useId();
  const control = React.isValidElement<{ id?: string }>(children) && typeof children.type !== "string" ? React.cloneElement(children, { id }) : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// An ordered list of named items: rename, recolour, reorder, switch off, add, and remove when nothing uses it.
function ListEditor<T extends Item>({
  items,
  usage,
  onChange,
  make,
  extra,
}: {
  items: T[];
  usage?: Record<string, number>;
  onChange: (items: T[]) => void;
  make: (label: string, key: string, index: number) => T;
  extra?: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const [label, setLabel] = React.useState("");
  const patch = (i: number, p: Partial<T>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  const add = () => {
    const l = label.trim();
    if (!l) return;
    onChange([...items, make(l, makeKey(l, items.map((x) => x.key)), items.length)]);
    setLabel("");
  };
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {items.map((it, i) => {
          const used = usage?.[it.key] ?? 0;
          return (
            <li key={it.key} className={cn("flex flex-wrap items-center gap-2 px-2 py-1.5", !it.active && "bg-muted/40")}>
              <span className="flex flex-col">
                <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${it.label} up`}>
                  <ArrowUpIcon className="size-3.5" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${it.label} down`}>
                  <ArrowDownIcon className="size-3.5" />
                </button>
              </span>
              {it.color !== undefined && (
                <input type="color" aria-label={`Colour of ${it.label}`} value={it.color} onChange={(e) => patch(i, { color: e.target.value } as Partial<T>)} className="size-7 cursor-pointer rounded border bg-transparent p-0.5" />
              )}
              <Input aria-label="Name" value={it.label} onChange={(e) => patch(i, { label: e.target.value } as Partial<T>)} className={cn("h-8 w-44 text-sm", !it.active && "text-muted-foreground")} />
              <span className="w-28 truncate font-mono text-[10px] text-muted-foreground" title="Key (fixed)">
                {it.key}
              </span>
              {extra?.(it, (p) => patch(i, p))}
              <span className="ml-auto flex items-center gap-2">
                {usage && <span className="text-xs text-muted-foreground tabular">{used ? `${used} use${used === 1 ? "" : "s"}` : "unused"}</span>}
                <label className="flex items-center gap-1 text-xs">
                  <Switch checked={it.active} onCheckedChange={(v) => patch(i, { active: v } as Partial<T>)} aria-label={`${it.label} on`} /> On
                </label>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-destructive"
                  disabled={used > 0}
                  title={used > 0 ? "In use: switch it off instead" : "Remove"}
                  aria-label={`Remove ${it.label}`}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New name" className="h-8 w-56" />
        <Button size="sm" variant="outline" type="submit" disabled={!label.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
    </div>
  );
}

const REQUIRED_OPTIONS: { value: string; label: string }[] = [
  { value: "never", label: "Optional" },
  { value: "open", label: "Always required" },
  { value: "active", label: "Required from In progress" },
  { value: "review", label: "Required from In review" },
  { value: "done", label: "Required to be Done" },
];

function FieldsEditor({ config: c, onChange }: { config: DeptConfig; onChange: (fields: DeptField[]) => void }) {
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<FieldType>("text");
  const fields = c.fields;
  const patch = (i: number, p: Partial<DeptField>) => onChange(fields.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const next = [...fields];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom fields</CardTitle>
        <CardDescription>
          Extra details on each {c.names.task.toLowerCase()}, such as a channel, a link to the design or the client. They appear in the {c.names.task.toLowerCase()} form, and optionally on board cards and as
          list columns. Removing a field hides it; values already entered are kept.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!fields.length && <p className="text-sm text-muted-foreground">No custom fields yet.</p>}
        {fields.map((f, i) => (
          <div key={f.key} className={cn("space-y-3 rounded-lg border p-3", !f.active && "bg-muted/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex flex-col">
                <button type="button" className="text-muted-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f.label} up`}>
                  <ArrowUpIcon className="size-3.5" />
                </button>
                <button type="button" className="text-muted-foreground disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f.label} down`}>
                  <ArrowDownIcon className="size-3.5" />
                </button>
              </span>
              <Input aria-label="Field name" value={f.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-8 w-48" />
              <Select value={f.type} onValueChange={(v) => patch(i, { type: v as FieldType })}>
                <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Field type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={f.requiredFrom ?? "never"} onValueChange={(v) => patch(i, { requiredFrom: v === "never" ? null : (v as StatusCategory) })}>
                <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="Required">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUIRED_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-mono text-[10px] text-muted-foreground" title="Key (fixed; also the CSV column name)">
                {f.key}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <Switch checked={f.active} onCheckedChange={(v) => patch(i, { active: v })} /> On
                </label>
                <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove ${f.label}`} onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </span>
            </div>
            {(f.type === "select" || f.type === "multiselect") && (
              <Field label="Choices" hint="One per line">
                <Textarea rows={3} value={f.options.join("\n")} onChange={(e) => patch(i, { options: e.target.value.split("\n") })} onBlur={() => patch(i, { options: f.options.map((o) => o.trim()).filter(Boolean) })} />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Help text (optional)">
                <Input value={f.help} onChange={(e) => patch(i, { help: e.target.value })} placeholder="Shown under the field" />
              </Field>
              <Field label={`Shown for these ${c.names.task.toLowerCase()} types`} hint="None picked: all types">
                <div className="flex flex-wrap gap-1.5">
                  {c.types.map((t) => {
                    const on = f.types.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch(i, { types: on ? f.types.filter((x) => x !== t.key) : [...f.types, t.key] })}
                        className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={f.onCard} onCheckedChange={(v) => patch(i, { onCard: v })} /> On board cards
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={f.inList} onCheckedChange={(v) => patch(i, { inList: v })} /> Column in the list
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={f.leadsOnly} onCheckedChange={(v) => patch(i, { leadsOnly: v })} /> Only people who edit everyone&apos;s {c.names.tasks.toLowerCase()} can change it
              </label>
            </div>
          </div>
        ))}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const l = label.trim();
            if (!l) return;
            onChange([
              ...fields,
              { key: makeKey(l, fields.map((x) => x.key)), label: l, type, options: type === "select" || type === "multiselect" ? ["Option 1"] : [], help: "", requiredFrom: null, types: [], onCard: false, inList: true, leadsOnly: false, active: true },
            ]);
            setLabel("");
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New field name" className="h-8 w-56" />
          <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
            <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="New field type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" type="submit" disabled={!label.trim()}>
            <PlusIcon /> Add field
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function History({ dept, version, dirty }: { dept: WorkDept; version: number; dirty: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<{ version: number; summary: string | null; created_at: string; created_by_name: string | null }[] | null>(null);
  React.useEffect(() => {
    void deptConfigVersionsAction(dept).then((r) => r.ok && setRows(r.data as typeof rows));
  }, [dept, version]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Versions</CardTitle>
        <CardDescription>Every save is kept. Restoring an earlier version saves it again as the newest one, so nothing is lost.</CardDescription>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((r) => (
              <li key={r.version} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-10 font-mono text-xs text-muted-foreground">v{r.version}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{r.summary ?? "Saved"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.created_at.slice(0, 16).replace("T", " ")}
                    {r.created_by_name && ` · ${r.created_by_name}`}
                  </span>
                </span>
                {r.version === version ? (
                  <span className="text-xs text-muted-foreground">Current</span>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      if (dirty && !window.confirm("You have unsaved changes; restoring discards them. Continue?")) return;
                      if (!window.confirm(`Restore version ${r.version}?`)) return;
                      const res = await restoreDeptConfigAction(dept, r.version);
                      if (!res.ok) return toast.error(res.error, { duration: 10000 });
                      toast.success(`Version ${r.version} restored`);
                      router.refresh();
                    }}
                  >
                    <RotateCcwIcon /> Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Checklists per type, templates, automations, requests
// ---------------------------------------------------------------------------

function LinesEditor({ lines, onChange, label }: { lines: ChecklistLine[]; onChange: (l: ChecklistLine[]) => void; label: string }) {
  const [text, setText] = React.useState("");
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Input value={l.text} aria-label={`${label} line ${i + 1}`} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="h-8 flex-1" />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Switch checked={l.verify} onCheckedChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, verify: v } : x)))} /> Lead verifies
            </label>
            <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove line ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange([...lines, { text: text.trim(), verify: false }]);
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="New checklist line" aria-label={`New ${label} line`} className="h-8 w-72" />
        <Button size="sm" variant="outline" type="submit" disabled={!text.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
    </div>
  );
}

function ChecklistsEditor({ config: c, onChange }: { config: DeptConfig; onChange: (types: DeptConfig["types"]) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Checklists</CardTitle>
        <CardDescription>
          Lines copied onto each new {c.names.task.toLowerCase()} of a type. Every line must be ticked before it is done; lines a lead verifies need a lead or the reviewer too.
          {!c.features.checklists && " Switch on Checklists in General, Features to use them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.types
          .filter((t) => t.active)
          .map((t) => (
            <section key={t.key} className="space-y-1.5 rounded-lg border p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.label}
              </h3>
              <LinesEditor label={t.label} lines={t.checklist} onChange={(lines) => onChange(c.types.map((x) => (x.key === t.key ? { ...x, checklist: lines } : x)))} />
            </section>
          ))}
      </CardContent>
    </Card>
  );
}

function TemplatesEditor({ config: c, onChange }: { config: DeptConfig; onChange: (t: DeptTemplate[]) => void }) {
  const [label, setLabel] = React.useState("");
  const patch = (i: number, p: Partial<DeptTemplate>) => onChange(c.templates.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{c.names.task} templates</CardTitle>
        <CardDescription>
          Ready-made {c.names.tasks.toLowerCase()} to start from (in the New {c.names.task.toLowerCase()} form): title, details, type, priority, estimate, checklist and subtasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {c.templates.map((t, i) => (
          <div key={t.key} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Template name" value={t.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-8 w-56 font-medium" />
              <Select value={t.type} onValueChange={(v) => patch(i, { type: v })}>
                <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {c.types.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={t.priority} onValueChange={(v) => patch(i, { priority: v })}>
                <SelectTrigger size="sm" className="h-8 w-32 text-xs" aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {c.priorities.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" min={0} step="0.5" aria-label="Estimate (hours)" placeholder="Estimate h" value={t.estimate ?? ""} onChange={(e) => patch(i, { estimate: e.target.value ? Number(e.target.value) : null })} className="h-8 w-28 text-xs" />
              <Button size="icon-xs" variant="ghost" className="ml-auto text-destructive" aria-label={`Remove ${t.label}`} onClick={() => onChange(c.templates.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
            <Input aria-label="Title" placeholder="Title of new tasks (optional)" value={t.title} onChange={(e) => patch(i, { title: e.target.value })} className="h-8" />
            <Textarea aria-label="Details" rows={2} placeholder="Details" value={t.description} onChange={(e) => patch(i, { description: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Subtasks (one per line)</Label>
                <Textarea rows={3} value={t.subtasks.join("\n")} onChange={(e) => patch(i, { subtasks: e.target.value.split("\n") })} onBlur={() => patch(i, { subtasks: t.subtasks.map((x) => x.trim()).filter(Boolean) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Checklist</Label>
                <LinesEditor label={t.label} lines={t.checklist} onChange={(lines) => patch(i, { checklist: lines })} />
              </div>
            </div>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const l = label.trim();
            if (!l) return;
            const type = c.types.find((x) => x.active)!.key;
            onChange([...c.templates, { key: makeKey(l, c.templates.map((x) => x.key)), label: l, title: "", description: "", type, priority: c.priorities.find((p) => p.key === "normal")?.key ?? c.priorities[0]!.key, estimate: null, checklist: [], subtasks: [] }]);
            setLabel("");
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New template name" aria-label="New template name" className="h-8 w-56" />
          <Button size="sm" variant="outline" type="submit" disabled={!label.trim()}>
            <PlusIcon /> Add template
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AutomationsEditor({ config: c, people, onChange }: { config: DeptConfig; people: { id: string; name: string }[]; onChange: (a: DeptAutomation[]) => void }) {
  const [label, setLabel] = React.useState("");
  const patch = (i: number, p: Partial<DeptAutomation>) => onChange(c.automations.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valueOptions = (kind: string | null) =>
    kind === "status" ? c.statuses.map((s) => ({ value: s.key, label: s.label })) : kind === "priority" ? c.priorities.map((s) => ({ value: s.key, label: s.label })) : kind === "person" ? people.map((p) => ({ value: p.id, label: p.name })) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Automations</CardTitle>
        <CardDescription>Simple when-then rules. They run once for each event, and changes they make do not set off other automations. Each run is in the history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {c.automations.map((a, i) => (
          <div key={a.key} className={cn("space-y-2 rounded-lg border p-3", !a.active && "bg-muted/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Rule name" value={a.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-8 w-64 font-medium" />
              <label className="ml-auto flex items-center gap-1 text-xs">
                <Switch checked={a.active} onCheckedChange={(v) => patch(i, { active: v })} /> On
              </label>
              <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove ${a.label}`} onClick={() => onChange(c.automations.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">When</span>
              <Select value={a.when} onValueChange={(v) => patch(i, { when: v as DeptAutomation["when"], status: v === "status" ? (a.status ?? c.statuses[0]!.key) : null })}>
                <SelectTrigger size="sm" className="h-8 w-56 text-xs" aria-label="When">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {a.when === "status" && (
                <Select value={a.status ?? ""} onValueChange={(v) => patch(i, { status: v })}>
                  <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Status">
                    <SelectValue placeholder="Choose status" />
                  </SelectTrigger>
                  <SelectContent>
                    {c.statuses.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-muted-foreground">for</span>
              <Select value={a.type ?? "any"} onValueChange={(v) => patch(i, { type: v === "any" ? null : v })}>
                <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">any type</SelectItem>
                  {c.types.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ul className="space-y-1.5 pl-4">
              {a.actions.map((act, k) => {
                const def = AUTOMATION_ACTIONS.find((x) => x.key === act.do)!;
                return (
                  <li key={k} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">then</span>
                    <Select value={act.do} onValueChange={(v) => patch(i, { actions: a.actions.map((x, j) => (j === k ? { do: v as typeof act.do, value: null } : x)) })}>
                      <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="Action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTOMATION_ACTIONS.map((x) => (
                          <SelectItem key={x.key} value={x.key}>
                            {x.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {def.value === "number" && (
                      <Input type="number" min={0} max={100} aria-label="Value" value={act.value ?? ""} onChange={(e) => patch(i, { actions: a.actions.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })} className="h-8 w-24 text-xs" />
                    )}
                    {(def.value === "status" || def.value === "priority" || def.value === "person") && (
                      <Select value={act.value ?? ""} onValueChange={(v) => patch(i, { actions: a.actions.map((x, j) => (j === k ? { ...x, value: v } : x)) })}>
                        <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Value">
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          {valueOptions(def.value).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="icon-xs" variant="ghost" aria-label="Remove action" onClick={() => patch(i, { actions: a.actions.filter((_, j) => j !== k) })}>
                      <XIcon />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button size="xs" variant="ghost" onClick={() => patch(i, { actions: [...a.actions, { do: "notify_reporter", value: null }] })}>
              <PlusIcon /> Add action
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const l = label.trim();
            if (!l) return;
            const done = c.statuses.find((s) => s.category === "done")?.key ?? c.statuses[0]!.key;
            onChange([...c.automations, { key: makeKey(l, c.automations.map((x) => x.key)), label: l, when: "status", status: done, type: null, actions: [{ do: "notify_reporter", value: null }], active: true }]);
            setLabel("");
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New rule, e.g. Tell the creator when done" aria-label="New rule name" className="h-8 w-80" />
          <Button size="sm" variant="outline" type="submit" disabled={!label.trim()}>
            <PlusIcon /> Add rule
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function IntakeEditor({ config: c, onChange }: { config: DeptConfig; onChange: (i: DeptConfig["intake"], requests: boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Requests from other departments</CardTitle>
        <CardDescription>
          When on, anyone can ask this department for something on the Requests page. Requests land here waiting for a head or lead to accept (and assign) or decline them; the person who asked is
          kept informed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={c.features.requests} onCheckedChange={(v) => onChange(c.intake, v)} /> Take requests
        </label>
        <div className="space-y-1.5">
          <Label>Types people may ask for (none ticked: all)</Label>
          <div className="flex flex-wrap gap-1.5">
            {c.types
              .filter((t) => t.active)
              .map((t) => {
                const on = c.intake.types.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...c.intake, types: on ? c.intake.types.filter((x) => x !== t.key) : [...c.intake.types, t.key] }, c.features.requests)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {t.label}
                  </button>
                );
              })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intake-intro">Note on the request form</Label>
          <Textarea id="intake-intro" rows={2} value={c.intake.intro} onChange={(e) => onChange({ ...c.intake, intro: e.target.value }, c.features.requests)} placeholder="What to include in a request" />
        </div>
      </CardContent>
    </Card>
  );
}
