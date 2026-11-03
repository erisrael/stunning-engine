"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkLinksNowAction, saveAppConfigAction, saveStorageConfigAction } from "@/app/actions/files-publishing";
import type { StorageConfig } from "@/server/files-publishing";

type Broken = { asset_id: string; url: string; status: number; checked_at: string; code: string; kind: string };
type Outside = { id: string; code: string; kind: string; url: string };

// Admin, Files and publishing (Phases 16.2 and 16.3).
export function FilesAdmin({ storage, app, broken, outside }: { storage: StorageConfig; app: { url: string; hasKey: boolean }; broken: Broken[]; outside: Outside[] }) {
  const router = useRouter();
  const [s, setS] = React.useState(storage);
  const [a, setA] = React.useState({ url: app.url, key: "" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (k: string, p: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: (d: unknown) => string) => {
    setBusy(k);
    const r = await p();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(ok(r.data));
    router.refresh();
  };
  return (
    <div className="space-y-4" data-files-admin>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where the files live</CardTitle>
          <CardDescription>The company&apos;s storage places (a shared Google Drive folder, a NAS path, a cloud bucket). Links on parts outside these places are flagged; with none listed, nothing is flagged.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {s.locations.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Place ${i + 1} name`} className="w-48" placeholder="Name" value={l.label} onChange={(e) => setS({ ...s, locations: s.locations.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Input aria-label={`Place ${i + 1} address`} placeholder="https://drive.google.com/drive/folders/... or \\nas\videos" value={l.prefix} onChange={(e) => setS({ ...s, locations: s.locations.map((x, j) => (j === i ? { ...x, prefix: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" aria-label={`Remove place ${i + 1}`} onClick={() => setS({ ...s, locations: s.locations.filter((_, j) => j !== i) })}>
                <XIcon />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setS({ ...s, locations: [...s.locations, { label: "", prefix: "" }] })}>
            <PlusIcon /> Add a place
          </Button>
          <div className="space-y-1">
            <Label htmlFor="fp-pattern">Folder pattern</Label>
            <Input id="fp-pattern" value={s.pattern} onChange={(e) => setS({ ...s, pattern: e.target.value })} />
            <p className="text-xs text-muted-foreground">Use {"{grade}"}, {"{subject}"}, {"{unit}"} and {"{code}"}.</p>
          </div>
          <Button size="sm" disabled={!!busy} onClick={() => run("storage", () => saveStorageConfigAction(s), () => "Saved")}>
            {busy === "storage" && <Loader2Icon className="animate-spin" />} Save places
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links that no longer open</CardTitle>
          <CardDescription>Checked once a week (raw, master, captions and thumbnail links); the team leads are told.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("links", checkLinksNowAction, (d) => { const x = d as { checked: number; broken: number }; return `Checked ${x.checked}; ${x.broken} do not open`; })}>
            {busy === "links" && <Loader2Icon className="animate-spin" />} Check now
          </Button>
          {broken.length ? (
            <ul className="space-y-0.5" data-broken-links>
              {broken.map((b) => (
                <li key={b.asset_id} className="truncate">
                  <span className="font-medium">{b.code}</span> {b.kind}: <span className="text-muted-foreground">{b.url}</span> ({b.status || "no answer"})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No broken links found.</p>
          )}
          {outside.length > 0 && (
            <>
              <p className="pt-2 font-medium">Outside the company&apos;s places ({outside.length})</p>
              <ul className="space-y-0.5" data-outside-links>
                {outside.slice(0, 50).map((o) => (
                  <li key={o.id} className="truncate">
                    <span className="font-medium">{o.code}</span> {o.kind}: <span className="text-muted-foreground">{o.url}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Myseed App</CardTitle>
          <CardDescription>The Uploading card sends the approved master to the app (POST /videos) and records the app&apos;s ID; &quot;Check the app&quot; asks it whether it plays (GET /videos/ID) and records live when it is.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Input aria-label="Myseed App API address" placeholder="https://api.myseed.com.et" value={a.url} onChange={(e) => setA({ ...a, url: e.target.value })} />
          <Input aria-label="Myseed App API key" type="password" placeholder={app.hasKey ? "Saved (sealed). Type to replace." : "API key"} value={a.key} onChange={(e) => setA({ ...a, key: e.target.value })} />
          <div>
            <Button size="sm" disabled={!!busy} onClick={() => run("app", () => saveAppConfigAction({ url: a.url, key: a.key || null }), () => "Saved")}>
              {busy === "app" && <Loader2Icon className="animate-spin" />} Save the connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
