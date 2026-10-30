import { requireViewer } from "@/server/auth";
import { REPORT_REASONS, REPORT_STATUSES, myReports } from "@/server/support";
import { getSettings } from "@/server/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/primitives";
import { StatusPill } from "@/components/app/status-pill";
import { ReportSomething } from "@/components/app/support-forms";

export const metadata = { title: "Safety and reporting" };

const RULES: { title: string; text: string }[] = [
  { title: "Respect", text: "Treat everyone with respect. No harassment, bullying, insults, or unwanted contact, in chat, calls, comments or anywhere else in the app." },
  { title: "No discrimination", text: "No hate or discrimination based on ethnicity, religion, gender, age, disability or any other part of who someone is." },
  { title: "No sexual content or advances", text: "Nothing sexual, and no unwanted advances. Keep the workspace professional." },
  { title: "No threats or violence", text: "No threats, intimidation, or content that encourages harm." },
  { title: "Privacy", text: "Do not share other people's private information (phone numbers, ID documents, salaries, health or leave details) without their agreement. Use the app's own sharing settings." },
  { title: "Company resources", text: "Use accounts, equipment, files and money for work. Report fraud, misuse or anything that looks wrong." },
  { title: "Health and safety", text: "Report unsafe equipment, studios, travel or working conditions straight away." },
  { title: "Security", text: "Keep your password to yourself, sign out on shared devices, and report a lost phone or laptop so Admin can end its sessions." },
];

// The safety policy, how to report, and the person's own reports.
export default async function SafetyPage() {
  const viewer = await requireViewer();
  const [mine, s] = await Promise.all([myReports(viewer), getSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader help="account" title="Safety and reporting" description={`How we keep ${s.workspace.name} safe and respectful, and how to report a problem.`} actions={<ReportSomething />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Safety policy</CardTitle>
            <CardDescription>Everyone who uses the app agrees to these.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {RULES.map((r) => (
              <div key={r.title}>
                <p className="font-semibold">{r.title}</p>
                <p className="text-muted-foreground">{r.text}</p>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-semibold">How reporting works</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Report a message from its menu (⋯, Report), a person from their contact card, a chat from its menu, or anything else with Report a problem.</li>
                <li>Only Admin sees reports. The person reported is never told who reported them.</li>
                <li>Admin reviews it and may delete messages or suspend accounts. You are told when it is handled.</li>
                <li>In an emergency, call for help first and report afterwards.</li>
              </ol>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {mine.map((r) => (
              <div key={r.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{REPORT_REASONS[r.reason] ?? r.reason}</span>
                  <StatusPill size="xs" className="ml-auto" tone={r.status === "resolved" ? "done" : r.status === "open" ? "paused" : "neutral"} label={REPORT_STATUSES[r.status] ?? r.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.target_label ?? "General"} · {new Date(r.created_at).toLocaleDateString()}
                </p>
                {r.resolution && <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">Outcome: {r.resolution}</p>}
              </div>
            ))}
            {!mine.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
