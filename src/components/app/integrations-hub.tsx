"use client";

// Admin, Integrations (Phase 27): Microsoft Office and Power BI, Notion, and "Integrate a platform": connect any
// SMS, email, payment or other provider from its API documentation (or a preset), review what the app found, test
// it with a real call, and switch it on.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenIcon, CheckIcon, DownloadIcon, Loader2Icon, PlugIcon, PlusIcon, SearchIcon, Trash2Icon, TriangleAlertIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as A from "@/app/actions/connect";
import type { Capability, Connector, ConnectorDraft, Operation } from "@/server/connectors";
import { cn } from "@/lib/utils";

type Preset = { key: string; name: string; capability: Capability; region: string; docsUrl?: string | null; secrets: { name: string; label: string }[] };
type Call = { id: string; name: string | null; capability: string; ok: number; status: number; ms: number; summary: string; error: string | null; test: number; at: string };
const sel = "h-9 rounded-md border bg-background px-2 text-sm";
const CAP_LABEL: Record<Capability, string> = { sms: "SMS", email: "Email", payment: "Payments", webhook: "Webhook", other: "Other" };
const TEST_FIELDS: Record<Capability, string[]> = { sms: ["to", "message", "sender"], email: ["to", "subject", "text", "from", "fromName"], payment: ["amount", "currency", "email", "phone", "description", "return_url"], webhook: ["event", "title", "body", "link"], other: ["value"] };
const SECRET_FIELDS: Record<string, string> = { token: "API key or token", username: "Username or account ID", password: "Password or secret", clientId: "OAuth client ID", clientSecret: "OAuth client secret", identifier: "Sender or identifier ID", domain: "Domain" };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async <T,>(key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, done?: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Failed"), null;
    if (done) toast.success(done);
    router.refresh();
    return (r.data ?? true) as T | true;
  };
  return { act, busy };
}

export function IntegrationsHub({ datasets, notion, connectors, presets, calls }: { datasets: { key: string; label: string }[]; notion: { connected: boolean; parentPageId: string | null; workspace: string | null }; connectors: Connector[]; presets: Preset[]; calls: Call[] }) {
  return (
    <div className="space-y-4" data-integrations-hub>
      <Office datasets={datasets} />
      <Notion status={notion} datasets={datasets} />
      <Platforms connectors={connectors} presets={presets} calls={calls} />
    </div>
  );
}

