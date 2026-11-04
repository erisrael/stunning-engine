import { getViewer } from "@/server/auth";
import { routineTemplate, STEPS_TEMPLATE } from "@/server/routines";
import { WorkflowError } from "@/server/workflow";

const csv = (body: string, name: string) =>
  new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

// A routine's form template (one column per field it asks for). "steps" as the id gives the blank routine template.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  if (id === "steps") return csv(STEPS_TEMPLATE, "routine-template.csv");
  try {
    const t = await routineTemplate(viewer, id);
    return csv(t.csv, `${t.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "routine"}-form-template.csv`);
  } catch (e) {
    if (e instanceof WorkflowError) return new Response(e.message, { status: 400 });
    throw e;
  }
}
