"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ForwardIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ForwardTarget } from "@/server/support-forward";
import * as SC from "@/app/actions/support-chat";

// Support, Queues and replies › Forwarding (Update 1.2, Phase 6): where agents may forward a customer message, who may
// use each target, what goes with it, and the forwards that wait for a lead's approval.

type Pending = { id: string; label: string; number: number; ticket_id: string; body: string; note: string | null; by: string; created_at: string };
const KINDS = [
  ["user", "A person"],
  ["department", "A department (its heads and leads)"],
  ["department_head", "A department's head"],
  ["support_leads", "The support leads"],
] as const;
const select = "h-8 w-full rounded-md border bg-background px-2 text-sm";
const empty = { kind: "user", target: "", label: "", allowed: [] as string[], needsApproval: false, includeFiles: true, includeCustomer: false, linkConversation: true, active: true };

export function ForwardingSetup({ initial, pending: firstPending, people, departments, roles, lead }: { initial: ForwardTarget[]; pending: Pending[]; people: { id: string; name: string }[]; departments: { key: string; label: string }[]; roles: { key: string; label: string }[]; lead: boolean }) {
  const router = useRouter();
  const [list, setList] = React.useState(initial);
  const [pending, setPending] = React.useState(firstPending);
  const [f, setF] = React.useState<typeof empty & { id?: string }>(empty);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const r = await SC.saveForwardTargetAction({ ...f, kind: f.kind as ForwardTarget["kind"] });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setList(r.data ?? []);
    setF(empty);
    toast.success("Target saved");
  };
  const targetName = (t: ForwardTarget) => (t.kind === "user" ? people.find((p) => p.id === t.target)?.name : t.kind === "support_leads" ? "Support leads" : departments.find((d) => d.key === t.target)?.label) ?? t.target;
  return (
    <Card className="xl:col-span-2" data-forwarding-setup>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ForwardIcon className="size-4" /> Forwarding</CardTitle>
        <CardDescription>Where agents may forward a customer message from a conversation. Without customer details, the customer's name stays here and numbers and emails in the text are hidden.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {lead && pending.length > 0 && (
          <section className="space-y-2" aria-label="Waiting for approval" data-pending-forwards>
            <p className="font-medium">Waiting for your approval</p>
            {pending.map((p) => (
              <div key={p.id} className="flex flex-wrap items-start gap-2 rounded-lg border p-2">
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium">{p.by} to {p.label}, #{p.number}</p>
                  {p.note && <p>Note: {p.note}</p>}
                  <p className="truncate text-muted-foreground">{p.body}</p>
                </div>
                {(["approve", "decline"] as const).map((k) => (
                  <Button key={k} size="sm" variant={k === "approve" ? "default" : "ghost"} onClick={async () => { const r = await SC.decideForwardAction(p.id, k === "approve"); if (!r.ok) return void toast.error(r.error); setPending((x) => x.filter((y) => y.id !== p.id)); toast.success(k === "approve" ? "Approved and sent" : "Declined"); router.refresh(); }}>
                    {k === "approve" ? <CheckIcon /> : <XIcon />} {k === "approve" ? "Approve" : "Decline"}
                  </Button>
                ))}
              </div>
            ))}
          </section>
        )}
        <ul className="divide-y rounded-lg border">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-forward-target={t.label}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.label}{!t.active && <span className="ml-1 text-xs text-muted-foreground">(off)</span>}</p>
                <p className="text-xs text-muted-foreground">
                  {targetName(t)} · {t.allowed.length ? `for ${t.allowed.map((a) => (a.startsWith("role:") ? roles.find((r) => `role:${r.key}` === a)?.label : people.find((p) => p.id === a)?.name) ?? a).join(", ")}` : "every agent"}
                  {t.needsApproval ? " · a lead approves" : ""}{t.includeCustomer ? " · with customer details" : ""}{t.includeFiles ? " · with files" : ""}{t.linkConversation ? " · linked" : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setF({ ...t })}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`Remove ${t.label}`} onClick={async () => { const r = await SC.deleteForwardTargetAction(t.id); if (r.ok) setList(r.data ?? []); else toast.error(r.error); }}><Trash2Icon /></Button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-4 text-center text-muted-foreground">No targets yet. Agents cannot forward until one is set.</li>}
        </ul>
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2" data-forward-form>
          <label className="space-y-1 text-xs">Forward to
            <select aria-label="Kind of target" className={select} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, target: "" })}>
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {f.kind !== "support_leads" ? (
            <label className="space-y-1 text-xs">{f.kind === "user" ? "Person" : "Department"}
              <select aria-label="Target" className={select} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value, label: f.label || e.target.selectedOptions[0]?.text || "" })}>
                <option value="">Choose…</option>
                {(f.kind === "user" ? people.map((p) => ({ key: p.id, label: p.name })) : departments).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          ) : <span />}
          <label className="space-y-1 text-xs sm:col-span-2">Name agents see
            <Input aria-label="Target name" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Finance head" />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">Who may use it (none chosen: every agent)
            <select aria-label="Who may use it" multiple className="h-24 w-full rounded-md border bg-background px-2 text-sm" value={f.allowed} onChange={(e) => setF({ ...f, allowed: [...e.target.selectedOptions].map((o) => o.value) })}>
              {roles.map((r) => <option key={r.key} value={`role:${r.key}`}>Role: {r.label}</option>)}
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {([
            ["needsApproval", "A support lead approves first"],
            ["includeFiles", "Include the message's files"],
            ["includeCustomer", "Include the customer's details"],
            ["linkConversation", "Link the conversation"],
            ["active", "On"],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-xs"><Switch checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} aria-label={l} />{l}</label>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={busy || !f.label.trim() || (f.kind !== "support_leads" && !f.target)} onClick={save}><PlusIcon /> {f.id ? "Save target" : "Add target"}</Button>
            {f.id && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Cancel</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
