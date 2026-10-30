"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheckIcon, CircleDotIcon, CircleXIcon, ExternalLinkIcon, GitBranchIcon, GitCommitHorizontalIcon, GitPullRequestIcon, Loader2Icon, LockIcon, PlusIcon, RefreshCwIcon, SettingsIcon, StarIcon, TagIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Hint } from "@/components/app/primitives";
import { refreshGithubAction, saveGithubAction } from "@/app/actions/integrations";
import type { GithubOverview, RepoStatus } from "@/server/github";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => {
  if (!iso) return "never";
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 / 24 ? "just now" : d < 1 ? `${Math.round(d * 24)} h ago` : d < 2 ? "yesterday" : `${Math.round(d)} days ago`;
};

function Ci({ ci }: { ci: RepoStatus["ci"] }) {
  if (!ci) return <span className="text-xs text-muted-foreground">No CI runs</span>;
  const ok = ci.conclusion === "success";
  const bad = ci.conclusion && ["failure", "timed_out", "cancelled", "action_required"].includes(ci.conclusion);
  return (
    <a href={ci.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : bad ? "bg-[var(--st-blocked-bg)] text-[var(--st-blocked-fg)]" : "bg-[var(--st-paused-bg)] text-[var(--st-paused-fg)]")} title={`${ci.name}, ${when(ci.at)}`}>
      {ok ? <CircleCheckIcon className="size-3" /> : bad ? <CircleXIcon className="size-3" /> : <CircleDotIcon className="size-3 animate-pulse" />}
      {ok ? "Build passing" : bad ? "Build failing" : ci.status === "completed" ? (ci.conclusion ?? "Done") : "Building"}
    </a>
  );
}

