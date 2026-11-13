"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decideUndoAction, requestUndoAction, saveIoPermissionsAction, saveUndoConfigAction } from "@/app/actions/import-undo";

type State = { can: boolean; why: string | null; until: string; hours: number; changes: number; pendingId: string | null };
type Skip = { table: string; op: string; key: string; why: string };
type Result = { reversed: number; skipped: Skip[]; tables: Record<string, number> } | null;
export type UndoReq = { id: string; jobId: string; requesterName: string; reason: string | null; status: string; deciderName: string | null; decidedAt: string | null; result: Result; createdAt: string; template: string | null; fileName: string | null; canDecide: boolean; title: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// The Undo cell in Job history: ask within the window, or see why not.
export function UndoCell({ jobId, state, undone, title }: { jobId: string; state: State | null; undone: string | null; title: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (undone) return <Badge variant="outline" className="text-[10px]" data-undone>Undone</Badge>;
  if (!state) return null;
  if (state.pendingId) return <Badge variant="secondary" className="text-[10px]" data-undo-pending>Undo waiting</Badge>;
  if (!state.can) return <span className="text-[10px] text-muted-foreground" title={state.why ?? ""}>—</span>;
  const submit = async () => {
    setBusy(true);
    const r = await requestUndoAction(jobId, reason);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setOpen(false);
    const d = r.data;
    if (d?.status === "done") toast.success(`Undone: ${d.result?.reversed ?? 0} changes put back${d.result?.skipped.length ? `, ${d.result.skipped.length} skipped` : ""}`);
    else toast.success("Undo requested", { description: "Admin or someone who may run this import approves it." });
    router.refresh();
  };
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)} title={`Until ${when(state.until)}`} data-undo-job={jobId}>
        <Undo2Icon /> Undo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Undo this import?</DialogTitle>
            <DialogDescription>
              {title}: {state.changes} recorded changes. Everything the import created, changed or removed is put back, in one go. Rows people edited since are skipped and listed. You can ask until {when(state.until)}.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (optional): wrong file, wrong columns…" aria-label="Why undo" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />} Ask to undo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Undo requests: approve or decline, and what each undo put back or skipped.
export function UndoRequests({ rows }: { rows: UndoReq[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const decide = async (id: string, approve: boolean) => {
    const note = approve ? undefined : (window.prompt("Why not? (optional)") ?? undefined);
    setBusy(id);
    const r = await decideUndoAction(id, approve, note);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const res = r.data?.result;
    toast.success(approve ? `Undone: ${res?.reversed ?? 0} changes put back${res?.skipped.length ? `, ${res.skipped.length} skipped` : ""}` : "Declined");
    router.refresh();
  };
  if (!rows.length) return null;
  return (
    <Card data-undo-requests>
      <CardHeader>
        <CardTitle>Undo requests</CardTitle>
        <CardDescription>Approving puts back what the import changed, in one transaction. Rows changed since are skipped and listed; nothing anyone edited is overwritten.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm" data-undo-request={r.status}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.title}</span>
              {r.fileName && <span className="truncate text-xs text-muted-foreground">{r.fileName}</span>}
              <Badge variant={r.status === "pending" ? "secondary" : "outline"} className="ml-auto text-[10px] capitalize">{r.status === "done" ? "Undone" : r.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.requesterName} asked {when(r.createdAt)}{r.reason ? `: “${r.reason}”` : ""}
              {r.deciderName && r.decidedAt ? ` · ${r.status === "declined" ? "declined" : "approved"} by ${r.deciderName} ${when(r.decidedAt)}` : ""}
            </p>
            {r.result && (
              <div className="mt-2 text-xs">
                <p>
                  {r.result.reversed} changes put back
                  {Object.keys(r.result.tables).length > 0 && <span className="text-muted-foreground"> ({Object.entries(r.result.tables).map(([t, n]) => `${t.replace(/_/g, " ")} ${n}`).join(", ")})</span>}
                  {r.result.skipped.length > 0 && `, ${r.result.skipped.length} skipped`}
                </p>
                {r.result.skipped.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">Skipped rows</summary>
                    <ul className="mt-1 space-y-0.5">
                      {r.result.skipped.slice(0, 50).map((s, i) => (
                        <li key={i}><span className="font-mono text-[10px]">{s.table} {s.key}</span> — {s.why}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {r.canDecide && (
              <div className="mt-2 flex gap-2">
                <Button size="xs" onClick={() => decide(r.id, true)} disabled={busy === r.id}>{busy === r.id ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve and undo</Button>
                <Button size="xs" variant="outline" onClick={() => decide(r.id, false)} disabled={busy === r.id}><XIcon /> Decline</Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type Cfg = { hours: number; kinds: Record<string, number>; approval: "role" | "admin" | "none" };
type Perms = Record<"members" | "teams" | "departments", { import: boolean; export: boolean }>;

// Admin: the undo window (per import kind), who approves, and the import / export switches.
export function IoRules({ cfg, perms, templates, entities }: { cfg: Cfg; perms: Perms; templates: { key: string; title: string }[]; entities: { key: keyof Perms; label: string; hint: string }[] }) {
  const router = useRouter();
  const [hours, setHours] = React.useState(String(cfg.hours));
  const [kinds, setKinds] = React.useState<Record<string, string>>(Object.fromEntries(Object.entries(cfg.kinds).map(([k, v]) => [k, String(v)])));
  const [approval, setApproval] = React.useState(cfg.approval);
  const [p, setP] = React.useState(perms);
  const [busy, setBusy] = React.useState(false);
  const saveUndo = async () => {
    setBusy(true);
    const r = await saveUndoConfigAction({ hours: Number(hours), kinds: Object.fromEntries(Object.entries(kinds).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])), approval });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.data?.hours ? `Imports can be undone for ${r.data?.hours} hours` : "Undo is off");
    router.refresh();
  };
  const flip = async (e: keyof Perms, dir: "import" | "export", on: boolean) => {
    const next = { ...p, [e]: { ...p[e], [dir]: on } };
    setP(next);
    const r = await saveIoPermissionsAction({ [e]: next[e] });
    if (!r.ok) {
      setP(p);
      return void toast.error(r.error);
    }
    toast.success(`${entities.find((x) => x.key === e)?.label} ${dir} ${on ? "on" : "off"}`);
  };
  return (
    <Card data-io-rules>
      <CardHeader>
        <CardTitle>Import and export rules</CardTitle>
        <CardDescription>Admin only. How long an import can be undone, who approves it, and what may be imported or exported.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">Undo window</h3>
          <label className="flex items-center gap-2 text-xs">
            Every import, hours
            <Input type="number" min={0} max={2160} value={hours} onChange={(e) => setHours(e.target.value)} className="h-7 w-20 text-xs" aria-label="Undo window in hours" />
            <span className="text-muted-foreground">0 turns undo off</span>
          </label>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Per import kind</summary>
            <div className="mt-2 grid gap-1">
              {templates.map((t) => (
                <label key={t.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{t.title}</span>
                  <Input type="number" min={0} placeholder={hours} value={kinds[t.key] ?? ""} onChange={(e) => setKinds({ ...kinds, [t.key]: e.target.value })} className="h-7 w-20 text-xs" aria-label={`Undo hours for ${t.title}`} />
                </label>
              ))}
            </div>
          </details>
          <fieldset className="space-y-1 text-xs">
            <legend className="mb-1 text-muted-foreground">Who approves an undo</legend>
            {([
              ["role", "Admin, or someone else who may run that import"],
              ["admin", "Admin only"],
              ["none", "No approval: the person undoes it straight away"],
            ] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="undo-approval" checked={approval === k} onChange={() => setApproval(k)} /> {l}
              </label>
            ))}
          </fieldset>
          <Button size="sm" onClick={saveUndo} disabled={busy} data-save-undo>{busy && <Loader2Icon className="animate-spin" />} Save undo rules</Button>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">Allow or deny</h3>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left font-medium" /><th className="w-16 font-medium">Import</th><th className="w-16 font-medium">Export</th></tr></thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.key} className="border-t">
                  <td className="py-2 pr-2"><span className="font-medium">{e.label}</span><span className="block text-[11px] text-muted-foreground">{e.hint}</span></td>
                  <td className="text-center"><Switch aria-label={`${e.label} import`} checked={p[e.key].import} onCheckedChange={(v) => flip(e.key, "import", v)} /></td>
                  <td className="text-center"><Switch aria-label={`${e.label} export`} checked={p[e.key].export} onCheckedChange={(v) => flip(e.key, "export", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">Checked on the server: the Users and access import refuses rows that change a turned-off kind, and the people exports stop.</p>
        </section>
      </CardContent>
    </Card>
  );
}
