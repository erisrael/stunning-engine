// GitHub for a department (the Dev team by default): which repositories it follows, and for each one its health
// (CI, open pull requests and issues, milestones, releases, recent commits) read from the GitHub REST API and kept
// for ten minutes. Task codes (DEV-12) in pull request titles and branches link pull requests to tasks.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { seal, unseal } from "./secrets";
import { deptAccess, deptPeople, requireDept } from "./departments";
import { workAccess } from "./dept-config";
import type { AppUser } from "./users";

type Stored = { tokenEnc: string | null; repos: { fullName: string; projectId: string | null; members?: string[] }[] };
const TTL_MS = 10 * 60e3;
const key = (dept: string) => `int.github.${dept}`;

async function stored(dept: string): Promise<Stored> {
  return parseJson<Stored>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key(dept)))?.value, { tokenEnc: null, repos: [] });
}

export type GithubSettings = { hasToken: boolean; repos: { fullName: string; projectId: string | null; members?: string[] }[]; canConfigure: boolean; people: {id:string;name:string}[] };

export async function githubSettings(user: AppUser, dept: string): Promise<GithubSettings> {
  const a = await workAccess(user, dept);
  const s = await stored(dept);
  const access = await deptAccess(user,dept);
  const projects = await all<{project_id:string}>("SELECT DISTINCT project_id FROM dept_tasks WHERE dept=? AND assignee_id=? AND project_id IS NOT NULL",dept,user.id);
  const repos = access.manage ? s.repos : s.repos.filter(r => r.members?.includes(user.id) || (r.projectId && projects.some(p=>p.project_id===r.projectId)));
  return { hasToken: !!s.tokenEnc, repos, canConfigure: access.manage && !a.readOnly, people: access.manage ? (await deptPeople(dept)).map(p=>({id:p.id,name:p.name})) : [] };
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// Accepts owner/name or a github.com link.
export function parseRepo(input: string) {
  const v = input.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
  return REPO_RE.test(v) ? v : null;
}

export async function saveGithubSettings(user: AppUser, dept: string, input: { token?: string | null; clearToken?: boolean; repos: { fullName: string; projectId?: string | null; members?: string[] }[] }) {
  const a = await workAccess(user, dept, "write");
  await requireDept(user,dept,"manage");
  const people = (await deptPeople(dept)).map(p=>p.id);
  const repos: Stored["repos"] = [];
  for (const r of input.repos) {
    if(r.projectId && !await get("SELECT id FROM dept_projects WHERE id=? AND dept=?",r.projectId,dept)) throw new WorkflowError("VALIDATION","Choose a project in this department.");
    const fullName = parseRepo(r.fullName);
    if (!fullName) throw new WorkflowError("VALIDATION", `${r.fullName} is not a repository. Use owner/name, for example myseed/website.`);
    if (!repos.some((x) => x.fullName.toLowerCase() === fullName.toLowerCase())) repos.push({ fullName, projectId: r.projectId || null, members: [...new Set((r.members ?? []).filter(id=>people.includes(id)))] });
  }
  if (repos.length > 30) throw new WorkflowError("VALIDATION", "Follow at most 30 repositories.");
  const old = await stored(dept);
  const next: Stored = { tokenEnc: input.clearToken ? null : input.token?.trim() ? await seal(input.token.trim()) : old.tokenEnc, repos };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key(dept),
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await run("DELETE FROM integration_cache WHERE key LIKE ?", `gh:${dept}:%`);
  await audit({ actor: user }, { action: "integration.github", summary: `${user.name} changed GitHub for ${dept}: ${repos.map((r) => r.fullName).join(", ") || "no repositories"}` });
}

async function gh<T>(path: string, token: string | null): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "myseed-content-manager", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, status: res.status, message: j.message ?? res.statusText };
  }
  return { ok: true, data: (await res.json()) as T };
}

