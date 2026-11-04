"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CopyIcon, DownloadIcon, FileUpIcon, Loader2Icon, PlusIcon, SaveIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { duplicateRoutineAction, importRunRowsAction, saveRoutineAction } from "@/app/actions/assistant";
import { beginBatch } from "@/components/app/routines-client";
import type { Routine, RoutineStep } from "@/server/routines";
import { DeleteRoutine } from "../routines-page";
import { listApprovedInBatch } from "./batch-ids";

type Field = { index: number; column: string; example: string };
type Preview = { rows: number; errors: string[]; preview: Record<string, string>[] };

const ACTIONS: { value: RoutineStep["do"]; label: string }[] = [
  { value: "click", label: "Press" },
  { value: "fill", label: "Type in" },
  { value: "select", label: "Choose in" },
  { value: "check", label: "Tick" },
  { value: "note", label: "Note" },
];
const askable = (s: RoutineStep) => s.do === "fill" || s.do === "select";

export function RoutineEditor({ routine, sharing, imports, maxRows, maxSteps, approval }: { routine: Routine & { fields: Field[] }; sharing: boolean; imports: boolean; maxRows: number; maxSteps: number; approval: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(routine.name);
  const [description, setDescription] = React.useState(routine.description ?? "");
  const [shared, setShared] = React.useState<string>(routine.shared);
  const [steps, setSteps] = React.useState(routine.steps);
  const [busy, setBusy] = React.useState(false);
  const mine = routine.mine;
  const dirty = name !== routine.name || description !== (routine.description ?? "") || shared !== routine.shared || JSON.stringify(steps) !== JSON.stringify(routine.steps);
  const set = (i: number, patch: Partial<RoutineStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => {
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s!);
    setSteps(next);
  };
  const save = async () => {
    setBusy(true);
    const r = await saveRoutineAction({ id: routine.id, name, description, steps, shared });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Routine saved");
    router.refresh();
  };
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: "myseed-routine", name, description, steps }, null, 2)], { type: "application/json" }));
    a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "routine"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-4" data-routine-editor>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link href="/routines">
            <ArrowLeftIcon /> Routines
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportJson}>
            <DownloadIcon /> Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const r = await duplicateRoutineAction(routine.id);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Copy made");
              router.push(`/routines/${r.data}`);
            }}
          >
            <CopyIcon /> {mine ? "Duplicate" : "Make my own copy"}
          </Button>
          {mine && <DeleteRoutine routine={routine} onDone={() => router.push("/routines")} />}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rt-name">Name</Label>
            <Input id="rt-name" disabled={!mine} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {sharing && (
            <div className="space-y-1">
              <Label htmlFor="rt-share">Who can use it</Label>
              <select id="rt-share" disabled={!mine} className="h-9 w-full rounded-md border bg-background px-2" value={shared} onChange={(e) => setShared(e.target.value)}>
                <option value="none">Only me</option>
                <option value="team">People in my departments</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="rt-desc">What it does</Label>
            <Input id="rt-desc" disabled={!mine} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Steps ({steps.length} of at most {maxSteps})
          </CardTitle>
          <CardDescription>Tick Ask each time for a field whose value changes. Those fields become the columns of the form template below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2" data-step={i}>
              <span className="w-6 text-xs text-muted-foreground tabular">{i + 1}</span>
              <select aria-label={`Step ${i + 1} action`} disabled={!mine} className="h-8 rounded-md border bg-background px-1.5 text-xs" value={s.do} onChange={(e) => set(i, { do: e.target.value as RoutineStep["do"] })}>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {s.do === "note" ? (
                <Input aria-label={`Step ${i + 1} note`} disabled={!mine} className="h-8 min-w-48 flex-1" value={s.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} placeholder="A note for the person running it" />
              ) : s.do === "click" ? (
                <Input aria-label={`Step ${i + 1} button`} disabled={!mine} className="h-8 min-w-48 flex-1" value={s.name ?? ""} onChange={(e) => set(i, { name: e.target.value })} placeholder="The button or link's name" />
              ) : (
                <>
                  <Input aria-label={`Step ${i + 1} field`} disabled={!mine} className="h-8 w-44" value={s.label ?? ""} onChange={(e) => set(i, { label: e.target.value })} placeholder="The field's name" />
                  <Input aria-label={`Step ${i + 1} value`} disabled={!mine} className="h-8 min-w-32 flex-1" value={s.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} placeholder={s.do === "check" ? "true or false" : "Value"} />
                </>
              )}
              {askable(s) && (
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox disabled={!mine} checked={!!s.ask} onCheckedChange={(v) => set(i, { ask: v === true })} aria-label={`Ask for step ${i + 1} each time`} /> Ask each time
                </label>
              )}
              <Input aria-label={`Step ${i + 1} page`} disabled={!mine} className="h-8 w-40 font-mono text-[11px]" value={s.path} onChange={(e) => set(i, { path: e.target.value })} />
              {mine && (
                <span className="flex">
                  <Button size="icon-xs" variant="ghost" disabled={i === 0} aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" disabled={steps.length === 1} aria-label={`Remove step ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                </span>
              )}
            </div>
          ))}
          {mine && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={steps.length >= maxSteps} onClick={() => setSteps([...steps, { path: steps[steps.length - 1]?.path ?? "/dashboard", do: "note", note: "" }])}>
                <PlusIcon /> Add a step
              </Button>
              <Button size="sm" disabled={busy || !dirty || !name.trim()} onClick={save}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {imports && <FillFromFile routine={routine} dirty={dirty} maxRows={maxRows} approval={approval} />}
    </div>
  );
}

