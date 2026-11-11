"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, DownloadIcon, KeyRoundIcon, LockIcon, PlusIcon, SaveIcon, Trash2Icon, UploadIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { KeyValue } from "@/components/app/primitives";
import { addEmployeeDocumentAction, createAppAccountAction, deleteEmployeeAction, deleteEmployeeDocumentAction, saveEmployeeAction, updateOwnContactAction } from "@/app/actions/hr";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import type { EmployeeDetail, PrivateDetails } from "@/server/hr";
import {
  DOC_KIND_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  type DocKind,
  type EmergencyContact,
} from "@/lib/hr";
import { SimpleSelect } from "./hr-home";
import { DueBadge, EmployeeStatusPill, Field, fmtDay, readBase64 } from "./hr-shared";

type Opt = { value: string; label: string };

export function EmployeeView({
  detail,
  departments,
  managers,
  accounts,
}: {
  detail: EmployeeDetail;
  departments: Opt[];
  // HR only: who can be the line manager, and app accounts that can be linked.
  managers?: Opt[];
  accounts?: Opt[];
}) {
  const e = detail.employee;
  const deptLabel = departments.find((d) => d.value === e.department)?.label ?? e.department ?? "-";
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{e.preferredName || e.fullName}</h2>
                <EmployeeStatusPill status={e.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {e.jobTitle ?? "No job title"} · {deptLabel} · <span className="font-mono text-xs">{e.code}</span>
              </p>
            </div>
            <KeyValue label="Line manager">
              {e.managerId ? (
                detail.view === "hr" ? (
                  <Link href={`/hr/people/${e.managerId}`} className="hover:underline">
                    {e.managerName}
                  </Link>
                ) : (
                  e.managerName
                )
              ) : (
                "-"
              )}
            </KeyValue>
            <KeyValue label="Type">{EMPLOYMENT_TYPE_LABELS[e.employmentType]}</KeyValue>
            <KeyValue label="Started">{fmtDay(e.startDate)}</KeyValue>
            {e.probationEnd && <KeyValue label="Probation ends">{fmtDay(e.probationEnd)}</KeyValue>}
            {e.contractEnd && <KeyValue label="Contract ends">{fmtDay(e.contractEnd)}</KeyValue>}
            {e.status === "left" && <KeyValue label="Left on">{fmtDay(e.endDate)}</KeyValue>}
          </CardContent>
        </Card>
        {detail.view === "hr" ? (
          <HrForm detail={detail} departments={departments} managers={managers ?? []} accounts={accounts ?? []} />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <KeyValue label="Email">{e.email ?? "-"}</KeyValue>
                <KeyValue label="Phone">{e.phone ?? "-"}</KeyValue>
                <KeyValue label="Location">{e.location ?? "-"}</KeyValue>
              </CardContent>
            </Card>
            {detail.view === "self" && <OwnContactForm detail={detail} />}
          </>
        )}
      </div>
      <div className="space-y-4">
        {detail.view !== "team" && <Documents detail={detail} />}
        <Card>
          <CardHeader>
            <CardTitle>Equipment held</CardTitle>
            <CardDescription>{detail.view === "self" ? "Ask HR if something here is wrong." : "Issued from the HR equipment register."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {detail.equipment.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <div className="font-medium">
                    {q.name} <span className="font-mono text-xs text-muted-foreground">{q.tag}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {EQUIPMENT_CATEGORY_LABELS[q.category]} · since {fmtDay(q.issuedAt)}
                  </div>
                </div>
                {q.dueBack && <DueBadge date={q.dueBack} />}
              </div>
            ))}
            {!detail.equipment.length && <p className="text-muted-foreground">Nothing issued.</p>}
          </CardContent>
        </Card>
        {detail.reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Reports to {detail.view === "self" ? "you" : e.preferredName || e.fullName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {detail.reports.map((r) => (
                <Link key={r.id} href={`/hr/people/${r.id}`} className="flex justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted">
                  <span className="font-medium">{r.name}</span>
                  <span className="truncate text-muted-foreground">{r.jobTitle ?? ""}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ContactsEditor({ value, onChange }: { value: EmergencyContact[]; onChange: (v: EmergencyContact[]) => void }) {
  const set = (i: number, k: keyof EmergencyContact, v: string) => onChange(value.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_8rem_9rem_auto] gap-2">
          <Input value={c.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Name" aria-label={`Emergency contact ${i + 1} name`} />
          <Input value={c.relation} onChange={(e) => set(i, "relation", e.target.value)} placeholder="Relation" aria-label={`Emergency contact ${i + 1} relation`} />
          <Input value={c.phone} onChange={(e) => set(i, "phone", e.target.value)} placeholder="Phone" aria-label={`Emergency contact ${i + 1} phone`} />
          <Button size="icon-sm" variant="ghost" aria-label="Remove contact" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {value.length < 5 && (
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { name: "", relation: "", phone: "" }])}>
          <PlusIcon /> Add emergency contact
        </Button>
      )}
    </div>
  );
}

function OwnContactForm({ detail }: { detail: EmployeeDetail }) {
  const router = useRouter();
  const e = detail.employee;
  const [f, setF] = React.useState({ preferredName: e.preferredName ?? "", phone: e.phone ?? "", address: e.address ?? "" });
  const [contacts, setContacts] = React.useState<EmergencyContact[]>(e.emergencyContacts ?? []);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const r = await updateOwnContactAction({ ...f, emergencyContacts: contacts });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>Keep these current. Ask HR to change your job, dates or anything else.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name people call you">
            <Input value={f.preferredName} onChange={(x) => setF({ ...f, preferredName: x.target.value })} placeholder={e.fullName} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(x) => setF({ ...f, phone: x.target.value })} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={f.address} onChange={(x) => setF({ ...f, address: x.target.value })} />
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Emergency contacts</p>
          <ContactsEditor value={contacts} onChange={setContacts} />
        </div>
        <Button onClick={save} disabled={busy}>
          <SaveIcon /> Save
        </Button>
      </CardContent>
    </Card>
  );
}

const PRIVATE_FIELDS: { key: keyof PrivateDetails; label: string }[] = [
  { key: "salaryGrade", label: "Salary grade" },
  { key: "nationalId", label: "National ID number" },
  { key: "tin", label: "Tax ID (TIN)" },
  { key: "pensionNo", label: "Pension number" },
  { key: "bankName", label: "Bank" },
  { key: "bankAccount", label: "Bank account" },
];

function HrForm({ detail, departments, managers, accounts }: { detail: EmployeeDetail; departments: Opt[]; managers: Opt[]; accounts: Opt[] }) {
  const router = useRouter();
  const e = detail.employee;
  const s = (v: string | null | undefined) => v ?? "";
  const [f, setF] = React.useState({
    fullName: e.fullName,
    preferredName: s(e.preferredName),
    email: s(e.email),
    phone: s(e.phone),
    address: s(e.address),
    birthDate: s(e.birthDate),
    gender: s(e.gender),
    jobTitle: s(e.jobTitle),
    department: s(e.department),
    managerId: s(e.managerId),
    employmentType: e.employmentType as string,
    status: e.status as string,
    location: s(e.location),
    startDate: s(e.startDate),
    probationEnd: s(e.probationEnd),
    contractEnd: s(e.contractEnd),
    endDate: s(e.endDate),
    endReason: s(e.endReason),
    notes: s(e.notes),
    userId: s(e.userId),
  });
  const [contacts, setContacts] = React.useState<EmergencyContact[]>(e.emergencyContacts ?? []);
  const [priv, setPriv] = React.useState<Record<keyof PrivateDetails, string>>(() => Object.fromEntries(PRIVATE_FIELDS.map((p) => [p.key, s(detail.private?.[p.key])])) as Record<keyof PrivateDetails, string>);
  const [busy, setBusy] = React.useState(false);
  const [createAccountOpen, setCreateAccountOpen] = React.useState(false);
  const [createdAccount, setCreatedAccount] = React.useState<{ email: string; tempPassword: string; roles: Role[]; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof f, type = "text") => <Input type={type} value={f[k]} onChange={(x) => set(k)(x.target.value)} />;
  const onAccountCreated = (acc: { userId: string; email: string; tempPassword: string; roles: Role[]; name: string }) => {
    setF((curr) => ({ ...curr, userId: acc.userId, email: curr.email || acc.email }));
    setCreateAccountOpen(false);
    setCreatedAccount(acc);
  };
  const save = async () => {
    setBusy(true);
    const r = await saveEmployeeAction({
      ...f,
      id: e.id,
      department: f.department || null,
      managerId: f.managerId || null,
      userId: f.userId || null,
      emergencyContacts: contacts,
      ...(detail.private ? { private: priv } : {}),
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    router.refresh();
  };
  const statuses = EMPLOYEE_STATUSES.filter((x) => x !== "left" || detail.rights.manage || e.status === "left");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Job title">{text("jobTitle")}</Field>
          <Field label="Department">
            <SimpleSelect value={f.department} onChange={set("department")} options={departments} placeholder="None" />
          </Field>
          <Field label="Line manager">
            <SimpleSelect value={f.managerId} onChange={set("managerId")} options={managers.filter((m) => m.value !== e.id)} placeholder="Nobody" />
          </Field>
          <Field label="Employment type">
            <SimpleSelect value={f.employmentType} onChange={set("employmentType")} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Status" hint={!detail.rights.manage ? "Only the HR Manager ends someone's employment." : undefined}>
            <SimpleSelect value={f.status} onChange={set("status")} options={statuses.map((x) => ({ value: x, label: EMPLOYEE_STATUS_LABELS[x] }))} />
          </Field>
          <Field label="Work location">{text("location")}</Field>
          <Field label="Start date">{text("startDate", "date")}</Field>
          <Field label="Probation ends">{text("probationEnd", "date")}</Field>
          <Field label="Contract ends">{text("contractEnd", "date")}</Field>
          {f.status === "left" && (
            <>
              <Field label="Last working day">{text("endDate", "date")}</Field>
              <Field label="Reason for leaving" className="sm:col-span-2">
                {text("endReason")}
              </Field>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Personal and contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Full name">{text("fullName")}</Field>
            <Field label="Preferred name">{text("preferredName")}</Field>
            <Field label="App account" hint="Links this record to the person's sign-in, for self-service.">
              <div className="space-y-1.5">
                <SimpleSelect value={f.userId} onChange={set("userId")} options={accounts} placeholder="Not linked" />
                {!f.userId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
                    onClick={() => setCreateAccountOpen(true)}
                  >
                    <UserPlusIcon className="size-3.5" /> Create app account
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Email">{text("email", "email")}</Field>
            <Field label="Phone">{text("phone")}</Field>
            <Field label="Date of birth">{text("birthDate", "date")}</Field>
            <Field label="Gender">{text("gender")}</Field>
            <Field label="Address" className="sm:col-span-2">
              {text("address")}
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Emergency contacts</p>
            <ContactsEditor value={contacts} onChange={setContacts} />
          </div>
        </CardContent>
      </Card>
      {detail.private && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockIcon className="size-4" /> Private details
            </CardTitle>
            <CardDescription>Only people allowed to see salary and ID details see this. Values are never written to the audit log.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {PRIVATE_FIELDS.map((p) => (
              <Field key={p.key} label={p.label}>
                <Input value={priv[p.key]} onChange={(x) => setPriv({ ...priv, [p.key]: x.target.value })} autoComplete="off" />
              </Field>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>HR notes</CardTitle>
          <CardDescription>Seen by HR only.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={f.notes} onChange={(x) => set("notes")(x.target.value)} rows={3} aria-label="HR notes" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={busy || !f.fullName.trim()}>
            <SaveIcon /> Save record
          </Button>
          <span className="text-xs text-muted-foreground">Last changed {new Date(e.updatedAt).toLocaleString()}</span>
        </div>
        {detail.rights.manage && (
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            <Trash2Icon className="size-4" /> Delete employee
          </Button>
        )}
      </div>

      <CreateAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        employee={{ id: e.id, fullName: f.fullName, email: f.email || null, jobTitle: f.jobTitle || null, phone: f.phone || null }}
        department={f.department}
        onCreated={onAccountCreated}
      />
      <CredentialsDialog
        account={createdAccount}
        onClose={() => {
          setCreatedAccount(null);
          router.refresh();
        }}
      />
      <DeleteEmployeeDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        employee={{ id: e.id, fullName: e.fullName, code: e.code, userId: f.userId || null }}
      />
    </div>
  );
}

function Documents({ detail }: { detail: EmployeeDetail }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<string>(detail.rights.addDocs[0] ?? "");
  const [title, setTitle] = React.useState("");
  const [expires, setExpires] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) return void toast.error("Files are limited to 8 MB.");
    setBusy(true);
    const r = await addEmployeeDocumentAction(detail.employee.id, { kind, title: title || undefined, expiresAt: expires || null, file: { name: file.name, mime: file.type, base64: await readBase64(file) } });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return void toast.error(r.error);
    setTitle("");
    setExpires("");
    toast.success("Document added");
    router.refresh();
  };
  const remove = async (id: string) => {
    const r = await deleteEmployeeDocumentAction(id);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Removed");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>{detail.view === "self" ? "Your contract and documents. You can add certificates and your CV." : "Contracts, IDs and certificates, with expiry reminders."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {detail.documents.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{d.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {DOC_KIND_LABELS[d.kind]} · {d.name}
                {d.expiresAt ? ` · expires ${fmtDay(d.expiresAt)}` : ""}
              </div>
            </div>
            {d.expiresAt && <DueBadge date={d.expiresAt} />}
            <Button size="icon-xs" variant="ghost" asChild>
              <a href={`/api/hr-files/${d.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>
                <DownloadIcon />
              </a>
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label={`Remove ${d.title}`} onClick={() => remove(d.id)}>
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {!detail.documents.length && <p className="text-muted-foreground">No documents yet.</p>}
        {detail.rights.addDocs.length > 0 && (
          <div className="space-y-2 rounded-md bg-muted/40 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Kind">
                <SimpleSelect value={kind} onChange={setKind} options={detail.rights.addDocs.map((k: DocKind) => ({ value: k, label: DOC_KIND_LABELS[k] }))} />
              </Field>
              <Field label="Expires on">
                <Input type="date" value={expires} onChange={(x) => setExpires(x.target.value)} />
              </Field>
              <Field label="Title" className="sm:col-span-2">
                <Input value={title} onChange={(x) => setTitle(x.target.value)} placeholder={DOC_KIND_LABELS[kind as DocKind] ?? "Title"} />
              </Field>
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={(x) => x.target.files?.[0] && upload(x.target.files[0])} aria-label="Choose a file" />
            <Button size="sm" variant="outline" disabled={busy || !kind} onClick={() => fileRef.current?.click()}>
              <UploadIcon /> {busy ? "Uploading…" : "Choose file and add"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const AVAILABLE_ROLES: Role[] = [
  "content",
  "recording",
  "editing",
  "uploading",
  "publication",
  "operations",
  "support",
  "marketing",
  "sales",
  "accountant",
  "developer",
  "hr_officer",
];

function CreateAccountDialog({
  open,
  onOpenChange,
  employee,
  department,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; fullName: string; email: string | null; jobTitle: string | null; phone: string | null };
  department?: string | null;
  onCreated: (acc: { userId: string; email: string; tempPassword: string; roles: Role[]; name: string }) => void;
}) {
  const [email, setEmail] = React.useState(employee.email || "");
  const [name, setName] = React.useState(employee.fullName || "");
  const [roles, setRoles] = React.useState<Role[]>(() => {
    if (department === "recording") return ["recording"];
    if (department === "editing") return ["editing"];
    if (department === "uploading") return ["uploading"];
    if (department === "publication") return ["publication"];
    if (department === "marketing") return ["marketing"];
    if (department === "dev") return ["developer"];
    if (department === "studio") return ["content"];
    if (department === "hr") return ["hr_officer"];
    if (department === "finance") return ["accountant"];
    if (department === "support") return ["support"];
    if (department === "sales") return ["sales"];
    if (department === "operations") return ["operations"];
    return ["content"];
  });
  const [password, setPassword] = React.useState(() => `Myseed-${Math.random().toString(36).slice(2, 8)}`);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmail(employee.email || "");
      setName(employee.fullName || "");
      setPassword(`Myseed-${Math.random().toString(36).slice(2, 8)}`);
    }
  }, [open, employee.email, employee.fullName]);

  const toggleRole = (r: Role) => {
    setRoles((curr) => (curr.includes(r) ? (curr.length > 1 ? curr.filter((x) => x !== r) : curr) : [...curr, r]));
  };

  const handleCreate = async () => {
    if (!email.trim()) return toast.error("Please enter an email address.");
    setBusy(true);
    const r = await createAppAccountAction({
      employeeId: employee.id,
      email: email.trim(),
      name: name.trim(),
      roles,
      password: password.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    if (!r.data) return toast.error("Account creation failed");
    toast.success("Account created successfully!");
    onCreated(r.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-5 text-primary" /> Create App Account
          </DialogTitle>
          <DialogDescription>
            Create a login account for <strong>{employee.fullName}</strong>. They can sign in immediately using these credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Full name</Label>
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">Sign-in email</Label>
              <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@myseed.com.et" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="acc-pass">Initial temporary password</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline cursor-pointer"
                onClick={() => setPassword(`Myseed-${Math.random().toString(36).slice(2, 8)}`)}
              >
                Regenerate
              </button>
            </div>
            <Input id="acc-pass" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">The employee will be asked to choose a new password upon first login.</p>
          </div>

          <div className="space-y-2">
            <Label>Assigned roles ({roles.length})</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-48 overflow-y-auto rounded-md border p-2">
              {AVAILABLE_ROLES.map((r) => {
                const checked = roles.includes(r);
                return (
                  <label
                    key={r}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                      checked ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleRole(r)} />
                    <span className="truncate">{ROLE_LABELS[r]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy || !email.trim() || !roles.length}>
            {busy ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsDialog({
  account,
  onClose,
}: {
  account: { email: string; tempPassword: string; roles: Role[]; name: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  if (!account) return null;

  const textToCopy = `Sign in credentials for Myseed:\nEmail: ${account.email}\nTemporary password: ${account.tempPassword}\nRoles: ${account.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}`;

  const copy = () => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      toast.success("Credentials copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <KeyRoundIcon className="size-5" /> Account Ready
          </DialogTitle>
          <DialogDescription>
            Account for <strong>{account.name}</strong> was created and linked. Share these credentials with the employee:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-4 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span className="font-semibold text-foreground select-all">{account.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Password:</span>
            <span className="font-semibold text-foreground select-all">{account.tempPassword}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Roles:</span>
            <span className="text-foreground">{account.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</span>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" className="gap-1.5" onClick={copy}>
            {copied ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy Credentials"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; fullName: string; code: string; userId: string | null };
}) {
  const router = useRouter();
  const [deleteUserAccount, setDeleteUserAccount] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const handleDelete = async () => {
    setBusy(true);
    const r = await deleteEmployeeAction(employee.id, { deleteUserAccount });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Employee ${employee.fullName} deleted`);
    onOpenChange(false);
    router.push("/hr");
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2Icon className="size-5" /> Delete Employee Record
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete <strong>{employee.fullName}</strong> ({employee.code})?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm text-muted-foreground">
          <p>
            This action permanently removes the employee&apos;s record, documents, attendance marks, and leave history. Any equipment held will be returned to inventory.
          </p>
          {employee.userId && (
            <label className="flex items-center gap-2 rounded-lg border p-3 text-xs text-foreground cursor-pointer hover:bg-muted/50">
              <Checkbox checked={deleteUserAccount} onCheckedChange={(v) => setDeleteUserAccount(!!v)} />
              <span>Also delete or anonymize their linked app user account</span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            {busy ? "Deleting..." : "Delete Employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
