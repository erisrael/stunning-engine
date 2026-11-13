"use client";

// The AI page's usage tab (Update 1.0, phase 7): keys in use (masked), calls, tokens and cost per day and per model
// from the call monitor, Admin's prices per model, and a test console that sends one question.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CallsChart } from "@/components/app/integrations/hub-ui";
import { aiConsoleAction, saveAiPricesAction } from "@/app/actions/assistant";
import { cn } from "@/lib/utils";

type Totals = { calls: number; failures: number; tokensIn: number; tokensOut: number; cost: number };
type Costs = { days: number; total: Totals; byDay: ({ day: string } & Totals)[]; byModel: ({ model: string; avgMs: number } & Totals)[]; prices: Record<string, { in: number; out: number }> };
type Model = { id: string; name: string; provider: string; model: string; isDefault: boolean; active: boolean; keyHint?: string | null };
type ConsoleResult = { ok: boolean; text: string; ms: number; tokensIn: number; tokensOut: number; model: string };

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : "$0");
const num = (n: number) => n.toLocaleString();

export function AiUsage({ costs, models, current }: { costs: Costs; models: Model[]; current: { provider: string; model: string; on: boolean } }) {
  const router = useRouter();
  const [prices, setPrices] = React.useState<Record<string, { in: string; out: string }>>(() => {
    const names = new Set([current.model, ...models.map((m) => m.model), ...Object.keys(costs.prices)].filter(Boolean));
    return Object.fromEntries([...names].map((m) => [m, { in: String(costs.prices[m]?.in ?? ""), out: String(costs.prices[m]?.out ?? "") }]));
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [modelId, setModelId] = React.useState("");
  const [result, setResult] = React.useState<ConsoleResult | null>(null);

  // One bar per day of the period, failures stacked on top.
  const series = React.useMemo(() => {
    const out: { at: string; calls: number; failures: number }[] = [];
    for (let i = costs.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      const x = costs.byDay.find((b) => b.day === d);
      out.push({ at: `${d}T12:00:00.000Z`, calls: x?.calls ?? 0, failures: x?.failures ?? 0 });
    }
    return out;
  }, [costs]);

  const savePrices = async () => {
    setBusy("prices");
    const clean = Object.fromEntries(Object.entries(prices).filter(([, p]) => p.in !== "" || p.out !== "").map(([m, p]) => [m, { in: Number(p.in) || 0, out: Number(p.out) || 0 }]));
    const r = await saveAiPricesAction(clean);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    toast.success(`Prices saved for ${Object.keys(clean).length} models`);
    router.refresh();
  };
  const send = async () => {
    setBusy("console");
    const r = await aiConsoleAction({ prompt, modelId: modelId || null });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    if (r.data) setResult(r.data);
    router.refresh();
  };

  return (
    <div className="space-y-4" data-ai-usage>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Calls", num(costs.total.calls)],
          ["Failed", num(costs.total.failures)],
          ["Tokens in / out", `${num(costs.total.tokensIn)} / ${num(costs.total.tokensOut)}`],
          ["Cost", usd(costs.total.cost)],
        ].map(([l, v]) => (
          <Card key={l} className="gap-1 py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">
                {l} ({costs.days} days)
              </p>
              <p className="text-xl font-semibold tabular-nums" data-ai-total={l}>
                {v}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calls per day</CardTitle>
          <CardDescription>
            Every model call is in the <Link href="/admin/integrations?tab=monitor&source=ai" className="underline">call monitor</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallsChart series={series} bucketH={24} label="calls" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By model</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-ai-by-model>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Model</th>
                  <th className="py-1 text-right font-medium">Calls</th>
                  <th className="py-1 text-right font-medium">Tokens</th>
                  <th className="py-1 text-right font-medium">Avg time</th>
                  <th className="py-1 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {costs.byModel.map((m) => (
                  <tr key={m.model} className="border-t">
                    <td className="py-1.5">{m.model || "–"}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", m.failures && "text-destructive")}>
                      {m.calls}
                      {m.failures ? ` (${m.failures} failed)` : ""}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{num(m.tokensIn + m.tokensOut)}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.avgMs} ms</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(m.cost)}</td>
                  </tr>
                ))}
                {!costs.byModel.length && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted-foreground">
                      No AI calls yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keys</CardTitle>
            <CardDescription>Only the last characters are shown. In use: {current.on ? `${current.provider} ${current.model}` : "AI is off"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm" data-ai-keys>
              {models.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1">
                    {m.name} <span className="text-xs text-muted-foreground">{m.provider} {m.model}</span>
                  </span>
                  {m.isDefault && <span className="text-xs text-muted-foreground">default</span>}
                  <span className="font-mono text-xs">{m.keyHint ?? "no key"}</span>
                </li>
              ))}
              {!models.length && <li className="px-3 py-2 text-muted-foreground">No saved models. Add them on the AI Models tab.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prices</CardTitle>
            <CardDescription>US dollars per million tokens, from the provider&apos;s price list. Cost is worked out from these.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2" data-ai-prices>
            {Object.entries(prices).map(([m, p]) => (
              <div key={m} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2">
                <span className="truncate text-sm" title={m}>
                  {m}
                </span>
                <Input inputMode="decimal" aria-label={`${m} input price`} placeholder="in" value={p.in} onChange={(e) => setPrices({ ...prices, [m]: { ...p, in: e.target.value } })} />
                <Input inputMode="decimal" aria-label={`${m} output price`} placeholder="out" value={p.out} onChange={(e) => setPrices({ ...prices, [m]: { ...p, out: e.target.value } })} />
              </div>
            ))}
            <Button size="sm" disabled={!!busy} onClick={savePrices} data-save-prices>
              {busy === "prices" && <Loader2Icon className="animate-spin" />} Save prices
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test console</CardTitle>
            <CardDescription>Send one question to a model and see the answer, time and tokens. It is logged as a test.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2" data-ai-console>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Model to test" value={modelId} onChange={(e) => setModelId(e.target.value)}>
              <option value="">The model in use ({current.model})</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Textarea rows={3} aria-label="Question" placeholder="Say hello in one sentence." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <Button size="sm" disabled={!!busy || !prompt.trim()} onClick={send}>
              {busy === "console" && <Loader2Icon className="animate-spin" />} Send
            </Button>
            {result && (
              <div className={cn("rounded-lg border p-3 text-sm", !result.ok && "border-destructive/40")} data-console-result data-ok={result.ok ? "1" : "0"}>
                <p className="whitespace-pre-wrap">{result.text}</p>
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  {result.model} · {result.ms} ms · {result.tokensIn} in / {result.tokensOut} out tokens
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
