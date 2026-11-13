import Link from "next/link";
import { CheckCircle2Icon, CircleAlertIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttStep } from "@/server/attendance-setup";

// The attendance setup steps with a check each. Shown on the Shifts and Capture tabs.
export function SetupChecklist({ steps, tab }: { steps: AttStep[]; tab: string }) {
  const done = steps.filter((s) => s.status === "ok").length;
  return (
    <Card data-att-setup>
      <CardHeader>
        <CardTitle>Setup checklist</CardTitle>
        <CardDescription>
          {done} of {steps.length} steps done. Each step is checked from what is saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.key} data-att-step={s.key} data-status={s.status} className="flex gap-2 rounded-lg border p-3 text-sm">
              {s.status === "ok" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Done" /> : s.status === "warn" ? <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Check" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Not done" />}
              <div className="min-w-0">
                <p className="font-medium">
                  {s.tab === tab ? s.label : <Link href={`/attendance?tab=${s.tab}`} className="underline-offset-2 hover:underline">{s.label}</Link>}
                </p>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
