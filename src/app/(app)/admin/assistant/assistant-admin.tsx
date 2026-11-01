"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveAssistantConfigAction } from "@/app/actions/assistant";
import type { AssistantConfig } from "@/lib/assistant";
import type { AssistantStats } from "@/server/assistant";
import { cn } from "@/lib/utils";

const cell = (x: unknown) => `"${String(x).replace(/"/g, '""')}"`;

export function AssistantAdmin({ config, stats, flows, roles }: { config: AssistantConfig; stats: AssistantStats; flows: { key: string; title: string; keywords: string[] }[]; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const [busy, setBusy] = React.useState(false);
  const [qa, setQa] = React.useState({ q: "", words: "", a: "" });
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  const save = async () => {
    setBusy(true);
    const r = await saveAssistantConfigAction(c);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Assistant saved");
    router.refresh();
  };
  const toggle = (flow: string, role: string) => {
    const cur = c.off[flow] ?? [];
    setC({ ...c, off: { ...c.off, [flow]: cur.includes(role) ? cur.filter((x) => x !== role) : [...cur, role] } });
  };
  const csv = () => {
    const rows: unknown[][] = [
      ["flow", "started", "finished", "gave up", "step most given up at", "roles"],
      ...stats.flows.map((f) => [f.title, f.started, f.finished, f.gaveUp, f.worstStep === null ? "" : f.worstStep + 1, f.roles.join(" ")]),
      [],
      ["typed, matched nothing", "times"],
      ...stats.unmatched.map((u) => [u.text, u.n]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    a.download = "assistant-usage.csv";
    a.click();
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it is used (last 8 weeks)</CardTitle>
          <CardDescription>Flows started and finished, where people gave up, and what people typed that matched nothing (write keywords or answers for those).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" variant="outline" onClick={csv}>
            <DownloadIcon /> Export
          </Button>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-1.5 font-medium">Flow</th>
                <th className="p-1.5 font-medium">Started</th>
                <th className="p-1.5 font-medium">Finished</th>
                <th className="p-1.5 font-medium">Gave up</th>
                <th className="p-1.5 font-medium">Mostly at step</th>
              </tr>
            </thead>
            <tbody>
              {stats.flows.map((f) => (
                <tr key={f.key} className="border-t" data-assistant-stat={f.key}>
                  <td className="p-1.5">{f.title}</td>
                  <td className="p-1.5 tabular-nums">{f.started}</td>
                  <td className="p-1.5 tabular-nums">{f.finished}</td>
                  <td className="p-1.5 tabular-nums">{f.gaveUp}</td>
                  <td className="p-1.5 tabular-nums">{f.worstStep === null ? "" : f.worstStep + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.weeks.length > 0 && <p className="text-xs text-muted-foreground">Per week: {stats.weeks.map((w) => `${w.week}: ${w.started}`).join(" · ")}</p>}
          <div>
            <p className="text-sm font-medium">Typed, matched nothing</p>
            {!stats.unmatched.length ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="text-sm">
                {stats.unmatched.map((u) => (
                  <li key={u.text}>
                    {u.text} <span className="text-muted-foreground">×{u.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flows per role</CardTitle>
          <CardDescription>Each flow shows to the people it is written for; switch it off for a role, or for everyone. Extra keywords help typed questions find it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flows.map((f) => {
            const off = c.off[f.key] ?? [];
            return (
              <div key={f.key} className="space-y-1.5 rounded-lg border p-2.5" data-assistant-flow-setup={f.key}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-medium">{f.title}</p>
                  <button type="button" aria-pressed={off.includes("*")} onClick={() => toggle(f.key, "*")} className={cn("rounded-full border px-2.5 py-0.5 text-xs", off.includes("*") ? "border-destructive bg-destructive text-white" : "hover:bg-muted")}>
                    {off.includes("*") ? "Off for everyone" : "On"}
                  </button>
                </div>
                {!off.includes("*") && (
                  <div className="flex flex-wrap gap-1">
                    {roles.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={!off.includes(r.key)}
                        aria-label={`${f.title} for ${r.label}`}
                        onClick={() => toggle(f.key, r.key)}
                        className={cn("rounded-full border px-2 py-0.5 text-[11px]", off.includes(r.key) ? "text-muted-foreground line-through" : "hover:bg-muted")}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  className="h-8 text-xs"
                  aria-label={`Extra keywords for ${f.title}`}
                  placeholder={`Extra keywords, comma separated (built in: ${f.keywords.slice(0, 4).join(", ")}...)`}
                  value={(c.keywords[f.key] ?? []).join(", ")}
                  onChange={(e) => setC({ ...c, keywords: { ...c.keywords, [f.key]: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Short answers</CardTitle>
          <CardDescription>Answers to common questions, found by their keywords (for example: when is pay day).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {c.answers.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded border p-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">{a.q}</p>
                <p className="text-muted-foreground">{a.a}</p>
                <p className="text-[11px] text-muted-foreground">Keywords: {a.words.join(", ")}</p>
              </div>
              <button type="button" aria-label="Remove" onClick={() => setC({ ...c, answers: c.answers.filter((_, j) => j !== i) })}>
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={qa.q} onChange={(e) => setQa({ ...qa, q: e.target.value })} placeholder="Question" aria-label="Question" />
            <Input value={qa.words} onChange={(e) => setQa({ ...qa, words: e.target.value })} placeholder="Keywords, comma separated" aria-label="Keywords" />
            <Textarea className="sm:col-span-2" rows={2} value={qa.a} onChange={(e) => setQa({ ...qa, a: e.target.value })} placeholder="Answer" aria-label="Answer" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!qa.q.trim() || !qa.a.trim()}
            onClick={() => (setC({ ...c, answers: [...c.answers, { q: qa.q.trim(), words: qa.words.split(",").map((x) => x.trim()).filter(Boolean), a: qa.a.trim() }] }), setQa({ q: "", words: "", a: "" }))}
          >
            <PlusIcon /> Add the answer
          </Button>
        </CardContent>
      </Card>
      <div className="sticky bottom-3 flex justify-end">
        <Button disabled={!dirty || busy} onClick={save} className="shadow-lg">
          {dirty ? "Save the assistant" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