function Spark({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  return (
    <span className="inline-flex h-6 items-end gap-0.5" title={`Commits per week, last 4 weeks: ${weeks.join(", ")}`}>
      {weeks.map((w, i) => (
        <span key={i} className="w-1.5 rounded-sm bg-primary/70" style={{ height: `${Math.max(8, (w / max) * 100)}%` }} />
      ))}
    </span>
  );
}

// Health of the repositories this department follows, with pull requests linked to its tasks.
export function GithubRepos({ dept, data, projects, taskHref }: { dept: string; data: GithubOverview; projects: { id: string; name: string }[]; taskHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [setup, setSetup] = React.useState(false);
  const refresh = async () => {
    setBusy(true);
    const r = await refreshGithubAction(dept);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  };
  const totals = data.repos.reduce(
    (a, r) => ({ prs: a.prs + (r.status?.openPrs.length ?? 0), issues: a.issues + (r.status?.openIssues ?? 0), failing: a.failing + (r.status?.ci?.conclusion === "failure" ? 1 : 0) }),
    { prs: 0, issues: 0, failing: 0 },
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border bg-card px-3 py-1.5">
            <span className="font-semibold tabular">{data.repos.length}</span> {data.repos.length === 1 ? "repository" : "repositories"}
          </span>
          <span className="rounded-lg border bg-card px-3 py-1.5">
            <span className="font-semibold tabular">{totals.prs}</span> open pull requests
          </span>
          <span className="rounded-lg border bg-card px-3 py-1.5">
            <span className="font-semibold tabular">{totals.issues}</span> open issues
          </span>
          {totals.failing > 0 && <span className="rounded-lg border border-[var(--st-blocked-fg)]/40 bg-[var(--st-blocked-bg)] px-3 py-1.5 text-[var(--st-blocked-fg)]">{totals.failing} failing builds</span>}
        </div>
        <div className="ml-auto flex gap-2">
          <Hint tip="Fetch the latest from GitHub now. It also refreshes by itself every 10 minutes.">
            <Button size="sm" variant="outline" onClick={refresh} disabled={busy || !data.repos.length}>
              {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Refresh
            </Button>
          </Hint>
          {data.canConfigure && (
            <Button size="sm" onClick={() => setSetup(true)}>
              <SettingsIcon /> Connect repositories
            </Button>
          )}
        </div>
      </div>
      {!data.repos.length ? (
        <EmptyState
          title="No repositories connected"
          description={data.canConfigure ? "Press Connect repositories and add owner/name for each repository, for example myseed/website. Add a token to read private ones." : "The department head connects GitHub repositories here."}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.repos.map((r) => {
            const s = r.status;
            const project = projects.find((p) => p.id === r.projectId);
            return (
              <Card key={r.fullName}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <a href={s?.url ?? `https://github.com/${r.fullName}`} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.fullName}
                    </a>
                    {s?.private && <LockIcon className="size-3.5 text-muted-foreground" />}
                    {s && <Ci ci={s.ci} />}
                  </CardTitle>
                  <CardDescription>
                    {[s?.description, s?.language, project && `Project: ${project.name}`].filter(Boolean).join(" · ") || " "}
                  </CardDescription>
                  <CardAction className="flex items-center gap-3 text-xs text-muted-foreground">
                    {s && <Spark weeks={s.weekly} />}
                    {s && (
                      <span className="flex items-center gap-1">
                        <StarIcon className="size-3" /> {s.stars}
                      </span>
                    )}
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!s ? (
                    <p className="text-muted-foreground">Not fetched yet. Press Refresh.</p>
                  ) : s.error ? (
                    <p className="text-[var(--st-blocked-fg)]">{s.error}</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <GitBranchIcon className="size-3" /> {s.defaultBranch}, last push {when(s.pushedAt)}
                        </span>
                        <span>{s.openIssues} open issues</span>
                        {s.release && (
                          <a href={s.release.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                            <TagIcon className="size-3" /> {s.release.tag}, {when(s.release.at)}
                          </a>
                        )}
                      </div>
                      {s.milestones.length > 0 && (
                        <div className="space-y-1.5">
                          {s.milestones.slice(0, 3).map((m) => {
                            const total = m.open + m.closed;
                            const p = total ? Math.round((m.closed / total) * 100) : 0;
                            return (
                              <a key={m.title} href={m.url} target="_blank" rel="noreferrer" className="block hover:underline">
                                <div className="flex justify-between text-xs">
                                  <span>{m.title}</span>
                                  <span className="text-muted-foreground tabular">
                                    {p}% · {m.open} open{m.dueOn ? ` · due ${new Date(m.dueOn).toLocaleDateString()}` : ""}
                                  </span>
                                </div>
                                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full bg-primary" style={{ width: `${p}%` }} />
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">Open pull requests ({s.openPrs.length})</p>
                        {s.openPrs.slice(0, 6).map((p) => (
                          <div key={p.number} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <GitPullRequestIcon className={cn("size-3.5 shrink-0", p.draft ? "text-muted-foreground" : "text-[var(--st-done-fg)]")} />
                            <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                              #{p.number} {p.title}
                            </a>
                            <span className="text-xs text-muted-foreground">
                              {p.author}, {when(p.createdAt)}
                            </span>
                            {p.tasks.map((code) =>
                              data.tasks[code] ? (
                                <Link key={code} href={`${taskHref}?task=${data.tasks[code]!.id}`} className="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary hover:underline" title={`${data.tasks[code]!.title} (${data.tasks[code]!.status})`}>
                                  {code}
                                </Link>
                              ) : null,
                            )}
                          </div>
                        ))}
                        {!s.openPrs.length && <p className="text-xs text-muted-foreground">None open.</p>}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">Latest commits</p>
                        {s.commits.slice(0, 4).map((c) => (
                          <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs hover:underline">
                            <GitCommitHorizontalIcon className="size-3 shrink-0" />
                            <span className="font-mono text-muted-foreground">{c.sha}</span>
                            <span className="min-w-0 flex-1 truncate">{c.message}</span>
                            <span className="shrink-0 text-muted-foreground">{when(c.at)}</span>
                          </a>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Updated {when(s.fetchedAt)}.{" "}
                        <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                          Open on GitHub <ExternalLinkIcon className="size-3" />
                        </a>
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Put a task code such as DEV-12 in a pull request title or branch name to link it to the task.</p>
      {setup && <Setup dept={dept} data={data} projects={projects} onClose={() => setSetup(false)} />}
    </div>
  );
}

function Setup({ dept, data, projects, onClose }: { dept: string; data: GithubOverview; projects: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [repos, setRepos] = React.useState(data.repos.map((r) => ({ fullName: r.fullName, projectId: r.projectId ?? "" })));
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const save = async (clearToken = false) => {
    setBusy(true);
    const r = await saveGithubAction(dept, { token: token || null, clearToken, repos: repos.filter((x) => x.fullName.trim()).map((x) => ({ fullName: x.fullName, projectId: x.projectId || null })) });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("GitHub connected. Fetching the repositories…");
    onClose();
    await refreshGithubAction(dept);
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect GitHub repositories</DialogTitle>
          <DialogDescription>Public repositories work without a token. For private ones, create a fine-grained token on GitHub (Settings, Developer settings) with read-only access to Contents, Metadata, Pull requests, Issues and Actions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {repos.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input value={r.fullName} onChange={(e) => setRepos(repos.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))} placeholder="owner/name or a github.com link" aria-label={`Repository ${i + 1}`} />
              <Select value={r.projectId || "__none"} onValueChange={(v) => setRepos(repos.map((x, j) => (j === i ? { ...x, projectId: v === "__none" ? "" : v } : x)))}>
                <SelectTrigger className="w-44" aria-label="Project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => setRepos(repos.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setRepos([...repos, { fullName: "", projectId: "" }])}>
            <PlusIcon /> Add repository
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="gh-token">Token (optional)</Label>
            <Input id="gh-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={data.hasToken ? "Saved; paste to replace" : "github_pat_…"} autoComplete="off" />
            <p className="text-xs text-muted-foreground">Stored encrypted. It also raises GitHub&apos;s limit from 60 to 5,000 requests an hour.</p>
          </div>
        </div>
        <DialogFooter>
          {data.hasToken && (
            <Button variant="ghost" onClick={() => save(true)} disabled={busy}>
              Remove token
            </Button>
          )}
          <Button onClick={() => save()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
