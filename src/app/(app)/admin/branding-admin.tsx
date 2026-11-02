"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeBannerAction, saveBannerAction, saveNavBrandAction } from "@/app/actions/branding";
import { AppIcon, ICONS, TONE_LIST, TONE_SWATCH, type Tone } from "@/components/app/app-icon";
import type { Banner, NavBrand } from "@/server/branding";
import { cn } from "@/lib/utils";

const COLOURS = ["#1A73E8", "#188038", "#D93025", "#F9AB00", "#9334E6", "#007B83", "#E8710A", "#D01884", "#0b7a3b", "#3d4350"];

// The sidebar entries Admin can restyle (their keys are the links they open).
export const NAV_ENTRIES: { key: string; label: string; icon: string }[] = [
  { key: "/dashboard", label: "Home / My work / Today", icon: "home" },
  { key: "/attendance", label: "Attendance", icon: "clock" },
  { key: "/approvals", label: "Approvals", icon: "checks" },
  { key: "/questions", label: "Questions", icon: "question" },
  { key: "/people", label: "People", icon: "team" },
  { key: "/overview", label: "Overview", icon: "tree" },
  { key: "views", label: "Work views", icon: "layers" },
  { key: "/handovers", label: "Handovers", icon: "package" },
  { key: "/sessions", label: "Studio sessions", icon: "video" },
  { key: "/coverage", label: "Coverage", icon: "grid" },
  { key: "/reports", label: "Reports", icon: "chart" },
  { key: "/team", label: "Team", icon: "users" },
  { key: "/email", label: "Email", icon: "mail" },
  { key: "/dev", label: "Dev team", icon: "code" },
  { key: "/studio", label: "Studio", icon: "notebook" },
  { key: "/marketing", label: "Marketing", icon: "megaphone" },
  { key: "/hr", label: "HR", icon: "contact" },
  { key: "/finance", label: "Finance", icon: "bank" },
  { key: "/requests", label: "Requests", icon: "inbox" },
  { key: "/owners", label: "Owners", icon: "crown" },
  { key: "/company", label: "Company", icon: "building" },
  { key: "/calendar", label: "Calendar", icon: "calendar" },
  { key: "/settings", label: "Settings", icon: "settings" },
  { key: "/admin", label: "Admin", icon: "userCog" },
  { key: "/import-export", label: "Import and export", icon: "arrows" },
  { key: "/audit", label: "Audit log", icon: "shield" },
];

