"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPinIcon, PlusIcon, PrinterIcon, RefreshCwIcon, SaveIcon, Trash2Icon, WifiIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { saveAttendanceConfigAction } from "@/app/actions/attendance";
import { rotatePosterAction, saveCaptureConfigAction } from "@/app/actions/attendance-capture";
import type { AttendanceConfig } from "@/lib/attendance";
import type { CaptureConfig, Site } from "@/server/attendance-capture";
import { fmtDateTime } from "@/lib/format";

type Status = { myIp: string | null; mySite: string | null; refusals: { siteId: string | null; count: number; lastIp: string | null; lastAt: string }[] };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b py-3 last:border-0 sm:grid-cols-[280px_1fr] sm:items-center sm:gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

const blankSite = (): Site => ({ id: "", name: "Office", networks: [], lat: null, lng: null, radiusM: 150, checks: { network: true, location: false, device: false }, posterKey: "", posterAt: "" });

// Admin's half of attendance setup: how people check in, the sites with their office networks, QR posters,
// phones and the time window. HR's half (shifts, breaks, rules, people) is in the Rules tab.
export function CaptureSetup({ att, cap, status, origin }: { att: AttendanceConfig; cap: CaptureConfig; status: Status; origin: string }) {
  const router = useRouter();
  const [a, setA] = React.useState(att);
  const [c, setC] = React.useState(cap);
  const [nets, setNets] = React.useState<string[]>(cap.sites.map((s) => s.networks.join("\n")));
  const [busy, setBusy] = React.useState(false);
  const setSite = (i: number, patch: Partial<Site>) => setC({ ...c, sites: c.sites.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const save = async () => {
    setBusy(true);
    const sites = c.sites.map((s, i) => ({ ...s, networks: (nets[i] ?? "").split(/[\s,;]+/).filter(Boolean) }));
    const r1 = await saveAttendanceConfigAction({ methods: a.methods, faceThreshold: a.faceThreshold, site: a.site, kioskSilenceMin: a.kioskSilenceMin, offlineMaxHours: a.offlineMaxHours });
    const r2 = r1.ok ? await saveCaptureConfigAction({ ...c, sites }) : r1;
    setBusy(false);
    if (!r2.ok) return void toast.error(r2.error);
    toast.success("Capture settings saved");
    router.refresh();
  };

  const here = (i: number | null) =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(p.coords.longitude * 1e6) / 1e6;
        if (i === null) setA({ ...a, site: { ...a.site, lat, lng } });
        else setSite(i, { lat, lng });
      },
      () => toast.error("Location is not available. Type the latitude and longitude."),
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ways to check in</CardTitle>
          <CardDescription>Switch on what fits. People without a smartphone can always use the short address on any phone, a shared office computer, or their team lead.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Printed QR at the entrance" hint={`People scan it with their phone, or type ${origin.replace(/^https?:\/\//, "")}/in. The site's checks below must pass too.`}>
            <Switch checked={c.methods.qr} onCheckedChange={(v) => setC({ ...c, methods: { ...c.methods, qr: v } })} aria-label="Printed QR check-in" />
          </Row>
          <Row label="On the office network, in the app" hint="The same buttons on the Attendance page, without scanning, when the phone or computer is on the office Wi-Fi.">
            <Switch checked={c.methods.network} onCheckedChange={(v) => setC({ ...c, methods: { ...c.methods, network: v } })} aria-label="Office network check-in" />
          </Row>
          <Row label="Shared office computer" hint={`Any computer at the office opens ${origin.replace(/^https?:\/\//, "")}/in/shared; people type their number and PIN. Only on the office network.`}>
            <Switch checked={c.methods.shared} onCheckedChange={(v) => setC({ ...c, methods: { ...c.methods, shared: v } })} aria-label="Shared computer check-in" />
          </Row>
          <Row label="Team leads record check-ins" hint="A lead picks the person or scans their badge with the lead's phone. Labelled and reviewed by HR.">
            <Switch checked={c.methods.leadScan} onCheckedChange={(v) => setC({ ...c, methods: { ...c.methods, leadScan: v } })} aria-label="Team lead check-in" />
          </Row>
          <Row label="From the app anywhere" hint="No place check at all. Good only for people who work away from the office.">
            <Switch checked={a.methods.web} onCheckedChange={(v) => setA({ ...a, methods: { ...a.methods, web: v } })} aria-label="Check in from the app anywhere" />
          </Row>
          <Row label="Kiosk" hint="A tablet or laptop at the entrance with badges and PINs (Kiosks, below).">
            <Switch checked={a.methods.kiosk} onCheckedChange={(v) => setA({ ...a, methods: { ...a.methods, kiosk: v } })} aria-label="Kiosk check-in" />
          </Row>
          <Row label="Face at the kiosk" hint="Only for people HR enrols with written consent. Read docs/FACE-CHECKIN.md first.">
            <div className="flex items-center gap-3">
              <Switch checked={a.methods.face} onCheckedChange={(v) => setA({ ...a, methods: { ...a.methods, face: v } })} aria-label="Face check-in at the kiosk" />
              {a.methods.face && <Input type="number" min={0.35} max={0.6} step={0.01} value={a.faceThreshold} onChange={(e) => setA({ ...a, faceThreshold: Number(e.target.value) })} className="w-24" aria-label="Face match threshold" />}
            </div>
          </Row>
          <Row label="Phone by location (older way)" hint="With app check-in off, the Attendance page accepts phones within this radius.">
            <div className="flex flex-wrap items-center gap-2">
              <Switch checked={a.methods.mobile} onCheckedChange={(v) => setA({ ...a, methods: { ...a.methods, mobile: v } })} aria-label="Phone check-in at the site" />
              {a.methods.mobile && (
                <>
                  <Input value={a.site.lat ?? ""} onChange={(e) => setA({ ...a, site: { ...a.site, lat: e.target.value === "" ? null : Number(e.target.value) } })} placeholder="Latitude" className="w-28" aria-label="Latitude" />
                  <Input value={a.site.lng ?? ""} onChange={(e) => setA({ ...a, site: { ...a.site, lng: e.target.value === "" ? null : Number(e.target.value) } })} placeholder="Longitude" className="w-28" aria-label="Longitude" />
                  <Input type="number" value={a.site.radiusM} onChange={(e) => setA({ ...a, site: { ...a.site, radiusM: num(e.target.value) } })} className="w-20" aria-label="Radius in metres" />
                  <Button size="sm" variant="outline" onClick={() => here(null)}>
                    <MapPinIcon /> Here
                  </Button>
                </>
              )}
            </div>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites and office networks</CardTitle>
          <CardDescription>
            A phone proves it is at the office by the office&apos;s internet address (the Wi-Fi name and the phone&apos;s hardware address cannot be read by a web page). You are on{" "}
            <b data-testid="my-ip">{status.myIp ?? "an unknown address"}</b>
            {status.mySite ? `, which is ${c.sites.find((s) => s.id === status.mySite)?.name ?? "a site"}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {c.sites.map((s, i) => {
            const ref = status.refusals.find((r) => r.siteId === s.id);
            return (
              <div key={s.id || i} className="space-y-3 rounded-lg border p-3" data-testid="site">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Site name</Label>
                    <Input value={s.name} onChange={(e) => setSite(i, { name: e.target.value })} className="w-56" aria-label="Site name" />
                  </div>
                  {s.id && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/attendance/poster?site=${s.id}`} target="_blank" rel="noreferrer">
                          <PrinterIcon /> Print the QR poster
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Make a new QR code for ${s.name}? Posters printed before stop working; print the new one.`)) return;
                          const r = await rotatePosterAction(s.id);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success("New code made. Print the poster again.");
                          router.refresh();
                        }}
                      >
                        <RefreshCwIcon /> New code
                      </Button>
                      <span className="text-xs text-muted-foreground">Code from {fmtDateTime(s.posterAt)}</span>
                    </>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label="Remove site"
                    onClick={() => (setC({ ...c, sites: c.sites.filter((_, j) => j !== i) }), setNets(nets.filter((_, j) => j !== i)))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`nets-${i}`}>
                      Office internet addresses (one per line: an address, a range like 196.188.10.0/24, or a dynamic DNS name)
                    </Label>
                    <Textarea id={`nets-${i}`} rows={3} value={nets[i] ?? ""} onChange={(e) => setNets(nets.map((n, j) => (j === i ? e.target.value : n)))} className="font-mono text-xs" />
                    {status.myIp && !(nets[i] ?? "").includes(status.myIp) && (
                      <Button size="sm" variant="outline" onClick={() => setNets(nets.map((n, j) => (j === i ? `${n.trim()}${n.trim() ? "\n" : ""}${status.myIp}` : n)))}>
                        <WifiIcon /> Use this network ({status.myIp})
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">A check-in counts when any of these holds</p>
                    {(
                      [
                        ["network", "On the office network (recommended)"],
                        ["location", "Within the site's radius (when the person allows location)"],
                        ["device", "On the person's own registered phone"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={s.checks[k]} onCheckedChange={(v) => setSite(i, { checks: { ...s.checks, [k]: v === true } })} /> {label}
                      </label>
                    ))}
                    {s.checks.location && (
                      <div className="flex flex-wrap gap-2">
                        <Input value={s.lat ?? ""} onChange={(e) => setSite(i, { lat: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Latitude" className="w-28" aria-label="Site latitude" />
                        <Input value={s.lng ?? ""} onChange={(e) => setSite(i, { lng: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Longitude" className="w-28" aria-label="Site longitude" />
                        <Input type="number" value={s.radiusM} onChange={(e) => setSite(i, { radiusM: num(e.target.value) })} className="w-20" aria-label="Site radius in metres" />
                        <Button size="sm" variant="outline" onClick={() => here(i)}>
                          <MapPinIcon /> Here
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {ref && (
                  <p className="text-xs text-[var(--st-paused-fg)]">
                    {ref.count} check-ins refused here in the last 7 days (last from {ref.lastIp ?? "an unknown address"}, {fmtDateTime(ref.lastAt)}). If the office address changed, add the new one.
                  </p>
                )}
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => (setC({ ...c, sites: [...c.sites, blankSite()] }), setNets([...nets, status.myIp ?? ""]))}>
            <PlusIcon /> Add a site
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phones, timing and kiosks</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="A phone becomes a person's own" hint="At the first check-in from it, or only when HR approves it (its check-ins wait for HR until then).">
            <div className="flex gap-4 text-sm">
              {(
                [
                  ["auto", "At the first check-in"],
                  ["hr", "When HR approves"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" name="dev-register" checked={c.devices.register === v} onChange={() => setC({ ...c, devices: { ...c.devices, register: v } })} /> {label}
                </label>
              ))}
            </div>
          </Row>
          <Row label="One phone, two people" hint="A phone used for two people within this many minutes is flagged for HR.">
            <Input type="number" min={1} value={c.devices.shareMinutes} onChange={(e) => setC({ ...c, devices: { ...c.devices, shareMinutes: num(e.target.value) } })} className="w-24" aria-label="Shared phone minutes" />
          </Row>
          <Row label="Usual hours" hint="Minutes before a shift starts and after it ends when QR and network check-ins are normal; outside, they are flagged for HR.">
            <div className="flex gap-2">
              <Input type="number" min={0} value={c.window.beforeMin} onChange={(e) => setC({ ...c, window: { ...c.window, beforeMin: num(e.target.value) } })} className="w-24" aria-label="Minutes before the shift" />
              <Input type="number" min={0} value={c.window.afterMin} onChange={(e) => setC({ ...c, window: { ...c.window, afterMin: num(e.target.value) } })} className="w-24" aria-label="Minutes after the shift" />
            </div>
          </Row>
          <Row label="Kiosk alert" hint="Minutes without a signal from a kiosk, during working hours, before leads and HR are told.">
            <Input type="number" min={5} value={a.kioskSilenceMin} onChange={(e) => setA({ ...a, kioskSilenceMin: num(e.target.value) })} className="w-24" aria-label="Kiosk silence minutes" />
          </Row>
          <Row label="Offline check-ins" hint="Hours a kiosk may keep check-ins while the network is down.">
            <Input type="number" min={1} value={a.offlineMaxHours} onChange={(e) => setA({ ...a, offlineMaxHours: num(e.target.value) })} className="w-24" aria-label="Offline hours" />
          </Row>
        </CardContent>
      </Card>
      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button onClick={save} disabled={busy} className="shadow-lg">
          <SaveIcon /> Save capture settings
        </Button>
      </div>
    </div>
  );
}
