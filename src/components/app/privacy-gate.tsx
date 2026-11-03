"use client";

// The privacy notice (Phase 16.5): shown before anything else until the person accepts this version of it.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptPrivacyAction } from "@/app/actions/privacy";

export function PrivacyGate({ notice, version, updatedAt }: { notice: string; version: number; updatedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  if (done) return null;
  const accept = async () => {
    setBusy(true);
    const r = await acceptPrivacyAction(version);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setDone(true);
    router.refresh();
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Privacy notice" data-privacy-gate>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <ShieldCheckIcon className="size-5 text-[#1A73E8]" />
          <div>
            <p className="font-semibold">How we look after your information</p>
            <p className="text-xs text-muted-foreground">
              Version {version}
              {updatedAt ? `, ${new Date(updatedAt).toLocaleDateString()}` : ""}. Please read it before you go on.
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm whitespace-pre-wrap">{notice}</div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <a href="/api/me/data" className="text-xs text-primary hover:underline">
            Download the data the app keeps about me
          </a>
          <Button disabled={busy} onClick={accept}>
            {busy && <Loader2Icon className="animate-spin" />} I have read it and accept
          </Button>
        </div>
      </div>
    </div>
  );
}
