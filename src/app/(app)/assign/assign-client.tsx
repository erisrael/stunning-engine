"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, CircleXIcon, ListChecksIcon, Loader2Icon, SearchIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/app/primitives";
import { MultiSelect } from "@/components/app/multi-select";
import { bulkAssignAction } from "@/app/actions/editorial";
import type { AssignCandidate } from "@/server/editorial";
import { STAGE_LABELS, STATUS_LABELS, type AttemptStatus, type Stage } from "@/lib/domain";
import { endOfLocalDayIso, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type Person = { id: string; name: string; open: number };
type Template = { id: string; name: string; lines: number; verify: number };
type Split = "even" | "units" | "balance";

const TOGGLE = "px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary";

function stateLabel(r: AssignCandidate, stage: Stage) {
  if (r.stage_done) return { text: "Done", tone: "done" };
  if (r.lifecycle === "draft") return { text: "Not started", tone: "neutral" };
  if (r.stage === stage) return { text: STATUS_LABELS[r.stage_status as AttemptStatus] ?? "-", tone: "active" };
  return { text: `In ${STAGE_LABELS[r.stage as Stage] ?? "-"}`, tone: "neutral" };
}

export function AssignWizard(props: {
  stage: Stage;
  stages: Stage[];
  mode: "grade" | "subject";
  gradeIds: string[];
  subjectIds: string[];
  grades: Opt[];
  subjects: Opt[];
  offered: string[];
  candidates: { rows: AssignCandidate[]; capped: boolean } | null;
  people: Person[];
  names: Record<string, string>;
  templates: Template[];
  tz: string;
  allStages: Stage[];
}) {
  const { stage, mode, gradeIds, subjectIds, grades, subjects, offered, candidates, people, names, templates, tz } = props;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // Second filter only offers what is taught in the first: subjects of the chosen grades, or grades of the chosen subjects.
  const subjectOptions = mode === "grade" && gradeIds.length ? subjects.filter((s) => gradeIds.some((g) => offered.includes(`${g}|${s.id}`))) : subjects;
  const gradeOptions = mode === "subject" && subjectIds.length ? grades.filter((g) => subjectIds.some((s) => offered.includes(`${g.id}|${s}`))) : grades;

  // List filters (in the browser; the server already limited rows to the chosen grades and subjects).
  const [show, setShow] = React.useState<"open" | "unassigned" | "all">("open");
  const [owner, setOwner] = React.useState<string[]>([]);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"curriculum" | "code" | "title" | "owner" | "due">("curriculum");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSelected(new Set()), [stage, gradeIds.join(), subjectIds.join()]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (candidates?.rows ?? []).filter((r) => {
      if (show === "open" && r.stage_done) return false;
      if (show === "unassigned" && (r.owner_id || r.stage_done)) return false;
      if (owner.length && !owner.includes(r.owner_id ?? "none")) return false;
      if (needle && !`${r.code} ${r.title} ${r.unit_title ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const by = (a: AssignCandidate, b: AssignCandidate) =>
      sort === "code"
        ? a.code.localeCompare(b.code, undefined, { numeric: true })
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "owner"
            ? (names[a.owner_id ?? ""] ?? "~").localeCompare(names[b.owner_id ?? ""] ?? "~")
            : sort === "due"
              ? (a.due_at ?? "9").localeCompare(b.due_at ?? "9")
              : 0;
    const first = (r: AssignCandidate) => (mode === "grade" ? [r.grade_sort, r.subject_sort] : [r.subject_sort, r.grade_sort]);
    return [...list].sort((a, b) => {
      const [a1, a2] = first(a);
      const [b1, b2] = first(b);
      return a1 - b1 || a2 - b2 || (a.unit_number ?? 999) - (b.unit_number ?? 999) || by(a, b) || (a.part_number ?? 0) - (b.part_number ?? 0) || a.code.localeCompare(b.code);
    });
  }, [candidates, show, owner, q, sort, mode, names]);

  // Grade (or subject) → subject (or grade) → unit.
  const groups = React.useMemo(() => {
    const out: { key: string; label: string; units: { key: string; label: string; rows: AssignCandidate[] }[] }[] = [];
    for (const r of rows) {
      const top = mode === "grade" ? `${r.grade} · ${r.subject}` : `${r.subject} · ${r.grade}`;
      const topKey = `${r.grade_id}|${r.subject_id}`;
      let g = out.find((x) => x.key === topKey);
      if (!g) out.push((g = { key: topKey, label: top, units: [] }));
      const uKey = `${topKey}|${r.unit_id ?? "none"}`;
      let u = g.units.find((x) => x.key === uKey);
      if (!u) g.units.push((u = { key: uKey, label: r.unit_number != null ? `Unit ${r.unit_number}${r.unit_title && !/^unit \d+$/i.test(r.unit_title) ? `: ${r.unit_title}` : ""}` : "No unit", rows: [] }));
      u.rows.push(r);
    }
    return out;
  }, [rows, mode]);

  const toggleMany = (list: AssignCandidate[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of list) on ? next.add(r.id) : next.delete(r.id);
      return next;
    });
  const state = (list: AssignCandidate[]) => {
    const n = list.filter((r) => selected.has(r.id)).length;
    return n === 0 ? false : n === list.length ? true : ("indeterminate" as const);
  };
  const flip = (k: string) => setCollapsed((c) => (c.has(k) ? (c.delete(k), new Set(c)) : new Set(c.add(k))));
  const chosen = rows.filter((r) => selected.has(r.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stage} onValueChange={(v) => go({ stage: v })}>
            <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && go({ mode: v === "grade" ? null : v })}>
            <ToggleGroupItem value="grade" className={TOGGLE}>
              Grade → Subject
            </ToggleGroupItem>
            <ToggleGroupItem value="subject" className={TOGGLE}>
              Subject → Grade
            </ToggleGroupItem>
          </ToggleGroup>
          {(mode === "grade" ? ["g", "s"] : ["s", "g"]).map((k) =>
            k === "g" ? (
              <MultiSelect key={k} label="Grade" placeholder="Choose grades" options={gradeOptions.map((g) => ({ value: g.id, label: g.name }))} value={gradeIds} onChange={(v) => go({ g: v.join(",") || null })} />
            ) : (
              <MultiSelect key={k} label="Subject" placeholder="Choose subjects" options={subjectOptions.map((s) => ({ value: s.id, label: s.name }))} value={subjectIds} onChange={(v) => go({ s: v.join(",") || null })} />
            ),
          )}
        </div>

        {!candidates ? (
          <EmptyState icon={<UsersIcon className="size-5" />} title={`Choose a ${mode === "grade" ? "grade" : "subject"} to start`} description="Parts appear here grouped by unit; select whole units or single parts." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={show} onValueChange={(v) => setShow(v as typeof show)}>
                <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Show">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Not done in {STAGE_LABELS[stage]}</SelectItem>
                  <SelectItem value="unassigned">Unassigned only</SelectItem>
                  <SelectItem value="all">Everything</SelectItem>
                </SelectContent>
              </Select>
              <MultiSelect
                label="Assignee"
                placeholder="Any assignee"
                options={[{ value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
                value={owner}
                onChange={setOwner}
              />
              <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="curriculum">Sort: part order</SelectItem>
                  <SelectItem value="code">Sort: code</SelectItem>
                  <SelectItem value="title">Sort: title</SelectItem>
                  <SelectItem value="owner">Sort: assignee</SelectItem>
                  <SelectItem value="due">Sort: due date</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title, unit" className="h-8 w-52 pl-7 text-sm" />
              </div>
              <span className="ml-auto text-xs text-muted-foreground tabular">
                {rows.length} parts{candidates.capped && " (first 3,000)"} · {chosen.length} selected
              </span>
            </div>

            {!rows.length ? (
              <EmptyState title="Nothing to show" description="Change the filters above." />
            ) : (
              <div className="rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/50 px-2 py-1.5 text-xs">
                  <Checkbox checked={state(rows)} onCheckedChange={(v) => toggleMany(rows, !!v)} aria-label="Select all shown" />
                  <span className="font-medium">Select all shown</span>
                </div>
                {groups.map((g) => {
                  const all = g.units.flatMap((u) => u.rows);
                  return (
                    <div key={g.key} className="border-b last:border-b-0">
                      <div className="flex items-center gap-2 bg-muted/25 px-2 py-1.5">
                        <Checkbox checked={state(all)} onCheckedChange={(v) => toggleMany(all, !!v)} aria-label={`Select ${g.label}`} />
                        <button type="button" className="flex flex-1 items-center gap-1 text-left text-sm font-semibold" onClick={() => flip(g.key)}>
                          {collapsed.has(g.key) ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />} {g.label}
                        </button>
                        <span className="text-xs text-muted-foreground tabular">{all.length}</span>
                      </div>
                      {!collapsed.has(g.key) &&
                        g.units.map((u) => (
                          <div key={u.key}>
                            <div className="flex items-center gap-2 px-2 py-1 pl-7">
                              <Checkbox checked={state(u.rows)} onCheckedChange={(v) => toggleMany(u.rows, !!v)} aria-label={`Select ${u.label}`} />
                              <button type="button" className="flex flex-1 items-center gap-1 text-left text-xs font-medium" onClick={() => flip(u.key)}>
                                {collapsed.has(u.key) ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />} {u.label}
                              </button>
                              <span className="text-xs text-muted-foreground tabular">{u.rows.length}</span>
                            </div>
                            {!collapsed.has(u.key) &&
                              u.rows.map((r) => {
                                const st = stateLabel(r, stage);
                                return (
                                  <label key={r.id} className={cn("flex cursor-pointer items-center gap-2 border-t border-dashed px-2 py-1 pl-12 text-xs hover:bg-muted/40", selected.has(r.id) && "bg-primary/5")}>
                                    <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleMany([r], !!v)} />
                                    <span className="w-10 shrink-0 text-muted-foreground tabular">{r.part_number != null ? `P${r.part_number}` : "-"}</span>
                                    <span className="min-w-0 flex-1 truncate">
                                      {r.title}
                                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{r.code}</span>
                                    </span>
                                    {r.checklist && (
                                      <span className="hidden items-center gap-0.5 text-muted-foreground sm:inline-flex" title={`Checklist: ${r.checklist}`}>
                                        <ListChecksIcon className="size-3" />
                                      </span>
                                    )}
                                    <span className="hidden w-24 truncate text-muted-foreground md:block">{r.due_at ? fmtDate(r.due_at, tz) : ""}</span>
                                    <span className={cn("w-28 truncate", r.owner_id ? "" : "text-muted-foreground italic")}>{r.owner_id ? names[r.owner_id] : "Unassigned"}</span>
                                    <span
                                      className="w-24 truncate rounded px-1.5 py-0.5 text-center text-[10px] font-medium"
                                      style={{ background: `var(--st-${st.tone}-bg)`, color: `var(--st-${st.tone}-fg)` }}
                                    >
                                      {st.text}
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AssignPanel stage={stage} chosen={chosen} people={people} templates={templates} tz={tz} onDone={() => (setSelected(new Set()), router.refresh())} />
    </div>
  );
}

function plan(chosen: AssignCandidate[], people: Person[], split: Split): Map<string, string> {
  const out = new Map<string, string>();
  if (!people.length) return out;
  if (people.length === 1 || split === "even") {
    // Consecutive blocks, so each person gets neighbouring parts.
    const size = Math.ceil(chosen.length / people.length);
    chosen.forEach((r, i) => out.set(r.id, people[Math.min(people.length - 1, Math.floor(i / size))].id));
    return out;
  }
  const load = new Map(people.map((p) => [p.id, split === "balance" ? p.open : 0]));
  const lightest = () => [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
  if (split === "units") {
    const units = new Map<string, AssignCandidate[]>();
    for (const r of chosen) {
      const k = `${r.grade_id}|${r.subject_id}|${r.unit_id ?? r.id}`;
      units.set(k, [...(units.get(k) ?? []), r]);
    }
    for (const list of [...units.values()].sort((a, b) => b.length - a.length)) {
      const p = lightest();
      for (const r of list) out.set(r.id, p);
      load.set(p, load.get(p)! + list.length);
    }
    return out;
  }
  for (const r of chosen) {
    const p = lightest();
    out.set(r.id, p);
    load.set(p, load.get(p)! + 1);
  }
  return out;
}

function AssignPanel({ stage, chosen, people, templates, tz, onDone }: { stage: Stage; chosen: AssignCandidate[]; people: Person[]; templates: Template[]; tz: string; onDone: () => void }) {
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [split, setSplit] = React.useState<Split>("even");
  const [due, setDue] = React.useState<"keep" | "set" | "clear">("keep");
  const [date, setDate] = React.useState("");
  const [checklist, setChecklist] = React.useState<string>("keep");
  const [perPerson, setPerPerson] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<{ id: string; code: string; ok: boolean; error?: string }[] | null>(null);
  React.useEffect(() => {
    setAssignees([]);
    setChecklist("keep");
    setPerPerson({});
  }, [stage]);

  const team = people.filter((p) => assignees.includes(p.id));
  const mapping = plan(chosen, team, split);
  const counts = team.map((p) => ({ ...p, n: [...mapping.values()].filter((v) => v === p.id).length }));
  const templateFor = (userId: string | null) => {
    const own = userId ? perPerson[userId] : undefined;
    const v = own && own !== "same" ? own : checklist;
    return v === "keep" ? undefined : v === "none" ? null : v;
  };

  const apply = async (unassign = false) => {
    setBusy(true);
    const r = await bulkAssignAction({
      stage,
      rows: chosen.map((c) => {
        const userId = unassign ? null : (mapping.get(c.id) ?? null);
        return unassign ? { itemId: c.id, userId } : { itemId: c.id, userId, templateId: templateFor(userId) };
      }),
      dueAt: due === "set" && date ? endOfLocalDayIso(date, tz) : due === "clear" ? null : undefined,
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const list = r.data as { id: string; code: string; ok: boolean; error?: string }[];
    const ok = list.filter((x) => x.ok).length;
    if (ok === list.length) {
      toast.success(unassign ? `${ok} unassigned` : `${ok} assigned to ${team.map((p) => p.name).join(", ")}`);
      setResults(null);
      onDone();
    } else {
      toast.warning(`${ok} of ${list.length} done`);
      setResults(list.filter((x) => !x.ok));
    }
  };

  return (
    <Card className="h-fit lg:sticky lg:top-16">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlusIcon className="size-4" /> Assign {chosen.length} {chosen.length === 1 ? "part" : "parts"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{STAGE_LABELS[stage]} stage</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>People</Label>
          <MultiSelect
            label="People"
            placeholder={`Choose ${STAGE_LABELS[stage]} staff`}
            options={people.map((p) => ({ value: p.id, label: p.name, hint: `${p.open} open` }))}
            value={assignees}
            onChange={setAssignees}
            className="w-full max-w-none"
          />
        </div>
        {team.length > 1 && (
          <div className="space-y-1.5">
            <Label>Split the work</Label>
            <Select value={split} onValueChange={(v) => setSplit(v as Split)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="even">Evenly, in part order</SelectItem>
                <SelectItem value="units">Keep each unit with one person</SelectItem>
                <SelectItem value="balance">Balance with current workload</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Due date for this stage</Label>
          <div className="flex gap-2">
            <Select value={due} onValueChange={(v) => setDue(v as typeof due)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Keep as is</SelectItem>
                <SelectItem value="set">Set date</SelectItem>
                <SelectItem value="clear">Clear</SelectItem>
              </SelectContent>
            </Select>
            {due === "set" && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Checklist</Label>
            <Link href={`/checklists?stage=${stage}`} className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
          <Select value={checklist} onValueChange={setChecklist}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Keep the current checklist</SelectItem>
              <SelectItem value="none">No extra checklist</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.lines} lines{t.verify ? `, ${t.verify} verified` : ""})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!templates.length && <p className="text-xs text-muted-foreground">No {STAGE_LABELS[stage]} checklists yet.</p>}
        </div>
        {team.length > 0 && (
          <div className="space-y-1.5 rounded-lg border p-2">
            <p className="text-xs font-medium">Each person gets</p>
            {counts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {p.name} <span className="text-muted-foreground">({p.open} open now)</span>
                </span>
                <Badge variant="secondary" className="tabular">
                  +{p.n}
                </Badge>
                {templates.length > 0 && team.length > 1 && (
                  <Select value={perPerson[p.id] ?? "same"} onValueChange={(v) => setPerPerson((x) => ({ ...x, [p.id]: v }))}>
                    <SelectTrigger size="sm" className="h-6 w-32 text-[11px]" aria-label={`Checklist for ${p.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">Same checklist</SelectItem>
                      <SelectItem value="none">No checklist</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Note (optional, sent with the notice)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Priority for this week" />
        </div>
        {results && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 p-2 text-xs">
            {results.map((r) => (
              <p key={r.id} className="flex gap-1.5">
                <CircleXIcon className="mt-0.5 size-3 shrink-0 text-destructive" />
                <span className="font-mono">{r.code}</span> <span className="text-muted-foreground">{r.error}</span>
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button disabled={busy || !chosen.length || !team.length || (due === "set" && !date)} onClick={() => apply(false)}>
            {busy ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />} Assign {chosen.length}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy || !chosen.length} onClick={() => apply(true)}>
            Remove the assignee from {chosen.length}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