export type RepoStatus = {
  fullName: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  stars: number;
  pushedAt: string | null;
  language: string | null;
  ci: { status: string; conclusion: string | null; name: string; url: string; at: string } | null;
  // checks: the combined result of the pull request's check runs (success, failure, pending), for those naming tasks.
  openPrs: { number: number; title: string; url: string; author: string; draft: boolean; createdAt: string; branch: string; tasks: string[]; checks?: "success" | "failure" | "pending" | null }[];
  // Recently merged pull requests (for the flow: a merge can move the task on by itself).
  mergedPrs?: { number: number; title: string; url: string; branch: string; mergedAt: string; tasks: string[] }[];
  openIssues: number;
  milestones: { title: string; open: number; closed: number; dueOn: string | null; url: string }[];
  release: { name: string; tag: string; at: string; url: string } | null;
  commits: { sha: string; message: string; author: string; at: string; url: string }[];
  weekly: number[];
  error: string | null;
  fetchedAt: string;
};

async function fetchRepo(fullName: string, token: string | null): Promise<RepoStatus> {
  const base: RepoStatus = {
    fullName,
    url: `https://github.com/${fullName}`,
    description: null,
    defaultBranch: "main",
    private: false,
    stars: 0,
    pushedAt: null,
    language: null,
    ci: null,
    openPrs: [],
    openIssues: 0,
    milestones: [],
    release: null,
    commits: [],
    weekly: [0, 0, 0, 0],
    error: null,
    fetchedAt: nowIso(),
  };
  const repo = await gh<{ html_url: string; description: string | null; default_branch: string; private: boolean; stargazers_count: number; pushed_at: string; language: string | null; open_issues_count: number }>(`/repos/${fullName}`, token);
  if (!repo.ok)
    return {
      ...base,
      error:
        repo.status === 404
          ? "Not found. Check the name, or add a token that can read this private repository."
          : repo.status === 403 || repo.status === 429
            ? "GitHub's rate limit was reached. Add a token to raise it, then refresh."
            : `GitHub said: ${repo.message}`,
    };
  const since = new Date(Date.now() - 28 * 864e5).toISOString();
  const [prs, runs, milestones, release, commits, closed] = await Promise.all([
    gh<{ number: number; title: string; html_url: string; user: { login: string }; draft: boolean; created_at: string; head: { ref: string; sha: string } }[]>(`/repos/${fullName}/pulls?state=open&per_page=50`, token),
    gh<{ workflow_runs: { status: string; conclusion: string | null; name: string; html_url: string; created_at: string }[] }>(`/repos/${fullName}/actions/runs?per_page=1&branch=${encodeURIComponent(repo.data.default_branch)}`, token),
    gh<{ title: string; open_issues: number; closed_issues: number; due_on: string | null; html_url: string }[]>(`/repos/${fullName}/milestones?state=open&per_page=10`, token),
    gh<{ name: string | null; tag_name: string; published_at: string; html_url: string }>(`/repos/${fullName}/releases/latest`, token),
    gh<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }[]>(`/repos/${fullName}/commits?since=${since}&per_page=100`, token),
    gh<{ number: number; title: string; html_url: string; merged_at: string | null; head: { ref: string } }[]>(`/repos/${fullName}/pulls?state=closed&sort=updated&direction=desc&per_page=30`, token),
  ]);
  const prList = prs.ok ? prs.data : [];
  const commitList = commits.ok ? commits.data : [];
  const weekly = [0, 0, 0, 0];
  for (const c of commitList) {
    const w = Math.floor((Date.now() - Date.parse(c.commit.author.date)) / (7 * 864e5));
    if (w >= 0 && w < 4) weekly[3 - w]!++;
  }
  const codes = (t: string) => [...new Set((t.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) ?? []).map((x) => x.toUpperCase()))];
  const run0 = runs.ok ? runs.data.workflow_runs[0] : undefined;
  // The checks of up to ten open pull requests that name a task, so the code review sees them on the card.
  const checks = new Map<number, "success" | "failure" | "pending" | null>();
  await Promise.all(
    prList
      .filter((p) => codes(`${p.title} ${p.head.ref.toUpperCase()}`).length)
      .slice(0, 10)
      .map(async (p) => {
        const r = await gh<{ check_runs: { status: string; conclusion: string | null }[] }>(`/repos/${fullName}/commits/${p.head.sha}/check-runs?per_page=50`, token);
        if (!r.ok || !r.data.check_runs.length) return checks.set(p.number, null);
        const list = r.data.check_runs;
        checks.set(
          p.number,
          list.some((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion)) ? "failure" : list.some((c) => c.status !== "completed") ? "pending" : "success",
        );
      }),
  );
  return {
    ...base,
    url: repo.data.html_url,
    description: repo.data.description,
    defaultBranch: repo.data.default_branch,
    private: repo.data.private,
    stars: repo.data.stargazers_count,
    pushedAt: repo.data.pushed_at,
    language: repo.data.language,
    ci: run0 ? { status: run0.status, conclusion: run0.conclusion, name: run0.name, url: run0.html_url, at: run0.created_at } : null,
    openPrs: prList.map((p) => ({
      number: p.number,
      title: p.title,
      url: p.html_url,
      author: p.user.login,
      draft: p.draft,
      createdAt: p.created_at,
      branch: p.head.ref,
      tasks: codes(`${p.title} ${p.head.ref.toUpperCase()}`),
      checks: checks.get(p.number) ?? null,
    })),
    mergedPrs: (closed.ok ? closed.data : [])
      .filter((p) => p.merged_at)
      .map((p) => ({ number: p.number, title: p.title, url: p.html_url, branch: p.head.ref, mergedAt: p.merged_at!, tasks: codes(`${p.title} ${p.head.ref.toUpperCase()}`) }))
      .filter((p) => p.tasks.length),
    // GitHub counts pull requests as issues; take them out.
    openIssues: Math.max(0, repo.data.open_issues_count - prList.length),
    milestones: (milestones.ok ? milestones.data : []).map((m) => ({ title: m.title, open: m.open_issues, closed: m.closed_issues, dueOn: m.due_on, url: m.html_url })),
    release: release.ok ? { name: release.data.name || release.data.tag_name, tag: release.data.tag_name, at: release.data.published_at, url: release.data.html_url } : null,
    commits: commitList.slice(0, 8).map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split("\n")[0]!.slice(0, 120), author: c.commit.author.name, at: c.commit.author.date, url: c.html_url })),
    weekly,
  };
}

