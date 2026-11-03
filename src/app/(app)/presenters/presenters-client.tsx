"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheckIcon, Loader2Icon, PlusIcon, ReceiptIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addReleaseAction, billStatementAction, savePresenterAction, savePresenterConfigAction, sendStatementAction } from "@/app/actions/presenters";
import type { Presenter, PresenterConfig, Statement } from "@/server/presenters";
import { cn } from "@/lib/utils";

const STATE: Record<Presenter["releaseState"], { label: string; cls: string }> = {
  valid: { label: "Release valid", cls: "bg-[#188038]/10 text-[#188038]" },
  expiring: { label: "Release ending soon", cls: "bg-[#E8710A]/10 text-[#E8710A]" },
  expired: { label: "Release expired", cls: "bg-[#D93025]/10 text-[#D93025]" },
  none: { label: "No release", cls: "bg-muted text-muted-foreground" },
};
const RATE: Record<string, string> = { session: "per session", part: "per part", hour: "per hour" };

function PresenterForm({ p, onDone }: { p?: Presenter; onDone: () => void }) {
  const [f, setF] = React.useState({ name: p?.name ?? "", kind: p?.kind ?? "teacher", phone: p?.phone ?? "", email: p?.email ?? "", subjects: p?.subjects ?? "", aliases: (p?.aliases ?? []).join(", "), rateKind: p?.rateKind ?? "", rate: p?.rate ? String(p.rate) : "" });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const r = await savePresenterAction({ id: p?.id, ...f, aliases: f.aliases.split(",").map((x) => x.trim()).filter(Boolean), rate: f.rate ? Number(f.rate) : null, rateKind: f.rateKind || null });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(p ? "Saved" : "Presenter added");
    onDone();
  };
  return (
    <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2" data-presenter-form>
      <Input aria-label="Presenter name" placeholder="Full name (as on parts and sessions)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select aria-label="Kind" className="h-9 rounded-md border bg-background px-2" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Presenter["kind"] })}>
        <option value="teacher">Teacher</option>
        <option value="guest">Guest</option>
        <option value="student">Student</option>
      </select>
      <Input aria-label="Phone" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <Input aria-label="Email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Input aria-label="Subjects" placeholder="Subjects (for example Grade 9 Physics)" value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} />
      <Input aria-label="Other names" placeholder="Other names on parts, comma separated" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} />
      <select aria-label="Fee" className="h-9 rounded-md border bg-background px-2" value={f.rateKind} onChange={(e) => setF({ ...f, rateKind: e.target.value })}>
        <option value="">No fee</option>
        <option value="session">Fee per session</option>
        <option value="part">Fee per part</option>
        <option value="hour">Fee per hour</option>
      </select>
      <Input aria-label="Fee amount" type="number" min={0} placeholder="Amount" disabled={!f.rateKind} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
      <div className="sm:col-span-2">
        <Button size="sm" disabled={busy || !f.name.trim()} onClick={save}>
          {busy && <Loader2Icon className="animate-spin" />} Save presenter
        </Button>
      </div>
    </div>
  );
}

function ReleaseForm({ p, onDone }: { p: Presenter; onDone: () => void }) {
  const [f, setF] = React.useState({ signedOn: new Date().toISOString().slice(0, 10), expiresOn: "", scope: "Myseed App, YouTube and partners" });
  const [file, setFile] = React.useState<{ name: string; mime: string; base64: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pick = (x: File | undefined) => {
    if (!x) return;
    const rd = new FileReader();
    rd.onload = () => setFile({ name: x.name, mime: x.type, base64: String(rd.result).split(",")[1] ?? "" });
    rd.readAsDataURL(x);
  };
  const save = async () => {
    setBusy(true);
    const r = await addReleaseAction(p.id, { signedOn: f.signedOn, expiresOn: f.expiresOn || null, scope: f.scope, file });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Release recorded");
    onDone();
  };
  return (
    <div className="grid gap-2 rounded-lg border border-[#188038]/30 bg-[#188038]/5 p-3 text-sm sm:grid-cols-2" data-release-form>
      <Label className="flex flex-col items-start gap-1">
        Signed on
        <Input aria-label="Signed on" type="date" value={f.signedOn} onChange={(e) => setF({ ...f, signedOn: e.target.value })} />
      </Label>
      <Label className="flex flex-col items-start gap-1">
        Valid until (empty: no end)
        <Input aria-label="Valid until" type="date" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} />
      </Label>
      <Input aria-label="Where the videos may be used" className="sm:col-span-2" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} />
      <Input aria-label="Signed form" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
      <Button size="sm" disabled={busy} onClick={save}>
        {busy && <Loader2Icon className="animate-spin" />} Record the release
      </Button>
    </div>
  );
}

