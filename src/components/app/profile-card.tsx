"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CameraIcon, DownloadIcon, EyeOffIcon, GlobeIcon, GraduationCapIcon, LanguagesIcon, Loader2Icon, MapPinIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon, BriefcaseIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/app/primitives";
import { addProfileFileAction, deleteProfileFileAction, saveProfileAction } from "@/app/actions/profile";
import type { Contact, Cover, Education, Experience, Language, LinkItem, Profile, ProfileSection, Skill, Visibility } from "@/server/profiles";
import { PhoneIcon } from "lucide-react";
import { ContactSheet } from "@/app/(app)/chat/chat-plus";
import { cn } from "@/lib/utils";

export const COVER_CLASS: Record<Cover, string> = {
  emerald: "from-emerald-600 to-teal-400",
  indigo: "from-indigo-600 to-sky-400",
  sunset: "from-orange-500 to-pink-500",
  ocean: "from-cyan-600 to-blue-500",
  rose: "from-rose-500 to-fuchsia-500",
  slate: "from-slate-700 to-slate-400",
  gold: "from-amber-500 to-yellow-300",
  violet: "from-violet-600 to-purple-400",
};
const LEVEL_LABELS: Record<Skill["level"], string> = { learning: "Learning", good: "Good", strong: "Strong", expert: "Expert" };
const LEVEL_DOTS: Record<Skill["level"], number> = { learning: 1, good: 2, strong: 3, expert: 4 };
const STUDY_LABELS: Record<string, string> = { not_studying: "Not studying now", studying_part_time: "Studying part time", studying_full_time: "Studying full time", graduated: "Graduated" };
const SECTION_LABELS: Record<ProfileSection, string> = { about: "About", skills: "Skills", education: "Education", experience: "Experience", languages: "Languages", links: "Links", files: "Files" };
const FILE_LABELS: Record<string, string> = { cv: "CV", certificate: "Certificate", portfolio: "Portfolio", transcript: "Transcript", other: "Other" };

// Shrinks a photo to 320 px square before upload, so profiles load fast.
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const size = 320;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const s = Math.min(img.width, img.height);
  c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.85);
}
const toBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(f);
  });

