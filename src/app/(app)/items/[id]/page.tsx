import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { itemDetail, taxonomy } from "@/server/queries";
import { can, canViewItem, userDirectory } from "@/server/users";
import { evaluateRequirements, workChecklistItems, type AttemptRow } from "@/server/workflow";
import { canAssign, canVerify, listTemplates } from "@/server/editorial";
import { get as dbGet } from "@/server/db";
import { attemptTimings, activeProcessingMs } from "@/server/metrics";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import {
  ASSET_KIND_LABELS,
  BLOCKER_CAUSE_LABELS,
  COMPLEXITY_LABELS,
  LIFECYCLE_LABELS,
  NEXT_STAGE,
  PRIORITY_LABELS,
  RETURN_REASON_LABELS,
  STAGE_LABELS,
  STAGES,
  STATUS_LABELS,
  sheetStatusLabel,
  type AttemptStatus,
  type Stage,
} from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDuration, tzLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemStatusPill, PriorityBadge, StatusPill, toneFor } from "@/components/app/status-pill";
import { KeyValue, UserAvatar, EmptyState } from "@/components/app/primitives";
import { ItemActions } from "@/components/app/item-actions";
import { CommentThread } from "@/components/app/comment-thread";
import {
  AddAssetButton,
  AssignmentEditor,
  WorkChecklist,
  CorrectionButton,
  DestinationsEditor,
  DurationEditor,
  EditDetails,
  HistoryList,
  PlacementEditor,
  QuestionsPanel,
  RecordingSessionButton,
  RequirementPanel,
  SessionStatusSelect,
  TargetsTable,
} from "./item-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Item detail" };

