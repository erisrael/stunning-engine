"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ClapperboardIcon, ImageIcon, Loader2Icon, PaletteIcon, RotateCcwIcon, TypeIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BrandMark } from "@/components/app/brand-mark";
import { saveSystemConfigAction } from "@/app/actions/system-config";
import type { MotionMode, SystemConfig } from "@/server/system-config";
import { cn } from "@/lib/utils";

const read = (f: File) =>
  new Promise<string>((res, rej) => {
    if (f.size > 1_000_000) return rej(new Error("Pictures are limited to 1 MB."));
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

const MOTION: { value: MotionMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Nothing moves. Best for slow computers and people sensitive to motion." },
  { value: "subtle", label: "Subtle", hint: "Soft fades and hovers: calm for long work days." },
  { value: "cinematic", label: "Cinematic", hint: "Like a film: scene cuts between pages, cards that glide in, icons that act out what they mean." },
];

// Admin, Configure whole system. Every change is listed in a confirmation before it is saved.
export function SystemConfigClient({ value, packs }: { value: SystemConfig; packs: { value: string; label: string; hint: string }[] }) {
  const router = useRouter();
  const start = {
    name: value.identity.name,
    tagline: value.identity.tagline,
    shortName: value.identity.shortName,
    color: value.identity.color,
    reportName: value.reportName,
    motionDefault: value.motionDefault,
    cinematicAllowed: value.cinematicAllowed,
    iconPack: value.iconPack,
    plainDefault: value.plainDefault,
  };
  const [f, setF] = React.useState(start);
  const [logo, setLogo] = React.useState<string | null | undefined>(undefined);
  const [favicon, setFavicon] = React.useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const label: Record<string, string> = {
    name: "System name",
    tagline: "Line under the name",
    shortName: "Short name on phones",
    color: "App colour",
    reportName: "Name on reports and documents",
    motionDefault: "Motion for everyone",
    cinematicAllowed: "People may switch cinematic on",
    iconPack: "Icon pack for everyone",
    plainDefault: "Simple look for everyone",
  };
  const show = (k: string, v: unknown) =>
    k === "motionDefault" ? (MOTION.find((m) => m.value === v)?.label ?? String(v)) : k === "iconPack" ? (packs.find((p) => p.value === v)?.label ?? String(v)) : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v || "(empty)");
  const changes = [
    ...(Object.keys(start) as (keyof typeof start)[]).filter((k) => f[k] !== start[k]).map((k) => ({ what: label[k]!, from: show(k, start[k]), to: show(k, f[k]) })),
    ...(logo !== undefined ? [{ what: "Logo", from: value.identity.logo ? "Your logo" : "The Myseed mark", to: logo ? "The new picture" : "The Myseed mark" }] : []),
    ...(favicon !== undefined ? [{ what: "Favicon", from: value.identity.favicon ? "Your favicon" : "The logo", to: favicon ? "The new picture" : "The logo" }] : []),
  ];
  const invalid = !f.name.trim() ? "Give the system a name." : !f.reportName.trim() ? "Give the name used on reports." : f.motionDefault === "cinematic" && !f.cinematicAllowed ? "Cinematic cannot be the default while it is switched off." : "";

  const pick = (set: (v: string) => void) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set(await read(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the picture");
    }
    e.target.value = "";
  };

  const save = async () => {
    setBusy(true);
    const r = await saveSystemConfigAction({ ...f, ...(logo !== undefined ? { logo } : {}), ...(favicon !== undefined ? { favicon } : {}) });
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("The whole system is updated");
    // The names and pictures show everywhere after a reload.
    setTimeout(() => location.reload(), 600);
    router.refresh();
  };

  const shownLogo = logo ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" data-system-config>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TypeIcon className="size-4" /> Names
            </CardTitle>
            <CardDescription>What people see in the app, and what is printed on every report, export and email.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sc-name">System name</Label>
              <Input id="sc-name" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-tag">Line under the name</Label>
              <Input id="sc-tag" value={f.tagline} maxLength={60} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Operations" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-short">Short name (under the app icon on phones)</Label>
              <Input id="sc-short" value={f.shortName} maxLength={20} onChange={(e) => setF({ ...f, shortName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-report">Name on reports and documents</Label>
              <Input id="sc-report" value={f.reportName} maxLength={80} onChange={(e) => setF({ ...f, reportName: e.target.value })} />
              <Button type="button" size="xs" variant="ghost" onClick={() => setF({ ...f, reportName: [f.name, f.tagline].filter(Boolean).join(" ") })}>
                Use “{[f.name, f.tagline].filter(Boolean).join(" ")}”
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="size-4" /> Logo and colour
            </CardTitle>
            <CardDescription>The logo shows in the sidebar, on the sign-in page and at the top of reports. Square PNG, SVG or WebP, up to 1 MB.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sc-logo">Logo</Label>
              <Input id="sc-logo" type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif" onChange={pick(setLogo)} />
              {(value.identity.logo || logo) && (
                <Button type="button" size="xs" variant="ghost" onClick={() => setLogo(null)}>
                  <RotateCcwIcon /> Use the Myseed mark
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-fav">Favicon (browser tab; the logo if empty)</Label>
              <Input id="sc-fav" type="file" accept="image/*,.ico" onChange={pick(setFavicon)} />
              {(value.identity.favicon || favicon) && (
                <Button type="button" size="xs" variant="ghost" onClick={() => setFavicon(null)}>
                  <RotateCcwIcon /> Remove the favicon
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-color">App colour</Label>
              <div className="flex items-center gap-2">
                <input id="sc-color" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-9 w-12 rounded border" />
                <span className="font-mono text-xs">{f.color}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClapperboardIcon className="size-4" /> Motion
            </CardTitle>
            <CardDescription>How the system moves for everyone who has not chosen for themselves (account menu, Motion). People who ask their computer for less motion always get Off.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Motion for everyone">
              {MOTION.map((m) => {
                const disabled = m.value === "cinematic" && !f.cinematicAllowed;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={f.motionDefault === m.value}
                    disabled={disabled}
                    onClick={() => setF({ ...f, motionDefault: m.value })}
                    className={cn("rounded-xl border p-3 text-left transition-colors disabled:opacity-50", f.motionDefault === m.value ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                    data-motion-option={m.value}
                  >
                    <span className="flex items-center justify-between font-medium">
                      {m.label} {f.motionDefault === m.value && <CheckIcon className="size-4 text-primary" />}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{m.hint}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={f.cinematicAllowed}
                onCheckedChange={(v) => setF({ ...f, cinematicAllowed: v, motionDefault: !v && f.motionDefault === "cinematic" ? "subtle" : f.motionDefault })}
                aria-label="Allow the cinematic mode"
              />
              Allow the cinematic mode (people can switch it on for themselves)
            </label>
            <label className="flex items-start gap-2 text-sm" data-plain-default>
              <Switch checked={f.plainDefault} onCheckedChange={(v) => setF({ ...f, plainDefault: v })} aria-label="Simple look for everyone" className="mt-0.5" />
              <span>
                Simple look for everyone
                <span className="block text-xs text-muted-foreground">Plain and calm: no glass, blur, animations or effects, and lighter on slow phones and connections. Each person can still turn it on or off for themselves (Settings, Appearance).</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PaletteIcon className="size-4" /> Icon pack
            </CardTitle>
            <CardDescription>The icons for everyone who has not picked a pack in their account menu.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Icon pack">
              {packs.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={f.iconPack === p.value}
                  onClick={() => setF({ ...f, iconPack: p.value })}
                  className={cn("rounded-xl border p-3 text-left text-sm transition-colors", f.iconPack === p.value ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                >
                  <span className="font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.hint}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase">Sidebar</p>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-white ring-1 ring-border">
                {shownLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview of the chosen picture
                  <img src={shownLogo} alt="" className="size-8 object-contain" />
                ) : (
                  <BrandMark logo={logo === null ? false : value.identity.logo} version={value.identity.version} className="size-8" />
                )}
              </span>
              <span className="grid leading-tight">
                <span className="font-semibold">{f.name || "Name"}</span>
                <span className="text-xs text-muted-foreground">{f.tagline}</span>
              </span>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Report header</p>
            <div className="overflow-hidden rounded-lg border bg-white text-[#1f2937]">
              <div className="h-1.5" style={{ background: f.color }} />
              <div className="flex items-center justify-between gap-2 p-3">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  {shownLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- preview of the chosen picture
                    <img src={shownLogo} alt="" className="size-5 object-contain" />
                  ) : (
                    <BrandMark logo={logo === null ? false : value.identity.logo} version={value.identity.version} className="size-5" />
                  )}
                  {f.reportName || "Name on reports"}
                </span>
                <span className="text-[10px] text-[#6b7280]">Team report</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p>{changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} ready.` : "No changes yet."}</p>
            {invalid && <p className="text-destructive">{invalid}</p>}
            <div className="flex gap-2">
              <Button disabled={!changes.length || !!invalid || busy} onClick={() => setConfirm(true)} data-system-review>
                Review and apply
              </Button>
              <Button
                variant="ghost"
                disabled={!changes.length || busy}
                onClick={() => {
                  setF(start);
                  setLogo(undefined);
                  setFavicon(undefined);
                }}
              >
                Undo all
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>

      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply these changes to the whole system?</AlertDialogTitle>
            <AlertDialogDescription>Everyone sees them right away, in the app and on every new report and export.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm" data-system-changes>
            {changes.map((c) => (
              <li key={c.what} className="rounded-lg border p-2">
                <p className="font-medium">{c.what}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="line-through">{c.from}</span> → <span className="text-foreground">{c.to}</span>
                </p>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
              data-system-confirm
            >
              {busy && <Loader2Icon className="animate-spin" />} Yes, apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
