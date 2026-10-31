"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ScanLineIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decideFlagsAction, leadCheckinAction, setDeviceAction } from "@/app/actions/attendance-capture";
import { ACTION_LABELS, SOURCE_LABELS, type EventKind } from "@/lib/attendance";
import type { DeviceRow, FlagRow } from "@/server/attendance-capture";
import { fmtDateTime } from "@/lib/format";

// HR: check-ins flagged when they were made (outside the usual hours, a new or shared phone, recorded by a lead).
export function FlaggedPanel({ rows, tz }: { rows: FlagRow[]; tz: string }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  if (!rows.length) return null;
  const decide = async (ids: string[], accept: boolean) => {
    const note = accept ? null : window.prompt("Why is it not accepted? The person is told.") || null;
    const r = await decideFlagsAction(ids, accept, note);
    if (!r.ok) return void toast.error(r.error);
    toast.success(accept ? "Accepted" : "Not accepted; the person was told");
    setPicked(new Set());
    router.refresh();
  };
  const ids = [...picked];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-ins to review ({rows.length})</CardTitle>
        <CardDescription>Accepted ones count as they are. Ones not accepted are removed from the day, and the person can ask for a correction.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {ids.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(ids, true)}>
              <CheckIcon /> Accept {ids.length}
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide(ids, false)}>
              <XIcon /> Do not accept
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8" />
                <th className="py-1 font-medium">Person</th>
                <th className="font-medium">What</th>
                <th className="font-medium">When</th>
                <th className="font-medium">How</th>
                <th className="font-medium">Why it is here</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" data-testid="flag-row">
                  <td>
                    <Checkbox
                      checked={picked.has(r.id)}
                      onCheckedChange={(v) => setPicked((p) => (v === true ? new Set([...p, r.id]) : new Set([...p].filter((x) => x !== r.id))))}
                      aria-label={`Pick ${r.name}`}
                    />
                  </td>
                  <td className="py-1.5 font-medium">{r.name}</td>
                  <td>{ACTION_LABELS[r.kind]?.done ?? r.kind}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(r.at, tz)}</td>
                  <td className="text-muted-foreground">
                    {SOURCE_LABELS[r.source] ?? r.source}
                    {r.site ? `, ${r.site}` : ""}
                    {r.ip ? `, ${r.ip}` : ""}
                  </td>
                  <td>{r.flag}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => decide([r.id], true)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide([r.id], false)}>
                      Do not accept
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// HR: phones registered to people (pending ones wait for approval when Admin chose that).
export function DevicesPanel({ rows, tz }: { rows: DeviceRow[]; tz: string }) {
  const router = useRouter();
  if (!rows.length) return null;
  const set = async (r: DeviceRow, status: "active" | "blocked" | "removed") => {
    const res = await setDeviceAction(r.deviceId, r.employeeId, status);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phones</CardTitle>
        <CardDescription>The phones people check in from. Each is known only by a random number the app gave it.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Person</th>
              <th className="font-medium">Phone</th>
              <th className="font-medium">State</th>
              <th className="font-medium">First and last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.deviceId}:${r.employeeId}`} className="border-t">
                <td className="py-1.5 font-medium">{r.name}</td>
                <td className="font-mono text-xs">{r.deviceId.slice(0, 8)}</td>
                <td className={r.status === "pending" ? "text-[var(--st-paused-fg)]" : r.status === "blocked" ? "text-destructive" : ""}>
                  {r.status === "pending" ? "Waiting for HR" : r.status === "blocked" ? "Blocked" : "Approved"}
                </td>
                <td className="text-muted-foreground">
                  {fmtDateTime(r.firstAt, tz)} / {fmtDateTime(r.lastAt, tz)}
                </td>
                <td className="text-right whitespace-nowrap">
                  {r.status !== "active" && (
                    <Button size="sm" variant="ghost" onClick={() => set(r, "active")}>
                      Approve
                    </Button>
                  )}
                  {r.status !== "blocked" && (
                    <Button size="sm" variant="ghost" onClick={() => set(r, "blocked")}>
                      Block
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => set(r, "removed")}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// A team lead records a check-in for someone without a phone: pick them, or scan their badge with this phone.
export function LeadCheckin({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [who, setWho] = React.useState("");
  const [badge, setBadge] = React.useState("");
  const [kind, setKind] = React.useState<EventKind>("in");
  const [scanning, setScanning] = React.useState(false);
  const video = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | null = null;
    (async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!Ctor) {
        toast.error("This browser cannot scan. Type the badge code or pick the person.");
        return setScanning(false);
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        toast.error("The camera is not available. Type the badge code or pick the person.");
        return setScanning(false);
      }
      if (!video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const d = new Ctor({ formats: ["qr_code"] });
      while (!stop) {
        const found = await d.detect(video.current).catch(() => []);
        if (found[0]?.rawValue) {
          setBadge(found[0].rawValue);
          setWho("");
          setScanning(false);
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  const save = async () => {
    const r = await leadCheckinAction({ employeeId: who || null, badge: who ? null : badge || null, kind });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${r.data!.name}: ${ACTION_LABELS[kind].done}. HR will review it.`);
    setOpen(false);
    setWho("");
    setBadge("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ScanLineIcon /> Record a check-in
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setScanning(false))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record a check-in</DialogTitle>
            <DialogDescription>For someone without a working phone. It is labelled as recorded by you, and HR reviews it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lead-who">Person</Label>
              <select id="lead-who" value={who} onChange={(e) => (setWho(e.target.value), setBadge(""))} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                <option value="">{badge ? "From the badge" : "Choose..."}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="lead-badge">Or their badge</Label>
                <Input id="lead-badge" value={badge} onChange={(e) => (setBadge(e.target.value), setWho(""))} placeholder="Scan or type the badge code" />
              </div>
              <Button variant="outline" onClick={() => setScanning((s) => !s)}>
                <ScanLineIcon /> {scanning ? "Stop" : "Scan"}
              </Button>
            </div>
            {scanning && <video ref={video} className="aspect-video w-full rounded-lg bg-black" muted playsInline />}
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="What to record">
              {(["in", "break_start", "break_end", "lunch_start", "lunch_end", "out"] as EventKind[]).map((k) => (
                <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {ACTION_LABELS[k].button}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!who && !badge}>
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
