import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { requireCapability } from "@/server/auth";
import { all, nowIso, placeholders } from "@/server/db";
import { listItems } from "@/server/queries";
import { filterOptions } from "@/server/view-data";
import { getSettings } from "@/server/settings";
import { parseFilters, scopeQueryString } from "@/lib/filters";
import { localDate, fmtTime, tzLabel, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { cn } from "@/lib/utils";
import { PageImport } from "@/components/app/page-import";
import { isManager } from "@/server/users";
import { DayDrop, ReleaseChip } from "./drag";

export const metadata = { title: "Calendar" };

type Ev = { date: string; time: string | null; kind: "session" | "release" | "published" | "due"; title: string; code: string; itemId: string; detail?: string };

const LAYERS: Record<Ev["kind"], { label: string; cls: string }> = {
  session: { label: "Recording sessions", cls: "bg-[var(--st-active-bg)] text-[var(--st-active-fg)]" },
  release: { label: "Scheduled releases", cls: "bg-[var(--st-scheduled-bg)] text-[var(--st-scheduled-fg)]" },
  published: { label: "Published", cls: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" },
  due: { label: "Due dates", cls: "bg-[var(--st-paused-bg)] text-[var(--st-paused-fg)]" },
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.calendar");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const today = localDate(nowIso(), tz);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const view = sp.view === "agenda" ? "agenda" : sp.view === "plan" ? "plan" : "month";
  // Publication and managers move scheduled releases by dragging them to another day.
  const canMove = viewer.roles.includes("publication") || viewer.leads.includes("publication") || isManager(viewer);
  const layers = (typeof sp.layers === "string" ? sp.layers.split(",") : ["session", "release", "published", "due"]) as Ev["kind"][];

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startOffset = (first.getUTCDay() - s.workspace.weekStartsOn + 7) % 7;
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - startOffset));
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 864e5).toISOString().slice(0, 10));
  const rangeFrom = new Date(gridStart.getTime() - 864e5).toISOString();
  const rangeTo = new Date(gridStart.getTime() + 43 * 864e5).toISOString();

  const { rows } = await listItems(viewer, { ...filters, life: filters.life.length ? filters.life : ["draft", "in_production", "published"] }, nowIso(), { all: true });
  const ids = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const events: Ev[] = [];
  if (ids.length && layers.includes("session")) {
    for (let i = 0; i < ids.length; i += 500) {
      const c = ids.slice(i, i + 500);
      for (const x of await all<{ item_id: string; scheduled_start: string; duration_min: number; location: string | null; presenter: string | null; status: string }>(
              `SELECT item_id, scheduled_start, duration_min, location, presenter, status FROM recording_sessions WHERE item_id IN (${placeholders(c.length)}) AND scheduled_start BETWEEN ? AND ? AND status <> 'cancelled'`,
              ...c,
              rangeFrom,
              rangeTo,
            )) {
        const r = byId.get(x.item_id)!;
        events.push({ date: localDate(x.scheduled_start, tz), time: fmtTime(x.scheduled_start, tz), kind: "session", title: r.title, code: r.code, itemId: r.id, detail: `${x.duration_min} min, ${x.location ?? "studio TBC"}, ${x.presenter ?? ""}${x.status === "completed" ? " (recorded)" : ""}` });
      }
    }
  }
  for (const r of rows) {
    if (layers.includes("release") && r.scheduled_publish_at && r.lifecycle === "in_production" && r.scheduled_publish_at >= rangeFrom && r.scheduled_publish_at <= rangeTo)
      events.push({ date: localDate(r.scheduled_publish_at, tz), time: fmtTime(r.scheduled_publish_at, tz), kind: "release", title: r.title, code: r.code, itemId: r.id, detail: "Scheduled, not yet confirmed live" });
    if (layers.includes("published") && r.published_at && r.published_at >= rangeFrom && r.published_at <= rangeTo)
      events.push({ date: localDate(r.published_at, tz), time: fmtTime(r.published_at, tz), kind: "published", title: r.title, code: r.code, itemId: r.id });
    if (layers.includes("due") && r.current_due_at && (r.lifecycle === "in_production" || r.lifecycle === "draft") && r.current_due_at >= rangeFrom && r.current_due_at <= rangeTo)
      events.push({ date: localDate(r.current_due_at, tz), time: null, kind: "due", title: r.title, code: r.code, itemId: r.id, detail: r.stage ? `In ${r.stage}` : "Draft" });
  }
  events.sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")));
  const holidays = new Map(s.calendar.holidays.map((h) => [h.date, h.name]));

  const base = new URLSearchParams(scopeQueryString(new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))).replace(/^\?/, ""));
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(base);
    p.set("month", month);
    p.set("view", view);
    p.set("layers", layers.join(","));
    for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
    return `/calendar?${p.toString()}`;
  };
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const weekdayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + ((s.workspace.weekStartsOn + 6 + i) % 7)))));
  const monthEvents = events.filter((e) => e.date.startsWith(month));

  return (
    <div className="space-y-4">
      <PageHeader help="publication" title="Calendar" description={`Recording sessions, scheduled releases, publications and due dates. ${tzLabel(tz)}.`} actions={<PageImport viewer={viewer} page="calendar" />} />
      <FilterBar options={await filterOptions(viewer, "/calendar")} total={monthEvents.length} totalLabel={`events in ${monthLabel}`} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" asChild aria-label="Previous month">
            <Link href={href({ month: shift(-1) })}><ChevronLeftIcon /></Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={href({ month: today.slice(0, 7) })}>Today</Link>
          </Button>
          <Button variant="outline" size="icon-sm" asChild aria-label="Next month">
            <Link href={href({ month: shift(1) })}><ChevronRightIcon /></Link>
          </Button>
        </div>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(Object.keys(LAYERS) as Ev["kind"][]).map((k) => {
            const on = layers.includes(k);
            const next = on ? layers.filter((x) => x !== k) : [...layers, k];
            return (
              <Link key={k} href={href({ layers: next.join(",") || "none" })} className={cn("flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs", on ? LAYERS[k].cls + " border-transparent" : "text-muted-foreground")} aria-pressed={on}>
                {LAYERS[k].label}
              </Link>
            );
          })}
          <div className="ml-1 flex rounded-lg border bg-muted/40 p-0.5">
            {(["month", "agenda", "plan"] as const).map((v) => (
              <Link key={v} href={href({ view: v })} className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize", view === v ? "bg-background shadow-sm" : "text-muted-foreground")}>
                {v === "plan" ? "Release plan" : v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "plan" ? (
        <ReleasePlan rows={rows} today={today} tz={tz} weekStartsOn={s.workspace.weekStartsOn} />
      ) : view === "month" ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              {weekdayNames.map((w) => (
                <div key={w} className="px-2 py-1.5">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const ev = events.filter((e) => e.date === d);
                const inMonth = d.startsWith(month);
                const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                const off = !s.calendar.workdays.includes(wd) || holidays.has(d);
                return (
                  <DayDrop key={d} date={d} tz={tz} className={cn("min-h-28 border-r border-b p-1.5 last:border-r-0", !inMonth && "bg-muted/30 text-muted-foreground", off && inMonth && "bg-muted/20")}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</span>
                      {holidays.has(d) && <span className="truncate text-[10px] text-muted-foreground" title={holidays.get(d)}>{holidays.get(d)}</span>}
                    </div>
                    <ul className="space-y-0.5">
                      {ev.slice(0, 4).map((e, i) => (
                        <li key={i}>
                          {e.kind === "release" ? (
                            <ReleaseChip itemId={e.itemId} time={e.time} canMove={canMove && d >= today} className={LAYERS[e.kind].cls} title={`${LAYERS[e.kind].label}: ${e.code} ${e.title}`}>
                              {e.time && <span className="tabular">{e.time} </span>}
                              {e.title}
                            </ReleaseChip>
                          ) : (
                            <Link href={`/items/${e.itemId}`} className={cn("block truncate rounded px-1.5 py-0.5 text-[11px]", LAYERS[e.kind].cls)} title={`${LAYERS[e.kind].label}: ${e.code} ${e.title}${e.detail ? ` (${e.detail})` : ""}`}>
                              {e.time && <span className="tabular">{e.time} </span>}
                              {e.title}
                            </Link>
                          )}
                        </li>
                      ))}
                      {ev.length > 4 && (
                        <li>
                          <Link href={href({ view: "agenda" }) + `#${d}`} className="px-1.5 text-[11px] text-muted-foreground hover:underline">
                            {ev.length - 4} more
                          </Link>
                        </li>
                      )}
                    </ul>
                  </DayDrop>
                );
              })}
            </div>
          </div>
          <Agenda events={monthEvents} today={today} tz={tz} className="md:hidden" />
        </>
      ) : (
        <Agenda events={monthEvents} today={today} tz={tz} />
      )}
    </div>
  );
}