export function PresentersClient(props: { tab: "people" | "fees"; month: string; manage: boolean; finance: boolean; presenters: Presenter[]; config: PresenterConfig; statements: Statement[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const [cfg, setCfg] = React.useState(props.config);
  const done = () => (setOpen(null), router.refresh());
  const act = async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await p;
    if (!r.ok) return void toast.error(r.error);
    toast.success(msg);
    router.refresh();
  };
  if (props.tab === "fees")
    return (
      <Card data-presenter-fees>
        <CardHeader>
          <CardTitle className="text-base">Fees for {props.month}</CardTitle>
          <CardDescription>From the sessions marked recorded that month and each presenter&apos;s fee. HR or the Recording lead sends a statement to Finance; Finance makes it a bill.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <form className="flex items-center gap-2" action="/presenters">
            <input type="hidden" name="tab" value="fees" />
            <Input aria-label="Month" type="month" name="month" defaultValue={props.month} className="w-44" />
            <Button size="sm" variant="outline" type="submit">
              Show
            </Button>
          </form>
          {!props.statements.length && <p className="text-muted-foreground">No recorded sessions with a presenter that month.</p>}
          {props.statements.map((s) => (
            <div key={s.presenterId} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-statement={s.presenterId}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.sessions} sessions · {s.parts} parts · {s.hours} hours · {s.rate ? `${s.rate.toLocaleString()} ${RATE[s.rateKind ?? ""] ?? ""}` : "no fee set"}
                </p>
              </div>
              <p className="font-semibold tabular-nums">{s.amount.toLocaleString()}</p>
              <span className="text-xs">{s.status === "open" ? "Not sent" : s.status === "sent" ? "With Finance" : "Billed"}</span>
              {props.manage && s.status === "open" && s.amount > 0 && (
                <Button size="xs" onClick={() => act(sendStatementAction(s.presenterId, props.month), "Sent to Finance")}>
                  <SendIcon /> Send to Finance
                </Button>
              )}
              {props.finance && s.status === "sent" && (
                <Button size="xs" onClick={() => act(billStatementAction(s.presenterId, props.month), "Bill made")}>
                  <ReceiptIcon /> Make it a bill
                </Button>
              )}
              {s.billId && (
                <Link href="/finance?tab=bills" className="text-xs text-primary hover:underline">
                  See the bill
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="pr-req" checked={cfg.requireRelease} onCheckedChange={(v) => setCfg({ ...cfg, requireRelease: v })} />
            <Label htmlFor="pr-req">A part cannot leave Recording without a valid release for its presenter</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pr-warn">Warn</Label>
            <Input id="pr-warn" type="number" min={1} className="h-8 w-20" value={cfg.warnDays} onChange={(e) => setCfg({ ...cfg, warnDays: Number(e.target.value) })} />
            <span>days before a release ends</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => act(savePresenterConfigAction(cfg), "Rules saved")}>
            Save rules
          </Button>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(open === "new" ? null : "new")}>
          <PlusIcon /> Add a presenter
        </Button>
      </div>
      {open === "new" && <PresenterForm onDone={done} />}
      {!props.presenters.length && <p className="text-sm text-muted-foreground">No presenters yet.</p>}
      {props.presenters.map((p) => (
        <Card key={p.id} data-presenter={p.name}>
          <CardContent className="space-y-2 pt-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 font-medium">
                {p.name} <span className="text-xs font-normal text-muted-foreground">· {p.kind}{p.subjects ? ` · ${p.subjects}` : ""}{p.rate ? ` · ${p.rate.toLocaleString()} ${RATE[p.rateKind ?? ""]}` : ""}</span>
              </p>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", STATE[p.releaseState].cls)} data-release-state={p.releaseState}>
                {STATE[p.releaseState].label}
                {p.release?.expiresOn ? ` (to ${p.release.expiresOn})` : ""}
              </span>
              {p.release?.fileName && (
                <a href={`/api/presenters/release/${p.release.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  <FileCheckIcon className="mr-0.5 inline size-3.5" />
                  Signed form
                </a>
              )}
              <Button size="xs" variant="outline" onClick={() => setOpen(open === `rel:${p.id}` ? null : `rel:${p.id}`)}>
                Record a release
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setOpen(open === `edit:${p.id}` ? null : `edit:${p.id}`)}>
                Edit
              </Button>
            </div>
            {open === `rel:${p.id}` && <ReleaseForm p={p} onDone={done} />}
            {open === `edit:${p.id}` && <PresenterForm p={p} onDone={done} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
