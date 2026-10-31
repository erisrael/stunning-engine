"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2Icon, UploadCloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result<T> = { ok: boolean; data?: T; error?: string; code?: string };
export async function googleApi<T>(body: Record<string, unknown>): Promise<Result<T>> {
  return fetch("/api/google", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
}
export const connectUrl = (purpose: "meet" | "youtube") => `/api/google/connect?for=${purpose}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`;

// Profile: the person's Google account, for Meet links and YouTube uploads.
export function GoogleAccount({ initial }: { initial: { email: string | null; scopes: string[] } | null }) {
  const [conn, setConn] = React.useState(initial);
  const has = (s: string) => !!conn?.scopes.some((x) => x.includes(s));
  return (
    <div className="space-y-3 text-sm">
      {conn ? (
        <p>
          Connected as <span className="font-medium">{conn.email ?? "your Google account"}</span>. {has("calendar") ? "Meet links: on." : "Meet links: off."} {has("youtube") ? "YouTube uploads: on." : "YouTube uploads: off."}
        </p>
      ) : (
        <p className="text-muted-foreground">Not connected.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!has("calendar") && (
          <Button size="sm" variant="outline" onClick={() => (window.location.href = connectUrl("meet"))}>
            Connect for Meet links
          </Button>
        )}
        {!has("youtube") && (
          <Button size="sm" variant="outline" onClick={() => (window.location.href = connectUrl("youtube"))}>
            Connect for YouTube uploads
          </Button>
        )}
        {conn && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const r = await googleApi({ op: "disconnect" });
              if (!r.ok) return void toast.error(r.error);
              setConn(null);
              toast.success("Disconnected");
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}

// Uploading: send the master file straight from this computer to YouTube; the video ID fills itself in.
export function YoutubeUpload({ title, description, onDone, disabled }: { title: string; description: string; onDone: (videoId: string) => void; disabled?: boolean }) {
  const [pct, setPct] = React.useState<number | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setPct(0);
    const r = await googleApi<{ uploadUrl: string }>({ op: "youtube", title, description, size: file.size, mime: file.type });
    if (!r.ok) {
      setPct(null);
      if (r.code === "NOT_CONNECTED") {
        toast.message(r.error ?? "Connect your Google account first.", { action: { label: "Connect", onClick: () => (window.location.href = connectUrl("youtube")) } });
        return;
      }
      return void toast.error(r.error);
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", r.data!.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/*");
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setPct(null);
      try {
        const id = (JSON.parse(xhr.responseText) as { id?: string }).id;
        if (xhr.status >= 200 && xhr.status < 300 && id) {
          toast.success("Uploaded to YouTube");
          onDone(id);
        } else toast.error(`YouTube did not take the file (${xhr.status}).`);
      } catch {
        toast.error("YouTube did not take the file.");
      }
    };
    xhr.onerror = () => {
      setPct(null);
      toast.error("The upload stopped. Check the connection and try again.");
    };
    xhr.send(file);
  };
  return (
    <>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      <Button size="sm" variant="outline" type="button" disabled={disabled || pct !== null} onClick={() => input.current?.click()}>
        {pct !== null ? <Loader2Icon className="animate-spin" /> : <UploadCloudIcon />} {pct !== null ? `Uploading ${pct}%` : "Upload to YouTube"}
      </Button>
    </>
  );
}
