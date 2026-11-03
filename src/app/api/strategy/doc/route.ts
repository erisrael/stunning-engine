import { getViewer } from "@/server/auth";
import { buildDoc, trackingWorkbook } from "@/server/strategy-docs";
import { DOC_KINDS, DOC_STYLES, type DocKind, type DocStyle } from "@/lib/strategy";

// Strategy documents as Word files, and the indicator tracking table as Excel:
// ?plan=<id>&kind=plan|meplan|report|kpis|evaluation|logframe|tracking&style=myseed|international&period=2026-Q1
// &evaluation=<id>&narrative=1 (the AI writes the report's narrative when it is on).
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const q = new URL(request.url).searchParams;
  const plan = q.get("plan") ?? "";
  const kind = q.get("kind") ?? "plan";
  try {
    const out =
      kind === "tracking"
        ? await trackingWorkbook(viewer, plan)
        : await buildDoc(viewer, {
            planId: plan,
            kind: (kind in DOC_KINDS ? kind : "plan") as DocKind,
            style: ((q.get("style") ?? "myseed") in DOC_STYLES ? q.get("style") : "myseed") as DocStyle,
            period: q.get("period"),
            evaluationId: q.get("evaluation"),
            narrative: q.get("narrative") === "1",
          });
    const type = kind === "tracking" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return new Response(new Uint8Array(out.buffer), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${encodeURIComponent(out.file)}"; filename*=UTF-8''${encodeURIComponent(out.file)}`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