export type GithubOverview = Omit<GithubSettings, "repos"> & {
  repos: (GithubSettings["repos"][number] & { status: RepoStatus | null })[];
  tasks: Record<string, { id: string; title: string; status: string }>;
};

// Each repository's status, from the cache when it is fresh (force: fetch again now).
export async function githubOverview(user: AppUser, dept: string, opts: { force?: boolean } = {}): Promise<GithubOverview> {
  const settings = await githubSettings(user, dept);
  const s = await stored(dept);
  const token = s.tokenEnc ? await unseal(s.tokenEnc) : null;
  const out: GithubOverview["repos"] = [];
  for (const r of settings.repos) {
    const k = `gh:${dept}:${r.fullName.toLowerCase()}`;
    const cached = await get<{ data: string; fetched_at: string }>("SELECT data, fetched_at FROM integration_cache WHERE key = ?", k);
    let status = cached ? parseJson<RepoStatus | null>(cached.data, null) : null;
    if (opts.force || !cached || Date.now() - Date.parse(cached.fetched_at) > TTL_MS) {
      try {
        status = await fetchRepo(r.fullName, token);
        await run("INSERT INTO integration_cache (key, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at", k, JSON.stringify(status), nowIso());
      } catch (e) {
        status = status ?? null;
        if (status) status = { ...status, error: `Could not reach GitHub (${e instanceof Error ? e.message : e}). Showing the last result.` };
      }
    }
    out.push({ ...r, status });
  }
  // Tasks named in pull requests, with their status, so the board and GitHub tell the same story.
  const codes = [...new Set(out.flatMap((r) => r.status?.openPrs.flatMap((p) => p.tasks) ?? []))];
  const tasks: GithubOverview["tasks"] = {};
  if (codes.length) {
    const rows = await all<{ id: string; code: string; title: string; status: string }>(
      `SELECT id, code, title, status FROM dept_tasks WHERE dept = ? AND upper(code) IN (${codes.map(() => "?").join(",")})`,
      dept,
      ...codes,
    );
    for (const r of rows) tasks[r.code.toUpperCase()] = { id: r.id, title: r.title, status: r.status };
  }
  return { ...settings, repos: out, tasks };
}

