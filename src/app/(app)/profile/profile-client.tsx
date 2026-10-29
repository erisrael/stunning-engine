"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changePasswordAction } from "@/app/actions/auth";
import { myChatKeysAction, saveChatKeysAction } from "@/app/actions/chat";
import { rememberWrap, rewrapForPassword } from "@/lib/e2e";
import { savePrefsAction } from "@/app/actions/admin";

export function PasswordForm({ force }: { force: boolean }) {
  const router = useRouter();
  const [f, setF] = React.useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.next !== f.confirm) return toast.error("The new passwords do not match.");
        setBusy(true);
        const r = await changePasswordAction({ current: f.current, next: f.next });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        // Secure chat keys protected by the old password are re-protected with the new one (same keys).
        const keys = await myChatKeysAction();
        if (keys.ok && keys.data?.privateEnc && keys.data.publicKey && keys.data.kdf === "login") {
          try {
            const next = await rewrapForPassword(keys.data.privateEnc, keys.data.email, f.current, f.next);
            const saved = await saveChatKeysAction({ publicKey: keys.data.publicKey, privateEnc: next.privateEnc, kdf: "login", rewrap: true });
            if (saved.ok) await rememberWrap(keys.data.email, next.wrap);
          } catch {
            toast.warning("Secure chat keys could not be re-protected. Open Chat to set them up again.");
          }
        }
        toast.success("Password changed. Other sessions were signed out.");
        setF({ current: "", next: "", confirm: "" });
        if (force) router.push("/dashboard");
        router.refresh();
      }}
    >
      <div className="space-y-1.5"><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /><p className="text-xs text-muted-foreground">At least 10 characters with letters and numbers.</p></div>
      <div className="space-y-1.5"><Label htmlFor="pw-conf">Confirm new password</Label><Input id="pw-conf" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
      <Button type="submit" disabled={busy || !f.current || !f.next}>Change password</Button>
    </form>
  );
}

export function PrefsForm({ density, landing }: { density: string; landing: string }) {
  const router = useRouter();
  const [d, setD] = React.useState(density);
  const [l, setL] = React.useState(landing);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Table density</Label>
        <Select value={d} onValueChange={setD}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Open after sign-in</Label>
        <Select value={l} onValueChange={setL}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="/dashboard">Dashboard</SelectItem>
            <SelectItem value="/sheet">Sheet view</SelectItem>
            <SelectItem value="/pipeline">Pipeline</SelectItem>
            <SelectItem value="/content">All content</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="outline"
        onClick={async () => {
          const r = await savePrefsAction({ density: d as "compact", defaultLanding: l });
          if (!r.ok) return toast.error(r.error);
          toast.success("Preferences saved");
          router.refresh();
        }}
      >
        Save preferences
      </Button>
    </div>
  );
}
