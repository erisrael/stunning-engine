"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AwardIcon, HeartHandshakeIcon, Loader2Icon, MedalIcon, TrendingDownIcon, TrendingUpIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as A from "@/app/actions/recognition";
import { BADGES, KUDOS_VALUES, PARTS, PART_LABELS, type AwardRow, type BadgeKey, type RecognitionConfig, type ScoreRow } from "@/lib/recognition";
import { cn } from "@/lib/utils";

type Board = { period: string; rows: ScoreRow[]; top: ScoreRow[]; mine: ScoreRow | null; support: ScoreRow[]; total: number; departments: string[]; seesAll: boolean; showScores: boolean };
type Kudos = { id: string; from_name: string; to_name: string; to_user: string; value: string; message: string; created_at: string };
const TAB_LABELS: Record<string, string> = { leaderboard: "Leaderboard", badges: "Badges and titles", kudos: "Kudos", settings: "Settings" };
const select = "h-9 rounded-md border bg-background px-2 text-sm";

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
    toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}

const medal = (rank: number) => (rank === 1 ? "text-[#F9AB00]" : rank === 2 ? "text-[#9AA0A6]" : rank === 3 ? "text-[#B06000]" : "text-muted-foreground");

export function RecognitionClient(props: { tab: string; tabs: string[]; cfg: RecognitionConfig; board: Board | null; awards: AwardRow[]; kudos: Kudos[]; people: { id: string; name: string }[]; viewerId: string; seesAll: boolean; admin: boolean; period: string; current: string; dept: string }) {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Recognition">
        {props.tabs.map((t) => (
          <Link key={t} href={`/recognition?tab=${t}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", props.tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>
      {props.tab === "leaderboard" && props.board && <Leaderboard {...props} board={props.board} />}
      {props.tab === "badges" && <Badges {...props} />}
      {props.tab === "kudos" && <KudosTab {...props} />}
      {props.tab === "settings" && <Settings cfg={props.cfg} current={props.current} />}
    </div>
  );
}

function Parts({ r, show }: { r: ScoreRow; show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {PARTS.filter((p) => r.parts[p] !== undefined).map((p) => (
        <span key={p}>
          {PART_LABELS[p]} {r.parts[p]}
        </span>
      ))}
    </div>
  );
}

function Leaderboard({ board, period, current, dept, seesAll }: { board: Board; period: string; current: string; dept: string; seesAll: boolean }) {
  const router = useRouter();
  const go = (p: string, d: string) => router.push(`/recognition?tab=leaderboard&period=${p}${d ? `&dept=${encodeURIComponent(d)}` : ""}`);
  return (
    <div className="space-y-4" data-leaderboard>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="lb-month">Month</Label>
          <Input id="lb-month" type="month" max={current} className="w-44" value={period} onChange={(e) => e.target.value && go(e.target.value, dept)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lb-dept">Department</Label>
          <select id="lb-dept" className={cn(select, "w-48")} value={dept} onChange={(e) => go(period, e.target.value)}>
            <option value="">Everyone</option>
            {board.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {board.mine && (
          <div className="ml-auto rounded-lg border bg-primary/5 px-3 py-2 text-sm" data-my-rank>
            You are <b>#{board.mine.rank}</b> of {board.total} with <b>{board.mine.score}</b>
            {board.mine.previous !== null && (
              <span className={cn("ml-2 inline-flex items-center gap-0.5 text-xs", board.mine.score >= board.mine.previous ? "text-[#188038]" : "text-[#D93025]")}>
                {board.mine.score >= board.mine.previous ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
                {Math.round((board.mine.score - board.mine.previous) * 10) / 10} on last month
              </span>
            )}
            <Parts r={board.mine} show />
          </div>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrophyIcon className="size-4 text-[#F9AB00]" /> {seesAll ? `Everyone (${board.total})` : `Top ${board.top.length}`}
          </CardTitle>
          <CardDescription>Scores out of 100 from attendance, delivery on time, quality and teamwork. Scored only with attendance or finished work in the month.</CardDescription>
        </CardHeader>
        <CardContent>
          {board.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scores for this month yet.</p>
          ) : (
            <ol className="divide-y">
              {board.rows.map((r) => (
                <li key={r.userId} className={cn("flex items-center gap-3 py-2", r.userId === board.mine?.userId && "bg-primary/5")} data-rank-row={r.rank}>
                  <span className={cn("flex w-8 justify-center font-semibold tabular-nums", medal(r.rank))}>{r.rank <= 3 ? <MedalIcon className="size-5" /> : r.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.department ?? ""}</p>
                    <Parts r={r} show={board.showScores} />
                  </div>
                  {board.showScores && (
                    <div className="w-28">
                      <div className="h-2 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${r.score}%` }} />
                      </div>
                    </div>
                  )}
                  {board.showScores && <span className="w-12 text-right font-semibold tabular-nums">{r.score}</span>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      {seesAll && board.support.length > 0 && (
        <Card data-needs-support>
          <CardHeader>
            <CardTitle className="text-base">Needs support</CardTitle>
            <CardDescription>The lowest scores this month, with what pulls them down. Seen by HR, Admin and owners only: a talk and help first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {board.support.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center gap-2">
                  <span className="w-40 truncate font-medium">{r.name}</span>
                  <span className="w-12 tabular-nums">{r.score}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.facts.absent && `${r.facts.absent} absent`, r.facts.late && `${r.facts.late} late`, r.facts.withDue - r.facts.onTime > 0 && `${r.facts.withDue - r.facts.onTime} past due`, r.facts.returns && `${r.facts.returns} sent back`].filter(Boolean).join(" · ") || "low volume"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Badges({ awards, people, viewerId, seesAll, current }: { awards: AwardRow[]; people: { id: string; name: string }[]; viewerId: string; seesAll: boolean; current: string }) {
  const { act, busy } = useAct();
  const [t, setT] = React.useState({ userId: "", title: "Employee of the month", reason: "", period: current });
  const mine = awards.filter((a) => a.userId === viewerId);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My badges and titles</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Badges are given at the start of each month for the month before.</p>
          ) : (
            <div className="flex flex-wrap gap-2" data-my-badges>
              {mine.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full border bg-[#F9AB00]/10 px-2.5 py-1 text-xs" title={a.reason ?? ""}>
                  <AwardIcon className="size-3.5 text-[#B06000]" /> {a.title} · {a.period}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">The badges</CardTitle>
          <CardDescription>Given by these rules, every month.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(Object.keys(BADGES) as BadgeKey[]).map((k) => (
              <li key={k}>
                <b>{BADGES[k].label}</b>: <span className="text-muted-foreground">{BADGES[k].description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {seesAll && (
        <Card className="lg:col-span-2" data-give-title>
          <CardHeader>
            <CardTitle className="text-base">Give a title</CardTitle>
            <CardDescription>&quot;Employee of the month&quot;, &quot;Best presenter of the term&quot; or your own. The person is told.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <select aria-label="Person" className={cn(select, "w-56")} value={t.userId} onChange={(e) => setT({ ...t, userId: e.target.value })}>
              <option value="">Choose a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input aria-label="Title" className="w-56" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
            <Input aria-label="Month of the title" type="month" className="w-40" value={t.period} onChange={(e) => setT({ ...t, period: e.target.value })} />
            <Input aria-label="Why" placeholder="Why" className="w-72" value={t.reason} onChange={(e) => setT({ ...t, reason: e.target.value })} />
            <Button disabled={busy || !t.userId || !t.title.trim() || !t.reason.trim()} onClick={async () => (await act(() => A.giveTitleAction(t), "Title given")) && setT({ ...t, reason: "" })}>
              <AwardIcon /> Give the title
            </Button>
          </CardContent>
        </Card>
      )}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Recently earned</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm" data-awards>
            {awards.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <AwardIcon className={cn("size-4", a.auto ? "text-[#B06000]" : "text-primary")} />
                <span className="font-medium">{a.name}</span>
                <span>{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {a.period} · {a.reason}
                </span>
                {seesAll && (
                  <Button size="xs" variant="ghost" className="ml-auto" disabled={busy} onClick={() => window.confirm(`Remove "${a.title}" from ${a.name}?`) && act(() => A.removeAwardAction(a.id), "Removed")}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
            {awards.length === 0 && <li className="py-2 text-muted-foreground">No badges or titles yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function KudosTab({ kudos, people }: { kudos: Kudos[]; people: { id: string; name: string }[] }) {
  const { act, busy } = useAct();
  const [k, setK] = React.useState({ to: "", value: "helpful", message: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshakeIcon className="size-4" /> Thank a colleague
          </CardTitle>
          <CardDescription>Kudos count for teamwork in the monthly score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2" data-give-kudos>
          <select aria-label="Who" className={cn(select, "w-full")} value={k.to} onChange={(e) => setK({ ...k, to: e.target.value })}>
            <option value="">Choose a colleague</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select aria-label="For" className={cn(select, "w-full")} value={k.value} onChange={(e) => setK({ ...k, value: e.target.value })}>
            {Object.entries(KUDOS_VALUES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Input aria-label="What they did" placeholder="What they did" value={k.message} onChange={(e) => setK({ ...k, message: e.target.value })} />
          <Button className="w-full" disabled={busy || !k.to || k.message.trim().length < 5} onClick={async () => (await act(() => A.giveKudosAction(k), "Kudos sent")) && setK({ ...k, message: "" })}>
            {busy && <Loader2Icon className="animate-spin" />} Send kudos
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kudos wall</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm" data-kudos-wall>
            {kudos.map((x) => (
              <li key={x.id} className="rounded-lg border p-2">
                <p>
                  <b>{x.from_name}</b> to <b>{x.to_name}</b>: <span className="text-muted-foreground">{KUDOS_VALUES[x.value as keyof typeof KUDOS_VALUES] ?? x.value}</span>
                </p>
                <p>{x.message}</p>
                <p className="text-xs text-muted-foreground">{new Date(x.created_at).toLocaleDateString()}</p>
              </li>
            ))}
            {kudos.length === 0 && <li className="text-muted-foreground">No kudos yet. Be the first.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Settings({ cfg, current }: { cfg: RecognitionConfig; current: string }) {
  const { act, busy } = useAct();
  const [c, setC] = React.useState(cfg);
  const total = PARTS.reduce((a, p) => a + (c.weights[p] || 0), 0);
  const last = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  return (
    <Card data-recognition-settings>
      <CardHeader>
        <CardTitle className="text-base">Recognition setup</CardTitle>
        <CardDescription>Switch the leaderboard, badges and kudos on or off for everyone, and set how the score is made.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <label className="flex items-center gap-3">
          <Switch checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} aria-label="Recognition on" />
          <span>
            <b>Recognition {c.enabled ? "on" : "off"}</b>
            <span className="block text-xs text-muted-foreground">Off: nobody sees scores, badges or kudos, and no badges are given.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="rc-board">Leaderboard</Label>
            <select id="rc-board" className={cn(select, "w-full")} value={c.leaderboard} onChange={(e) => setC({ ...c, leaderboard: e.target.value as RecognitionConfig["leaderboard"] })}>
              <option value="everyone">Everyone sees the top and their own place</option>
              <option value="managers">Only HR, Admin and owners</option>
              <option value="off">Off (badges and kudos only)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-top">How many on the board</Label>
            <Input id="rc-top" type="number" min={3} max={100} value={c.topN} onChange={(e) => setC({ ...c, topN: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-kpm">Kudos a person gives a month</Label>
            <Input id="rc-kpm" type="number" min={1} max={100} value={c.kudosPerMonth} onChange={(e) => setC({ ...c, kudosPerMonth: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={c.showScores} onCheckedChange={(v) => setC({ ...c, showScores: v })} aria-label="Show scores" /> Show scores to everyone (off: only the order)
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={c.kudos} onCheckedChange={(v) => setC({ ...c, kudos: v })} aria-label="Kudos" /> Kudos between colleagues
          </label>
        </div>
        <div className="space-y-1">
          <Label>Weights (out of {total})</Label>
          <div className="grid gap-2 sm:grid-cols-4">
            {PARTS.map((p) => (
              <div key={p} className="space-y-1">
                <Label htmlFor={`rc-w-${p}`} className="text-xs font-normal text-muted-foreground">
                  {PART_LABELS[p]}
                </Label>
                <Input id={`rc-w-${p}`} type="number" min={0} max={100} value={c.weights[p]} onChange={(e) => setC({ ...c, weights: { ...c.weights, [p]: Number(e.target.value) } })} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Badges given</Label>
          <div className="grid gap-1 sm:grid-cols-2">
            {(Object.keys(BADGES) as BadgeKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={c.badges[k]} onChange={(e) => setC({ ...c, badges: { ...c.badges, [k]: e.target.checked } })} /> {BADGES[k].label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => act(() => A.saveRecognitionAction(c), "Saved")}>
            Save
          </Button>
          {cfg.enabled && (
            <Button variant="outline" disabled={busy} onClick={() => act(() => A.awardMonthAction(last), `Badges for ${last} given`)}>
              Give {last}&apos;s badges now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
