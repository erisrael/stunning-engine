"use client";

// A department's Tools (Phases 12b.2, 12b.4, 12b.5): releases with versions and deployments per environment,
// incidents, test cases and runs, traceability, project templates, import and export, and (for the head) the API
// key, webhooks and Slack or Telegram notices.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, DownloadIcon, KeyRoundIcon, Loader2Icon, PlayIcon, PlusIcon, SirenIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/dev-tools";
import { cn } from "@/lib/utils";

type Releases = { environments: { name: string; latest: { version: string | null; at: string; status: string } | null }[]; releases: { id: string; name: string; version: string | null; task_count: number; created_at: string; deployments: { environment: string; status: string; at: string }[] }[] };
type Incident = { id: string; title: string; severity: string; status: string; started_at: string; resolved_at: string | null; source: string; url: string | null; bug_task_id: string | null; postmortem_doc_id: string | null; timeline: { at: string; text: string }[] };
type Case = { id: string; title: string; steps: string; expected: string; requirement: string | null; doc_id: string | null; last: { result: string; at: string } | null; runs: number };
type Template = { id: string; name: string; description: string; builtIn: boolean; body: { epics: { title: string; tasks: { title: string }[] }[]; milestones: { name: string }[] } };
type Tools = { keyHint: string | null; webhooks: { id: string; url: string; events: string[] }[]; slack: boolean; telegram: { chatId: string } | null; notify: string[] } | null;
type Trace = { title: string; rows: { requirement: string; tasks: { code: string; done: boolean }[]; pullRequests: { number: number; state: string }[]; tests: { title: string; result: string | null }[]; release: string | null; covered: boolean }[]; uncovered: string[] };

type Epic = { id: string; code: string; title: string; project: string | null; due: string | null; children: number; done: number; progress: number };
type Drift = { savedAt: string | null; tracked: number; rows: { id: string; code: string; title: string; baseDue: string | null; due: string | null; slipDays: number }[] };
type Portfolio = { dept: string; deptTitle: string; id: string; name: string; [k: string]: unknown };

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const SEV: Record<string, string> = { sev1: "bg-[#D93025] text-white", sev2: "bg-[#E8710A] text-white", sev3: "bg-[#F9AB00]/30", sev4: "bg-muted" };
const RES: Record<string, string> = { pass: "text-[#188038]", fail: "text-[#D93025]", blocked: "text-[#E8710A]" };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} data-tools-section={id}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

