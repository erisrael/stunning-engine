"use client";

import * as React from "react";
import { toast } from "sonner";
import { CopyIcon, DownloadIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProviderId } from "@/lib/signin-policy";

export const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
  </svg>
);

export const MicrosoftMark = () => (
  <svg viewBox="0 0 23 23" className="size-4" aria-hidden>
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

export function ProviderMark({ id }: { id: ProviderId }) {
  return id === "google" ? <GoogleMark /> : id === "microsoft" ? <MicrosoftMark /> : <KeyRoundIcon className="size-4" />;
}

// "Continue with Google / Microsoft / single sign-on" buttons on the sign-in and sign-up pages.
export function ProviderButtons({ providers, next, verb = "Continue" }: { providers: { id: ProviderId; name: string }[]; next?: string; verb?: string }) {
  if (!providers.length) return null;
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Button key={p.id} asChild variant="outline" className="h-11 w-full gap-2 rounded-lg">
          <a href={`/api/auth/oauth/${p.id}${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            <ProviderMark id={p.id} /> {verb} with {p.name}
          </a>
        </Button>
      ))}
    </div>
  );
}

export function OrLine() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}

// Recovery codes, shown once: copy or save them before leaving.
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Keep these <b>recovery codes</b> somewhere safe (printed, or in a password manager). Each one works once, if you lose your phone. They are not shown again.
      </p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}>
          <CopyIcon /> Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`Recovery codes (each works once)\n\n${text}\n`], { type: "text/plain" }));
            a.download = "recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <DownloadIcon /> Save as a file
        </Button>
      </div>
    </div>
  );
}