export function ProfileCard({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [p, setP] = React.useState(profile);
  const [busy, setBusy] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  React.useEffect(() => setP(profile), [profile]);
  const photo = React.useRef<HTMLInputElement>(null);
  const save = async (patch: Partial<Profile> = p) => {
    setBusy(true);
    const r = await saveProfileAction({
      headline: patch.headline,
      about: patch.about,
      location: patch.location,
      avatar: patch.avatar,
      cover: patch.cover,
      skills: patch.skills,
      education: patch.education,
      experience: patch.experience,
      languages: patch.languages,
      links: patch.links,
      studyStatus: patch.studyStatus,
      hidden: patch.hidden,
      contact: patch.contact ?? undefined,
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Profile saved");
    setEditing(false);
    router.refresh();
  };
  const show = (k: ProfileSection) => editing || !p.hidden.includes(k) || p.canEdit;
  const hiddenNote = (k: ProfileSection) =>
    p.canEdit && p.hidden.includes(k) ? (
      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
        <EyeOffIcon className="size-3" /> only you
      </span>
    ) : null;
  const list = <T,>(k: "skills" | "education" | "experience" | "languages" | "links", make: () => T) => ({
    add: () => setP({ ...p, [k]: [...(p[k] as T[]), make()] }),
    set: (i: number, patch: Partial<T>) => setP({ ...p, [k]: (p[k] as T[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) }),
    del: (i: number) => setP({ ...p, [k]: (p[k] as T[]).filter((_, j) => j !== i) }),
  });
  const skills = list<Skill>("skills", () => ({ name: "", level: "good" }));
  const edu = list<Education>("education", () => ({ school: "", degree: "", field: "", from: "", to: "", status: "completed" }));
  const exp = list<Experience>("experience", () => ({ org: "", title: "", from: "", to: "", note: "" }));
  const langs = list<Language>("languages", () => ({ name: "", level: "" }));
  const links = list<LinkItem>("links", () => ({ label: "", url: "https://" }));

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <div className={cn("relative h-32 bg-gradient-to-r sm:h-40", COVER_CLASS[p.cover])}>
          {editing && (
            <div className="absolute right-3 bottom-3 flex gap-1 rounded-full bg-background/80 p-1 backdrop-blur" role="radiogroup" aria-label="Cover colour">
              {(Object.keys(COVER_CLASS) as Cover[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={p.cover === c} aria-label={c} onClick={() => setP({ ...p, cover: c })} className={cn("size-6 rounded-full bg-gradient-to-r ring-offset-1", COVER_CLASS[c], p.cover === c && "ring-2 ring-foreground")} />
              ))}
            </div>
          )}
        </div>
        <CardContent className="relative flex flex-wrap items-end gap-4">
          <div className="relative -mt-14">
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- small data URL photo
              <img src={p.avatar} alt={p.name} className="size-24 rounded-full border-4 border-background object-cover shadow" />
            ) : (
              <div className="rounded-full border-4 border-background bg-background shadow">
                <UserAvatar name={p.name} size="md" className="size-22 text-2xl" />
              </div>
            )}
            {p.canEdit && (
              <>
                <button type="button" onClick={() => photo.current?.click()} className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border bg-background shadow hover:bg-muted" aria-label="Change photo" title="Change photo">
                  <CameraIcon className="size-4" />
                </button>
                <input
                  ref={photo}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const avatar = await shrink(f);
                    setP({ ...p, avatar });
                    await save({ ...p, avatar });
                  }}
                />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h2 className="text-2xl font-semibold">{p.name}</h2>
            {editing ? (
              <Input value={p.headline ?? ""} onChange={(e) => setP({ ...p, headline: e.target.value })} placeholder="Headline, for example Video editor and colourist" className="mt-1 max-w-xl" aria-label="Headline" />
            ) : (
              <p className="text-muted-foreground">{p.headline || p.roles.join(", ")}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {editing ? (
                <Input value={p.location ?? ""} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="Location" className="h-7 w-48" aria-label="Location" />
              ) : (
                p.location && (
                  <span className="flex items-center gap-1">
                    <MapPinIcon className="size-3" /> {p.location}
                  </span>
                )
              )}
              {editing ? (
                <Select value={p.studyStatus ?? "none"} onValueChange={(v) => setP({ ...p, studyStatus: v === "none" ? null : (v as Profile["studyStatus"]) })}>
                  <SelectTrigger size="sm" className="h-7 w-48" aria-label="Study status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Study status not shown</SelectItem>
                    {Object.entries(STUDY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                p.studyStatus && (
                  <span className="flex items-center gap-1">
                    <GraduationCapIcon className="size-3" /> {STUDY_LABELS[p.studyStatus]}
                  </span>
                )
              )}
              <span>{p.roles.join(", ")}</span>
            </div>
          </div>
          {!p.canEdit && (
            <div className="flex gap-2 pb-1">
              <Button variant="outline" onClick={() => setContactOpen(true)}>
                <PhoneIcon /> Contact
              </Button>
            </div>
          )}
          {p.canEdit && (
            <div className="flex gap-2 pb-1">
              {editing ? (
                <>
                  <Button variant="ghost" onClick={() => (setP(profile), setEditing(false))}>
                    Cancel
                  </Button>
                  <Button onClick={() => save()} disabled={busy}>
                    {busy && <Loader2Icon className="animate-spin" />} Save profile
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <PencilIcon /> Edit profile
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-medium">Shown to colleagues:</span>
            {(Object.keys(SECTION_LABELS) as ProfileSection[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <Checkbox checked={!p.hidden.includes(k)} onCheckedChange={(v) => setP({ ...p, hidden: v === true ? p.hidden.filter((x) => x !== k) : [...p.hidden, k] })} /> {SECTION_LABELS[k]}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {show("about") && (editing || p.about) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">About{hiddenNote("about")}</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? <Textarea value={p.about ?? ""} onChange={(e) => setP({ ...p, about: e.target.value })} rows={4} placeholder="What you do, what you are good at, what you are learning" /> : <p className="text-sm whitespace-pre-wrap">{p.about}</p>}
            </CardContent>
          </Card>
        )}
        {show("skills") && (editing || p.skills.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="size-4" /> Skills{hiddenNote("skills")}
              </CardTitle>
              {editing && (
                <CardAction>
                  <Button size="xs" variant="outline" onClick={skills.add}>
                    <PlusIcon /> Add
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {editing
                ? p.skills.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={s.name} onChange={(e) => skills.set(i, { name: e.target.value })} placeholder="Premiere Pro" aria-label={`Skill ${i + 1}`} />
                      <Select value={s.level} onValueChange={(v) => skills.set(i, { level: v as Skill["level"] })}>
                        <SelectTrigger className="w-32" aria-label="Level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => skills.del(i)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))
                : (
                  <div className="flex flex-wrap gap-2">
                    {p.skills.map((s) => (
                      <span key={s.name} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm" title={LEVEL_LABELS[s.level]}>
                        {s.name}
                        <span className="flex gap-0.5">
                          {[1, 2, 3, 4].map((d) => (
                            <span key={d} className={cn("size-1.5 rounded-full", d <= LEVEL_DOTS[s.level] ? "bg-primary" : "bg-muted")} />
                          ))}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        )}
        {show("education") && (editing || p.education.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCapIcon className="size-4" /> Education{hiddenNote("education")}
              </CardTitle>
              {editing && (
                <CardAction>
                  <Button size="xs" variant="outline" onClick={edu.add}>
                    <PlusIcon /> Add
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {p.education.map((e, i) =>
                editing ? (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
                    <Input value={e.school} onChange={(x) => edu.set(i, { school: x.target.value })} placeholder="School or university" className="col-span-2" aria-label="School" />
                    <Input value={e.degree} onChange={(x) => edu.set(i, { degree: x.target.value })} placeholder="Degree (BSc, Diploma)" aria-label="Degree" />
                    <Input value={e.field} onChange={(x) => edu.set(i, { field: x.target.value })} placeholder="Field" aria-label="Field" />
                    <Input value={e.from} onChange={(x) => edu.set(i, { from: x.target.value })} placeholder="From (year)" aria-label="From" />
                    <Input value={e.to} onChange={(x) => edu.set(i, { to: x.target.value })} placeholder="To (year)" aria-label="To" />
                    <Select value={e.status} onValueChange={(v) => edu.set(i, { status: v as Education["status"] })}>
                      <SelectTrigger aria-label="Status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="ongoing">Studying now</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => edu.del(i)}>
                      <Trash2Icon /> Remove
                    </Button>
                  </div>
                ) : (
                  <div key={i}>
                    <div className="font-medium">{e.school}</div>
                    <div className="text-muted-foreground">
                      {[e.degree, e.field].filter(Boolean).join(", ")}
                      {(e.from || e.to) && ` · ${e.from}${e.to ? `–${e.to}` : ""}`}
                      {e.status === "ongoing" && " · studying now"}
                    </div>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
        {show("experience") && (editing || p.experience.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BriefcaseIcon className="size-4" /> Experience{hiddenNote("experience")}
              </CardTitle>
              {editing && (
                <CardAction>
                  <Button size="xs" variant="outline" onClick={exp.add}>
                    <PlusIcon /> Add
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {p.experience.map((e, i) =>
                editing ? (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
                    <Input value={e.title} onChange={(x) => exp.set(i, { title: x.target.value })} placeholder="Job title" aria-label="Job title" />
                    <Input value={e.org} onChange={(x) => exp.set(i, { org: x.target.value })} placeholder="Organisation" aria-label="Organisation" />
                    <Input value={e.from} onChange={(x) => exp.set(i, { from: x.target.value })} placeholder="From" aria-label="From" />
                    <Input value={e.to} onChange={(x) => exp.set(i, { to: x.target.value })} placeholder="To (or now)" aria-label="To" />
                    <Input value={e.note} onChange={(x) => exp.set(i, { note: x.target.value })} placeholder="What you did" className="col-span-2" aria-label="Note" />
                    <Button size="sm" variant="ghost" onClick={() => exp.del(i)}>
                      <Trash2Icon /> Remove
                    </Button>
                  </div>
                ) : (
                  <div key={i}>
                    <div className="font-medium">
                      {e.title} <span className="font-normal text-muted-foreground">at {e.org}</span>
                    </div>
                    <div className="text-muted-foreground">{[`${e.from}${e.to ? `–${e.to}` : ""}`, e.note].filter(Boolean).join(" · ")}</div>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
        {show("languages") && (editing || p.languages.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LanguagesIcon className="size-4" /> Languages{hiddenNote("languages")}
              </CardTitle>
              {editing && (
                <CardAction>
                  <Button size="xs" variant="outline" onClick={langs.add}>
                    <PlusIcon /> Add
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.languages.map((l, i) =>
                editing ? (
                  <div key={i} className="flex gap-2">
                    <Input value={l.name} onChange={(x) => langs.set(i, { name: x.target.value })} placeholder="Amharic" aria-label="Language" />
                    <Input value={l.level} onChange={(x) => langs.set(i, { level: x.target.value })} placeholder="Native, fluent, basic" aria-label="Level" />
                    <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => langs.del(i)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                ) : (
                  <div key={i}>
                    {l.name} <span className="text-muted-foreground">{l.level}</span>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
        {show("links") && (editing || p.links.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GlobeIcon className="size-4" /> Links{hiddenNote("links")}
              </CardTitle>
              {editing && (
                <CardAction>
                  <Button size="xs" variant="outline" onClick={links.add}>
                    <PlusIcon /> Add
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.links.map((l, i) =>
                editing ? (
                  <div key={i} className="flex gap-2">
                    <Input value={l.label} onChange={(x) => links.set(i, { label: x.target.value })} placeholder="Portfolio" className="w-36" aria-label="Label" />
                    <Input value={l.url} onChange={(x) => links.set(i, { url: x.target.value })} placeholder="https://" aria-label="Address" />
                    <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => links.del(i)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                ) : (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer noopener" className="block text-primary hover:underline">
                    {l.label || l.url}
                  </a>
                ),
              )}
            </CardContent>
          </Card>
        )}
        {p.canEdit && p.contact && <ContactEditor profile={p} onSave={(contact) => save({ ...p, contact })} busy={busy} />}
        {p.files && <Files profile={p} />}
      </div>
      <ContactSheet userId={contactOpen ? p.userId : null} onClose={() => setContactOpen(false)} />
    </div>
  );
}

function Files({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [kind, setKind] = React.useState("certificate");
  const [title, setTitle] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">
          Files <span className="text-xs font-normal text-muted-foreground">CV, certificates, portfolio. Seen by you, your lead or manager, HR and Admin.</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {profile.files!.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="rounded bg-muted px-1.5 text-xs">{FILE_LABELS[f.kind] ?? f.kind}</span>
            <span className="min-w-0 flex-1 truncate">{f.title}</span>
            <span className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
            <Button size="icon-xs" variant="ghost" asChild aria-label={`Open ${f.title}`}>
              <Link href={`/api/profile-files/${f.id}`} target="_blank">
                <DownloadIcon />
              </Link>
            </Button>
            {profile.canEdit && (
              <Button size="icon-xs" variant="ghost" aria-label={`Remove ${f.title}`} onClick={async () => {
                const r = await deleteProfileFileAction(f.id);
                if (!r.ok) return void toast.error(r.error);
                router.refresh();
              }}>
                <Trash2Icon />
              </Button>
            )}
          </div>
        ))}
        {!profile.files!.length && <p className="text-muted-foreground">No files yet.</p>}
        {profile.canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FILE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor="pf-title">Title</Label>
              <Input id="pf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adobe Certified Professional" />
            </div>
            <input
              ref={ref}
              type="file"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) return void toast.error("Files are limited to 8 MB.");
                setBusy(true);
                const r = await addProfileFileAction({ kind, title, file: { name: f.name, mime: f.type, base64: await toBase64(f) } });
                setBusy(false);
                e.target.value = "";
                if (!r.ok) return void toast.error(r.error);
                setTitle("");
                toast.success("File added");
                router.refresh();
              }}
            />
            <Button variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Upload
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const VIS_LABELS: Record<Visibility, string> = { everyone: "Everyone", team: "My team", nobody: "Only me" };

// Contact details colleagues see when they tap you in chat or open your profile, each with who may see it.
function ContactEditor({ profile, onSave, busy }: { profile: Profile; onSave: (c: Contact) => void; busy: boolean }) {
  const [c, setC] = React.useState<Contact>(profile.contact!);
  const field = (k: keyof Contact, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label htmlFor={`ct-${k}`}>{label}</Label>
      <Input id={`ct-${k}`} value={String(c[k] ?? "")} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={placeholder} />
    </div>
  );
  const vis = (k: "phoneVisible" | "emailVisible" | "messengersVisible", label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={c[k]} onValueChange={(v) => setC({ ...c, [k]: v as Visibility })}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(VIS_LABELS) as Visibility[]).map((x) => (
            <SelectItem key={x} value={x}>
              {VIS_LABELS[x]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneIcon className="size-4" /> Contact details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Shown on your contact card when someone taps you in chat. My team means people in your stage or department and your leads. HR and Admin always see them.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("phone", "Mobile", "+251 9…")}
          {field("phone2", "Other phone", "Office line")}
          {vis("phoneVisible", "Phones visible to")}
          {field("workEmail", "Work email", "you@myseed.com.et")}
          {field("office", "Office or desk", "Studio 2, 3rd floor")}
          {vis("emailVisible", "Email visible to")}
          {field("telegram", "Telegram username", "@name")}
          {field("whatsapp", "WhatsApp number", "+251 9…")}
          {vis("messengersVisible", "Telegram and WhatsApp visible to")}
        </div>
        <Button onClick={() => onSave(c)} disabled={busy}>
          Save contact details
        </Button>
      </CardContent>
    </Card>
  );
}
