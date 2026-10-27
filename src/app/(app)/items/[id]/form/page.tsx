import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, LayoutListIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { all, get } from "@/server/db";
import { itemDetail } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { stageStatuses } from "@/server/structure";
import { can, canViewItem, isManager, userDirectory } from "@/server/users";
import { Button } from "@/components/ui/button";
import { ItemActions } from "@/components/app/item-actions";
import { ItemStatusPill } from "@/components/app/status-pill";
import { SimpleChip } from "@/components/app/structure-report";
import { DurationEditor, TargetsTable } from "../item-client";
import { CommentProvider, InlineSelect, InlineText, LinkFileButton, LockNote, PropertyRow, StageDate, StageNotes } from "./form-client";
import { COMPLEXITY_LABELS, PRIORITY_LABELS, ROLE_LABELS, STAGE_LABELS, STAGES, sheetStatusLabel, type AttemptStatus, type Stage } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Page view" };

const STAGE_TONE: Record<Stage, string> = {
  recording: "border-l-[var(--stage-recording)]",
  editing: "border-l-[var(--stage-editing)]",
  uploading: "border-l-[var(--stage-uploading)]",
  publication: "border-l-[var(--stage-publication)]",
};

export default async function ItemFormPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!(await canViewItem(viewer, id))) notFound();
  const d = await itemDetail(id);
  if (!d) notFound();
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const it = d.item as Record<string, string | number | null> & { id: string };
  const lifecycle = it.lifecycle as string;
  const stage = it.stage as Stage | null;
  const ref = { id: it.id, code: it.code as string, title: it.title as string, version: it.version as number, stage, status: it.stage_status as string | null };
  const names = Object.fromEntries((await userDirectory()).map((u) => [u.id, u.name]));
  const manager = isManager(viewer);
  const planner = can(viewer, "items.plan");
  const collaborator = d.collaborators.some((c) => c.user_id === viewer.id);
  const current = d.attempts.find((a) => a.id === it.current_attempt_id) ?? null;
  const primary = d.memberships.find((m) => m.is_primary) ?? d.memberships[0];

  // Who may edit each stage: the stage role (owner or unassigned) or a manager, and only while the item is in that stage.
  const ownerOf = (st: Stage) => d.assignments.find((a) => a.stage === st)?.user_id ?? null;
  const editReason = (st: Stage): string | null => {
    if (lifecycle === "published") return "Published. Changes go through a revision.";
    if (lifecycle !== "in_production" || !stage) return lifecycle === "draft" ? "Opens when Recording staff start the item." : "This item is closed.";
    const lead = viewer.leads.includes(st);
    const roleOk = manager || lead || viewer.roles.includes(st);
    if (!roleOk) return `${ROLE_LABELS[st]} team only. You can view and comment.`;
    if (stage !== st) return STAGES.indexOf(st) < STAGES.indexOf(stage) ? `${STAGE_LABELS[st]} is complete.` : `Opens after ${STAGE_LABELS[stage]}.`;
    const owner = current?.owner_id ?? ownerOf(st);
    if (!manager && !lead && owner && owner !== viewer.id && !collaborator) return `Owned by ${names[owner] ?? "someone else"}. You can view and comment.`;
    return null;
  };
  const simple = stageStatuses({ lifecycle, stage });
  const dateEditable = (st: Stage) =>
    (st !== "publication" || lifecycle === "published") && (planner || viewer.leads.includes(st) || (viewer.roles.includes(st) && (!ownerOf(st) || ownerOf(st) === viewer.id)));
  const dateRow = (st: Stage, label: string, col: string) => (
    <PropertyRow label={label} field={`${st}.date`} stage={st}>
      <StageDate item={ref} stage={st} value={(it[col] as string | null) ?? null} editable={dateEditable(st)} tz={tz} />
    </PropertyRow>
  );
  const latest = (st: Stage) => [...d.attempts].reverse().find((a) => a.stage === st && a.status !== "superseded") ?? null;
  const assets = (kind: string) => d.assets.filter((a) => a.kind === kind);
  const currentAsset = (kind: string) => d.assets.find((a) => a.kind === kind && a.status === "current") ?? null;
  const currentMaster = currentAsset("master");
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

  // Open comment counts per field, for the badges next to each property.
  const counts = Object.fromEntries(
    (await all<{ field: string; c: number }>("SELECT field, COUNT(*) AS c FROM comments WHERE item_id = ? AND field IS NOT NULL AND resolved = 0 AND deleted_at IS NULL GROUP BY field", id)).map((r) => [
      r.field,
      Number(r.c),
    ]),
  );

  // Previous and next parts in the same unit (then subject), for moving through the curriculum like a form.
  const siblings = primary
    ? await all<{ id: string; code: string; title: string }>(
        `SELECT i.id, i.code, i.title FROM items i JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
         LEFT JOIN lessons l ON l.id = i.lesson_id LEFT JOIN units u ON u.id = m.unit_id
         WHERE m.grade_id = ? AND m.subject_id = ? AND i.lifecycle NOT IN ('archived','cancelled')
         ORDER BY COALESCE(u.number, 999), COALESCE(l.number, 999), i.code`,
        primary.grade_id,
        primary.subject_id,
      )
    : [];
  const pos = siblings.findIndex((x) => x.id === id);
  const prev = pos > 0 ? siblings[pos - 1] : null;
  const next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : null;
  const unit = primary?.unit_id ? await get<{ number: number; title: string }>("SELECT number, title FROM units WHERE id = ?", primary.unit_id) : null;

  const metaEdit = planner;
  const workerMeta = !planner && !!current && editReason(current.stage) === null; // stage workers may edit a few descriptive fields
  const stageHeader = (st: Stage) => {
    const a = latest(st);
    const owner = (a?.owner_id ?? ownerOf(st)) as string | null;
    const due = d.assignments.find((x) => x.stage === st)?.stage_due_at ?? null;
    const reason = editReason(st);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{STAGE_LABELS[st]}</h2>
        <SimpleChip status={simple[st]} />
        {a && stage === st && lifecycle === "in_production" && (
          <span className="text-xs text-muted-foreground">{sheetStatusLabel(st, a.status as AttemptStatus, a.substate)}</span>
        )}
        <span className="text-xs text-muted-foreground">
          · {owner ? names[owner] : "Unassigned"}
          {due ? ` · due ${fmtDate(due, tz)}` : ""}
        </span>
        <span className="ml-auto">{reason ? <LockNote reason={reason} /> : <span className="text-[11px] font-medium text-[var(--st-done-fg)]">You can edit this section</span>}</span>
      </div>
    );
  };

  return (
    <CommentProvider value={{ itemId: id, viewerId: viewer.id, isManager: manager, tz, counts }}>
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/items/${id}`}>
              <ArrowLeftIcon /> Detail view
            </Link>
          </Button>
          <span className="text-muted-foreground">
            {primary?.grade_name} / {primary?.subject_name}
            {unit ? ` / Unit ${unit.number}` : ""}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {pos >= 0 && (
              <span className="mr-1 text-xs text-muted-foreground tabular">
                {pos + 1} of {siblings.length}
              </span>
            )}
            <Button variant="outline" size="icon-sm" asChild={!!prev} disabled={!prev} aria-label="Previous part">
              {prev ? (
                <Link href={`/items/${prev.id}/form`} title={prev.title}>
                  <ChevronLeftIcon />
                </Link>
              ) : (
                <ChevronLeftIcon />
              )}
            </Button>
            <Button variant="outline" size="icon-sm" asChild={!!next} disabled={!next} aria-label="Next part">
              {next ? (
                <Link href={`/items/${next.id}/form`} title={next.title}>
                  <ChevronRightIcon />
                </Link>
              ) : (
                <ChevronRightIcon />
              )}
            </Button>
          </div>
        </div>

        {/* Title block */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{ref.code}</span>
            <ItemStatusPill lifecycle={lifecycle} stage={stage} status={ref.status as AttemptStatus | null} substate={it.substate as string | null} />
          </div>
          <div className="text-2xl font-bold tracking-tight sm:text-3xl">
            <InlineText item={ref} field="title" value={it.title} editable={metaEdit} />
          </div>
          <ItemActions
            item={{ ...ref, lifecycle, substate: it.substate as string | null, ownerId: current?.owner_id ?? (lifecycle === "draft" ? ownerOf("recording") : null), nextOwnerId: stage ? ownerOf(STAGES[STAGES.indexOf(stage) + 1] ?? stage) : null }}
            viewer={{ id: viewer.id, roles: viewer.roles, leads: viewer.leads, perms: viewer.perms }}
            max={3}
          />
        </header>

        {/* Properties */}
        <section className="space-y-0.5 border-y py-3">
          <PropertyRow label="Grade and subject">
            <span className="block py-1">
              {d.memberships.map((m) => `${m.grade_name} ${m.subject_name}`).join(", ")}
            </span>
          </PropertyRow>
          <PropertyRow label="Unit">
            <span className="block py-1">{unit ? `Unit ${unit.number}: ${unit.title}` : "Not set"}</span>
          </PropertyRow>
          <PropertyRow label="Part">
            <span className="block py-1">{d.lesson ? `Part ${d.lesson.number}: ${d.lesson.title}` : "Not linked to a part"}</span>
          </PropertyRow>
          <PropertyRow label="Amharic title" field="plan.title_am">
            <InlineText item={ref} field="title_am" value={it.title_am} editable={metaEdit || workerMeta} />
          </PropertyRow>
          <PropertyRow label="Teacher" field="plan.teacher">
            <InlineText item={ref} field="teacher" value={it.teacher} editable={metaEdit || workerMeta} />
          </PropertyRow>
          <PropertyRow label="Priority" field="plan.priority">
            <InlineSelect item={ref} field="priority" value={it.priority as string} editable={metaEdit} options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
          </PropertyRow>
          <PropertyRow label="Complexity" field="plan.complexity">
            <InlineSelect item={ref} field="complexity" value={it.complexity as string} editable={metaEdit} options={Object.entries(COMPLEXITY_LABELS).map(([value, label]) => ({ value, label }))} />
          </PropertyRow>
          <PropertyRow label="Language" field="plan.language">
            <InlineSelect item={ref} field="language" value={it.language as string} editable={metaEdit} options={s.lists.languages.map((l) => ({ value: l.code, label: l.label }))} />
          </PropertyRow>
          <PropertyRow label="Target length (min)" field="plan.target_duration_min">
            <InlineText item={ref} field="target_duration_min" type="number" value={it.target_duration_min} editable={metaEdit} />
          </PropertyRow>
          <PropertyRow label="Due" field="plan.due">
            <span className="block py-1">{it.current_due_at ? fmtDateTime(it.current_due_at as string, tz) : "No deadline"}</span>
          </PropertyRow>
          <PropertyRow label="Objectives" field="plan.objectives">
            <InlineText item={ref} field="objectives" value={it.objectives} editable={metaEdit || workerMeta} multiline placeholder="What learners should be able to do" />
          </PropertyRow>
          {!metaEdit && (
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">Planning fields are edited by people with planning permission. Hover any property to comment on it.</p>
          )}
        </section>

        {/* Recording */}
        <section className={cn("space-y-2 rounded-lg border border-l-4 bg-card p-4", STAGE_TONE.recording)}>
          {stageHeader("recording")}
          <PropertyRow label="Recordings" field="recording.recordings" stage="recording">
            {assets("raw").length ? (
              <ul className="space-y-1.5 py-1">
                {assets("raw").map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                    {a.camera_code && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">{a.camera_code}</span>}
                    <span className="font-medium">{a.label ?? "Recording"}</span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                        <ExternalLinkIcon className="size-3" /> file
                      </a>
                    )}
                    {a.notes && <span className="w-full text-xs text-muted-foreground">{a.notes}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="block py-1 text-muted-foreground/60">No recordings logged</span>
            )}
            {editReason("recording") === null && (
              <div className="pt-1">
                <LinkFileButton item={ref} kind="raw" label="Log recording" />
              </div>
            )}
          </PropertyRow>
          <PropertyRow label="Raw duration" field="recording.raw_duration" stage="recording">
            {stage === "recording" && current && editReason("recording") === null ? (
              <DurationEditor item={ref} stage="recording" raw={current.raw_duration_min} final={null} canEdit />
            ) : (
              <span className="block py-1">{latest("recording")?.raw_duration_min ? `${latest("recording")!.raw_duration_min} min` : "Not recorded"}</span>
            )}
          </PropertyRow>
          {dateRow("recording", "Recorded date", "recorded_at")}
          <PropertyRow label="Notes" field="recording.notes" stage="recording">
            <StageNotes item={ref} value={latest("recording")?.notes ?? null} editable={editReason("recording") === null} />
          </PropertyRow>
        </section>

        {/* Editing */}
        <section className={cn("space-y-2 rounded-lg border border-l-4 bg-card p-4", STAGE_TONE.editing)}>
          {stageHeader("editing")}
          {(["master", "captions", "thumbnail"] as const).map((k) => {
            const a = currentAsset(k);
            const label = k === "master" ? "Edited master" : k === "captions" ? "Captions" : "Thumbnail";
            return (
              <PropertyRow key={k} label={label} field={`editing.${k}`} stage="editing">
                <span className="flex flex-wrap items-center gap-2 py-1">
                  {a ? (
                    <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                      <span className="truncate">
                        v{a.version_no} {a.label ?? a.url}
                      </span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60">Not linked</span>
                  )}
                  {editReason("editing") === null && <LinkFileButton item={ref} kind={k} label={a ? "New version" : "Link"} />}
                </span>
              </PropertyRow>
            );
          })}
          <PropertyRow label="Final duration" field="editing.final_duration" stage="editing">
            {stage === "editing" && editReason("editing") === null ? (
              <DurationEditor item={ref} stage="editing" raw={null} final={it.actual_duration_min as number | null} canEdit={editReason("editing") === null} />
            ) : (
              <span className="block py-1">{it.actual_duration_min ? `${it.actual_duration_min} min` : "Not recorded"}</span>
            )}
          </PropertyRow>
          {dateRow("editing", "Edited date", "edited_at")}
          <PropertyRow label="Notes" field="editing.notes" stage="editing">
            <StageNotes item={ref} value={latest("editing")?.notes ?? null} editable={editReason("editing") === null} />
          </PropertyRow>
        </section>

        {/* Uploading */}
        <section className={cn("space-y-2 rounded-lg border border-l-4 bg-card p-4", STAGE_TONE.uploading)}>
          {stageHeader("uploading")}
          <PropertyRow label="Destinations" field="uploading.destinations" stage="uploading">
            <div className="py-1">
              <TargetsTable item={ref} targets={targets} stage={stage} canUpload={stage === "uploading" && editReason("uploading") === null} canPublish={false} tz={tz} />
            </div>
          </PropertyRow>
          {dateRow("uploading", "Uploaded date", "uploaded_at")}
          <PropertyRow label="Notes" field="uploading.notes" stage="uploading">
            <StageNotes item={ref} value={latest("uploading")?.notes ?? null} editable={editReason("uploading") === null} />
          </PropertyRow>
        </section>

        {/* Publication */}
        <section className={cn("space-y-2 rounded-lg border border-l-4 bg-card p-4", STAGE_TONE.publication)}>
          {stageHeader("publication")}
          <PropertyRow label="Release date" field="publication.release" stage="publication">
            <span className="block py-1">
              {it.scheduled_publish_at ? fmtDateTime(it.scheduled_publish_at as string, tz) : it.planned_publish_at ? `Planned ${fmtDate(it.planned_publish_at as string, tz)}` : "Not scheduled"}
            </span>
          </PropertyRow>
          <PropertyRow label="Live links" field="publication.live" stage="publication">
            {targets.some((t) => t.live_url) ? (
              <ul className="space-y-1 py-1">
                {targets
                  .filter((t) => t.live_url)
                  .map((t) => (
                    <li key={t.platform}>
                      <a href={t.live_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLinkIcon className="size-3.5" /> {t.label}
                      </a>
                    </li>
                  ))}
              </ul>
            ) : (
              <span className="block py-1 text-muted-foreground/60">Not live yet</span>
            )}
          </PropertyRow>
          {dateRow("publication", "Publication date", "published_at")}
          <PropertyRow label="Notes" field="publication.notes" stage="publication">
            <StageNotes item={ref} value={latest("publication")?.notes ?? null} editable={editReason("publication") === null} />
          </PropertyRow>
        </section>

        <div className="flex justify-center">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/items/${id}?tab=history`}>
              <LayoutListIcon /> Full history and discussion
            </Link>
          </Button>
        </div>
      </div>
    </CommentProvider>
  );
}