function Office({ datasets }: { datasets: { key: string; label: string }[] }) {
  const [d, setD] = React.useState(datasets[0]?.key ?? "");
  return (
    <Card data-office>
      <CardHeader>
        <CardTitle className="text-base">Microsoft Office, Power BI and Google Sheets</CardTitle>
        <CardDescription>
          Any dataset as an Excel workbook, a Word document or a PowerPoint deck in Myseed's colours. For live data, make a key below: each key gives a Power BI file (.pbids), the Excel Power Query and a Google Sheets formula. Documents, strategy reports and presentations also export to Word and PowerPoint from their own pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select aria-label="Dataset" className={sel} value={d} onChange={(e) => setD(e.target.value)}>
          {datasets.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
        {(["xlsx", "docx", "pptx"] as const).map((f) => (
          <Button key={f} asChild size="sm" variant="outline">
            <a href={`/api/office/${d}?format=${f}`} data-office-export={f}>
              <DownloadIcon /> {f === "xlsx" ? "Excel" : f === "docx" ? "Word" : "PowerPoint"}
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function Notion({ status, datasets }: { status: { connected: boolean; parentPageId: string | null; workspace: string | null }; datasets: { key: string; label: string }[] }) {
  const { act, busy } = useAct();
  const [token, setToken] = React.useState("");
  const [page, setPage] = React.useState(status.parentPageId ?? "");
  const [d, setD] = React.useState(datasets[0]?.key ?? "");
  return (
    <Card data-notion>
      <CardHeader>
        <CardTitle className="text-base">Notion {status.connected && <span className="ml-1 rounded bg-[#1E8E3E]/10 px-1.5 text-xs font-normal text-[#1E8E3E]">Connected to {status.workspace}</span>}</CardTitle>
        <CardDescription>Make an internal integration in Notion (Settings, Connections, Develop or manage integrations), share a page with it, and paste its secret and the page's link. Documents in the library go to Notion as pages and come back; datasets go to Notion as databases.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Notion secret" type="password" placeholder={status.connected ? "Saved (sealed). Paste a new one to change it." : "Integration secret (ntn_… or secret_…)"} value={token} onChange={(e) => setToken(e.target.value)} />
          <Input aria-label="Notion page" placeholder="Link of the Notion page to put things under" value={page} onChange={(e) => setPage(e.target.value)} />
          <Button size="sm" disabled={!!busy} onClick={() => act("n", () => A.connectNotionAction({ token: token || null, parentPage: page || null }), "Notion connected")} data-notion-connect>
            {busy === "n" && <Loader2Icon className="animate-spin" />} {status.connected ? "Save and test" : "Connect"}
          </Button>
        </div>
        {status.connected && (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Dataset for Notion" className={sel} value={d} onChange={(e) => setD(e.target.value)}>
              {datasets.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={async () => {
                const r = await act<{ url: string; rows: number }>("nd", () => A.datasetToNotionAction(d));
                if (r && r !== true) toast.success(`${r.rows} rows sent to Notion`, { action: { label: "Open", onClick: () => window.open(r.url, "_blank") } });
              }}
            >
              Send to Notion as a database
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act("nx", () => A.connectNotionAction({ disconnect: true }), "Notion disconnected")}>
              Disconnect
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Integrate a platform
// ---------------------------------------------------------------------------

function Platforms({ connectors, presets, calls }: { connectors: Connector[]; presets: Preset[]; calls: Call[] }) {
  const { act, busy } = useAct();
  const [cap, setCap] = React.useState<Capability>("sms");
  const [url, setUrl] = React.useState("");
  const [spec, setSpec] = React.useState("");
  const [found, setFound] = React.useState<{ discovery: { source: string; title: string; specUrl: string | null; operations: Operation[]; count: number; tried: number }; draft: ConnectorDraft } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const read = async () => {
    const r = await act<NonNullable<typeof found>>("read", () => A.setupFromDocsAction({ url: url || null, spec: spec || null, capability: cap }));
    if (r && r !== true) setFound(r);
  };
  return (
    <Card data-platforms>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <PlugIcon className="size-4" /> Integrate a platform
        </CardTitle>
        <CardDescription>
          Connect an SMS, email, payment or any other provider by its API. Give the address of its API documentation (or its OpenAPI / Swagger file, or paste it): the app reads it, finds the right call, matches the fields and sets up the sign-in. You review it, add the keys, test it, and switch it on. Or start from a ready preset.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Ready presets</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <Button key={p.key} size="xs" variant="outline" disabled={!!busy} onClick={async () => { const id = await act<string>(`p:${p.key}`, () => A.installPresetAction(p.key), `${p.name} added: add its keys and test it`); if (typeof id === "string") setEditing(id); }} data-preset={p.key}>
                <PlusIcon /> {p.name} <span className="text-muted-foreground">{CAP_LABEL[p.capability]} · {p.region}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-3" data-from-docs>
          <p className="flex items-center gap-1 text-sm font-medium">
            <BookOpenIcon className="size-4" /> From the provider's documentation
          </p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <select aria-label="Purpose" className={sel} value={cap} onChange={(e) => setCap(e.target.value as Capability)}>
              {(Object.keys(CAP_LABEL) as Capability[]).map((c) => (
                <option key={c} value={c}>
                  {CAP_LABEL[c]}
                </option>
              ))}
            </select>
            <Input aria-label="Documentation address" placeholder="https://developer.provider.com/docs (or the openapi.json address)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button size="sm" disabled={!!busy || (!url.trim() && !spec.trim())} onClick={read} data-read-docs>
              {busy === "read" ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} Read it
            </Button>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Or paste the OpenAPI / Swagger file (JSON or YAML)</summary>
            <textarea aria-label="OpenAPI file" className="mt-1 min-h-28 w-full rounded-md border bg-background p-2 font-mono text-xs" value={spec} onChange={(e) => setSpec(e.target.value)} />
          </details>
          {found && (
            <div className="space-y-2" data-discovery>
              <p className="text-xs">
                Found <b>{found.discovery.count}</b> operations in <b>{found.discovery.title}</b> ({found.discovery.source === "openapi" ? `OpenAPI file${found.discovery.specUrl ? ` at ${found.discovery.specUrl}` : ""}` : "curl examples on the page"}). The best fit for {CAP_LABEL[cap]} is chosen below; change it if needed.
              </p>
              <DraftEditor
                draft={found.draft}
                operations={found.discovery.operations}
                secretNames={[]}
                onSave={async (d, secrets) => {
                  const id = await act<string>("save", () => A.saveConnectorAction({ ...d, operations: found.discovery.operations, secrets, status: "draft" }), "Saved as a draft: test it, then switch it on");
                  if (typeof id === "string") (setFound(null), setEditing(id));
                }}
                busy={busy === "save"}
              />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Connected platforms</p>
          {connectors.map((c) => (
            <ConnectorRow key={c.id} c={c} open={editing === c.id} setOpen={(o) => setEditing(o ? c.id : null)} presets={presets} />
          ))}
          {!connectors.length && <p className="text-sm text-muted-foreground">None yet.</p>}
        </div>
        {calls.length > 0 && (
          <details className="rounded-lg border p-2 text-xs" data-call-log>
            <summary className="cursor-pointer font-medium">Recent calls ({calls.length})</summary>
            <table className="mt-1 w-full">
              <tbody>
                {calls.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1">{l.ok ? <CheckIcon className="size-3.5 text-[#1E8E3E]" /> : <TriangleAlertIcon className="size-3.5 text-[#D93025]" />}</td>
                    <td>{l.name}</td>
                    <td>{CAP_LABEL[l.capability as Capability] ?? l.capability}{l.test ? " (test)" : ""}</td>
                    <td className="font-mono">{l.summary}</td>
                    <td>{l.status || "–"}</td>
                    <td>{l.ms} ms</td>
                    <td className="text-[#D93025]">{l.error}</td>
                    <td className="text-muted-foreground">{new Date(l.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function DraftEditor({ draft, operations, secretNames, onSave, busy, extra }: { draft: ConnectorDraft; operations: Operation[]; secretNames: string[]; onSave: (d: ConnectorDraft, secrets: Record<string, string>) => void; busy: boolean; extra?: React.ReactNode }) {
  const [d, setD] = React.useState(draft);
  const [secrets, setSecrets] = React.useState<Record<string, string>>({});
  const opKey = `${d.operation.method} ${d.operation.path}`;
  const neededSecrets = [...new Set([...(d.auth.kind === "basic" ? ["username", "password"] : d.auth.kind === "oauth2" ? ["clientId", "clientSecret"] : d.auth.kind === "none" ? [] : ["token"]), ...[...JSON.stringify(d).matchAll(/\{\{secret\.(\w+)\}\}/g)].map((m) => m[1]!)])];
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-2 text-xs" data-draft-editor>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input aria-label="Connection name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Input aria-label="API address" value={d.baseUrl} onChange={(e) => setD({ ...d, baseUrl: e.target.value })} />
        {operations.length > 0 ? (
          <select
            aria-label="Operation"
            className={sel}
            value={opKey}
            onChange={async (e) => {
              const op = operations.find((o) => `${o.method} ${o.path}` === e.target.value);
              if (!op) return;
              const { matchFieldsClient } = await import("./integrations-match");
              setD({ ...d, operation: { ...d.operation, method: op.method, path: op.path, contentType: op.contentType === "none" && op.method !== "GET" ? "json" : op.contentType, map: matchFieldsClient(d.capability, op.fields) } });
            }}
          >
            {operations.slice(0, 200).map((o) => (
              <option key={`${o.method} ${o.path}`} value={`${o.method} ${o.path}`}>
                {o.method} {o.path} {o.summary ? `– ${o.summary.slice(0, 50)}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex gap-1">
            <select aria-label="Method" className={sel} value={d.operation.method} onChange={(e) => setD({ ...d, operation: { ...d.operation, method: e.target.value } })}>
              {["POST", "GET", "PUT", "PATCH"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <Input aria-label="Path" value={d.operation.path} onChange={(e) => setD({ ...d, operation: { ...d.operation, path: e.target.value } })} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        Sign-in
        <select aria-label="Sign-in" className={sel} value={d.auth.kind} onChange={(e) => setD({ ...d, auth: { ...d.auth, kind: e.target.value as ConnectorDraft["auth"]["kind"] } })}>
          <option value="bearer">Bearer token</option>
          <option value="header">API key in a header</option>
          <option value="query">API key in the address</option>
          <option value="basic">Username and password</option>
          <option value="oauth2">OAuth client credentials</option>
          <option value="none">None</option>
        </select>
        {(d.auth.kind === "header" || d.auth.kind === "query") && <Input aria-label="Key name" className="h-8 w-40" placeholder="X-API-Key" value={d.auth.name ?? ""} onChange={(e) => setD({ ...d, auth: { ...d.auth, name: e.target.value } })} />}
        {d.auth.kind === "oauth2" && <Input aria-label="Token address" className="h-8 w-72" placeholder="https://…/oauth/token" value={d.auth.tokenUrl ?? ""} onChange={(e) => setD({ ...d, auth: { ...d.auth, tokenUrl: e.target.value } })} />}
        Body
        <select aria-label="Body" className={sel} value={d.operation.contentType} onChange={(e) => setD({ ...d, operation: { ...d.operation, contentType: e.target.value as "json" } })}>
          <option value="json">JSON</option>
          <option value="form">Form</option>
          <option value="none">In the address</option>
        </select>
      </div>
      <div className="space-y-1">
        <p className="font-medium">Fields sent ({"{{to}}"}, {"{{message}}"}, {"{{amount}}"}… are filled by the app; others are fixed values)</p>
        {Object.entries(d.operation.map).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1" data-map-field={k}>
            <span className="w-56 truncate font-mono">{k}</span>
            <Input aria-label={`Value of ${k}`} className={cn("h-7 flex-1 font-mono", v === "" && "border-[#F9AB00]")} placeholder="Required: give a fixed value" value={v} onChange={(e) => setD({ ...d, operation: { ...d.operation, map: { ...d.operation.map, [k]: e.target.value } } })} />
            <button type="button" aria-label={`Remove ${k}`} onClick={() => { const m = { ...d.operation.map }; delete m[k]; setD({ ...d, operation: { ...d.operation, map: m } }); }}>
              <Trash2Icon className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
        <Button size="xs" variant="ghost" onClick={() => { const k = window.prompt("Field name (a.b for nested, query:name for the address)"); if (k) setD({ ...d, operation: { ...d.operation, map: { ...d.operation.map, [k]: "" } } }); }}>
          <PlusIcon /> Field
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input aria-label="Success field" placeholder="Success field, e.g. status" value={d.response.okPath ?? ""} onChange={(e) => setD({ ...d, response: { ...d.response, okPath: e.target.value } })} />
        <Input aria-label="Success value" placeholder="Success value, e.g. success" value={d.response.okValue ?? ""} onChange={(e) => setD({ ...d, response: { ...d.response, okValue: e.target.value } })} />
        <Input aria-label={d.capability === "payment" ? "Payment link field" : "Message id field"} placeholder={d.capability === "payment" ? "Link field, e.g. data.checkout_url" : "Id field, e.g. id"} value={(d.capability === "payment" ? d.response.urlPath : d.response.idPath) ?? ""} onChange={(e) => setD({ ...d, response: d.capability === "payment" ? { ...d.response, urlPath: e.target.value } : { ...d.response, idPath: e.target.value } })} />
      </div>
      <div className="flex flex-wrap gap-2" data-secrets>
        {neededSecrets.map((s) => (
          <Input key={s} aria-label={SECRET_FIELDS[s] ?? s} type="password" className="h-8 w-56" placeholder={`${SECRET_FIELDS[s] ?? s}${secretNames.includes(s) ? " (saved)" : ""}`} value={secrets[s] ?? ""} onChange={(e) => setSecrets({ ...secrets, [s]: e.target.value })} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" disabled={busy} onClick={() => onSave(d, secrets)} data-save-connector>
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
        {extra}
      </div>
    </div>
  );
}

function ConnectorRow({ c, open, setOpen, presets }: { c: Connector; open: boolean; setOpen: (o: boolean) => void; presets: Preset[] }) {
  const { act, busy } = useAct();
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<{ ok: boolean; status: number; error: string | null; url: string | null; id: string | null; body: string | null } | null>(null);
  const preset = presets.find((p) => p.key === c.preset);
  const save = (patch: Record<string, unknown>, done: string) => act("save", () => A.saveConnectorAction({ ...c, ...patch, id: c.id }), done);
  return (
    <div className="rounded-lg border p-2" data-connector={c.name}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ZapIcon className={cn("size-4", c.status === "active" ? "text-[#1E8E3E]" : "text-muted-foreground")} />
        <span className="font-medium">{c.name}</span>
        <span className="rounded bg-muted px-1.5 text-[11px]">{CAP_LABEL[c.capability]}</span>
        <span className={cn("text-xs", c.status === "active" ? "text-[#1E8E3E]" : "text-muted-foreground")} data-status={c.status}>
          {c.status === "active" ? `On${c.isDefault ? " (default)" : ""}` : "Draft"}
        </span>
        {c.lastTest && <span className={cn("text-xs", c.lastTest.ok ? "text-[#1E8E3E]" : "text-[#D93025]")}>last test {c.lastTest.ok ? "passed" : "failed"}</span>}
        <span className="ml-auto flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Set up and test"}
          </Button>
          {c.status === "active" ? (
            <Button size="xs" variant="outline" onClick={() => save({ status: "draft" }, "Switched off")}>
              Switch off
            </Button>
          ) : (
            <Button size="xs" onClick={() => save({ status: "active" }, "Switched on")} data-activate>
              Switch on
            </Button>
          )}
          <Button size="xs" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => window.confirm(`Delete ${c.name}?`) && act("del", () => A.deleteConnectorAction(c.id), "Deleted")}>
            <Trash2Icon />
          </Button>
        </span>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {preset && (
            <p className="text-xs text-muted-foreground">
              Preset from {preset.docsUrl ? <a className="underline" href={preset.docsUrl} target="_blank" rel="noreferrer">the provider's documentation</a> : "the provider"}. Keys needed: {preset.secrets.map((s) => s.label).join(", ")}.
            </p>
          )}
          <DraftEditor draft={c} operations={c.operations} secretNames={c.secretNames} busy={busy === "save"} onSave={(d, secrets) => act("save", () => A.saveConnectorAction({ ...d, id: c.id, secrets, status: c.status, useForSystem: c.useForSystem }), "Saved")} />
          {c.capability === "email" && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={c.useForSystem} onChange={(e) => save({ useForSystem: e.target.checked }, e.target.checked ? "The app's own email now goes through it" : "Back to SMTP")} /> Use it for the app's own email (notifications, invitations, password resets) instead of SMTP
            </label>
          )}
          <div className="space-y-1 rounded-md border p-2" data-test>
            <p className="text-xs font-medium">Test with a real call</p>
            <div className="flex flex-wrap gap-1">
              {TEST_FIELDS[c.capability].map((f) => (
                <Input key={f} aria-label={`Test ${f}`} className="h-8 w-44" placeholder={f} value={vals[f] ?? ""} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} />
              ))}
              <Button
                size="sm"
                disabled={!!busy}
                onClick={async () => {
                  const r = await act<NonNullable<typeof result>>("test", () => A.testConnectorAction(c.id, vals));
                  if (r && r !== true) setResult(r);
                }}
                data-run-test
              >
                {busy === "test" && <Loader2Icon className="animate-spin" />} Send a test
              </Button>
            </div>
            {result && (
              <div className={cn("rounded p-2 text-xs", result.ok ? "bg-[#1E8E3E]/10" : "bg-[#D93025]/10")} data-test-result={result.ok ? "ok" : "failed"}>
                <p className="font-medium">{result.ok ? `Accepted (${result.status})` : `Not accepted (${result.status || "no answer"}): ${result.error}`}</p>
                {result.url && (
                  <p>
                    Link: <a className="underline" href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
                  </p>
                )}
                {result.id && <p>Id: {result.id}</p>}
                {result.body && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{result.body}</pre>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
