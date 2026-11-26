"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/app/multi-select";
import { createGptClientAction, revokeGptClientAction, saveToolsAccessAction } from "@/app/actions/tools";
import { Input } from "@/components/ui/input";
import { TOOL_APPS, TOOL_FEATURES } from "@/lib/tools";
import type { ToolsConfig } from "@/server/tools";

type Row = { key: string; label: string; hint: string };

export function ToolsAdmin({ initial, roles, gptClients = [] }: { initial: ToolsConfig; roles: { key: string; label: string }[]; gptClients?: { client_id: string; name: string; created_at: string; revoked_at: string | null }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const options = roles.map((r) => ({ value: r.key, label: r.label }));

  const section = (title: string, rows: readonly Row[], part: "apps" | "features") => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="divide-y rounded-md border">
        {rows.map((r) => {
          const s = (c[part] as Record<string, { on: boolean; roles: string[] }>)[r.key]!;
          const set = (next: Partial<typeof s>) => setC({ ...c, [part]: { ...c[part], [r.key]: { ...s, ...next } } });
          return (
            <div key={r.key} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center">
              <label className="flex items-start gap-3">
                <Switch className="mt-0.5" checked={s.on} onCheckedChange={(v) => set({ on: v })} aria-label={r.label} />
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.hint}</span>
                </span>
              </label>
              <div className={s.on ? "" : "pointer-events-none opacity-50"}>
                <MultiSelect label={`Roles for ${r.label}`} options={options} value={s.roles} onChange={(v: string[]) => set({ roles: v })} placeholder="Everyone with Tools hub" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tools hub</CardTitle>
        <CardDescription>
          Six apps that work inside Myseed with no outside service. Switch each app and connection on or off, and pick the roles that get it (none picked = everyone
          whose role has &ldquo;Tools hub&rdquo; in{" "}
          <Link className="underline" href="/admin?tab=permissions">
            Roles &amp; permissions
          </Link>
          ). People&apos;s notes, documents and reminders are private to them. The letterhead is changed in{" "}
          <Link className="underline" href="/tools/letters?tab=letterhead">
            Letters, Letterhead
          </Link>{" "}
          by people with &ldquo;Change the official company letterhead&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} />
          Tools hub on
        </label>
        <fieldset disabled={!c.enabled} className="space-y-5 disabled:opacity-50">
          {section("Apps", TOOL_APPS, "apps")}
          {section("Connections (optional; the apps work without them)", TOOL_FEATURES, "features")}
        </fieldset>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveToolsAccessAction({ enabled: c.enabled, apps: c.apps, features: c.features });
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success("Tools hub saved");
            router.refresh();
          }}
        >
          Save
        </Button>
        <GptClients clients={gptClients} />
      </CardContent>
    </Card>
  );
}

// The OAuth client a Custom GPT uses (its secret is shown once). People still approve the GPT on their own account.
function GptClients({ clients }: { clients: { client_id: string; name: string; created_at: string; revoked_at: string | null }[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("Myseed GPT");
  const [uris, setUris] = React.useState("");
  const [made, setMade] = React.useState<{ clientId: string; clientSecret: string } | null>(null);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">ChatGPT connections</p>
      <p className="text-xs text-muted-foreground">
        A Custom GPT needs a client id and secret (GPT editor, Actions, Authentication, OAuth). Leave the callback empty to accept ChatGPT&apos;s own callback address, or paste the exact one the GPT editor shows.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48" aria-label="Name" />
        <Input value={uris} onChange={(e) => setUris(e.target.value)} className="min-w-64 flex-1" placeholder="Callback URL (optional)" aria-label="Callback URL" />
        <Button
          variant="outline"
          onClick={async () => {
            const r = await createGptClientAction({ name, redirectUris: uris.split(/[\s,]+/).filter(Boolean) });
            if (!r.ok) return toast.error(r.error);
            setMade(r.data as { clientId: string; clientSecret: string });
            router.refresh();
          }}
        >
          Create
        </Button>
      </div>
      {made && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">Copy these now; the secret is not shown again.</p>
          <p className="mt-1 font-mono break-all">Client ID: {made.clientId}</p>
          <p className="font-mono break-all">Client secret: {made.clientSecret}</p>
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {clients.map((c) => (
          <li key={c.client_id} className="flex items-center gap-2">
            <span className={c.revoked_at ? "text-muted-foreground line-through" : ""}>
              {c.name} <span className="font-mono text-xs text-muted-foreground">{c.client_id}</span>
            </span>
            {!c.revoked_at && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  if (!confirm(`Remove ${c.name}? Everyone connected through it is disconnected.`)) return;
                  const r = await revokeGptClientAction(c.client_id);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
