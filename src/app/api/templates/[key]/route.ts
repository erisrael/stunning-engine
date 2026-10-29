import { getViewer } from "@/server/auth";
import { loadLookups, TEMPLATES, templateList, type TemplateKey } from "@/server/importer";
import { templateCsv, templateXlsx } from "@/server/templates";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const { key } = await params;
  const t = TEMPLATES[key as TemplateKey];
  if (!t) return new Response("Unknown template", { status: 404 });
  if (!templateList(viewer).some((x) => x.key === t.key)) return new Response("You do not have permission for this template", { status: 403 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("format");
  const format = requested === "csv" ? "csv" : requested === "json" ? "json" : "xlsx";
  // Templates with a pre-fill come with current data ready to edit: a team's waiting parts, or today's curriculum.
  const prefill = t.prefill && url.searchParams.get("prefill") === "1" ? await t.prefill.rows(viewer) : undefined;
  const name = `myseed-${key.replace(/_/g, "-")}-${prefill ? (t.stage ? "my-parts" : "current") : "template"}.${format}`;
  if (format === "json") {
    // Same columns as the spreadsheet templates, as an array of example rows.
    await loadLookups();
    const rows = (prefill ?? t.examples()).map((e) => Object.fromEntries(t.fields.map((f) => [f.key, e[f.key] ?? ""])));
    return new Response(JSON.stringify(rows, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` },
    });
  }
  if (format === "csv")
    return new Response(templateCsv(t.key, prefill), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    });
  const buf = await templateXlsx(t.key, prefill);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