// Fill the routine's form from a file: download the set template, fill one row per form, check, then run them.
function FillFromFile({ routine, dirty, maxRows, approval }: { routine: Routine & { fields: Field[] }; dirty: boolean; maxRows: number; approval: string }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const send = async (dry: boolean) => {
    const form = new FormData();
    form.set("file", file!);
    setBusy(true);
    const r = await importRunRowsAction(routine.id, form, dry);
    setBusy(false);
    if (!r.ok) {
      setPreview(null);
      return void toast.error(r.error);
    }
    if (dry) return setPreview(r.data!);
    setPreview(null);
    setFile(null);
    const d = r.data!;
    if (d.status === "pending") {
      toast.success(`${d.rows} runs sent for approval`);
      router.push("/routines");
    } else if (d.batchId) {
      toast.success(`${d.rows} runs ready. Starting.`);
      void beginBatch(await listApprovedInBatch(d.batchId));
    }
  };
  return (
    <Card data-fill-from-file>
      <CardHeader>
        <CardTitle className="text-base">Fill the form from a file</CardTitle>
        <CardDescription>
          Each row of the template fills this routine&apos;s form once. At most {maxRows} rows at a time. {approval === "self" ? "" : "The runs go for approval first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dirty ? (
          <p className="text-muted-foreground">Save your changes first.</p>
        ) : !routine.fields.length ? (
          <p className="text-muted-foreground">This routine asks for nothing. Tick Ask each time on a field above and save.</p>
        ) : (
          <>
            <p>
              Template columns: <span className="font-medium">{routine.fields.map((f) => f.column).join(", ")}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/routines/${routine.id}/template`}>
                  <DownloadIcon /> Download the template
                </a>
              </Button>
              <Input aria-label="Filled template" type="file" accept=".csv,.xlsx" className="h-9 w-64" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPreview(null))} />
              <Button size="sm" disabled={!file || busy} onClick={() => void send(true)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Check the file
              </Button>
            </div>
            {preview && (
              <div className="space-y-2 rounded-lg border p-3" data-fill-preview>
                <p className="font-medium">
                  {preview.rows} {preview.rows === 1 ? "row is" : "rows are"} ready{preview.errors.length ? `, ${preview.errors.length} left out` : ""}
                </p>
                {preview.errors.slice(0, 10).map((e) => (
                  <p key={e} className="text-xs text-[var(--st-blocked-fg)]">
                    {e}
                  </p>
                ))}
                {preview.preview.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          {Object.keys(preview.preview[0]!).map((k) => (
                            <th key={k} className="p-1 font-medium">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i} className="border-t">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="p-1">
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview.rows > 0 && (
                  <Button size="sm" disabled={busy} onClick={() => void send(false)}>
                    {approval === "self" ? `Run ${preview.rows} now` : `Send ${preview.rows} for approval`}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