// Pull requests naming each task code, from what was last fetched (no call to GitHub), for the flow cards.
export type TaskPr = { number: number; title: string; url: string; branch: string; state: "open" | "draft" | "merged"; checks: "success" | "failure" | "pending" | null; repo: string };
export async function cachedPrsByCode(dept: string) {
  const rows = await all<{ data: string }>("SELECT data FROM integration_cache WHERE key LIKE ?", `gh:${dept}:%`);
  const out = new Map<string, TaskPr[]>();
  const add = (code: string, pr: TaskPr) => out.set(code, [...(out.get(code) ?? []).filter((x) => !(x.repo === pr.repo && x.number === pr.number)), pr]);
  for (const r of rows) {
    const st = parseJson<RepoStatus | null>(r.data, null);
    if (!st) continue;
    for (const p of st.mergedPrs ?? []) for (const c of p.tasks) add(c, { number: p.number, title: p.title, url: p.url, branch: p.branch, state: "merged", checks: null, repo: st.fullName });
    for (const p of st.openPrs) for (const c of p.tasks) add(c, { number: p.number, title: p.title, url: p.url, branch: p.branch, state: p.draft ? "draft" : "open", checks: p.checks ?? null, repo: st.fullName });
  }
  // GitLab merge requests reported to the department's API (Phase 12b.5), the same way.
  const gl = await all<{ code: string; repo: string; number: number; title: string; url: string; branch: string; state: string }>("SELECT code, repo, number, title, url, branch, state FROM dev_merge_requests WHERE dept = ?", dept).catch(() => []);
  for (const r of gl) add(r.code, { number: Number(r.number), title: r.title, url: r.url, branch: r.branch, state: r.state as TaskPr["state"], checks: null, repo: r.repo });
  return out;
}

export async function addGithubCollaborator(user:AppUser,dept:string,input:{repo:string;username:string;permission:string}) {
 await requireDept(user,dept,"manage");await workAccess(user,dept,"write");
 const settings=await stored(dept);
 if(!settings.repos.some(r=>r.fullName===input.repo)) throw new WorkflowError("FORBIDDEN","Connect this repository to the department first.");
 if(!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(input.username)||!["pull","triage","push","maintain","admin"].includes(input.permission)) throw new WorkflowError("VALIDATION","Enter a GitHub username and supported permission.");
 const token=settings.tokenEnc?await unseal(settings.tokenEnc):null;
 if(!token) throw new WorkflowError("VALIDATION","Add a GitHub token with repository Administration write permission in Connect repositories.");
 const response=await fetch(`https://api.github.com/repos/${input.repo}/collaborators/${encodeURIComponent(input.username)}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json","User-Agent":"myseed-content-manager"},body:JSON.stringify({permission:input.permission}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
 if(![201,204].includes(response.status)) throw new WorkflowError("VALIDATION",`GitHub rejected the collaborator change (HTTP ${response.status}). Check the token and organization invitation policy.`);
 await audit({actor:user},{action:"github.collaborator",summary:`${user.name} granted ${input.permission} to ${input.username} on ${input.repo}`});
 return {message:response.status===201?"GitHub invitation sent; the collaborator must accept it.":"GitHub collaborator access updated."};
}
