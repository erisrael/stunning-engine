"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveFunConfigAction } from "@/app/actions/fun";
import type { FunConfig, PointRule } from "@/server/fun";

// Admin, Fun mode: what people get in the Fun window (music, lyrics, playlists, games, the pet, points, the board,
// moods), who sees it, when games are open, and how work earns points.
export function FunAdmin({ initial, games, roles }: { initial: FunConfig; games: { key: string; label: string; note: string }[]; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState<FunConfig>(initial);
  const [saving, setSaving] = React.useState(false);
  const set = (p: Partial<FunConfig>) => setC((x) => ({ ...x, ...p }));
  const rule = (i: number, p: Partial<PointRule>) => set({ rules: c.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const Toggle = ({ k, label, hint }: { k: "enabled" | "world" | "worldChat" | "focus" | "youtube" | "music" | "lyrics" | "playlists" | "pet" | "points" | "leaderboard" | "moods"; label: string; hint: string }) => (
    <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={c[k]} onCheckedChange={(v) => set({ [k]: v } as Partial<FunConfig>)} aria-label={label} data-fun-switch={k} />
    </label>
  );
  return (
    <div className="space-y-4" data-fun-admin>
      <Card>
        <CardHeader>
          <CardTitle>Fun mode</CardTitle>
          <CardDescription>A side window with free music (Audius) and lyrics (LRCLIB), games, a pet and morale boosters. Work earns points that grow the pet; games never earn points.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Toggle k="enabled" label="Fun mode on" hint="The gamepad in the top bar, Alt+F and the assistant's fun commands." />
          <Toggle k="world" label="Seed Town 3D" hint="The office world: homes, department workspaces, who is working, characters people design, chat bubbles." />
          <Toggle k="worldChat" label="Chat in Seed Town" hint="Speech bubbles over the characters (kept for seven seconds, never stored)." />
          <Toggle k="focus" label="Focus mode" hint="A focus timer, a persona quiz and recommended music; finished sessions earn points." />
          <Toggle k="youtube" label="YouTube in focus mode" hint="Play YouTube playlists and videos; sign-in for people's own playlists needs the client ID below." />
          <Toggle k="music" label="Music" hint="Search, moods, trending, the player." />
          <Toggle k="lyrics" label="Lyrics" hint="Words for the song playing, synced when available." />
          <Toggle k="playlists" label="Playlists" hint="People make playlists and may share them with the team." />
          <Toggle k="pet" label="Pet" hint="A pet that grows with work points." />
          <Toggle k="points" label="Points" hint="Work earns points by the rules below." />
          <Toggle k="leaderboard" label="Weekly board" hint="The week's top ten by work points." />
          <Toggle k="moods" label="Mood check-in" hint="One tap a day; the team sees only the spread, never who said what." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seed Town</CardTitle>
          <CardDescription>Who sees who is absent or on leave (everyone else sees them as away), and what fills the bar over each head.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Name</span>
            <Input value={c.worldName} onChange={(e) => set({ worldName: e.target.value })} aria-label="World name" className="h-8" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Absences shown to</span>
            <select value={c.worldAbsence} onChange={(e) => set({ worldAbsence: e.target.value as FunConfig["worldAbsence"] })} aria-label="Absences shown to" className="h-8 w-full rounded-md border bg-background px-2">
              <option value="hr">HR and Admin</option>
              <option value="leads">HR, Admin and team leads</option>
              <option value="everyone">Everyone</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">The bar shows</span>
            <select value={c.worldProgress} onChange={(e) => set({ worldProgress: e.target.value as FunConfig["worldProgress"] })} aria-label="Progress bar" className="h-8 w-full rounded-md border bg-background px-2">
              <option value="points">Today's work points (of the daily cap)</option>
              <option value="tasks">Tasks finished today</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">YouTube sign-in</CardTitle>
          <CardDescription>
            Optional. In Google Cloud make an OAuth client (Web application) with this site as an authorised JavaScript origin, switch on the YouTube Data API v3 and paste its client ID. People then sign in to see their own playlists. Without it they paste playlist links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input value={c.youtubeClientId} onChange={(e) => set({ youtubeClientId: e.target.value })} placeholder="1234567890-abc.apps.googleusercontent.com" aria-label="Google OAuth client ID" className="font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who and when</CardTitle>
          <CardDescription>No role ticked: everyone. Game hours empty: any time (music and the rest stay open).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {roles.map((r) => (
              <label key={r.key} className="flex items-center gap-1.5">
                <Checkbox checked={c.roles.includes(r.key)} onCheckedChange={(v) => set({ roles: v === true ? [...c.roles, r.key] : c.roles.filter((x) => x !== r.key) })} aria-label={`Fun mode for ${r.label}`} />
                {r.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Games open from
            <Input type="time" value={c.gamesFrom} onChange={(e) => set({ gamesFrom: e.target.value })} className="h-8 w-28" aria-label="Games open from" />
            to
            <Input type="time" value={c.gamesTo} onChange={(e) => set({ gamesTo: e.target.value })} className="h-8 w-28" aria-label="Games open until" />
            <Button size="xs" variant="ghost" onClick={() => set({ gamesFrom: "", gamesTo: "" })}>Any time</Button>
          </div>
          <div>
            <p className="mb-1 font-medium">Games</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => (
                <label key={g.key} className="flex items-center gap-1.5">
                  <Checkbox checked={c.games.includes(g.key)} onCheckedChange={(v) => set({ games: v === true ? [...c.games, g.key] : c.games.filter((x) => x !== g.key) })} aria-label={g.label} />
                  {g.label} <span className="text-xs text-muted-foreground">{g.note}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Points</CardTitle>
          <CardDescription>
            The first rule that matches an action pays, once per item a day, up to the daily cap. An action is the name in the activity log (Audit); * matches anything, e.g. *.task. Text match is an optional pattern the summary must contain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            Daily cap
            <Input type="number" min={0} value={c.dailyCap} onChange={(e) => set({ dailyCap: Number(e.target.value) })} className="h-8 w-24" aria-label="Daily cap" />
            points (0: no cap) · pet food costs
            <Input type="number" min={0} value={c.feedCost} onChange={(e) => set({ feedCost: Number(e.target.value) })} className="h-8 w-20" aria-label="Pet food cost" />
            points
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">On</th>
                  <th>What</th>
                  <th>Action</th>
                  <th>Text match</th>
                  <th>Points</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.rules.map((r, i) => (
                  <tr key={r.key} className="border-t" data-fun-rule={r.key}>
                    <td className="py-1"><Checkbox checked={r.on} onCheckedChange={(v) => rule(i, { on: v === true })} aria-label={`Rule ${r.label} on`} /></td>
                    <td><Input value={r.label} onChange={(e) => rule(i, { label: e.target.value })} className="h-7 text-xs" aria-label="What earns it" /></td>
                    <td><Input value={r.action} onChange={(e) => rule(i, { action: e.target.value })} className="h-7 font-mono text-xs" aria-label="Action" /></td>
                    <td><Input value={r.summary ?? ""} onChange={(e) => rule(i, { summary: e.target.value || undefined })} className="h-7 font-mono text-xs" aria-label="Text match" /></td>
                    <td><Input type="number" min={0} value={r.points} onChange={(e) => rule(i, { points: Number(e.target.value) })} className="h-7 w-20 text-xs" aria-label="Points" /></td>
                    <td><Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${r.label}`} onClick={() => set({ rules: c.rules.filter((_, j) => j !== i) })}><Trash2Icon /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="outline" onClick={() => set({ rules: [...c.rules, { key: `r${Date.now().toString(36)}`, label: "New rule", action: "", points: 5, on: true }] })}>
            <PlusIcon /> Add a rule
          </Button>
        </CardContent>
      </Card>

      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const r = await saveFunConfigAction(c);
          setSaving(false);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Fun mode saved");
          router.refresh();
        }}
        data-fun-save
      >
        {saving ? "Saving…" : "Save Fun mode"}
      </Button>
    </div>
  );
}
