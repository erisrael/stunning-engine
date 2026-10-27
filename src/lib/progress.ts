import { STAGES, type SimpleStatus, type Stage } from "@/lib/domain";

// Done / In process / Missing / - for one stage of an item, as on the Overview.
export function progressOf(row: { lifecycle: string; stage: Stage | null }, st: Stage): SimpleStatus {
  if (row.lifecycle === "published") return "done";
  if (row.lifecycle !== "in_production" || !row.stage) return st === "recording" ? "missing" : "none";
  const i = STAGES.indexOf(row.stage);
  const j = STAGES.indexOf(st);
  return j < i ? "done" : j === i ? "in_process" : "none";
}