function Agenda({ events, today, tz, className }: { events: Ev[]; today: string; tz: string; className?: string }) {
  const days = [...new Set(events.map((e) => e.date))];
  if (!days.length) return <p className={cn("rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground", className)}>No events this month for the selected layers and filters.</p>;
  return (
    <div className={cn("space-y-3", className)}>
      {days.map((d) => (
        <section key={d} id={d} className="rounded-xl border bg-card">
          <h3 className={cn("border-b px-3 py-2 text-sm font-semibold", d === today && "text-primary")}>
            {fmtDate(`${d}T09:00:00Z`, tz)}
            {d === today && " (today)"}
          </h3>
          <ul className="divide-y">
            {events
              .filter((e) => e.date === d)
              .map((e, i) => (
                <li key={i}>
                  <Link href={`/items/${e.itemId}`} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/40">
                    <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground tabular">{e.time ?? "All day"}</span>
                    <span className={cn("mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-medium", LAYERS[e.kind].cls)}>{LAYERS[e.kind].label}</span>
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.code}
                        {e.detail ? ` / ${e.detail}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// The weekly release plan: per subject, releases scheduled (and already published) in each of the next eight weeks.
function ReleasePlan({ rows, today, tz, weekStartsOn }: { rows: Awaited<ReturnType<typeof listItems>>["rows"]; today: string; tz: string; weekStartsOn: number }) {
  const t = new Date(`${today}T12:00:00Z`);
  const start = new Date(t.getTime() - ((t.getUTCDay() - weekStartsOn + 7) % 7) * 864e5);
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(start.getTime() + i * 7 * 864e5).toISOString().slice(0, 10));
  const weekOf = (d: string) => weeks.findLast((w) => w <= d) ?? null;
  const end = new Date(start.getTime() + 56 * 864e5).toISOString().slice(0, 10);
  const subjects = new Map<string, { planned: Record<string, number>; live: Record<string, number> }>();
  for (const r of rows) {
    const scheduled = r.scheduled_publish_at && r.lifecycle === "in_production" ? localDate(r.scheduled_publish_at, tz) : null;
    const published = r.published_at ? localDate(r.published_at, tz) : null;
    for (const [d, kind] of [[scheduled, "planned"], [published, "live"]] as const) {
      if (!d || d < weeks[0]! || d >= end) continue;
      const w = weekOf(d);
      if (!w) continue;
      const key = r.subject_name ?? "No subject";
      const e = subjects.get(key) ?? { planned: {}, live: {} };
      e[kind][w] = (e[kind][w] ?? 0) + 1;
      subjects.set(key, e);
    }
  }
  const list = [...subjects.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fmtWeek = (w: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${w}T12:00:00Z`));
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Subject</th>
            {weeks.map((w) => (
              <th key={w} className="px-2 py-2 text-center font-medium">
                Week of {fmtWeek(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map(([name, e]) => (
            <tr key={name} className="border-t">
              <td className="px-3 py-2 font-medium">{name}</td>
              {weeks.map((w) => (
                <td key={w} className="px-2 py-2 text-center tabular">
                  {e.live[w] ? <span className="text-[var(--st-done-fg)]">{e.live[w]} live</span> : null}
                  {e.live[w] && e.planned[w] ? " · " : null}
                  {e.planned[w] ? <span className="text-[var(--st-scheduled-fg)]">{e.planned[w]} planned</span> : null}
                  {!e.live[w] && !e.planned[w] ? <span className="text-muted-foreground">-</span> : null}
                </td>
              ))}
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                Nothing scheduled or published in the next eight weeks.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">Planned: scheduled and not yet confirmed live. Drag a release in the month view to move it.</p>
    </div>
  );
}