function BannerEditor({ section, banner, onSaved }: { section: { key: string; label: string }; banner: Banner | undefined; onSaved: () => void }) {
  const [title, setTitle] = React.useState(banner?.title ?? "");
  const [text, setText] = React.useState(banner?.text ?? "");
  const [color, setColor] = React.useState(banner?.color ?? "");
  const [busy, setBusy] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);
  const save = async (image?: { mime: string; base64: string } | null, removeImage = false) => {
    setBusy(true);
    const r = await saveBannerAction({ key: section.key, title, text, color: color || null, image: image ?? null, removeImage });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Banner saved for ${section.label}`);
    onSaved();
  };
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return void toast.error("The picture is over 3 MB; make it smaller.");
    const rd = new FileReader();
    rd.onload = () => void save({ mime: f.type, base64: String(rd.result).split(",")[1] ?? "" });
    rd.readAsDataURL(f);
  };
  const preview = banner?.image ? `url("/api/branding/banner/${encodeURIComponent(section.key)}?v=${encodeURIComponent(banner.updatedAt)}") center / cover` : color ? color : undefined;
  return (
    <div className="space-y-2 rounded-xl border p-3" data-banner-editor={section.key}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{section.label}</p>
        {banner && (
          <Button size="xs" variant="ghost" aria-label={`Remove the banner of ${section.label}`} onClick={async () => (await removeBannerAction(section.key), onSaved())}>
            <Trash2Icon /> Remove
          </Button>
        )}
      </div>
      <div className="flex h-16 items-end rounded-lg border bg-muted px-3 py-2 text-sm text-white" style={preview ? { background: preview } : undefined}>
        {(title || text) && (
          <span className="rounded bg-black/40 px-2 py-0.5">
            {title}
            {text ? ` · ${text}` : ""}
          </span>
        )}
        {!preview && !title && !text && <span className="text-muted-foreground">No banner</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label={`Banner title for ${section.label}`} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input aria-label={`Banner line for ${section.label}`} placeholder="A short line (optional)" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOURS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
        ))}
        <Input type="color" aria-label="Another colour" className="h-7 w-10 p-0.5" value={color || "#1a73e8"} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => save()}>
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label={`Banner picture for ${section.label}`} onChange={(e) => pick(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          <ImageIcon /> Upload a picture
        </Button>
        {banner?.image && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null, true)}>
            Use the colour instead
          </Button>
        )}
      </div>
    </div>
  );
}

export function BrandingAdmin({ sections, banners, nav }: { sections: { key: string; label: string }[]; banners: Banner[]; nav: NavBrand }) {
  const router = useRouter();
  const [n, setN] = React.useState<NavBrand>(nav);
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = (key: string, patch: { icon?: string | null; tone?: string | null }) => setN({ ...n, [key]: { ...n[key], ...patch } });
  const saveNav = async () => {
    setBusy(true);
    const r = await saveNavBrandAction(n);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Sidebar icons saved");
    router.refresh();
  };
  return (
    <div className="space-y-4" data-branding-admin>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banners</CardTitle>
          <CardDescription>A picture, or a colour with a title and a line, at the top of each section&apos;s main page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {sections.map((s) => (
            <BannerEditor key={s.key} section={s} banner={banners.find((b) => b.key === s.key)} onSaved={() => router.refresh()} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sidebar icons and colours</CardTitle>
          <CardDescription>Give any sidebar entry another icon from the pack and another colour, for everyone. People still choose the style (outline, filled, duotone; colourful or one colour) in their account menu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {NAV_ENTRIES.map((e) => {
            const cur = n[e.key] ?? {};
            return (
              <div key={e.key} className="rounded-lg border p-2" data-nav-brand={e.key}>
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted [&_svg]:size-4">
                    <AppIcon name={cur.icon || e.icon} tone={(cur.tone as Tone) || null} />
                  </span>
                  <p className="flex-1 font-medium">{e.label}</p>
                  <div className="flex gap-1">
                    {TONE_LIST.map((t) => (
                      <button key={t} type="button" aria-label={`${e.label} in ${t}`} aria-pressed={cur.tone === t} onClick={() => set(e.key, { tone: cur.tone === t ? null : t })} className={cn("size-5 rounded-full border-2", cur.tone === t ? "border-foreground" : "border-transparent")} style={{ background: TONE_SWATCH[t] }} />
                    ))}
                  </div>
                  <Button size="xs" variant="outline" onClick={() => setOpen(open === e.key ? null : e.key)}>
                    Icon
                  </Button>
                </div>
                {open === e.key && (
                  <div className="mt-2 grid max-h-56 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-12" role="listbox" aria-label={`Icon for ${e.label}`}>
                    {Object.entries(ICONS).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        role="option"
                        aria-selected={(cur.icon || e.icon) === k}
                        title={v.label}
                        aria-label={v.label}
                        onClick={() => (set(e.key, { icon: k === e.icon ? null : k }), setOpen(null))}
                        className={cn("flex size-9 items-center justify-center rounded-lg border hover:bg-muted [&_svg]:size-4", (cur.icon || e.icon) === k && "border-primary bg-primary/10")}
                      >
                        <AppIcon name={k} tone={(cur.tone as Tone) || null} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <Label className="sr-only">Save</Label>
            <Button size="sm" disabled={busy} onClick={saveNav}>
              {busy && <Loader2Icon className="animate-spin" />} Save sidebar icons
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setN({})}>
              Back to the usual icons
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
