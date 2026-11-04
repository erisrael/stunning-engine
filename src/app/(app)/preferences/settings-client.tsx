"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { BellIcon, ChevronRightIcon, HelpCircleIcon, LanguagesIcon, MapPinIcon, PaletteIcon, PhoneIcon, ShieldIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ACCENTS, FONTS, useAppearance } from "@/components/app/appearance";
import { PushToggle } from "@/components/app/push-toggle";
import { Preferences } from "@/app/(app)/notifications/notifications-client";
import { readConsent, writeConsent } from "@/components/app/attendance/geofence-watch";
import { cn } from "@/lib/utils";

// One choice as a row of buttons that wraps: it never runs off a phone's screen the way nested menus did.
function Choice({ label, value, options, onChange, id }: { label: string; value: string; options: { value: string; label: React.ReactNode }[]; onChange: (v: string) => void; id: string }) {
  return (
    <div className="space-y-1.5" data-setting={id}>
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn("max-w-full rounded-full border px-3 py-1.5 text-left text-sm transition-colors", value === o.value ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ROUTE_KEY = "myseed.call.route";
function readRoutes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ROUTE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function Section({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20" data-settings-section={id}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function PersonalSettings({ muted, emailed, geofence }: { muted: string[]; emailed: string[]; geofence: string }) {
  const { theme, setTheme } = useTheme();
  const [look, setLook] = useAppearance();
  const [routes, setRoutes] = React.useState<Record<string, string>>({});
  const [geo, setGeo] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setRoutes(readRoutes());
    setGeo(readConsent());
    setMounted(true);
  }, []);
  const setRoute = (kind: string, v: string) => {
    const next = { ...routes, [kind]: v };
    setRoutes(next);
    try {
      localStorage.setItem(ROUTE_KEY, JSON.stringify(next));
    } catch {}
  };
  const jump = [
    ["look", "Appearance"],
    ["language", "Language"],
    ["notifications", "Notifications"],
    ["help", "Help"],
    ["calls", "Calls"],
    ["location", "Location"],
    ["more", "More"],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4" data-personal-settings>
      <nav className="flex flex-wrap gap-1.5" aria-label="Settings sections">
        {jump.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
            {label}
          </a>
        ))}
      </nav>

      <Section id="look" icon={<PaletteIcon className="size-4" />} title="Appearance" description="On this device.">
        <Choice id="theme" label="Theme" value={mounted ? (theme ?? "system") : "system"} onChange={setTheme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Like the device" }]} />
        <Choice
          id="accent"
          label="Accent colour"
          value={look.accent}
          onChange={(v) => setLook({ accent: v })}
          options={ACCENTS.map((a) => ({ value: a.key, label: <span className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: a.color }} /> {a.label}</span> }))}
        />
        <Choice id="font" label="Font" value={look.font} onChange={(v) => setLook({ font: v })} options={FONTS.map((f) => ({ value: f.key, label: f.label }))} />
        <Choice id="text" label="Text size" value={look.text} onChange={(v) => setLook({ text: v })} options={[{ value: "small", label: "Small" }, { value: "normal", label: "Normal" }, { value: "large", label: "Large" }]} />
        <Choice id="contrast" label="Contrast" value={look.contrast} onChange={(v) => setLook({ contrast: v })} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High contrast" }]} />
        <Choice id="radius" label="Corners" value={look.radius} onChange={(v) => setLook({ radius: v })} options={[{ value: "sharp", label: "Sharp" }, { value: "default", label: "Default" }, { value: "round", label: "Rounded" }]} />
        <Choice id="icons" label="Icons" value={look.icons} onChange={(v) => setLook({ icons: v })} options={[{ value: "colour", label: "Colourful" }, { value: "plain", label: "One colour" }]} />
        <Choice id="iconPack" label="Icon style" value={look.iconPack} onChange={(v) => setLook({ iconPack: v })} options={[{ value: "lucide", label: "Outline" }, { value: "fill", label: "Filled" }, { value: "duotone", label: "Duotone" }]} />
        <Choice id="iconWeight" label="Outline strokes" value={look.iconWeight} onChange={(v) => setLook({ iconWeight: v })} options={[{ value: "thin", label: "Thin" }, { value: "regular", label: "Regular" }, { value: "bold", label: "Bold" }]} />
        <Choice id="lite" label="Slow connection" value={look.lite} onChange={(v) => setLook({ lite: v })} options={[{ value: "off", label: "Normal" }, { value: "on", label: "Light mode: no animations, fewer refreshes" }]} />
      </Section>

      <Section id="language" icon={<LanguagesIcon className="size-4" />} title="Language and dates" description="On this device.">
        <Choice id="lang" label="Language" value={look.lang} onChange={(v) => setLook({ lang: v })} options={[{ value: "en", label: "English" }, { value: "am", label: "አማርኛ (Amharic)" }]} />
        <Choice
          id="calendar"
          label="Dates"
          value={look.calendar}
          onChange={(v) => setLook({ calendar: v })}
          options={[
            { value: "", label: "As set for the workspace" },
            { value: "gregorian", label: "Gregorian (3 Nov 2026)" },
            { value: "ethiopian", label: "Ethiopian (ጥቅምት 24, 2019)" },
            { value: "both", label: "Both" },
          ]}
        />
      </Section>

      <Section id="notifications" icon={<BellIcon className="size-4" />} title="Notifications" description="On your account. Essential workflow notices are always delivered.">
        <PushToggle />
        <Preferences muted={muted} emailed={emailed} />
      </Section>

      <Section id="help" icon={<HelpCircleIcon className="size-4" />} title="Help and how-to" description="Tips and help links on this device; which chapters and guides you see is set in Help.">
        <div className="flex items-center gap-2">
          <Switch id="st-tips" checked={look.tips !== "off"} onCheckedChange={(v) => setLook({ tips: v ? "on" : "off" })} />
          <Label htmlFor="st-tips">Show tips when pointing at buttons</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="st-links" checked={look.helpLinks !== "off"} onCheckedChange={(v) => setLook({ helpLinks: v ? "on" : "off" })} />
          <Label htmlFor="st-links">Show the help link (?) next to page titles</Label>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/profile/help">
            Choose chapters and guides <ChevronRightIcon />
          </Link>
        </Button>
      </Section>

      <Section id="calls" icon={<PhoneIcon className="size-4" />} title="Calls" description="Where call sound starts on this device. You can switch during the call with the speaker button.">
        <Choice id="route-voice" label="Voice calls" value={routes.voice ?? "auto"} onChange={(v) => setRoute("voice", v === "auto" ? "" : v)} options={[{ value: "auto", label: "Earpiece on phones, speaker on computers" }, { value: "ear", label: "Earpiece" }, { value: "speaker", label: "Loudspeaker" }]} />
        <Choice id="route-video" label="Video calls" value={routes.video ?? "auto"} onChange={(v) => setRoute("video", v === "auto" ? "" : v)} options={[{ value: "auto", label: "Loudspeaker (usual)" }, { value: "ear", label: "Earpiece" }]} />
        <p className="text-xs text-muted-foreground">Where the browser allows it, the proximity sensor switches to the earpiece and darkens the screen while the phone is at your ear.</p>
      </Section>

      <Section id="location" icon={<MapPinIcon className="size-4" />} title="Location while checked in" description="This phone only.">
        {geofence === "off" ? (
          <p className="text-sm text-muted-foreground">Your workspace does not use location after check-in.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              While you are checked in, this phone&apos;s location tells the app when you leave the site, so it can {geofence === "notify" ? "remind you to check out" : geofence === "checkout" ? "check you out" : "start a break"}. It is read only while you are checked in and the app is open.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="st-geo"
                checked={geo === "yes"}
                onCheckedChange={(v) => {
                  if (!v) return (writeConsent("no"), setGeo("no"));
                  navigator.geolocation?.getCurrentPosition(
                    () => (writeConsent("yes"), setGeo("yes")),
                    () => toast.error("Location is blocked for this site. Allow it in the browser first."),
                    { enableHighAccuracy: true, timeout: 20000 },
                  );
                }}
              />
              <Label htmlFor="st-geo">Use this phone&apos;s location while I am checked in</Label>
            </div>
          </>
        )}
      </Section>

      <Section id="more" icon={<ShieldIcon className="size-4" />} title="More">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["/profile", "Profile and photo"],
            ["/profile?tab=account", "Password, two-step and devices"],
            ["/profile/help", "Help and training"],
            ["/notifications", "Notifications inbox"],
            ["/safety", "Safety and reporting"],
            ["/routines", "Routines"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted">
              {label} <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
