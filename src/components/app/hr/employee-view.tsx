"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, LockIcon, PlusIcon, SaveIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue } from "@/components/app/primitives";
import { addEmployeeDocumentAction, deleteEmployeeDocumentAction, saveEmployeeAction, updateOwnContactAction } from "@/app/actions/hr";
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
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof f, type = "text") => <Input type={type} value={f[k]} onChange={(x) => set(k)(x.target.value)} />;
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
              <SimpleSelect value={f.userId} onChange={set("userId")} options={accounts} placeholder="Not linked" />
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
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy || !f.fullName.trim()}>
          <SaveIcon /> Save record
        </Button>
        <span className="text-xs text-muted-foreground">Last changed {new Date(e.updatedAt).toLocaleString()}</span>
      </div>
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
