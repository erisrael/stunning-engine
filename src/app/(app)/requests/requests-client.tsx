"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InboxIcon, Loader2Icon, SendIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import { createRequestAction } from "@/app/actions/departments";

type Target = { dept: string; title: string; task: string; intro: string; types: { key: string; label: string }[] };
type Mine = { id: string; dept: string; deptTitle: string; code: string; title: string; statusLabel: string; status_category: string; request_state: string | null; assignee_name: string | null; created_at: string; due_date: string | null };

const STATE: Record<string, string> = { pending: "Waiting for a decision", accepted: "Accepted", declined: "Declined" };

export function RequestsClient({ targets, mine }: { targets: Target[]; mine: Mine[] }) {
  const router = useRouter();
  const [dept, setDept] = React.useState(targets[0]?.dept ?? "");
  const target = targets.find((t) => t.dept === dept);
  const [f, setF] = React.useState({ type: target?.types[0]?.key ?? "", title: "", description: "", dueDate: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setF((x) => ({ ...x, type: target?.types[0]?.key ?? "" })), [target]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
          <CardDescription>
            {targets.length ? target?.intro || "Say what you need and by when." : "No department takes requests yet. Heads switch this on in their Configure tab (General, Features)."}
          </CardDescription>
        </CardHeader>
        {targets.length > 0 && (
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-full" aria-label="Department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.dept} value={t.dept}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What for</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
                <SelectTrigger className="w-full" aria-label="What for">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {target?.types.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-title">What do you need?</Label>
              <Input id="rq-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-desc">Details</Label>
              <Textarea id="rq-desc" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-due">Needed by (optional)</Label>
              <Input id="rq-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className="w-44" />
            </div>
            <Button
              disabled={busy || !f.title.trim() || !f.type}
              onClick={async () => {
                setBusy(true);
                const r = await createRequestAction(dept, { title: f.title, description: f.description, type: f.type, dueDate: f.dueDate || null });
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success(`Sent as ${(r.data as { code: string }).code}. You will be told when it is accepted and done.`);
                setF({ ...f, title: "", description: "", dueDate: "" });
                router.refresh();
              }}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send request
            </Button>
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
          <CardDescription>You are told when a request is accepted, declined and finished.</CardDescription>
        </CardHeader>
        <CardContent>
          {mine.length ? (
            <ul className="divide-y rounded-lg border">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.deptTitle} · asked {r.created_at.slice(0, 10)}
                      {r.due_date && ` · needed by ${r.due_date}`}
                      {r.assignee_name && ` · ${r.assignee_name}`}
                    </span>
                  </span>
                  <Badge variant={r.request_state === "declined" ? "destructive" : r.status_category === "done" ? "default" : "secondary"}>
                    {r.request_state === "accepted" || r.status_category === "done" ? r.statusLabel : (STATE[r.request_state ?? ""] ?? r.statusLabel)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<InboxIcon className="size-5" />} title="No requests yet" description="Requests you send appear here with their progress." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
