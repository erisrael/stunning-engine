"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyRetentionAction, savePrivacyAction } from "@/app/actions/privacy";
import type { PrivacyConfig, Retention } from "@/server/privacy";

const FIELDS: { key: keyof Retention; label: string; unit: string }[] = [
  { key: "attendanceYears", label: "Attendance (check-ins and marks)", unit: "years" },
  { key: "applicantsMonths", label: "Applicants not hired", unit: "months" },
  { key: "notificationsDays", label: "Read notifications", unit: "days" },
  { key: "visitsDays", label: "Page visits (usage view)", unit: "days" },
  { key: "assistantDays", label: "Assistant use records", unit: "days" },
  { key: "auditYears", label: "Audit log and record access log", unit: "years" },
];
const TEMPLATE = `Myseed keeps the information needed to run your work: your account, your HR record (contract, documents, leave), attendance, pay and expense claims, and the work you do in the app.

Who can see it: you; your line manager (your leave, attendance and work); HR (your HR record); Finance (pay and claims); Admin (to run the system). Opening someone's HR or salary record is logged.

How long it is kept: see the retention schedule below; after that it is removed automatically.

Your rights: you can download everything the app keeps about you (Profile, or the link below), ask HR to correct anything wrong, and ask questions to HR.`;

export function PrivacyAdmin({ config, report, log }: { config: PrivacyConfig; report: { version: number; accepted: number; waiting: { id: string; name: string }[] }; log: { at: string; viewer: string; employee: string; what: string }[] }) {
  const router = useRouter();
  const [notice, setNotice] = React.useState(config.notice);
  const [ret, setRet] = React.useState(config.retention);
  const [busy, setBusy] = React.useState<string | null>(null);
  const save = async () => {
    setBusy("save");
    const r = await savePrivacyAction({ notice, retention: ret });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.data !== config.version ? `Saved as version ${r.data}; everyone accepts it again` : "Saved");
    router.refresh();
  };
  const apply = async () => {
    setBusy("apply");
    const r = await applyRetentionAction();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const parts = Object.entries(r.data ?? {}).map(([k, v]) => `${v} ${k}`);
    toast.success(parts.length ? `Removed ${parts.join(", ")}` : "Nothing was past its time");
  };
  return (
    <div className="space-y-4" data-privacy-admin>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy notice</CardTitle>
          <CardDescription>Shown to everyone before anything else until they accept it; a changed notice is a new version that everyone accepts again. Version {config.version || "none yet"}: {report.accepted} accepted{report.waiting.length ? `, ${report.waiting.length} not yet` : ""}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Textarea aria-label="Privacy notice" rows={10} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Write the notice, or start from the template." />
          {!notice && (
            <Button size="sm" variant="outline" onClick={() => setNotice(TEMPLATE)}>
              Start from a template
            </Button>
          )}
          {report.waiting.length > 0 && report.version > 0 && <p className="text-xs text-muted-foreground">Not accepted yet: {report.waiting.slice(0, 40).map((p) => p.name).join(", ")}{report.waiting.length > 40 ? "…" : ""}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention schedule</CardTitle>
          <CardDescription>Applied every day by the scheduled checks; what was removed is written in the audit log.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`ret-${f.key}`}>
                {f.label} ({f.unit})
              </Label>
              <Input id={`ret-${f.key}`} type="number" min={1} value={ret[f.key]} onChange={(e) => setRet({ ...ret, [f.key]: Number(e.target.value) })} />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button disabled={!!busy} onClick={save}>
          {busy === "save" && <Loader2Icon className="animate-spin" />} Save
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={apply}>
          {busy === "apply" && <Loader2Icon className="animate-spin" />} Apply the schedule now
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who opened HR and salary records</CardTitle>
          <CardDescription>Every opening of someone else&apos;s HR record or payslip (one line per person and record each hour).</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length ? (
            <table className="w-full text-sm" data-access-log>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-1">When</th>
                  <th className="p-1">Who</th>
                  <th className="p-1">Whose record</th>
                  <th className="p-1">What</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1 text-xs">{new Date(l.at).toLocaleString()}</td>
                    <td className="p-1">{l.viewer}</td>
                    <td className="p-1">{l.employee}</td>
                    <td className="p-1 text-xs">{l.what.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody has opened someone else&apos;s record yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
