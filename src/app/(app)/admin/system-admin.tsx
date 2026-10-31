"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, CheckIcon, CopyIcon, DatabaseBackupIcon, DownloadIcon, FlaskConicalIcon, PlayIcon, SaveIcon, SendIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backupNowAction, resolveErrorsAction, runJobsNowAction, saveBackupConfigAction, saveOpsConfigAction, testAlertAction, testRestoreAction } from "@/app/actions/system";
import type { ErrorRow, HealthCheck, JobRow, OpsConfig } from "@/server/ops";
import type { BackupConfig, BackupFile, BackupRun, TargetId } from "@/server/backups";
import { fmtDateTime } from "@/lib/format";

const TARGETS: Record<TargetId, string> = { local: "This server's disk", drive: "Google Drive", s3: "S3-compatible storage" };

export type SystemData = {
  health: HealthCheck[];
  jobs: { lastChecksAt: string | null; trigger: string | null; late: boolean; jobs: JobRow[] };
  backup: BackupConfig;
  backups: { files: BackupFile[]; errors: Partial<Record<TargetId, string>> };
  runs: BackupRun[];
  errors: ErrorRow[];
  ops: OpsConfig;
  driveConnected: boolean;
  googleReady: boolean;
  appUrl: string;
  defaultDir: string;
  onRender: boolean;
};

const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const StateIcon = ({ s }: { s: "ok" | "warn" | "bad" }) =>
  s === "ok" ? <CheckCircle2Icon className="size-4 text-[var(--st-done-fg)]" /> : s === "warn" ? <AlertTriangleIcon className="size-4 text-[var(--st-paused-fg)]" /> : <XCircleIcon className="size-4 text-destructive" />;

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" aria-label={label} />
      <Button size="icon" variant="outline" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
        <CopyIcon />
      </Button>
    </div>
  );
}

// The System tab loads its data (backup lists from Drive and S3 take a moment) only when opened by address.
export function OpenWithTab({ tab }: { tab: string }) {
  const router = useRouter();
  React.useEffect(() => router.replace(`/admin?tab=${tab}`), [router, tab]);
  return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
}

