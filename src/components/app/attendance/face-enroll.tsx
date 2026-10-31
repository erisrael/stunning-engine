"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, ScanFaceIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteFaceAction, enrollFaceAction } from "@/app/actions/attendance";
import { FACE_CONSENT_TEXT, FACE_CONSENT_VERSION } from "@/lib/attendance";
import { loadFaceApi, readFace } from "./face";

const PROMPTS = ["Look straight at the camera", "Turn your head a little to the left", "A little to the right", "Chin up a little", "Straight again"];

// HR enrols a person's face with them present: written consent first, then five captures. Only face codes are sent.
export function FaceEnroll({ employeeId, name, enrolled }: { employeeId: string; name: string; enrolled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [codes, setCodes] = React.useState<number[][]>([]);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const video = React.useRef<HTMLVideoElement>(null);
  const stream = React.useRef<MediaStream | null>(null);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  React.useEffect(() => () => stopCamera(), []);

  const capture = async () => {
    setBusy(true);
    try {
      const f = await loadFaceApi();
      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        video.current!.srcObject = stream.current;
        await video.current!.play();
      }
      const got: number[][] = [];
      for (const prompt of PROMPTS) {
        setMsg(prompt);
        let r = null;
        for (let tries = 0; tries < 40 && !r; tries++) {
          await new Promise((res) => setTimeout(res, 120));
          const x = await readFace(f, video.current!).catch(() => null);
          if (x && x.size > 0.15 && x.eyes > 0.24) r = x;
        }
        if (!r) throw new Error("No clear single face was found. Use good light, one face in view, and try again.");
        got.push(r.code);
        setCodes([...got]);
        await new Promise((res) => setTimeout(res, 500));
      }
      setMsg("Done. Save to finish.");
    } catch (err) {
      setMsg("");
      toast.error(err instanceof Error ? err.message : "The camera is not available.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const r = await enrollFaceAction(employeeId, { codes, consent, consentNote: note || null });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${name} can now check in with their face`);
    stopCamera();
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      {enrolled ? (
        <span className="flex items-center gap-1">
          On
          <Button
            size="xs"
            variant="ghost"
            onClick={async () => {
              if (!window.confirm(`Delete ${name}'s face data?`)) return;
              const r = await deleteFaceAction(employeeId, "hr");
              if (!r.ok) return void toast.error(r.error);
              toast.success("Deleted");
              router.refresh();
            }}
          >
            Delete
          </Button>
        </span>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => (setOpen(true), setCodes([]), setConsent(false), setMsg(""))}>
          <ScanFaceIcon /> Set up
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) stopCamera();
          setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Face check-in for {name}</DialogTitle>
            <DialogDescription>With {name} here in person. Only face codes are saved, encrypted; no photo is kept or sent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="rounded-md bg-muted p-3 text-sm">{FACE_CONSENT_TEXT}</p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>
                {name} read this and signed the consent form (version {FACE_CONSENT_VERSION}) today, of their own free choice.
              </span>
            </label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where the signed form is kept (optional)" aria-label="Where the signed form is kept" />
            <video ref={video} muted playsInline className="aspect-[4/3] w-full -scale-x-100 rounded-lg bg-black object-cover" aria-label="Camera" />
            <p className="text-sm font-medium" role="status" aria-live="polite">
              {msg || (consent ? "Press Take captures and follow the prompts." : "Record the consent first.")} {codes.length > 0 && `(${codes.length} of ${PROMPTS.length})`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!consent || busy} onClick={capture}>
              {busy && <Loader2Icon className="animate-spin" />} Take captures
            </Button>
            <Button disabled={!consent || codes.length < PROMPTS.length || busy} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
