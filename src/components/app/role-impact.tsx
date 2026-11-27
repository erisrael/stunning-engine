"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, ClockIcon, HourglassIcon, KeyRoundIcon, ListChecksIcon, PlayIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { applyRoleChangeAction, cancelRoleChangeAction, declineResumeAction, reportFinishedAction, requestFinishFirstAction, resumeWorkAction } from "@/app/actions/role-change";
import type { MyRoleChanges, RoleImpact } from "@/server/role-change";
import { DEPARTMENT_LABELS, STAGE_LABELS, type Department, type Stage } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

const statusWords = (s: string) => s.replace(/_/g, " ");

// A confirmation step for every action on these pages.
function Confirm({ open, onOpenChange, title, children, action, onConfirm, busy, disabled, destructive }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: React.ReactNode; action: string; onConfirm: () => void; busy?: boolean; disabled?: boolean; destructive?: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || disabled}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "warn" | "ok" }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${tone === "warn" && value ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-xl font-semibold tabular">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function RoleImpactView({ impact, back = "/admin?tab=people" }: { impact: RoleImpact; back?: string }) {
  const router = useRouter();
  const { person, removal } = impact;
  const nothing = !removal.roles.length && !removal.leads.length;
  const teams = Object.keys(impact.candidates);
  const needs = new Set<string>([
    ...impact.stageWork.map((w) => w.stage as string),
    ...impact.tasks.map((t) => `dept.${t.dept}`),
    ...impact.leadQueue.filter((q) => q.orphaned).map((q) => q.stage as string),
  ]);
  const [forward, setForward] = React.useState<Record<string, string | null>>(() => Object.fromEntries(teams.map((k) => [k, impact.candidates[k]?.[0]?.id ?? null])));
  const [note, setNote] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [open, setOpen] = React.useState<null | "finish" | "force" | "cancel">(null);
  const [busy, setBusy] = React.useState(false);
  const teamName = (k: string) => (k.startsWith("dept.") ? DEPARTMENT_LABELS[k.slice(5) as Department] ?? k.slice(5) : STAGE_LABELS[k as Stage]);
  const nameOf = (k: string) => impact.candidates[k]?.find((c) => c.id === forward[k])?.name ?? "nobody";
  const missing = [...needs].filter((k) => !forward[k]);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, then?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Could not do that.");
    toast.success(ok);
    setOpen(null);
    if (then) router.push(then);
    else router.refresh();
  };

  if (nothing)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {person.name} no longer holds these roles. <Link className="underline" href={back}>Back to People</Link>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4" data-role-impact>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Taking from {person.name}:
            {impact.labels.roles.map((r) => <Badge key={r} variant="destructive">{r}</Badge>)}
            {impact.labels.leads.filter((l) => !impact.labels.roles.some((r) => l.startsWith(r))).map((l) => <Badge key={l} variant="destructive">{l}</Badge>)}
          </CardTitle>
          <CardDescription>{impact.stillHolds.length ? `They keep: ${impact.stillHolds.join(", ")}.` : "They will have no other role."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<ListChecksIcon className="size-5" />} label="Production work they hold" value={impact.stageWork.length} tone="warn" />
          <Stat icon={<ClockIcon className="size-5" />} label="Timers running now" value={impact.stageWork.filter((w) => w.running).length} tone="warn" />
          <Stat icon={<UsersIcon className="size-5" />} label="Team queue left without a lead" value={impact.leadQueue.filter((q) => q.orphaned).length} tone="warn" />
          <Stat icon={<KeyRoundIcon className="size-5" />} label="Rights and pages they lose" value={impact.permsLost.length} />
        </CardContent>
      </Card>

      {impact.pending && (
        <Card className="border-amber-500/40" data-role-pending>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><HourglassIcon className="size-4" /> Waiting for {person.name} to finish</CardTitle>
            <CardDescription>
              Asked {fmtDateTime(impact.pending.requestedAt)}{impact.pending.by ? ` by ${impact.pending.by}` : ""}. {impact.blocking ? `${impact.blocking} open ${impact.blocking === 1 ? "piece" : "pieces"} of work left.` : "Everything is finished: you can confirm the change now."}
              {impact.pending.note ? ` Note: ${impact.pending.note}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => setOpen("cancel")}>Call off the change</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work they still hold</CardTitle>
            <CardDescription>Parts assigned to them in the teams they leave, including what has not reached their stage yet.</CardDescription>
          </CardHeader>
          <CardContent>
            {impact.stageWork.length || impact.tasks.length ? (
              <ul className="divide-y text-sm">
                {impact.stageWork.map((w) => (
                  <li key={`${w.itemId}:${w.stage}`} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link href={`/items/${w.itemId}`} className="font-mono text-xs underline-offset-2 hover:underline">{w.code}</Link>
                    <span className="min-w-0 flex-1 truncate">{w.title}</span>
                    <Badge variant="secondary">{STAGE_LABELS[w.stage]}</Badge>
                    <Badge variant={w.running ? "destructive" : "outline"}>{w.running ? "timer running" : w.current ? statusWords(w.status) : "upcoming"}</Badge>
                  </li>
                ))}
                {impact.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="font-mono text-xs">{t.code}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <Badge variant="secondary">{DEPARTMENT_LABELS[t.dept as Department] ?? t.dept}</Badge>
                    <Badge variant="outline">{statusWords(t.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2Icon className="size-4 text-emerald-600" /> No open work. Nothing needs forwarding.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Their team</CardTitle>
            <CardDescription>What waits for a team lead in the teams they lead.</CardDescription>
          </CardHeader>
          <CardContent>
            {impact.leadQueue.length ? (
              <>
                {impact.leadQueue.some((q) => q.orphaned) && (
                  <p className="mb-2 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-sm"><AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> They are the only lead: name a new team lead below, or the queue has nobody to approve it.</p>
                )}
                <ul className="divide-y text-sm">
                  {impact.leadQueue.slice(0, 50).map((q) => (
                    <li key={`${q.itemId}:${q.stage}`} className="flex flex-wrap items-center gap-2 py-1.5">
                      <Link href={`/items/${q.itemId}`} className="font-mono text-xs hover:underline">{q.code}</Link>
                      <span className="min-w-0 flex-1 truncate">{q.title}</span>
                      <Badge variant="outline">{statusWords(q.status)}</Badge>
                    </li>
                  ))}
                </ul>
                {impact.leadQueue.length > 50 && <p className="mt-1 text-xs text-muted-foreground">and {impact.leadQueue.length - 50} more</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{removal.leads.length ? "Nothing waits for the team lead." : "They lead no team that changes."}</p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Rights and pages they lose</CardTitle>
            <CardDescription>Their sidebar and what they may do change at once.</CardDescription>
          </CardHeader>
          <CardContent>
            {impact.permsLost.length ? (
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {impact.permsLost.map((p) => (
                  <div key={p.key} className="flex gap-2"><span className="shrink-0 text-xs text-muted-foreground">{p.group}</span><span>{p.label}</span></div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Their other roles give the same rights.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">If you force the change now, who takes the work</CardTitle>
            <CardDescription>Open work goes to the person chosen for each team (team leads first). If {person.name} gets the role back, everything nobody has touched since comes back to them.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {teams.map((k) => (
              <div key={k} className="space-y-1">
                <Label>{teamName(k)}{needs.has(k) ? " (needed)" : ""}</Label>
                <Select value={forward[k] ?? "none"} onValueChange={(v) => setForward((f) => ({ ...f, [k]: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nobody</SelectItem>
                    {(impact.candidates[k] ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.lead ? " (lead)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!impact.candidates[k]?.length && <p className="text-xs text-amber-600">Nobody else holds this role. Give someone the role first.</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What to do</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">Ask them to finish first (recommended)</p>
            <p className="text-sm text-muted-foreground">Nothing changes yet. {person.name} is told to finish their open work; they tell you when done and you confirm here.</p>
            <Textarea placeholder="A note for them (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <Button disabled={busy || !impact.blocking} onClick={() => setOpen("finish")} data-role-finish>
              <HourglassIcon /> Ask to finish first
            </Button>
            {!impact.blocking && <p className="text-xs text-muted-foreground">There is no open work to finish.</p>}
          </div>
          <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
            <p className="font-medium">{impact.blocking ? "Force the change now" : "Confirm the change"}</p>
            <p className="text-sm text-muted-foreground">{impact.blocking ? "Running timers stop and open work is forwarded to the people chosen above." : "The roles are taken now."}</p>
            <Button variant="destructive" disabled={busy || missing.length > 0} onClick={() => setOpen("force")} data-role-force>
              <ArrowRightIcon /> {impact.blocking ? "Force and forward the work" : "Take the roles"}
            </Button>
            {missing.length > 0 && <p className="text-xs text-destructive">Choose who takes the work for {missing.map(teamName).join(", ")}.</p>}
          </div>
        </CardContent>
      </Card>

      <Confirm
        open={open === "finish"} onOpenChange={(v) => setOpen(v ? "finish" : null)} busy={busy}
        title={`Ask ${person.name} to finish first?`} action="Send the request"
        onConfirm={() => run(() => requestFinishFirstAction(person.id, removal, note), `${person.name} was asked to finish first`)}
      >
        <p>{person.name} gets a notice listing their {impact.blocking} open {impact.blocking === 1 ? "piece" : "pieces"} of work. Their roles do not change until you confirm here.</p>
      </Confirm>
      <Confirm
        open={open === "force"} onOpenChange={(v) => { setOpen(v ? "force" : null); if (!v) setConfirm(""); }} busy={busy} destructive
        disabled={confirm.trim().toLowerCase() !== person.name.trim().toLowerCase()}
        title={impact.blocking ? `Force the change for ${person.name}?` : `Take the roles from ${person.name}?`} action={impact.blocking ? "Force and forward" : "Take the roles"}
        onConfirm={() => run(() => applyRoleChangeAction(person.id, removal, Object.fromEntries([...needs].map((k) => [k, forward[k] ?? null])), confirm), "Role changed", back)}
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>Takes {[...impact.labels.roles, ...impact.labels.leads].join(", ")}.</li>
          {[...needs].map((k) => <li key={k}>{teamName(k)}: their work goes to {nameOf(k)}.</li>)}
          {impact.stageWork.some((w) => w.running) && <li>Their running timers stop.</li>}
          <li>Their sidebar and rights change at once.</li>
        </ul>
        <div className="space-y-1 pt-1">
          <Label htmlFor="rc-confirm">Type {person.name} to confirm</Label>
          <Input id="rc-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" data-role-confirm />
        </div>
      </Confirm>
      <Confirm
        open={open === "cancel"} onOpenChange={(v) => setOpen(v ? "cancel" : null)} busy={busy}
        title="Call off the role change?" action="Call it off"
        onConfirm={() => impact.pending && run(() => cancelRoleChangeAction(impact.pending!.id), "The change was called off", back)}
      >
        <p>{person.name} keeps their roles and is told the change is off.</p>
      </Confirm>
    </div>
  );
}

export function MyRoleChangesView({ data, tz }: { data: MyRoleChanges; tz: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<null | { kind: "done" | "resume" | "decline"; id: string }>(null);
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: (d: unknown) => string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Could not do that.");
    toast.success(ok(r.data));
    setOpen(null);
    router.refresh();
  };
  const restored = data.restored.find((r) => r.id === open?.id);
  if (!data.pending.length && !data.restored.length)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing waits for you. {data.history.length ? "Earlier changes are listed below." : ""}</CardContent>
        {data.history.length > 0 && <History data={data} tz={tz} />}
      </Card>
    );
  return (
    <div className="space-y-4">
      {data.pending.map((p) => {
        const left = p.work.length + p.tasks.length;
        return (
          <Card key={p.id} className="border-amber-500/40" data-my-role-pending>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><HourglassIcon className="size-4" /> Please finish your work: {p.what} is changing</CardTitle>
              <CardDescription>Asked {fmtDateTime(p.at, tz)}{p.by ? ` by ${p.by}` : ""}.{p.note ? ` ${p.note}` : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {left ? (
                <ul className="divide-y text-sm">
                  {p.work.map((w) => (
                    <li key={`${w.itemId}:${w.stage}`} className="flex flex-wrap items-center gap-2 py-1.5">
                      <Link href={`/items/${w.itemId}`} className="font-mono text-xs hover:underline">{w.code}</Link>
                      <span className="min-w-0 flex-1 truncate">{w.title}</span>
                      <Badge variant="secondary">{STAGE_LABELS[w.stage]}</Badge>
                      <Badge variant="outline">{w.current ? statusWords(w.status) : "upcoming"}</Badge>
                    </li>
                  ))}
                  {p.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="font-mono text-xs">{t.code}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <Badge variant="outline">{statusWords(t.status)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm"><CheckCircle2Icon className="size-4 text-emerald-600" /> All finished.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/my-work">Open My work</Link></Button>
                <Button size="sm" disabled={busy || left > 0} onClick={() => setOpen({ kind: "done", id: p.id })}><CheckCircle2Icon /> I have finished</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {data.restored.map((r) => {
        const clean = r.entries.filter((e) => e.clean);
        return (
          <Card key={r.id} className="border-emerald-500/40" data-my-role-restored>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><PlayIcon className="size-4" /> {r.what} is back: continue where you stopped</CardTitle>
              <CardDescription>Restored {fmtDateTime(r.at, tz)}. Work nobody touched while you were away comes back to you as it was; the rest stays with whoever took it further.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.entries.length ? (
                <ul className="divide-y text-sm">
                  {r.entries.map((e) => (
                    <li key={e.key} className="flex flex-wrap items-center gap-2 py-1.5">
                      {e.link ? <Link href={e.link} className="min-w-0 flex-1 truncate hover:underline">{e.label}</Link> : <span className="min-w-0 flex-1 truncate">{e.label}</span>}
                      <span className="text-xs text-muted-foreground">{e.detail}</span>
                      <Badge variant={e.clean ? "secondary" : "outline"}>{e.clean ? "comes back" : "stays"}</Badge>
                      {e.why && <span className="w-full text-xs text-muted-foreground">{e.why}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No work was forwarded when the role was taken.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => setOpen({ kind: "resume", id: r.id })} data-resume><PlayIcon /> Continue where I stopped{clean.length ? ` (${clean.length})` : ""}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen({ kind: "decline", id: r.id })}>Start fresh instead</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Confirm open={open?.kind === "done"} onOpenChange={(v) => !v && setOpen(null)} busy={busy} title="Tell them you have finished?" action="Yes, I have finished" onConfirm={() => open && run(() => reportFinishedAction(open.id), () => "They were told; they will confirm the change")}>
        <p>Whoever asked is told your work is done, and confirms the role change.</p>
      </Confirm>
      <Confirm open={open?.kind === "resume"} onOpenChange={(v) => !v && setOpen(null)} busy={busy} title="Continue where you stopped?" action="Continue" onConfirm={() => open && run(() => resumeWorkAction(open.id), (d) => { const x = d as { back: number; left: number }; return `${x.back} came back to you${x.left ? `, ${x.left} stayed with others` : ""}`; })}>
        <p>{restored ? `${restored.entries.filter((e) => e.clean).length} of ${restored.entries.length} pieces of work come back to you, as you left them.` : ""} Those someone took further stay with them.</p>
      </Confirm>
      <Confirm open={open?.kind === "decline"} onOpenChange={(v) => !v && setOpen(null)} busy={busy} title="Start fresh instead?" action="Start fresh" onConfirm={() => open && run(() => declineResumeAction(open.id), () => "Your earlier work stays with your team")}>
        <p>Your earlier work stays with the people it went to. You can be assigned new work as usual.</p>
      </Confirm>
      {data.history.length > 0 && <Card><History data={data} tz={tz} /></Card>}
    </div>
  );
}

function History({ data, tz }: { data: MyRoleChanges; tz: string }) {
  const LABEL: Record<string, string> = { awaiting_finish: "Waiting for you to finish", applied: "Role taken", restored: "Role back", resumed: "Continued", cancelled: "Called off" };
  return (
    <CardContent className="pt-0">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">Earlier changes</p>
      <ul className="divide-y text-sm">
        {data.history.map((h) => (
          <li key={h.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{h.what}</span><span className="text-xs text-muted-foreground">{LABEL[h.status] ?? h.status}, {fmtDateTime(h.at, tz)}</span></li>
        ))}
      </ul>
    </CardContent>
  );
}
