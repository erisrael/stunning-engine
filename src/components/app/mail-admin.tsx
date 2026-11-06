"use client";

// Phase 14, for email managers (Email, Settings): the incoming mail server, the cPanel connection that lets the app
// create mailboxes with passwords nobody sees, whether managers may open mailboxes, and who has one.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlertIcon, CircleXIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, MailIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/app/multi-select";
import {
  checkCpanelAction,
  checkMailServerAction,
  connectMailboxAction,
  cpanelMailboxesAction,
  createMailboxAction,
  newMailboxPasswordAction,
  removeMailboxAction,
  saveMailConfigAction,
  setMailboxOnAction,
  setMailboxPasswordAction,
  takeOverMailboxAction,
} from "@/app/actions/mail";
import type { MailboxRow, MailConfig } from "@/server/mail";
import type { CheckStep } from "@/server/email";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; handle: string };

function Steps({ title, steps, onClose }: { title: string; steps: CheckStep[]; onClose: () => void }) {
  return (
    <div className="rounded-lg border p-3" data-mail-check>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-2 text-sm">
            {s.status === "ok" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : s.status === "warn" ? <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <CircleXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <span className="min-w-0">
              <span className="font-medium">{s.label}</span>
              <span className="block text-xs break-words text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MailAdmin({ config, boxes, people }: { config: MailConfig; boxes: MailboxRow[]; people: Person[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ imapHost: config.imapHost, imapPort: config.imapPort, imapSecure: config.imapSecure, cpanelUrl: config.cpanelUrl, cpanelUser: config.cpanelUser, cpanelToken: "", domain: config.domain, quotaMb: config.quotaMb, adminOpen: config.adminOpen });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [checks, setChecks] = React.useState<{ title: string; steps: CheckStep[] } | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<MailboxRow | null>(null);
  const [settingPass, setSettingPass] = React.useState<MailboxRow | null>(null);
  const cpanelReady = !!(config.cpanelUrl && config.cpanelUser && config.hasToken);

  const save = async () => {
    setBusy("save");
    const r = await saveMailConfigAction({ ...f, cpanelToken: f.cpanelToken || null });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("Mailbox settings saved");
    setF((x) => ({ ...x, cpanelToken: "" }));
    router.refresh();
  };
  const run = async (key: string, title: string, fn: () => Promise<{ ok: boolean; error?: string; data?: CheckStep[] }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setChecks({ title, steps: r.data! });
    router.refresh();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2" data-mail-admin>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mailboxes: the inbox in the app</CardTitle>
          <CardDescription>
            People read and send their company email under Email, without a password of their own. They cannot change the password, forwarding or filters, and without the password they cannot open webmail or add the
            mailbox to a phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.fake && <p className="rounded-md bg-amber-500/15 px-2 py-1 text-sm text-amber-800 dark:text-amber-300">Test mode (MAIL_FAKE): mail is kept in memory and nothing is sent.</p>}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Incoming mail server (IMAP)</legend>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
              <div className="space-y-1">
                <Label htmlFor="mail-host">Server</Label>
                <Input id="mail-host" value={f.imapHost} onChange={(e) => setF({ ...f, imapHost: e.target.value })} placeholder={f.domain ? `mail.${f.domain}` : "mail.myseed.com.et"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-port">Port</Label>
                <Input id="mail-port" type="number" value={f.imapPort} onChange={(e) => setF({ ...f, imapPort: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.imapSecure} onCheckedChange={(v) => setF({ ...f, imapSecure: v })} /> Encrypted from the start (SSL, port 993)
            </label>
            <p className="text-xs text-muted-foreground">In cPanel: Email Accounts, then Connect Devices on any mailbox, under &ldquo;Secure SSL/TLS Settings&rdquo;: the incoming server and IMAP port. Empty uses mail. and the mailbox&apos;s domain.</p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">cPanel connection (recommended)</legend>
            <p className="text-xs text-muted-foreground">
              With it, the app creates mailboxes and sets their passwords itself, so nobody ever sees one. In cPanel open Security, Manage API Tokens, create a token (for example &ldquo;myseed-app&rdquo;) and paste it here.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cp-url">cPanel address</Label>
                <Input id="cp-url" value={f.cpanelUrl} onChange={(e) => setF({ ...f, cpanelUrl: e.target.value })} placeholder="https://myseed.com.et:2083" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-user">cPanel user name</Label>
                <Input id="cp-user" value={f.cpanelUser} onChange={(e) => setF({ ...f, cpanelUser: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-token">API token</Label>
                <Input id="cp-token" type="password" value={f.cpanelToken} onChange={(e) => setF({ ...f, cpanelToken: e.target.value })} placeholder={config.hasToken ? "Saved (type to replace)" : "Paste the token"} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-domain">Email domain</Label>
                <Input id="cp-domain" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="myseed.com.et" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-quota">Space per new mailbox (MB, 0 = no limit)</Label>
                <Input id="cp-quota" type="number" value={f.quotaMb} onChange={(e) => setF({ ...f, quotaMb: Number(e.target.value) })} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Privacy</legend>
            <label className="flex items-start gap-2 text-sm">
              <Switch checked={f.adminOpen} onCheckedChange={(v) => setF({ ...f, adminOpen: v })} aria-label="Email managers may open mailboxes" />
              <span>
                Email managers may open a person&apos;s mailbox, read-only
                <span className="block text-xs text-muted-foreground">Off: nobody but the person reads their mail. On: each opening is recorded in the audit log and the person gets a notice. Check what your staff policy and the law allow.</span>
              </span>
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!!busy}>
              {busy === "save" && <Loader2Icon className="animate-spin" />} Save
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => run("server", "Mail server", () => checkMailServerAction(null))}>
              {busy === "server" ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} Check the server
            </Button>
            <Button variant="outline" disabled={!!busy || !cpanelReady} onClick={() => run("cpanel", "cPanel", () => checkCpanelAction())}>
              {busy === "cpanel" ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />} Check cPanel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">The checks run from the app&apos;s server, so they show whether the hosting can reach the mail server.</p>
          {checks && <Steps {...checks} onClose={() => setChecks(null)} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who has a mailbox</CardTitle>
          <CardDescription>Each person sees only their own. Unread counts are checked every few minutes by the scheduled checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Give someone a mailbox
          </Button>
          {boxes.length ? (
            <ul className="divide-y rounded-lg border" data-mailboxes>
              {boxes.map((b) => (
                <li key={b.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !b.mailbox && "opacity-70")} data-mailbox={b.address}>
                  <MailIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.userName ?? "Nobody"}</span>
                    <span className="block truncate text-xs">{b.address}</span>
                    <span className={cn("block truncate text-xs", b.error ? "text-destructive" : "text-muted-foreground")}>
                      {b.managed === "cpanel" ? "Managed through cPanel" : "Password entered by hand"}
                      {b.mailbox ? (b.checkedAt ? ` · ${b.unread} unread` : " · not checked yet") : " · inbox off"}
                      {b.error && ` · ${b.error}`}
                    </span>
                  </span>
                  <label className="flex items-center gap-1 text-xs">
                    <Switch
                      checked={b.mailbox}
                      aria-label={`Inbox in the app for ${b.address}`}
                      onCheckedChange={async (v) => {
                        const r = await setMailboxOnAction(b.id, v);
                        if (!r.ok) return toast.error(r.error);
                        router.refresh();
                      }}
                    />
                    Inbox
                  </label>
                  <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => run(`c-${b.id}`, `Check ${b.address}`, () => checkMailServerAction(b.id))}>
                    {busy === `c-${b.id}` ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} Check
                  </Button>
                  <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => setSettingPass(b)}>
                    <KeyRoundIcon /> Set password
                  </Button>
                  {b.managed === "cpanel" && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={async () => {
                        if (!window.confirm(`Set a new password for ${b.address}? Any phone or webmail signed in with the old one stops working.`)) return;
                        setBusy(`p-${b.id}`);
                        const r = await newMailboxPasswordAction(b.id);
                        setBusy(null);
                        if (!r.ok) return toast.error(r.error);
                        toast.success("New password set (nobody sees it)");
                      }}
                    >
                      <KeyRoundIcon /> Randomize
                    </Button>
                  )}
                  <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove ${b.address}`} onClick={() => setRemoving(b)}>
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nobody has a mailbox in the app yet.</p>
          )}
        </CardContent>
      </Card>

      {adding && <AddMailbox people={people} domain={config.domain} cpanel={cpanelReady} taken={boxes.map((b) => b.userId).filter((x): x is string => !!x)} onClose={() => setAdding(false)} onSaved={() => (setAdding(false), router.refresh())} />}
      {removing && <RemoveMailbox box={removing} onClose={() => setRemoving(null)} onDone={() => (setRemoving(null), router.refresh())} />}
      {settingPass && <SetMailboxPasswordModal box={settingPass} onClose={() => setSettingPass(null)} onSaved={() => (setSettingPass(null), router.refresh())} />}
    </div>
  );
}

function SetMailboxPasswordModal({ box, onClose, onSaved }: { box: MailboxRow; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!password.trim()) return toast.error("Enter the mailbox password.");
    setBusy(true);
    const r = await setMailboxPasswordAction(box.id, password.trim());
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Password saved for ${box.address}`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set mailbox password</DialogTitle>
          <DialogDescription>
            Enter the password for <strong>{box.address}</strong> ({box.userName ?? "Nobody"}). The password is encrypted and saved securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="mb-set-pass">Mailbox Password</Label>
            <div className="relative">
              <Input
                id="mb-set-pass"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Use the email account&apos;s password from your mail hosting / cPanel.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />} Save password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMailbox({ people, domain, cpanel, taken, onClose, onSaved }: { people: Person[]; domain: string; cpanel: boolean; taken: string[]; onClose: () => void; onSaved: () => void }) {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"create" | "existing" | "password">(cpanel ? "create" : "password");
  const [local, setLocal] = React.useState("");
  const [existing, setExisting] = React.useState<string | null>(null);
  const [list, setList] = React.useState<{ address: string; usedMb: number | null }[] | null>(null);
  const [address, setAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const person = people.find((p) => p.id === userId);

  React.useEffect(() => {
    if (person && !local) setLocal(person.handle.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
  }, [person]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (mode !== "existing" || list) return;
    void cpanelMailboxesAction().then((r) => (r.ok ? setList(r.data!) : toast.error(r.error)));
  }, [mode, list]);

  const submit = async () => {
    if (!userId) return toast.error("Choose the person.");
    setBusy(true);
    const r =
      mode === "create"
        ? await createMailboxAction({ userId, local })
        : mode === "existing"
          ? existing
            ? await takeOverMailboxAction({ userId, address: existing })
            : { ok: false as const, error: "Choose the mailbox." }
          : await connectMailboxAction({ userId, address, password });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${person?.name} now reads ${"data" in r && r.data ? r.data.address : "their mail"} in the app`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give someone a mailbox</DialogTitle>
          <DialogDescription>They will find it under Email. They never see the password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Person</Label>
            <Combobox options={people.filter((p) => !taken.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))} value={userId} onChange={setUserId} placeholder="Choose the person" />
          </div>
          <div className="space-y-1" role="radiogroup" aria-label="How">
            {(
              [
                ["create", "Create a new mailbox at cPanel", "A new address with a password nobody sees."],
                ["existing", "Use a mailbox that already exists at cPanel", "Its password is changed to a new one nobody sees; phones and webmail signed in with the old one stop."],
                ["password", "Enter the password by hand", "Without the cPanel connection. Whoever knows the password can still use webmail."],
              ] as const
            ).map(([k, label, hint]) => (
              <label key={k} className={cn("flex cursor-pointer gap-2 rounded-lg border p-2 text-sm", mode === k && "border-primary bg-primary/5", k !== "password" && !cpanel && "pointer-events-none opacity-50")}>
                <input type="radio" name="mail-mode" checked={mode === k} disabled={k !== "password" && !cpanel} onChange={() => setMode(k)} className="mt-1" />
                <span>
                  {label}
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
            {!cpanel && <p className="text-xs text-muted-foreground">Set up the cPanel connection to create mailboxes from here.</p>}
          </div>
          {mode === "create" && (
            <div className="space-y-1">
              <Label htmlFor="mb-local">Address</Label>
              <div className="flex items-center gap-1">
                <Input id="mb-local" value={local} onChange={(e) => setLocal(e.target.value.toLowerCase())} placeholder="firstname" />
                <span className="text-sm text-muted-foreground">@{domain || "(set the domain)"}</span>
              </div>
            </div>
          )}
          {mode === "existing" && (
            <div className="space-y-1">
              <Label>Mailbox</Label>
              {list ? (
                <Select value={existing ?? ""} onValueChange={setExisting}>
                  <SelectTrigger aria-label="Mailbox at cPanel">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((m) => (
                      <SelectItem key={m.address} value={m.address}>
                        {m.address}
                        {m.usedMb !== null ? ` (${m.usedMb} MB)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" /> Reading the mailboxes at cPanel…
                </p>
              )}
            </div>
          )}
          {mode === "password" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mb-addr">Address</Label>
                <Input id="mb-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`name@${domain || "myseed.com.et"}`} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mb-pass">Password</Label>
                <Input id="mb-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />} Give the mailbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMailbox({ box, onClose, onDone }: { box: MailboxRow; onClose: () => void; onDone: () => void }) {
  const [atHost, setAtHost] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {box.address}?</DialogTitle>
          <DialogDescription>{box.userName ?? "The person"} will no longer see this mailbox in the app.</DialogDescription>
        </DialogHeader>
        {box.managed === "cpanel" && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={atHost} onCheckedChange={(v) => setAtHost(!!v)} className="mt-0.5" />
            <span>
              Also delete the mailbox and all its mail at cPanel
              <span className="block text-xs text-destructive">This cannot be undone. Leave it unticked to keep the mail (for example to give the mailbox to someone else).</span>
            </span>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await removeMailboxAction(box.id, atHost);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Removed");
              onDone();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