export function SystemAdmin({ data }: { data: SystemData }) {
  const openErrors = data.errors.length;
  const bad = data.health.filter((h) => h.state !== "ok").length;
  return (
    <Tabs defaultValue="health" className="space-y-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="health">Health {bad > 0 && <Badge variant="secondary" className="ml-1">{bad}</Badge>}</TabsTrigger>
        <TabsTrigger value="jobs">Scheduled jobs</TabsTrigger>
        <TabsTrigger value="backups">Backups</TabsTrigger>
        <TabsTrigger value="errors">Errors {openErrors > 0 && <Badge className="ml-1">{openErrors}</Badge>}</TabsTrigger>
        <TabsTrigger value="alerts">Alerts</TabsTrigger>
      </TabsList>
      <TabsContent value="health">
        <Card>
          <CardHeader>
            <CardTitle>How the system is doing</CardTitle>
            <CardDescription>Checked when this page opens. Problems also reach you as alerts (see Alerts).</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {data.health.map((h) => (
              <div key={h.key} className="flex items-start gap-3 py-2.5 text-sm" data-testid={`health-${h.key}`}>
                <StateIcon s={h.state} />
                <div className="w-44 shrink-0 font-medium">{h.label}</div>
                <div className="text-muted-foreground">{h.text}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="jobs">
        <Jobs data={data} />
      </TabsContent>
      <TabsContent value="backups">
        <Backups data={data} />
      </TabsContent>
      <TabsContent value="errors">
        <Errors rows={data.errors} />
      </TabsContent>
      <TabsContent value="alerts">
        <Alerts ops={data.ops} />
      </TabsContent>
    </Tabs>
  );
}

function Jobs({ data }: { data: SystemData }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const cron = `*/10 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" ${data.appUrl}/api/cron/checks > /dev/null`;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled jobs</CardTitle>
          <CardDescription>
            {data.jobs.lastChecksAt ? `Last run ${fmtDateTime(data.jobs.lastChecksAt)}.` : "Not run yet."}{" "}
            {data.jobs.late ? "Late: nothing ran in the last 30 minutes. Set up one of the ways below." : "Running on time."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await runJobsNowAction();
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Jobs ran");
              router.refresh();
            }}
          >
            <PlayIcon /> Run all now
          </Button>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.jobs.jobs.map((j) => (
                  <TableRow key={j.name}>
                    <TableCell className="font-medium">{j.label}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{j.lastAt ? fmtDateTime(j.lastAt) : "Not yet"}</TableCell>
                    <TableCell className={j.ok ? "text-muted-foreground" : "text-destructive"}>
                      {j.ok ? (j.detail ?? (j.lastAt ? "Done" : "")) : `Failed ${j.failures} ${j.failures === 1 ? "time" : "times"} in a row: ${j.error}`}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{j.lastAt ? `${(j.ms / 1000).toFixed(1)} s` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Making sure they always run</CardTitle>
          <CardDescription>The jobs also run when people open pages, but at night nobody does. Use at least one of these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">1. The timer inside the server (on by default)</p>
            <p className="text-muted-foreground">
              Every 10 minutes while the server runs. Enough on a VPS or any host that keeps the app running.{" "}
              {data.onRender ? "On Render's free plan the app sleeps when nobody uses it, so add 2 or 3 as well." : ""}
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">2. A schedule from outside (free with GitHub)</p>
            <p className="text-muted-foreground">
              Set a long random CRON_SECRET in the hosting settings. In the GitHub repository, Settings, Secrets and variables, Actions, add APP_URL ({data.appUrl}) and CRON_SECRET. The workflow
              .github/workflows/schedule.yml then calls the jobs every 10 minutes and checks the site is up; GitHub emails you when the site does not answer.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">3. On the VPS: a cron line</p>
            <Copyable value={cron} label="cron line" />
            <p className="text-muted-foreground">Add it with crontab -e, with CRON_SECRET set in the crontab or replaced by its value.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Backups({ data }: { data: SystemData }) {
  const router = useRouter();
  const [c, setC] = React.useState<BackupConfig>(data.backup);
  const [passphrase, setPassphrase] = React.useState("");
  const [s3Secret, setS3Secret] = React.useState("");
  const [busy, setBusy] = React.useState<null | "save" | "backup" | "test">(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(data.backup) || !!passphrase || !!s3Secret;
  const set = (v: Partial<BackupConfig>) => setC((o) => ({ ...o, ...v }));
  const save = async () => {
    setBusy("save");
    const r = await saveBackupConfigAction({ ...c, passphrase: passphrase || undefined, s3Secret: s3Secret || undefined });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Backup settings saved");
    setPassphrase("");
    setS3Secret("");
    router.refresh();
  };
  const lastTest = data.runs.find((r) => r.kind === "test");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!!busy}
          onClick={async () => {
            setBusy("backup");
            const r = await backupNowAction();
            setBusy(null);
            if (!r.ok) return void toast.error(r.error);
            if (r.data!.ok) toast.success(`Backup ${r.data!.name} saved (${mb(r.data!.size)})`);
            else toast.error(`Backup failed: ${Object.values(r.data!.results).join("; ") || "see the history below"}`);
            router.refresh();
          }}
        >
          <DatabaseBackupIcon /> {busy === "backup" ? "Backing up..." : "Back up now"}
        </Button>
        <Button
          variant="outline"
          disabled={!!busy || !data.backups.files.length}
          onClick={async () => {
            setBusy("test");
            const r = await testRestoreAction();
            setBusy(null);
            if (!r.ok) return void toast.error(r.error);
            (r.data!.ok ? toast.success : toast.error)(r.data!.detail);
            router.refresh();
          }}
        >
          <FlaskConicalIcon /> {busy === "test" ? "Testing..." : "Test restore now"}
        </Button>
        {lastTest && (
          <p className={`self-center text-sm ${lastTest.ok ? "text-muted-foreground" : "text-destructive"}`}>
            Last test {fmtDateTime(lastTest.startedAt)}: {lastTest.ok ? "passed" : "failed"}.
          </p>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>When and how many</CardTitle>
            <CardDescription>A copy of every table, including files kept in the database. Files in Supabase Storage are not included.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch id="bk-on" checked={c.enabled} onCheckedChange={(v) => set({ enabled: v })} />
              <Label htmlFor="bk-on">Back up automatically every day</Label>
            </div>
            <div className="flex flex-wrap gap-5">
              {(
                [
                  ["bk-hour", "At (hour, 0 to 23)", c.hour, (n: number) => set({ hour: n })],
                  ["bk-d", "Keep daily", c.keep.daily, (n: number) => set({ keep: { ...c.keep, daily: n } })],
                  ["bk-w", "Keep weekly", c.keep.weekly, (n: number) => set({ keep: { ...c.keep, weekly: n } })],
                  ["bk-m", "Keep monthly", c.keep.monthly, (n: number) => set({ keep: { ...c.keep, monthly: n } })],
                  ["bk-t", "Test restore every (days, 0: never)", c.testRestoreDays, (n: number) => set({ testRestoreDays: n })],
                ] as const
              ).map(([id, label, v, on]) => (
                <div key={id} className="space-y-1">
                  <Label htmlFor={id}>{label}</Label>
                  <Input id={id} type="number" value={v} onChange={(e) => on(Number(e.target.value))} className="w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Switch id="bk-enc" checked={c.encrypt} onCheckedChange={(v) => set({ encrypt: v })} />
                <Label htmlFor="bk-enc">Encrypt backups with a passphrase</Label>
              </div>
              {c.encrypt && (
                <>
                  <Input type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={c.hasPassphrase ? "Saved; type to replace" : "At least 12 characters"} aria-label="Backup passphrase" />
                  <p className="text-xs text-muted-foreground">Write it down outside the app. Without it nobody, you included, can restore an encrypted backup if this server is lost.</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where to keep them</CardTitle>
            <CardDescription>Keep at least one copy away from this server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Switch id="bk-local" checked={c.local.enabled} onCheckedChange={(v) => set({ local: { ...c.local, enabled: v } })} />
                <Label htmlFor="bk-local">This server&apos;s disk</Label>
              </div>
              {c.local.enabled && (
                <>
                  <Input value={c.local.dir} onChange={(e) => set({ local: { ...c.local, dir: e.target.value } })} placeholder={data.defaultDir} aria-label="Backup folder" />
                  {data.onRender && <p className="text-xs text-[var(--st-paused-fg)]">On Render the disk is emptied at every deploy unless a persistent disk is attached. Keep Google Drive on too.</p>}
                </>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Switch id="bk-drive" checked={c.drive.enabled} onCheckedChange={(v) => set({ drive: { ...c.drive, enabled: v } })} disabled={!c.drive.enabled && !data.driveConnected && !c.drive.userId} />
                <Label htmlFor="bk-drive">Google Drive</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {c.drive.userId
                  ? `Into the folder "Myseed backups" in ${c.drive.email ?? "the connected"} Drive. The app sees only the files it puts there.`
                  : data.googleReady
                    ? "Connect your Google Drive, then switch it on. The app can only see the files it creates."
                    : "Set up the Google client first (Admin, Sign-in, Google sign-in)."}
              </p>
              {data.googleReady && !data.driveConnected && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/google/connect?for=drive&back=${encodeURIComponent("/admin?tab=system")}`}>Connect Google Drive</a>
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Switch id="bk-s3" checked={c.s3.enabled} onCheckedChange={(v) => set({ s3: { ...c.s3, enabled: v } })} />
                <Label htmlFor="bk-s3">S3-compatible storage (optional)</Label>
              </div>
              {c.s3.enabled && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={c.s3.endpoint} onChange={(e) => set({ s3: { ...c.s3, endpoint: e.target.value } })} placeholder="https://<account>.r2.cloudflarestorage.com" aria-label="Endpoint" className="sm:col-span-2" />
                  <Input value={c.s3.bucket} onChange={(e) => set({ s3: { ...c.s3, bucket: e.target.value } })} placeholder="Bucket" aria-label="Bucket" />
                  <Input value={c.s3.region} onChange={(e) => set({ s3: { ...c.s3, region: e.target.value } })} placeholder="Region (auto)" aria-label="Region" />
                  <Input value={c.s3.prefix} onChange={(e) => set({ s3: { ...c.s3, prefix: e.target.value } })} placeholder="Folder (myseed/)" aria-label="Folder" />
                  <Input value={c.s3.accessKeyId} onChange={(e) => set({ s3: { ...c.s3, accessKeyId: e.target.value } })} placeholder="Access key ID" aria-label="Access key ID" />
                  <Input type="password" autoComplete="off" value={s3Secret} onChange={(e) => setS3Secret(e.target.value)} placeholder={c.s3.hasSecret ? "Secret saved; paste to replace" : "Secret access key"} aria-label="Secret access key" className="sm:col-span-2" />
                  <p className="text-xs text-muted-foreground sm:col-span-2">Cloudflare R2, Backblaze B2, Wasabi, Amazon S3, or MinIO on your VPS.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || !!busy}>
          <SaveIcon /> {dirty ? "Save backup settings" : "Saved"}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Backups kept</CardTitle>
          <CardDescription>
            Restore one with <code>npm run db:restore -- file</code> on the server (see docs/RECOVERY.md).
            {Object.entries(data.backups.errors).map(([k, e]) => (
              <span key={k} className="block text-destructive">
                {TARGETS[k as TargetId]}: {e}
              </span>
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Size</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.backups.files.map((f) => (
                <TableRow key={`${f.target}:${f.ref}`}>
                  <TableCell className="font-mono text-xs">{f.name}</TableCell>
                  <TableCell>{TARGETS[f.target]}</TableCell>
                  <TableCell>{mb(f.size)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/api/admin/backups?target=${f.target}&ref=${encodeURIComponent(f.ref)}&name=${encodeURIComponent(f.name)}`} aria-label={`Download ${f.name}`}>
                        <DownloadIcon /> Download
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.backups.files.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No backups yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(r.startedAt)}</TableCell>
                  <TableCell>
                    {r.kind === "test" ? "Test restore" : "Backup"}
                    {r.by ? ` by ${r.by}` : ""}
                  </TableCell>
                  <TableCell className={r.ok ? "text-muted-foreground" : "text-destructive"}>
                    {r.kind === "backup" && r.ok
                      ? `${r.file}, ${mb(r.size)}, ${r.rows} rows: ${Object.entries(r.targets)
                          .map(([k, v]) => `${TARGETS[k as TargetId]} ${v}`)
                          .join("; ")}`
                      : (r.detail ?? (r.finishedAt ? "" : "Running"))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Errors({ rows }: { rows: ErrorRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const resolve = async (ids: string[]) => {
    const r = await resolveErrorsAction(ids);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Marked fixed. You are told if it happens again.");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Errors</CardTitle>
        <CardDescription>From the server, people&apos;s browsers and scheduled jobs, grouped when they are the same. Email addresses, long numbers and keys are masked. Kept in the app only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => resolve(rows.map((r) => r.id))}>
            <CheckIcon /> Mark all fixed
          </Button>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm" data-testid="error-row">
            <div className="flex flex-wrap items-start gap-2">
              <Badge variant="secondary">{r.source}</Badge>
              <p className="min-w-0 flex-1 font-medium break-words">{r.message}</p>
              <Button size="sm" variant="ghost" onClick={() => resolve([r.id])}>
                <CheckIcon /> Fixed
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.count} {r.count === 1 ? "time" : "times"}, last {fmtDateTime(r.lastAt)}, first {fmtDateTime(r.firstAt)}
              {r.path ? `, on ${r.path}` : ""}
              {r.userName ? `, seen by ${r.userName}` : ""}
              {r.digest ? `, reference ${r.digest}` : ""}
            </p>
            {r.stack && (
              <>
                <button className="mt-1 text-xs text-primary hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Hide details" : "Details"}
                </button>
                {open === r.id && <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{r.stack}</pre>}
              </>
            )}
          </div>
        ))}
        {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No open errors.</p>}
      </CardContent>
    </Card>
  );
}

function Alerts({ ops }: { ops: OpsConfig }) {
  const router = useRouter();
  const [o, setO] = React.useState(ops);
  const [emails, setEmails] = React.useState(ops.alerts.emailTo.join(", "));
  const [token, setToken] = React.useState("");
  const save = async () => {
    const r = await saveOpsConfigAction({ ...o, alerts: { ...o.alerts, emailTo: emails.split(/[\s,;]+/).filter(Boolean) }, telegramToken: token || undefined });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Alert settings saved");
    setToken("");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts to Admin</CardTitle>
        <CardDescription>New errors, failed backups, jobs failing twice, and lockouts. Always in the app (the bell); also by email and Telegram when set up. All free.</CardDescription>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Switch id="al-mail" checked={o.alerts.email} onCheckedChange={(v) => setO({ ...o, alerts: { ...o.alerts, email: v } })} />
          <Label htmlFor="al-mail">By email (through Email, Settings)</Label>
        </div>
        {o.alerts.email && (
          <div className="space-y-1">
            <Label htmlFor="al-to">To (empty: every Admin)</Label>
            <Input id="al-to" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="it@myseed.et" />
          </div>
        )}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Telegram (optional)</p>
          <p className="text-xs text-muted-foreground">
            In Telegram, message @BotFather, send /newbot and copy the token. Add the bot to a group (or message it), then find the chat ID by opening https://api.telegram.org/bot&lt;token&gt;/getUpdates.
          </p>
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={o.alerts.hasTelegram ? "Bot token saved; paste to replace" : "Bot token"} aria-label="Telegram bot token" />
          <Input value={o.alerts.telegramChatId} onChange={(e) => setO({ ...o, alerts: { ...o.alerts, telegramChatId: e.target.value } })} placeholder="Chat ID, for example -1001234567890" aria-label="Telegram chat ID" />
        </div>
        <div className="flex flex-wrap gap-5">
          <div className="space-y-1">
            <Label htmlFor="al-err">Keep errors for (days)</Label>
            <Input id="al-err" type="number" className="w-24" value={o.keep.errorsDays} onChange={(e) => setO({ ...o, keep: { ...o.keep, errorsDays: Number(e.target.value) } })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-log">Keep the sign-in log for (days)</Label>
            <Input id="al-log" type="number" className="w-24" value={o.keep.signinLogDays} onChange={(e) => setO({ ...o, keep: { ...o.keep, signinLogDays: Number(e.target.value) } })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={save}>
            <SaveIcon /> Save
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const r = await testAlertAction();
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Test sent: in the app${r.data!.email ? ", by email" : ""}${r.data!.telegram ? ", on Telegram" : ""}`);
            }}
          >
            <SendIcon /> Send a test alert
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
