"use client";
import * as React from "react";
import { toast } from "sonner";
import { PauseIcon, PlayIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusStrip } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { noorGateStatusAction, pauseNoorAction, saveNoorGateAction } from "@/app/actions/noor-gate";
import type { NoorGateConfig } from "@/server/noor-gate";

type Status = Awaited<ReturnType<typeof import("@/server/noor-gate").noorGateStatus>>;
const FIELDS: [keyof NoorGateConfig, string, string][] = [
  ["maxPerMinute", "Requests per minute, at most", "Noor gets no more than this in any minute."],
  ["gapSeconds", "Seconds between requests", "One request at a time, with this pause after each."],
  ["heavyGapSeconds", "Seconds after a heavy page", "After a large page (a subject's edit page, a big list), Noor rests longer."],
  ["errorsToPause", "Errors in a row before pausing", "When Noor errors or does not answer this many times in a row, every call stops."],
  ["pauseMinutes", "Minutes to pause after errors", "How long every call waits before trying Noor again."],
  ["queueLimit", "Requests allowed to wait", "More than this waiting, and new requests are refused at once instead of piling up."],
  ["waitSeconds", "Longest wait in line (seconds)", "A request waiting longer is dropped."],
];
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Addis_Ababa" });

// Admin, Legacy CMS, Noor protection: how hard this app may use Noor (pace, ceiling, pause after errors, stop now),
// whether automatic reads run, and who may read Noor live (everyone else works from the saved copy).
export function NoorProtection({ people }: { people: { id: string; name: string }[] }) {
  const [s, setS] = React.useState<Status | null>(null);
  const [draft, setDraft] = React.useState<NoorGateConfig | null>(null);
  const [pick, setPick] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await noorGateStatusAction();
    if (r.ok) {
      const d = r.data as Status;
      setS(d);
      setDraft((x) => x ?? d.config);
    } else toast.error(r.error);
  }, []);
  React.useEffect(() => {
    void load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, [load]);
  if (!s || !draft) return <StatusStrip>Loading Noor protection…</StatusStrip>;
  const save = async (patch: Partial<NoorGateConfig>, msg = "Saved") => {
    setBusy(true);
    const r = await saveNoorGateAction({ ...draft, ...patch });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setDraft(r.data as NoorGateConfig);
    toast.success(msg);
    void load();
  };
  const stop = async (minutes: number) => {
    const r = await pauseNoorAction(minutes);
    if (!r.ok) return void toast.error(r.error);
    toast.success(minutes ? "Noor calls stopped" : "Noor calls resumed");
    void load();
  };
  const granted = draft.grants.map((id) => ({ id, name: people.find((p) => p.id === id)?.name ?? s.granted.find((g) => g.id === id)?.name ?? "Removed person" }));
  return (
    <div className="space-y-4" data-noor-protection>
      {s.pausedUntil ? (
        <StatusStrip tone="danger">
          <span className="flex flex-wrap items-center gap-2">
            Every Noor call is paused until {at(s.pausedUntil)}{s.pauseReason ? `: ${s.pauseReason}` : ""}. Pages use the saved copy.
            <Button size="xs" variant="outline" onClick={() => void stop(0)} data-noor-resume><PlayIcon /> Resume now</Button>
          </span>
        </StatusStrip>
      ) : (
        <StatusStrip tone="success">
          <span className="flex flex-wrap items-center gap-2">
            <ShieldCheckIcon className="size-4" /> Noor is protected: one request at a time, at most {draft.maxPerMinute} a minute.
            <Button size="xs" variant="outline" onClick={() => void stop(60)} data-noor-stop><PauseIcon /> Stop all Noor calls for an hour</Button>
            <Button size="xs" variant="ghost" onClick={() => void stop(12 * 60)}>For 12 hours</Button>
          </span>
        </StatusStrip>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Requests, last minute" value={s.lastMinute} hint={`Ceiling ${draft.maxPerMinute}`} />
        <MetricCard label="Waiting" value={s.waiting} hint={`At most ${draft.queueLimit}`} />
        <MetricCard label="Errors in a row" value={s.errorsInARow} tone={s.errorsInARow ? "warning" : "default"} hint={`Pauses at ${draft.errorsToPause}`} />
        <MetricCard label="Live access" value={granted.length} hint="People besides Admin" />
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <h3 className="font-semibold">Who may read Noor live</h3>
        <p className="text-sm text-muted-foreground">Admin always may. Everyone else sees the saved copy (the tables Admin&apos;s sync collected, the content collected before) unless granted here. Live views, Noor admin pages, slips and content reads all count as live.</p>
        <div className="flex flex-wrap gap-2" data-noor-grants>
          {granted.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-sm">
              {g.name}
              <button type="button" aria-label={`Take live access from ${g.name}`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => void save({ grants: draft.grants.filter((x) => x !== g.id) }, `Live access taken from ${g.name}`)}>
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
          {!granted.length && <span className="text-sm text-muted-foreground">Nobody besides Admin.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Person to grant live access" value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Choose a person…</option>
            {people.filter((p) => !draft.grants.includes(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button size="sm" disabled={!pick || busy} onClick={() => (void save({ grants: [...draft.grants, pick] }, "Live access granted"), setPick(""))} data-noor-grant>Grant live access</Button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 font-semibold">Automatic reads</h3>
          <Switch checked={draft.automatic} onCheckedChange={(v) => void save({ automatic: v }, v ? "Automatic reads on" : "Automatic reads off")} aria-label="Automatic reads" data-noor-automatic />
        </div>
        <p className="text-sm text-muted-foreground">Scheduled syncs, the nightly figures, the Noor mirror and scheduled reports. Off: nothing reads Noor by itself; Admin collects data when it suits Noor (Legacy CMS, Live, Sync; Content, Collect from Noor), slowly, through these limits.</p>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h3 className="font-semibold">Pace</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, label, hint]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`ng-${k}`}>{label}</Label>
              <Input id={`ng-${k}`} type="number" min={0} step="any" value={String(draft[k])} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save({})} data-noor-pace-save>Save the pace</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft({ ...s.defaults, grants: draft.grants, automatic: draft.automatic })}>Back to the safe defaults</Button>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">Latest requests to Noor</h3>
        {s.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-2 font-medium">When</th><th className="pr-2 font-medium">Request</th><th className="pr-2 font-medium">Answer</th><th className="pr-2 text-right font-medium">Time</th><th className="text-right font-medium">Size</th></tr>
              </thead>
              <tbody>
                {s.recent.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2 whitespace-nowrap">{at(r.at)}</td>
                    <td className="pr-2 font-mono">{r.method} {r.path}</td>
                    <td className={r.status >= 200 && r.status < 400 ? "pr-2" : "pr-2 text-destructive"}>{r.status || r.note || "No answer"}</td>
                    <td className="pr-2 text-right tabular-nums">{(r.ms / 1000).toFixed(1)} s</td>
                    <td className="text-right tabular-nums">{r.bytes ? `${Math.round(r.bytes / 1024)} KB` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No requests since the server started.</p>
        )}
      </section>
    </div>
  );
}