const BUCKETS = [
  { key: "queued", label: "To do", color: "var(--st-queued-fg)" },
  { key: "active", label: "Active", color: "var(--st-active-fg)" },
  { key: "paused", label: "Paused", color: "var(--st-paused-fg)" },
  { key: "blocked", label: "Blocked", color: "var(--st-blocked-fg)" },
  { key: "handoff", label: "Handoff wait", color: "var(--st-handoff-fg)" },
] as const;

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  // Team members work from their Home board; links to an item open it there.
  if (!can(viewer, "items.detail")) redirect(`/dashboard?item=${encodeURIComponent(id)}`);
  const { tab = "overview" } = await searchParams;
  if (!await canViewItem(viewer, id)) notFound();
  const d = await itemDetail(id);
  if (!d) notFound();
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const now = nowIso();
  const it = d.item as Record<string, string | number | null> & { id: string };
  const users = await userDirectory();
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  // Managers view only: stage data needs Edit any stage (work.override), planning fields need items.plan.
  const isManager = viewer.roles.includes("manager");
  const override = can(viewer, "work.override");
  const planner = can(viewer, "items.plan");
  const lifecycle = it.lifecycle as string;
  const stage = it.stage as Stage | null;
  const status = it.stage_status as AttemptStatus | null;
  const current = d.attempts.find((a) => a.id === it.current_attempt_id) ?? null;
  const timings = await attemptTimings(d.attempts.map((a) => a.id), now, { business: true });
  const activeById: Record<string, number> = {};
  for (const a of d.attempts) activeById[a.id] = await activeProcessingMs(a.id, now);
  const tmap = new Map(timings.map((t) => [t.attemptId, t]));
  const ref = { id: it.id, code: it.code as string, title: it.title as string, version: it.version as number, stage, status };
  const canWork =
    !!current && (override || viewer.leads.includes(current.stage) || (viewer.roles.includes(current.stage) && (!current.owner_id || current.owner_id === viewer.id || d.collaborators.some((c) => c.user_id === viewer.id))));
  const requirements = current ? await evaluateRequirements(id, current as unknown as AttemptRow) : [];
  const checklistDefs = current ? s.checklists[current.stage] : [];
  const checklist = checklistDefs.map((c) => {
    const r = d.checklist.find((x) => x.attempt_id === current!.id && x.key === c.key) as
      | { checked: number; checked_by: string | null; checked_at: string | null; verified_by?: string | null; verified_at?: string | null }
      | undefined;
    return {
      key: c.key,
      label: c.label,
      required: c.required,
      verify: !!c.verify,
      group: "Standard",
      checked: !!r?.checked,
      by: r?.checked_by ? names[r.checked_by] : null,
      at: r?.checked_at ? fmtDateTime(r.checked_at, tz) : null,
      verifiedBy: r?.verified_by ? names[r.verified_by] : null,
      verifiedAt: r?.verified_at ? fmtDateTime(r.verified_at, tz) : null,
    };
  });
  // The checklist chosen for this person when the work was assigned, with the lead's verification.
  const work = current ? await dbGet<{ name: string; template_id: string | null }>("SELECT name, template_id FROM work_checklists WHERE item_id = ? AND stage = ?", id, current.stage) : undefined;
  const workLines = current
    ? (await workChecklistItems(id, current.stage)).map((c) => {
        const r = d.checklist.find((x) => x.attempt_id === current!.id && x.key === `wc:${c.key}`) as ({ checked: number; checked_by: string | null; checked_at: string | null; verified_by?: string | null; verified_at?: string | null } | undefined);
        return {
          key: `wc:${c.key}`,
          label: c.label,
          required: c.required,
          verify: c.verify,
          group: work?.name ?? "Extra",
          checked: !!r?.checked,
          by: r?.checked_by ? names[r.checked_by] : null,
          at: r?.checked_at ? fmtDateTime(r.checked_at, tz) : null,
          verifiedBy: r?.verified_by ? names[r.verified_by] : null,
          verifiedAt: r?.verified_at ? fmtDateTime(r.verified_at, tz) : null,
        };
      })
    : [];
  const mayVerify = !!current && canVerify(viewer, current.stage);
  const mayPick = !!current && canAssign(viewer, current.stage);
  const stageTemplates = mayPick ? (await listTemplates({ stage: current!.stage, active: "active", sort: "name" })).map((t) => ({ id: t.id, name: t.name })) : [];
  const currentMaster = d.assets.find((a) => a.kind === "master" && a.status === "current");
  const targets = d.targets.map((t) => ({
    platform: t.platform,
    label: s.destinations.find((x) => x.key === t.platform)?.label ?? t.platform,
    required: !!t.required,
    upload_status: t.upload_status as string,
    external_id: t.external_id as string | null,
    upload_url: t.upload_url as string | null,
    playback_checked: t.playback_checked as number,
    metadata_checked: t.metadata_checked as number,
    release_status: t.release_status as string,
    scheduled_at: t.scheduled_at as string | null,
    live_url: t.live_url as string | null,
    published_at: t.published_at as string | null,
    verified_at: t.verified_at as string | null,
    failure_reason: t.failure_reason as string | null,
    retry_count: t.retry_count as number,
    versionOk: !t.uploaded_asset_id || t.uploaded_asset_id === currentMaster?.id,
  }));
  const primary = d.memberships.find((m) => m.is_primary) ?? d.memberships[0];
  const nextOwner = stage && NEXT_STAGE[stage] ? d.assignments.find((a) => a.stage === NEXT_STAGE[stage])?.user_id ?? null : null;
  const tax = await taxonomy();
  const leadMs = it.released_at ? new Date((it.published_at as string) ?? now).getTime() - new Date(it.released_at as string).getTime() : null;
  const labelOf = (list: { key: string; label: string }[], k: unknown) => list.find((x) => x.key === k)?.label ?? String(k ?? "");

  const stepper = STAGES.map((st) => {
    const atts = d.attempts.filter((a) => a.stage === st);
    const latest = [...atts].reverse().find((a) => a.status !== "superseded") ?? atts.at(-1);
    const stale = lifecycle === "in_production" && stage && STAGES.indexOf(st) > STAGES.indexOf(stage) && latest?.status === "completed";
    const st_status = stale ? null : latest?.status ?? null;
    const isCurrent = lifecycle === "in_production" && stage === st;
    const done = st === "publication" ? lifecycle === "published" : st_status === "completed";
    return { st, latest: stale ? undefined : latest, attempts: atts.length, isCurrent, done, status: st_status };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">{it.code}</span>
            <ItemStatusPill lifecycle={lifecycle} stage={stage} status={status} substate={it.substate as string | null} />
            <PriorityBadge priority={it.priority as string} />
            {it.provenance !== "live" && (
              <Badge variant="outline" className="font-normal capitalize" title={it.provenance === "historical" ? "Excluded from timing and performance metrics" : undefined}>
                {it.provenance}
                {it.exclude_from_metrics ? ", excluded from metrics" : ""}
              </Badge>
            )}
            {d.revisionOf && (
              <Link href={`/items/${d.revisionOf.id}`} className="text-primary hover:underline">
                Revision of {d.revisionOf.code}
              </Link>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{it.title}</h1>
          {it.title_am && (
            <p className="ethiopic text-base text-muted-foreground" lang="am">
              {it.title_am}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {primary?.grade_name} / {primary?.subject_name}
            {primary?.unit_number ? ` / Unit ${primary.unit_number}: ${primary.unit_title}` : ""}
            {d.lesson ? ` / Part ${d.lesson.number}` : ""}
            {d.memberships.length > 1 && ` (also in ${d.memberships.filter((m) => !m.is_primary).map((m) => `${m.grade_name} ${m.subject_name}`).join(", ")})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/items/${it.id}/form`}>
              <FileTextIcon /> Page view
            </Link>
          </Button>
          <ItemActions
            item={{ ...ref, lifecycle, substate: it.substate as string | null, ownerId: current?.owner_id ?? (lifecycle === "draft" ? d.assignments.find((a) => a.stage === "recording")?.user_id ?? null : null), nextOwnerId: nextOwner }}
            viewer={{ id: viewer.id, roles: viewer.roles, leads: viewer.leads, perms: viewer.perms }}
            max={3}
          />
        </div>
      </div>

      {/* Stage stepper */}
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Workflow progress">
        {stepper.map((x, i) => (
          <li
            key={x.st}
            className={cn(
              "relative rounded-xl border bg-card p-3",
              x.isCurrent && "border-primary/60 ring-2 ring-primary/15",
              x.done && "bg-[var(--st-done-bg)]/40",
            )}
            aria-current={x.isCurrent ? "step" : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {i + 1}. {STAGE_LABELS[x.st]}
              </span>
              {x.attempts > 1 && <span className="text-[10px] text-muted-foreground">{x.attempts} attempts</span>}
            </div>
            <div className="mt-1.5">
              {x.st === "publication" && lifecycle === "published" ? (
                <StatusPill tone="done" size="xs" label="Published" />
              ) : x.status ? (
                <StatusPill tone={toneFor(x.status, x.latest?.substate)} size="xs" label={sheetStatusLabel(x.st, x.status as AttemptStatus, x.latest?.substate ?? null)} />
              ) : (
                <span className="text-xs text-muted-foreground">Not started</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <UserAvatar name={names[x.latest?.owner_id ?? d.assignments.find((a) => a.stage === x.st)?.user_id ?? ""] ?? null} size="xs" />
              <span className="truncate">{names[x.latest?.owner_id ?? d.assignments.find((a) => a.stage === x.st)?.user_id ?? ""] ?? "Unassigned"}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground tabular">
              {x.latest?.completed_at
                ? `Done ${fmtDate(x.latest.completed_at, tz)}`
                : x.latest
                  ? `In stage ${fmtDuration(tmap.get(x.latest.id)?.residence ?? 0)}`
                  : d.assignments.find((a) => a.stage === x.st)?.stage_due_at
                    ? `Target ${fmtDate(d.assignments.find((a) => a.stage === x.st)!.stage_due_at, tz)}`
                    : ""}
            </p>
          </li>
        ))}
      </ol>

      {it.next_action && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-accent/40 px-4 py-3 text-sm">
          <span className="font-medium">Next action:</span>
          <span>{it.next_action}</span>
          <span className="text-muted-foreground">owner</span>
          <span className="flex items-center gap-1.5">
            <UserAvatar name={it.next_action_owner_id ? names[it.next_action_owner_id as string] : null} size="xs" />
            {it.next_action_owner_id ? names[it.next_action_owner_id as string] : "Unassigned"}
          </span>
          {it.current_due_at && (
            <span className={cn("ml-auto text-xs", (it.current_due_at as string) < now && "font-medium text-[var(--st-blocked-fg)]")}>
              Due {fmtDate(it.current_due_at as string, tz)}
            </span>
          )}
        </div>
      )}

      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="assets">Assets ({d.assets.length})</TabsTrigger>
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
          <TabsTrigger value="history">History ({d.events.length})</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            {current && lifecycle === "in_production" && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {STAGE_LABELS[current.stage]} evidence, attempt {current.attempt_no}
                  </CardTitle>
                  <CardDescription>
                    {canWork ? "Complete the checklist and link files; the handoff opens once everything required is in place." : "Only the stage owner or the team lead can change this evidence."}
                    {current.cause !== "initial" && current.cause_note && <span className="mt-1 block font-medium text-[var(--st-paused-fg)]">Rework: {current.cause_note}</span>}
                  </CardDescription>
                  <CardAction>
                    {(current.stage === "recording" || current.stage === "editing") && canWork && <AddAssetButton item={ref} kind={current.stage === "recording" ? "raw" : "master"} />}
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <RequirementPanel requirements={requirements} />
                  <div className="space-y-4">
                    <WorkChecklist
                      item={ref}
                      name={work?.name ?? null}
                      templateId={work?.template_id ?? null}
                      lines={[...checklist, ...workLines]}
                      canEdit={canWork}
                      canVerify={mayVerify}
                      templates={mayPick ? stageTemplates : null}
                    />
                    <DurationEditor item={ref} stage={current.stage} raw={current.raw_duration_min} final={it.actual_duration_min as number | null} canEdit={canWork} />
                  </div>
                  {(current.stage === "uploading" || current.stage === "publication") && (
                    <div className="md:col-span-2">
                      <TargetsTable item={ref} targets={targets} stage={current.stage} canUpload={canWork} canPublish={viewer.roles.includes("publication") || can(viewer, "release.emergency")} tz={tz} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Lesson details</CardTitle>
                <CardAction>
                  {(planner || canWork) && (
                  <EditDetails
                    item={ref}
                    isManager={planner}
                    tz={tz}
                    lists={s.lists}
                    values={{
                      title: it.title,
                      title_am: it.title_am,
                      objectives: it.objectives,
                      teacher: it.teacher,
                      target_duration_min: it.target_duration_min,
                      priority: it.priority,
                      complexity: it.complexity,
                      complexity_note: it.complexity_note,
                      deliverable_type: it.deliverable_type,
                      content_type: it.content_type,
                      language: it.language,
                      planned_publish_at: it.planned_publish_at,
                      tags: d.tags.join(", "),
                    }}
                  />
                  )}
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <KeyValue label="Deliverable">{labelOf(s.lists.deliverableTypes, it.deliverable_type)}</KeyValue>
                  <KeyValue label="Content type">{labelOf(s.lists.contentTypes, it.content_type)}</KeyValue>
                  <KeyValue label="Language">{s.lists.languages.find((l) => l.code === it.language)?.label ?? it.language}</KeyValue>
                  <KeyValue label="Teacher or presenter">{it.teacher ?? "-"}</KeyValue>
                  <KeyValue label="Duration">
                    {it.actual_duration_min ?? "-"} min final / {it.target_duration_min ?? "-"} min target
                  </KeyValue>
                  <KeyValue label="Complexity">
                    {COMPLEXITY_LABELS[it.complexity as keyof typeof COMPLEXITY_LABELS]}
                    {it.complexity_note && <span className="block text-xs text-muted-foreground">{it.complexity_note}</span>}
                  </KeyValue>
                  <KeyValue label="Priority">{PRIORITY_LABELS[it.priority as keyof typeof PRIORITY_LABELS]}</KeyValue>
                  <KeyValue label="Tags">{d.tags.length ? d.tags.join(", ") : "-"}</KeyValue>
                  <KeyValue label="Item ID">
                    <span className="font-mono text-xs">{it.id}</span>
                  </KeyValue>
                  <KeyValue label="Learning objectives" className="col-span-2 md:col-span-3">
                    {(it.objectives ?? d.lesson?.objectives) ? (
                      <ul className="list-inside list-disc text-sm">
                        {String(it.objectives ?? d.lesson?.objectives)
                          .split(";")
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .map((o) => (
                            <li key={o}>{o}</li>
                          ))}
                      </ul>
                    ) : (
                      "-"
                    )}
                  </KeyValue>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Owners and stage targets</CardTitle>
                <CardDescription>Assignment alone never starts a timer. Reassignments keep the previous owner in the history.</CardDescription>
              </CardHeader>
              <CardContent>
                <AssignmentEditor
                  item={ref}
                  isManager={planner}
                  tz={tz}
                  users={users}
                  assignments={d.assignments.map((a) => ({ stage: a.stage, userId: a.user_id, dueAt: a.stage_due_at }))}
                />
                {d.collaborators.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Collaborators: {d.collaborators.map((c) => `${names[c.user_id]} (${c.stage})`).join(", ")}</p>
                )}
              </CardContent>
            </Card>
            {lifecycle !== "in_production" || (current?.stage !== "uploading" && current?.stage !== "publication") ? (
              <Card>
                <CardHeader>
                  <CardTitle>Publication destinations</CardTitle>
                  {planner && (
                    <CardAction>
                      <DestinationsEditor item={ref} targets={targets.map((t) => ({ platform: t.platform, required: t.required, live: t.release_status === "live" }))} destinations={s.destinations.filter((x) => x.active).map((x) => ({ key: x.key, label: x.label }))} />
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <TargetsTable item={ref} targets={targets} stage={stage} canUpload={false} canPublish={false} tz={tz} />
                </CardContent>
              </Card>
            ) : null}
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Deadlines</CardTitle>
                <CardDescription>The original deadline is kept as the baseline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-3">
                  <KeyValue label="Current due">{fmtDate(it.current_due_at as string | null, tz)}</KeyValue>
                  <KeyValue label="Original due">{fmtDate(it.original_due_at as string | null, tz)}</KeyValue>
                  <KeyValue label="Planned release">{fmtDate(it.planned_publish_at as string | null, tz)}</KeyValue>
                  <KeyValue label="Scheduled release">{fmtDateTime(it.scheduled_publish_at as string | null, tz)}</KeyValue>
                  <KeyValue label="Published">{fmtDateTime(it.published_at as string | null, tz)}</KeyValue>
                  <KeyValue label="Verified">{fmtDateTime(it.publication_verified_at as string | null, tz)}</KeyValue>
                </dl>
                {d.deadlines.length > 0 && (
                  <ul className="space-y-1.5 border-t pt-3 text-xs">
                    {d.deadlines.map((x) => (
                      <li key={x.id}>
                        <span className="font-medium">{fmtDate(x.new_due_at, tz)}</span> from {fmtDate(x.old_due_at, tz)} by {x.actor_id ? names[x.actor_id] : "System"}: {x.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Timing</CardTitle>
                <CardDescription>Measured from system events. {tzLabel(tz)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  <KeyValue label="Created">{fmtDateTime(it.created_at as string, tz)}</KeyValue>
                  <KeyValue label="Released to production">{fmtDateTime(it.released_at as string | null, tz)}</KeyValue>
                  <KeyValue label={it.published_at ? "Production lead time" : "Elapsed since release"}>{leadMs !== null ? fmtDuration(leadMs) : "-"}</KeyValue>
                  <KeyValue label="Labor, all stages">{fmtDuration(timings.reduce((a, t) => a + t.labor, 0))}</KeyValue>
                  <KeyValue label="Rework labor">{fmtDuration(timings.filter((t) => t.cause !== "initial").reduce((a, t) => a + t.labor, 0))}</KeyValue>
                  <KeyValue label="Attempts">{d.attempts.length}</KeyValue>
                </dl>
                {it.provenance === "historical" && <p className="mt-3 text-xs text-muted-foreground">Historical record: unknown dates stay unknown and timing is excluded from metrics.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Curriculum placement</CardTitle>
                {planner && (
                  <CardAction>
                    <PlacementEditor
                      item={ref}
                      memberships={d.memberships.map((m) => ({ gradeId: m.grade_id, subjectId: m.subject_id, unitId: m.unit_id, primary: !!m.is_primary }))}
                      grades={tax.grades.map((g) => ({ id: g.id, name: g.name }))}
                      subjects={tax.subjects.map((x) => ({ id: x.id, name: x.name }))}
                      gradeSubjects={tax.gradeSubjects}
                      units={tax.units.map((u) => ({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, number: u.number, title: u.title }))}
                    />
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.memberships.map((m) => (
                  <div key={`${m.grade_id}-${m.subject_id}`} className="flex items-center justify-between gap-2">
                    <span>
                      {m.grade_name} / {m.subject_name}
                      {m.unit_number ? ` / U${m.unit_number}` : ""}
                    </span>
                    {m.is_primary ? <Badge variant="secondary">Primary</Badge> : <span className="text-xs text-muted-foreground">Secondary</span>}
                  </div>
                ))}
                {d.siblings.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Other deliverables for this lesson</p>
                    {d.siblings.map((x) => (
                      <Link key={x.id} href={`/items/${x.id}`} className="block truncate text-xs text-primary hover:underline">
                        {x.code} {x.title}
                      </Link>
                    ))}
                  </div>
                )}
                {d.revisions.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Revisions</p>
                    {d.revisions.map((x) => (
                      <Link key={x.id} href={`/items/${x.id}`} className="block text-xs text-primary hover:underline">
                        {x.code} ({LIFECYCLE_LABELS[x.lifecycle as keyof typeof LIFECYCLE_LABELS]})
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recording sessions</CardTitle>
                {(override || viewer.roles.includes("recording")) && lifecycle !== "published" && (
                  <CardAction>
                    <RecordingSessionButton item={ref} presenter={it.teacher as string | null} tz={tz} />
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {d.recordingSessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions booked.</p>}
                {d.recordingSessions.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      <span className="font-medium">{fmtDateTime(x.scheduled_start, tz)}</span> / {x.duration_min} min / {x.location ?? "-"}
                      {x.outcome_note && <span className="block text-muted-foreground">{x.outcome_note}</span>}
                    </span>
                    {override || viewer.roles.includes("recording") ? <SessionStatusSelect item={ref} sessionId={x.id} status={x.status} /> : <span className="capitalize">{x.status}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Workflow */}
        <TabsContent value="workflow" className="space-y-3">
          {d.attempts.length === 0 && <EmptyState title="Not started yet" description="Workflow history starts when Recording staff press Start on this item." />}
          {[...d.attempts].reverse().map((a) => {
            const t = tmap.get(a.id)!;
            const active = activeById[a.id];
            const sessions = d.sessions.filter((x) => x.attempt_id === a.id);
            const reviews = d.reviews.filter((r) => r.attempt_id === a.id);
            const blockers = d.blockers.filter((b) => b.attempt_id === a.id);
            const total = BUCKETS.reduce((acc, b) => acc + t.buckets[b.key], 0) || 1;
            return (
              <Card key={a.id} className={cn(a.id === current?.id && "border-primary/50")}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {STAGE_LABELS[a.stage]} attempt {a.attempt_no}
                    <StatusPill size="xs" tone={toneFor(a.status, a.substate)} label={a.status === "superseded" || a.status === "returned" ? STATUS_LABELS[a.status] : sheetStatusLabel(a.stage, a.status, a.substate)} />
                    {a.cause !== "initial" && <Badge variant="outline" className="font-normal capitalize">{a.cause}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    Owner {a.owner_id ? names[a.owner_id] : "unassigned"}
                    {a.cause_note && ` / ${a.cause_note}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <KeyValue label="Stage entered">{fmtDateTime(a.entered_at, tz)}</KeyValue>
                    <KeyValue label="First started">{a.first_started_at ? fmtDateTime(a.first_started_at, tz) : "Not started"}</KeyValue>
                    <KeyValue label="Handoff submitted">{fmtDateTime(a.handoff_submitted_at, tz)}</KeyValue>
                    <KeyValue label="Completed">{fmtDateTime(a.completed_at, tz)}</KeyValue>
                    <KeyValue label={a.closed_at ? "Residence" : "Residence so far"}>{fmtDuration(t.residence)}</KeyValue>
                  </dl>
                  <div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Time in each state">
                      {BUCKETS.map((b) => (t.buckets[b.key] > 0 ? <div key={b.key} style={{ width: `${(t.buckets[b.key] / total) * 100}%`, background: b.color }} className="border-r-2 border-card last:border-r-0" title={`${b.label} ${fmtDuration(t.buckets[b.key])}`} /> : null))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      {BUCKETS.map((b) => (
                        <span key={b.key} className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: b.color }} />
                          {b.label} <span className="ml-auto font-medium tabular">{fmtDuration(t.buckets[b.key])}</span>
                        </span>
                      ))}
                      <span className="flex items-center gap-1.5">
                        Labor <span className="ml-auto font-medium tabular">{fmtDuration(t.labor)}</span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Initial queue {fmtDuration(t.initialQueue)}
                      {t.initialQueueOpen ? " (still waiting, open interval)" : ""}. Active processing {fmtDuration(active)} (union of sessions). Labor {fmtDuration(t.labor)} across {t.sessionCount} session
                      {t.sessionCount === 1 ? "" : "s"}. Business-hours residence {fmtDuration(t.businessResidence)}.
                    </p>
                  </div>
                  {sessions.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium">Work sessions</p>
                      <ul className="divide-y rounded-lg border text-xs">
                        {sessions.map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                            <span className="w-32 truncate font-medium">{names[x.user_id]}</span>
                            <span className="tabular">
                              {fmtDateTime(x.started_at, tz)} to {x.ended_at ? fmtDateTime(x.ended_at, tz) : "running"}
                            </span>
                            <span className="text-muted-foreground tabular">{fmtDuration((x.ended_at ? new Date(x.ended_at).getTime() : Date.now()) - new Date(x.started_at).getTime())}</span>
                            {x.end_reason && <span className="text-muted-foreground">{x.end_reason.replace("_", " ")}</span>}
                            {x.corrected_from && <Badge variant="outline" className="font-normal">corrected: {x.correction_reason}</Badge>}
                            {(x.user_id === viewer.id || isManager) && <span className="ml-auto"><CorrectionButton item={ref} session={x} tz={tz} /></span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {blockers.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium">Blockers</p>
                      <ul className="space-y-1 text-xs">
                        {blockers.map((b) => (
                          <li key={b.id} className="rounded-lg border px-3 py-1.5">
                            <span className="font-medium">{BLOCKER_CAUSE_LABELS[b.cause] ?? b.cause}</span> opened {fmtDateTime(b.opened_at, tz)} by {b.opened_by ? names[b.opened_by] : "System"}
                            {b.resolver_id && `, resolver ${names[b.resolver_id]}`}
                            {b.note && <span className="block text-muted-foreground">{b.note}</span>}
                            {b.resolved_at ? (
                              <span className="block text-[var(--st-done-fg)]">
                                Resolved {fmtDateTime(b.resolved_at, tz)} ({fmtDuration(new Date(b.resolved_at).getTime() - new Date(b.opened_at).getTime())}){b.resolution ? `: ${b.resolution}` : ""}
                              </span>
                            ) : (
                              <span className="block text-[var(--st-blocked-fg)]">Open for {fmtDuration(Date.now() - new Date(b.opened_at).getTime())}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {reviews.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium">Reviews and handoff decisions</p>
                      <ul className="space-y-1 text-xs">
                        {reviews.map((r) => (
                          <li key={r.id} className={cn("rounded-lg border px-3 py-1.5", !r.valid && "opacity-60")}>
                            <span className="font-medium capitalize">{r.decision.replace("_", " ")}</span> ({r.kind.replace(/_/g, " ")}) by {r.reviewer_id ? names[r.reviewer_id] : "System"}, {fmtDateTime(r.created_at, tz)}
                            {r.reason_category && ` / ${RETURN_REASON_LABELS[r.reason_category] ?? r.reason_category}`}
                            {r.self_approval ? " / self-approval recorded" : ""}
                            {!r.valid && " / invalidated by a newer file version"}
                            {r.note && <span className="block text-muted-foreground">{r.note}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Assets */}
        <TabsContent value="assets" className="space-y-3">
          <div className="flex justify-end">{canWork && <AddAssetButton item={ref} kind={current?.stage === "recording" ? "raw" : "master"} />}</div>
          {d.assets.length === 0 && <EmptyState title="No files linked yet" description="Recording links raw footage; editing links the master, captions and thumbnail." />}
          {Object.keys(ASSET_KIND_LABELS)
            .filter((k) => d.assets.some((a) => a.kind === k))
            .map((k) => (
              <Card key={k} className="gap-2">
                <CardHeader>
                  <CardTitle>{ASSET_KIND_LABELS[k as keyof typeof ASSET_KIND_LABELS]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {d.assets
                      .filter((a) => a.kind === k)
                      .map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                          <span className="font-medium">v{a.version_no}</span>
                          <StatusPill size="xs" tone={a.status === "current" ? "done" : "neutral"} label={a.status} />
                          {a.camera_code && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{a.camera_code}</span>}
                          {a.url ? (
                            <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-primary hover:underline">
                              <ExternalLinkIcon className="size-3.5 shrink-0" />
                              <span className="truncate">{a.label ?? a.url}</span>
                            </a>
                          ) : (
                            <span className="truncate">{a.label ?? "Recording"}</span>
                          )}
                          {a.duration_min && <span className="text-xs text-muted-foreground">{a.duration_min} min</span>}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {a.created_by ? names[a.created_by] : "System"}, {fmtDateTime(a.created_at, tz)}
                          </span>
                          {a.notes && <p className="w-full text-xs text-muted-foreground">{a.notes}</p>}
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          {d.assets.some((a) => a.kind === "master") && (
            <Card>
              <CardHeader>
                <CardTitle>Video review comments</CardTitle>
                <CardDescription>Comments with a timecode stay attached to the exact file version they were made on.</CardDescription>
              </CardHeader>
              <CardContent>
                <CommentThread
                  itemId={id}
                  viewerId={viewer.id}
                  isManager={isManager}
                  tz={tz}
                  allowTimecode
                  stage={stage}
                  assets={d.assets.filter((a) => a.kind === "master" || a.kind === "raw").map((a) => ({ id: a.id, label: `${ASSET_KIND_LABELS[a.kind as keyof typeof ASSET_KIND_LABELS]} v${a.version_no}${a.status !== "current" ? " (superseded)" : ""}` }))}
                  placeholder="Note on the video. Pick a version and enter a timecode such as 03:42."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Discussion */}
        <TabsContent value="discussion" className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Discussion</CardTitle>
              <CardDescription>Threaded comments for everyone working on this item. Mention people with @handle.</CardDescription>
            </CardHeader>
            <CardContent>
              <CommentThread
                itemId={id}
                viewerId={viewer.id}
                isManager={isManager}
                tz={tz}
                stage={stage}
                allowTimecode
                assets={d.assets.filter((a) => a.kind === "master" || a.kind === "raw").map((a) => ({ id: a.id, label: `${ASSET_KIND_LABELS[a.kind as keyof typeof ASSET_KIND_LABELS]} v${a.version_no}` }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Manager questions</CardTitle>
              <CardDescription>Tracked questions with an owner, answer deadline and escalation.</CardDescription>
            </CardHeader>
            <CardContent>
              <QuestionsPanel itemId={id} questions={d.questions} users={users} viewerId={viewer.id} isManager={isManager} tz={tz} defaultOwner={(it.next_action_owner_id as string | null) ?? null} stage={stage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Event history</CardTitle>
              <CardDescription>Append-only. Corrections add new events; nothing is rewritten. Times in {tzLabel(tz)}.</CardDescription>
            </CardHeader>
            <CardContent>
              <HistoryList
                tz={tz}
                events={d.events.map((e) => ({ id: e.id, actor: e.actor_id ? names[e.actor_id] ?? "Unknown" : "System", action: e.action, summary: e.summary, old_value: e.old_value, new_value: e.new_value, reason: e.reason, occurred_at: e.occurred_at, source_occurred_at: e.source_occurred_at, stage: e.stage, request_id: e.request_id, job_id: e.job_id }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