export function DevToolsView(props: { dept: string; releases: Releases; incidents: Incident[]; cases: Case[]; docs: { id: string; title: string; kind: string }[]; templates: Template[]; tools: Tools; nextVersion: string; canWrite: boolean; canProjects: boolean; canConfigure: boolean; epics: Epic[]; drift: Drift; portfolio: Portfolio[] | null }) {
  const router = useRouter();
  const d = props.dept;
  const [busy, setBusy] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const go = async <T,>(k: string, p: () => Promise<{ ok: boolean; error?: string; data?: T }>, msg: (d: T | undefined) => string) => {
    setBusy(k);
    const r = await p();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(msg(r.data));
    router.refresh();
    return r.data;
  };
  const [inc, setInc] = React.useState({ title: "", severity: "sev3" });
  const [note, setNote] = React.useState<Record<string, string>>({});
  const [tc, setTc] = React.useState({ title: "", steps: "", expected: "", requirement: "", docId: "" });
  const [trace, setTrace] = React.useState<Trace | null>(null);
  const [tpl, setTpl] = React.useState<{ id: string; name: string; key: string; start: string } | null>(null);
  const [imp, setImp] = React.useState<{ source: "jira" | "trello" | "asana"; text: string; includeDone: boolean }>({ source: "jira", text: "", includeDone: false });
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [hook, setHook] = React.useState({ url: props.tools?.webhooks[0]?.url ?? "", slack: "", tgToken: "", tgChat: props.tools?.telegram?.chatId ?? "" });
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setImp({ ...imp, text: String(rd.result), source: f.name.endsWith(".json") ? "trello" : imp.source });
    rd.readAsText(f);
  };
  return (
    <div className="space-y-4" data-dev-tools>
      <Section id="releases" title="Releases and deployments" description={`Versions like 1.4.0 (next: ${props.nextVersion}). CI/CD reports each deployment with the API key; a deployment links to its release by version.`}>
        <div className="flex flex-wrap gap-2">
          {props.releases.environments.length ? (
            props.releases.environments.map((e) => (
              <div key={e.name} className="rounded-lg border px-3 py-2" data-environment={e.name}>
                <p className="text-xs text-muted-foreground uppercase">{e.name}</p>
                <p className="font-semibold">{e.latest?.version ?? "-"}</p>
                <p className="text-xs text-muted-foreground">{e.latest ? when(e.latest.at) : "never"}</p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No deployments reported yet.</p>
          )}
        </div>
        <ul className="divide-y">
          {props.releases.releases.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {r.version ? `v${r.version}` : "no version"} · {r.task_count} tasks · {when(r.created_at)}
              </span>
              <span className="flex-1 text-xs">{r.deployments.map((x) => `${x.environment} ${x.status === "ok" ? "✓" : "✗"}`).join(", ")}</span>
              {props.canWrite && !r.version && (
                <Button size="xs" variant="outline" onClick={() => { const v = prompt("Version, for example 1.4.0", props.nextVersion); if (v) void go("ver", () => A.setReleaseVersionAction(d, r.id, v), () => "Version set"); }}>
                  Set version
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="incidents" title="Incidents" description="Opened by monitoring (Sentry or another tool with the API key) or by hand; each opens a bug. Resolving them gives DORA's time to restore.">
        {props.canWrite && (
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Incident title" className="min-w-60 flex-1" placeholder="What is wrong" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
            <select aria-label="Severity" className="h-9 rounded-md border bg-background px-2" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>
              <option value="sev1">SEV1 (down)</option>
              <option value="sev2">SEV2 (major)</option>
              <option value="sev3">SEV3 (minor)</option>
              <option value="sev4">SEV4 (cosmetic)</option>
            </select>
            <Button size="sm" disabled={!inc.title.trim() || !!busy} onClick={() => go("inc", () => A.incidentAction(d, { title: inc.title, severity: inc.severity }), () => (setInc({ title: "", severity: "sev3" }), "Incident opened, with a bug"))}>
              <SirenIcon /> Open an incident
            </Button>
          </div>
        )}
        {!props.incidents.length && <p className="text-muted-foreground">No incidents.</p>}
        {props.incidents.map((i) => (
          <div key={i.id} className="rounded-lg border p-2" data-incident={i.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold uppercase", SEV[i.severity])}>{i.severity}</span>
              <span className="flex-1 font-medium">{i.title}</span>
              <span className="text-xs text-muted-foreground">
                {i.status === "open" ? `open since ${when(i.started_at)}` : `resolved ${when(i.resolved_at!)}`} · {i.source}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {i.timeline.slice(-4).map((t, k) => (
                <li key={k}>
                  {when(t.at)}: {t.text}
                </li>
              ))}
            </ul>
            {props.canWrite && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Input aria-label={`Note on ${i.title}`} className="h-8 min-w-48 flex-1" placeholder="Add to the timeline" value={note[i.id] ?? ""} onChange={(e) => setNote({ ...note, [i.id]: e.target.value })} />
                <Button size="xs" variant="outline" disabled={!note[i.id]?.trim()} onClick={() => go("note", () => A.incidentAction(d, { id: i.id, note: note[i.id] }), () => (setNote({ ...note, [i.id]: "" }), "Added"))}>
                  Add
                </Button>
                {i.status === "open" && (
                  <Button size="xs" onClick={() => go("res", () => A.incidentAction(d, { id: i.id, resolve: true }), () => "Resolved")}>
                    Resolve
                  </Button>
                )}
                <select aria-label="Postmortem" className="h-8 rounded-md border bg-background px-2 text-xs" value={i.postmortem_doc_id ?? ""} onChange={(e) => go("pm", () => A.incidentAction(d, { id: i.id, postmortemDocId: e.target.value || null }), () => "Postmortem linked")}>
                  <option value="">No postmortem linked</option>
                  {props.docs.filter((x) => x.kind === "postmortem").map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </Section>

      <Section id="tests" title="Test cases and runs" description="Linked to a requirement (FR-1). A failed run files a bug with the steps to reproduce; test runners can report with the API key.">
        {props.canWrite && (
          <div className="grid gap-2 rounded-lg border p-2 sm:grid-cols-2" data-test-form>
            <Input aria-label="Test title" placeholder="Test title" value={tc.title} onChange={(e) => setTc({ ...tc, title: e.target.value })} />
            <div className="flex gap-2">
              <Input aria-label="Requirement" placeholder="Requirement, e.g. FR-1" value={tc.requirement} onChange={(e) => setTc({ ...tc, requirement: e.target.value })} />
              <select aria-label="Document" className="h-9 rounded-md border bg-background px-2" value={tc.docId} onChange={(e) => setTc({ ...tc, docId: e.target.value })}>
                <option value="">Any document</option>
                {props.docs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </div>
            <Textarea aria-label="Steps" rows={3} placeholder="Steps" value={tc.steps} onChange={(e) => setTc({ ...tc, steps: e.target.value })} />
            <Textarea aria-label="Expected result" rows={3} placeholder="Expected result" value={tc.expected} onChange={(e) => setTc({ ...tc, expected: e.target.value })} />
            <div>
              <Button size="sm" disabled={!tc.title.trim()} onClick={() => go("tc", () => A.saveTestCaseAction(d, { ...tc, docId: tc.docId || null }), () => (setTc({ title: "", steps: "", expected: "", requirement: "", docId: "" }), "Test case added"))}>
                <PlusIcon /> Add test case
              </Button>
            </div>
          </div>
        )}
        <ul className="divide-y">
          {props.cases.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5" data-test-case={c.id}>
              <span className="w-14 text-xs font-medium">{c.requirement ?? "-"}</span>
              <span className="flex-1">{c.title}</span>
              <span className={cn("text-xs font-medium", RES[c.last?.result ?? ""])}>{c.last ? `${c.last.result} · ${when(c.last.at)}` : "not run"}</span>
              {props.canWrite &&
                (["pass", "fail", "blocked"] as const).map((r) => (
                  <Button key={r} size="xs" variant="outline" onClick={() => go("run", () => A.recordTestRunAction(d, { caseId: c.id, result: r }), (x) => ((x as { bugTaskId?: string } | undefined)?.bugTaskId ? "Failed; a bug was filed" : `Recorded ${r}`))}>
                    {r === "pass" ? "Pass" : r === "fail" ? "Fail" : "Blocked"}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="trace" title="Traceability" description="Each requirement of a document through its tasks, pull or merge requests, tests and the release.">
        <select aria-label="Document to trace" className="h-9 rounded-md border bg-background px-2" defaultValue="" onChange={async (e) => { if (!e.target.value) return setTrace(null); const r = await A.traceabilityAction(d, e.target.value); if (r.ok && r.data) setTrace(r.data); }}>
          <option value="">Choose a document</option>
          {props.docs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
        {trace && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-trace>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-1">Requirement</th>
                  <th className="p-1">Tasks</th>
                  <th className="p-1">Pull requests</th>
                  <th className="p-1">Tests</th>
                  <th className="p-1">Release</th>
                </tr>
              </thead>
              <tbody>
                {trace.rows.map((r) => (
                  <tr key={r.requirement} className={cn("border-t", !r.covered && "bg-[#F9AB00]/10")}>
                    <td className="p-1 font-medium">{r.requirement}</td>
                    <td className="p-1">{r.tasks.map((t) => `${t.code}${t.done ? " ✓" : ""}`).join(", ") || "none"}</td>
                    <td className="p-1">{r.pullRequests.map((p) => `#${p.number} ${p.state}`).join(", ") || "none"}</td>
                    <td className="p-1">{r.tests.map((t) => `${t.title} (${t.result ?? "not run"})`).join(", ") || "none"}</td>
                    <td className="p-1">{r.release ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trace.uncovered.length > 0 && <p className="mt-1 text-xs text-[#E8710A]">Not covered by both a task and a test: {trace.uncovered.join(", ")}</p>}
          </div>
        )}
      </Section>

      <Section id="plan" title="Epics and baseline" description="Each epic's progress from its child tasks. Save a baseline to see which tasks slipped against the plan.">
        {props.epics.length === 0 ? (
          <p className="text-muted-foreground">No epics yet. Make a task of type Epic, or start a project from a template.</p>
        ) : (
          <div className="space-y-1.5">
            {props.epics.map((e) => (
              <div key={e.id} className="flex items-center gap-2" data-epic={e.code}>
                <span className="w-20 shrink-0 font-mono text-xs">{e.code}</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <div className="h-2 w-28 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-[#188038]" style={{ width: `${e.progress}%` }} />
                </div>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {e.done}/{e.children} · {e.progress}%
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground" data-baseline-info>
            {props.drift.savedAt ? `Baseline of ${props.drift.tracked} tasks saved ${when(props.drift.savedAt)}` : "No baseline saved yet."}
          </span>
          {props.canProjects && (
            <Button size="xs" variant="outline" disabled={!!busy} onClick={() => go("base", () => A.saveBaselineAction(d, null), (n) => `Baseline saved for ${n ?? 0} tasks`)}>
              Save baseline now
            </Button>
          )}
        </div>
        {props.drift.rows.length > 0 && (
          <ul className="space-y-1" data-drift>
            {props.drift.rows.slice(0, 15).map((r) => (
              <li key={r.id} className="flex gap-2 text-xs">
                <span className="w-20 font-mono">{r.code}</span>
                <span className="flex-1 truncate">{r.title}</span>
                <span className={r.slipDays > 0 ? "text-[#D93025]" : "text-[#188038]"}>
                  {r.slipDays > 0 ? `${r.slipDays} days late` : `${-r.slipDays} days early`} (plan {r.baseDue ?? "-"}, now {r.due ?? "-"})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {props.portfolio && (
        <Section id="portfolio" title="Portfolio" description="Every department's projects you can see, side by side.">
          {props.portfolio.length === 0 ? (
            <p className="text-muted-foreground">No projects yet.</p>
          ) : (
            <table className="w-full text-xs" data-portfolio>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Department</th>
                  <th>Project</th>
                  <th>Progress</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {props.portfolio.map((p) => (
                  <tr key={`${p.dept}-${p.id}`} className="border-t">
                    <td className="py-1">{p.deptTitle}</td>
                    <td>{p.name}</td>
                    <td>{typeof p.progress === "number" ? `${p.progress}%` : "-"}</td>
                    <td>{typeof p.due_date === "string" ? p.due_date : "-"}{typeof p.health === "string" && p.health !== "on_track" ? ` · ${String(p.health).replace("_", " ")}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      <Section id="templates" title="Project templates" description="Start a project with its epics, milestones, tasks and documents. Heads and Admin add their own.">
        <div className="grid gap-2 sm:grid-cols-2">
          {props.templates.map((t) => (
            <div key={t.id} className="rounded-lg border p-2" data-template={t.id}>
              <p className="font-medium">
                {t.name} {t.builtIn && <span className="text-xs font-normal text-muted-foreground">(ready)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <p className="text-xs text-muted-foreground">
                {t.body.epics.length} epics · {t.body.epics.reduce((n, e) => n + e.tasks.length, 0)} tasks · {t.body.milestones.length} milestones
              </p>
              {props.canProjects && (
                <Button size="xs" variant="outline" className="mt-1" onClick={() => setTpl({ id: t.id, name: t.name, key: "", start: new Date().toISOString().slice(0, 10) })}>
                  Start a project
                </Button>
              )}
            </div>
          ))}
        </div>
        {tpl && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[#1A73E8]/30 bg-[#1A73E8]/5 p-2" data-apply-template>
            <Input aria-label="Project name" className="w-56" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} />
            <Input aria-label="Project key" className="w-28" placeholder="KEY" value={tpl.key} onChange={(e) => setTpl({ ...tpl, key: e.target.value.toUpperCase() })} />
            <Input aria-label="Start date" type="date" className="w-44" value={tpl.start} onChange={(e) => setTpl({ ...tpl, start: e.target.value })} />
            <Button size="sm" disabled={!tpl.name.trim() || !tpl.key.trim() || !!busy} onClick={() => go("tpl", () => A.applyTemplateAction(d, tpl.id, { name: tpl.name, key: tpl.key, start: tpl.start }), (x) => (setTpl(null), `Project started with ${(x as { tasks: number } | undefined)?.tasks ?? 0} tasks`))}>
              {busy === "tpl" && <Loader2Icon className="animate-spin" />} Create the project
            </Button>
          </div>
        )}
      </Section>

      <Section id="import" title="Import and export" description="From Jira (CSV), Trello (board JSON) or Asana (CSV); finished items are left out unless you tick them. Export to Jira's CSV or MS Project.">
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted" href={`/api/dept-export/${d}?format=jira`}>
            <DownloadIcon className="size-4" /> Jira CSV
          </a>
          <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted" href={`/api/dept-export/${d}?format=msproject`}>
            <DownloadIcon className="size-4" /> MS Project XML
          </a>
        </div>
        {props.canWrite && (
          <div className="space-y-2 rounded-lg border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Import from" className="h-9 rounded-md border bg-background px-2" value={imp.source} onChange={(e) => setImp({ ...imp, source: e.target.value as "jira" })}>
                <option value="jira">Jira CSV</option>
                <option value="trello">Trello JSON</option>
                <option value="asana">Asana CSV</option>
              </select>
              <Input aria-label="Import file" type="file" accept=".csv,.json" className="w-64" onChange={(e) => pickFile(e.target.files?.[0])} />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={imp.includeDone} onChange={(e) => setImp({ ...imp, includeDone: e.target.checked })} /> include finished items
              </label>
              <Button size="sm" disabled={!imp.text || !!busy} onClick={() => go("imp", () => A.importFromAction(d, imp.source, imp.text, imp.includeDone), (x) => { const r = x as { created: number; errors: string[]; skippedDone: number }; return `Imported ${r.created}${r.skippedDone ? `; ${r.skippedDone} finished left out` : ""}${r.errors.length ? `; ${r.errors.length} refused` : ""}`; })}>
                <UploadIcon /> Import
              </Button>
            </div>
          </div>
        )}
      </Section>

      {props.tools && (
        <Section id="integrations" title="Integrations (head only)" description="The key lets CI/CD, monitoring, test runners and GitLab report here. Webhooks and channel notices tell other tools what happens.">
          <div className="space-y-1">
            <p>
              API key: <span className="font-mono">{props.tools.keyHint ?? "none yet"}</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => go<string>("key", () => A.newApiKeyAction(d), (k) => (setNewKey(k ?? null), "New key made; copy it now"))}>
              <KeyRoundIcon /> {props.tools.keyHint ? "Replace the key" : "Make a key"}
            </Button>
            {newKey && (
              <div className="rounded-lg border border-[#E8710A]/40 bg-[#E8710A]/5 p-2 text-xs" data-new-key>
                <p className="font-medium">Copy it now; it is not shown again.</p>
                <p className="font-mono break-all">{newKey}</p>
                <Button size="xs" variant="ghost" onClick={() => void navigator.clipboard.writeText(newKey)}>
                  <CopyIcon /> Copy
                </Button>
              </div>
            )}
            <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">{`POST ${origin}/api/dev/${d}/events
Authorization: Bearer <key>
{"type":"deploy","environment":"production","version":"1.4.0","status":"ok"}
{"type":"incident","title":"Login fails","severity":"sev2","id":"mon-1"}
{"type":"test_run","caseTitle":"Download on a slow network","result":"pass"}
GitLab: add a webhook to ${origin}/api/dev/${d}/events with the key as the secret token.
Sentry: ${origin}/api/dev/${d}/events?key=<key>`}</pre>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="wh-url">Webhook (all events)</Label>
              <Input id="wh-url" placeholder="https://..." value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wh-slack">Slack incoming webhook</Label>
              <Input id="wh-slack" placeholder={props.tools.slack ? "Saved. Type to replace." : "https://hooks.slack.com/services/..."} value={hook.slack} onChange={(e) => setHook({ ...hook, slack: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wh-tg">Telegram bot token</Label>
              <Input id="wh-tg" type="password" placeholder={props.tools.telegram ? "Saved. Type to replace." : "123456:ABC..."} value={hook.tgToken} onChange={(e) => setHook({ ...hook, tgToken: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wh-chat">Telegram chat ID</Label>
              <Input id="wh-chat" placeholder="-100123456789" value={hook.tgChat} onChange={(e) => setHook({ ...hook, tgChat: e.target.value })} />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() =>
              go("hooks", () =>
                A.saveToolsSettingsAction(d, {
                  webhooks: hook.url ? [{ url: hook.url, events: ["task.created", "task.status", "release", "deploy", "incident", "test.failed"] }] : [],
                  ...(hook.slack ? { slack: hook.slack } : {}),
                  ...(hook.tgChat ? { telegram: { token: hook.tgToken || null, chatId: hook.tgChat } } : {}),
                }), () => "Saved")
            }
          >
            <PlayIcon /> Save integrations
          </Button>
        </Section>
      )}
    </div>
  );
}
