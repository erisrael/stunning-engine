"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DATE_PRESETS } from "@/lib/date-presets";
import { exportDashboardAction } from "@/app/actions/support-ivr";

// Customer support › Analytics (Update 1.2, spec 18). Filters live in the address, so a view can be shared.

type Dash = Awaited<ReturnType<typeof import("@/server/support-dashboard").supportDashboard>>;
type Opt = { id: string; name: string };
const select = "h-8 rounded-md border bg-background px-2 text-sm";
const dash = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : `${v}${unit}`);
const secs = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border p-2" title={hint}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function SupportAnalytics({ d, preset, agents, queues, departments, statuses, canExport }: { d: Dash; preset: string; agents: Opt[]; queues: Opt[]; departments: { key: string; label: string }[]; statuses: { key: string; label: string }[]; canExport: boolean }) {
  const router = useRouter();
  const f = d.filters;
  const [form, setForm] = React.useState({ preset, from: f.from, to: f.to, agent: f.agentId ?? "", department: f.department ?? "", queue: f.queueId ?? "", category: f.category ?? "", customer: f.customer ?? "", status: f.status ?? "" });
  const apply = (next = form) => {
    const p = new URLSearchParams({ tab: "analytics" });
    if (next.preset) p.set("range", next.preset);
    if (next.preset === "custom") (p.set("from", next.from), p.set("to", next.to));
    for (const k of ["agent", "department", "queue", "category", "customer", "status"] as const) if (next[k]) p.set(k, next[k]);
    router.push(`/support?${p}`);
  };
  const exp = async (format: "csv" | "xlsx") => {
    const r = await exportDashboardAction(f, format);
    if (!r.ok) return void toast.error(r.error);
    const bytes = Uint8Array.from(atob(r.data!.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.data!.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.data!.name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const c = d.conversations;
  const k = d.callCenter;
  const m = d.finance;
  return (
    <div className="space-y-4" data-support-analytics>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <select aria-label="Dates" className={select} value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
          {DATE_PRESETS.filter(([p]) => p !== "all").map(([p, l]) => (
            <option key={p} value={p}>{l}</option>
          ))}
        </select>
        {form.preset === "custom" && (
          <>
            <Input aria-label="From" type="date" className="h-8 w-36" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            <Input aria-label="To" type="date" className="h-8 w-36" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </>
        )}
        <select aria-label="Agent" className={select} value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}>
          <option value="">Every agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select aria-label="Department" className={select} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          <option value="">Every department</option>
          {departments.map((x) => (
            <option key={x.key} value={x.key}>{x.label}</option>
          ))}
        </select>
        <select aria-label="Queue" className={select} value={form.queue} onChange={(e) => setForm({ ...form, queue: e.target.value })}>
          <option value="">Every queue</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
        <Input aria-label="Category" className="h-8 w-32" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <Input aria-label="Customer" className="h-8 w-36" placeholder="Customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
        <select aria-label="Status" className={select} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" type="submit" data-analytics-apply>Apply</Button>
        {canExport && (
          <span className="ml-auto flex gap-2">
            <Button size="sm" type="button" variant="outline" onClick={() => void exp("csv")} data-analytics-csv>
              <DownloadIcon /> CSV
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => void exp("xlsx")} data-analytics-xlsx>
              <DownloadIcon /> Excel
            </Button>
          </span>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        {f.from} to {f.to} (Addis Ababa days). Every number comes from the stored conversations, calls and requests.
      </p>
      <Card data-analytics-conversations>
        <CardHeader>
          <CardTitle className="text-base">Conversations</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Tile label="Total" value={<span data-analytics-total>{c.total}</span>} />
          <Tile label="New" value={c.new} />
          <Tile label="Active" value={c.active} />
          <Tile label="Resolved" value={c.resolved} />
          <Tile label="Unresolved" value={c.unresolved} />
          <Tile label="Reopened" value={c.reopened} />
          <Tile label="First response" value={dash(c.firstResponseMin, " min")} />
          <Tile label="Resolution" value={dash(c.resolutionHours, " h")} />
          <Tile label="Satisfaction" value={c.satisfaction === null ? "—" : `${c.satisfaction} / 5`} hint={`${c.ratings} ratings`} />
          <Tile label="Escalation rate" value={dash(c.escalationRate, "%")} />
        </CardContent>
      </Card>
      <Card data-analytics-calls>
        <CardHeader>
          <CardTitle className="text-base">Call center</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Tile label="Total calls" value={k.total} />
          <Tile label="Incoming" value={k.incoming} />
          <Tile label="Outgoing" value={k.outgoing} />
          <Tile label="Answered" value={k.answered} />
          <Tile label="Missed" value={k.missed} />
          <Tile label="Declined" value={k.declined} />
          <Tile label="Abandoned" value={k.abandoned} hint="The caller hung up while waiting" />
          <Tile label="Average wait" value={secs(k.avgWaitS)} />
          <Tile label="Average duration" value={secs(k.avgDurationS)} />
          <Tile label="Service level" value={dash(k.serviceLevel, "%")} hint="Incoming calls answered within the queue's target" />
          <Tile label="Call-backs completed" value={dash(k.callbackCompletion, "%")} />
        </CardContent>
      </Card>
      <Card data-analytics-finance>
        <CardHeader>
          <CardTitle className="text-base">Financial support</CardTitle>
          <CardDescription>Payment conversations are found by their category, subject or Chapa follow-up; requests by their type and destination.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Payment inquiries" value={m.paymentInquiries} />
          <Tile label="Verification requests" value={m.verificationRequests} />
          <Tile label="Failed transactions" value={m.failedTransactionInquiries} />
          <Tile label="Refund requests" value={m.refundRequests} />
          <Tile label="Resolved payment issues" value={m.resolvedPaymentIssues} />
          <Tile label="Pending Finance requests" value={m.pendingFinanceRequests} />
        </CardContent>
      </Card>
      <Card data-analytics-agents>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {d.agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents in the queues yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    {["Agent", "Conversations", "Calls", "Avg handle", "Avg response", "Resolved", "Missed calls", "Rating", "Available", "Queues"].map((h, i) => (
                      <th key={h} className={i ? "p-2 text-right" : "p-2"}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.agents.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-2">{a.name}</td>
                      <td className="p-2 text-right tabular-nums">{a.conversations}</td>
                      <td className="p-2 text-right tabular-nums">{a.calls}</td>
                      <td className="p-2 text-right tabular-nums">{secs(a.avgHandleS)}</td>
                      <td className="p-2 text-right tabular-nums">{dash(a.avgResponseMin, " min")}</td>
                      <td className="p-2 text-right tabular-nums">{dash(a.resolutionRate, "%")}</td>
                      <td className="p-2 text-right tabular-nums">{a.missedCalls}</td>
                      <td className="p-2 text-right tabular-nums">{dash(a.rating)}</td>
                      <td className="p-2 text-right tabular-nums">{a.availableHours} h</td>
                      <td className="p-2 text-right tabular-nums">{a.queues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
