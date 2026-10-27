"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importTrackerAction } from "@/app/actions/imports";
import type { CurriculumImportSummary } from "@/server/workspace-data";

// Upload of the curriculum tracker JSON (the Recording team's file, or one exported from here).
export function TrackerImport() {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CurriculumImportSummary | null>(null);
  return (
    <div className="space-y-2">
      <Input ref={ref} type="file" accept=".json,application/json" />
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          const file = ref.current?.files?.[0];
          if (!file) return toast.error("Choose the tracker JSON first.");
          const fd = new FormData();
          fd.set("file", file);
          setBusy(true);
          const r = await importTrackerAction(fd);
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          setResult(r.data as CurriculumImportSummary);
          toast.success("Tracker imported");
          router.refresh();
        }}
      >
        <UploadIcon /> {busy ? "Importing..." : "Import tracker JSON"}
      </Button>
      {result && (
        <p className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
          {result.units.created} new units, {result.parts.created} new parts, {result.items.created} new items, {result.recordings.created} camera codes logged, {result.recordedParts} parts moved to Editing.
          {result.warnings.length > 0 && ` ${result.warnings.length} warning(s).`}
        </p>
      )}
    </div>
  );
}
