"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRingIcon, Loader2Icon, MegaphoneIcon, PinIcon, ShieldCheckIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { announcementStatusAction, deleteAnnouncementAction, markAnnouncementAction, remindAnnouncementAction, saveAnnouncementAction } from "@/app/actions/announcements";
import type { Announcement } from "@/server/announcements";
import { cn } from "@/lib/utils";

type Opt = { key: string; label: string };
type Status = { kind: string; total: number; done: number; waiting: { id: string; name: string }[] };

function Composer({ canAll, departments, roles, onDone }: { canAll: boolean; departments: Opt[]; roles: Opt[]; onDone: () => void }) {
  const [f, setF] = React.useState({ title: "", body: "", kind: "news" as "news" | "policy", all: canAll, departments: [] as string[], roles: [] as string[], pinned: false, expiresAt: "" });
  const [busy, setBusy] = React.useState(false);
  const pick = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const save = async () => {
    setBusy(true);
    const r = await saveAnnouncementAction({ title: f.title, body: f.body, kind: f.kind, pinned: f.pinned, expiresAt: f.expiresAt || null, audience: { all: f.all, departments: f.all ? [] : f.departments, roles: f.all ? [] : f.roles } });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(f.kind === "policy" ? "Policy published" : "Announced");
    setF({ ...f, title: "", body: "" });
    onDone();
  };
  return (
    <Card data-announce-composer>
      <CardHeader>
        <CardTitle className="text-base">New announcement</CardTitle>
        <CardDescription>Shown at the top of every page for the people it is for, until they read it (or, for a policy, confirm it). They are also told by a notice.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          {(["news", "policy"] as const).map((k) => (
            <Button key={k} size="sm" variant={f.kind === k ? "default" : "outline"} onClick={() => setF({ ...f, kind: k })}>
              {k === "news" ? <MegaphoneIcon /> : <ShieldCheckIcon />} {k === "news" ? "News" : "Policy to confirm"}
            </Button>
          ))}
        </div>
        <Input aria-label="Announcement title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea aria-label="Announcement text" rows={5} placeholder="What people should know" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="space-y-1.5">
          <p className="font-medium">For whom</p>
          {canAll && (
            <div className="flex items-center gap-2">
              <Switch id="an-all" checked={f.all} onCheckedChange={(v) => setF({ ...f, all: v })} />
              <Label htmlFor="an-all">Everyone</Label>
            </div>
          )}
          {!f.all && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {departments.map((d) => (
                  <button key={d.key} type="button" aria-pressed={f.departments.includes(d.key)} onClick={() => setF({ ...f, departments: pick(f.departments, d.key) })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", f.departments.includes(d.key) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {d.label}
                  </button>
                ))}
              </div>
              {roles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => (
                    <button key={r.key} type="button" aria-pressed={f.roles.includes(r.key)} onClick={() => setF({ ...f, roles: pick(f.roles, r.key) })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", f.roles.includes(r.key) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="an-pin" checked={f.pinned} onCheckedChange={(v) => setF({ ...f, pinned: v })} />
            <Label htmlFor="an-pin">Pin to the top</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="an-exp">Until</Label>
            <Input id="an-exp" type="date" className="h-8 w-40" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
          </div>
        </div>
        <Button disabled={busy || !f.title.trim() || !f.body.trim()} onClick={save}>
          {busy && <Loader2Icon className="animate-spin" />} Publish
        </Button>
      </CardContent>
    </Card>
  );
}

export function AnnouncementsClient({ list, viewerId, canAll, departments, roles }: { list: Announcement[]; viewerId: string; canAll: boolean; departments: Opt[]; roles: Opt[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Record<string, Status>>({});
  const showStatus = async (id: string) => {
    const r = await announcementStatusAction(id);
    if (r.ok && r.data) setStatus({ ...status, [id]: r.data });
  };
  return (
    <div className="space-y-4">
      {(canAll || departments.length > 0) && <Composer canAll={canAll} departments={departments} roles={roles} onDone={() => router.refresh()} />}
      {!list.length && <p className="text-sm text-muted-foreground">Nothing announced yet.</p>}
      {list.map((a) => {
        const st = status[a.id];
        const mine = a.authorId === viewerId;
        return (
          <Card key={a.id} data-announcement-card={a.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {a.kind === "policy" ? <ShieldCheckIcon className="size-4 text-[#E8710A]" /> : <MegaphoneIcon className="size-4 text-[#1A73E8]" />}
                {a.title}
                {a.pinned && <PinIcon className="size-3.5 text-muted-foreground" />}
              </CardTitle>
              <CardDescription>
                {a.author} · {new Date(a.createdAt).toLocaleString()}
                {a.expiresAt ? ` · until ${a.expiresAt.slice(0, 10)}` : ""}
                {a.audience.all ? " · everyone" : ` · ${[...a.audience.departments, ...a.audience.roles].join(", ")}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{a.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                {!mine && a.kind === "policy" && (a.ackedAt ? <span className="text-xs text-[#188038]">You confirmed it {new Date(a.ackedAt).toLocaleDateString()}</span> : <Button size="sm" onClick={async () => (await markAnnouncementAction(a.id, true), router.refresh())}>I have read this</Button>)}
                {!mine && a.kind === "news" && !a.readAt && (
                  <Button size="sm" variant="outline" onClick={async () => (await markAnnouncementAction(a.id, false), router.refresh())}>
                    Got it
                  </Button>
                )}
                {mine && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => showStatus(a.id)}>
                      <UsersIcon /> Who has {a.kind === "policy" ? "confirmed" : "read"}
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${a.title}`} onClick={async () => (await deleteAnnouncementAction(a.id), router.refresh())}>
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </div>
              {st && (
                <div className="rounded-lg border p-2" data-announcement-status>
                  <p className="font-medium">
                    {st.done} of {st.total} {st.kind === "policy" ? "confirmed" : "read"}
                  </p>
                  {st.waiting.length > 0 && (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">Not yet: {st.waiting.map((p) => p.name).join(", ")}</p>
                      <Button size="xs" variant="outline" className="mt-1.5" onClick={async () => { const r = await remindAnnouncementAction(a.id); if (r.ok) toast.success(`Reminded ${r.data} people`); }}>
                        <BellRingIcon /> Remind them
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
