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
  const requested = new URL(request.url).searchParams.get("format");
  const format = requested === "csv" ? "csv" : requested === "json" ? "json" : "xlsx";
  const name = `myseed-${key.replace(/_/g, "-")}-template.${format}`;
  if (format === "json") {
    // Same columns as the spreadsheet templates, as an array of example rows.
    await loadLookups();
    const rows = t.examples().map((e) => Object.fromEntries(t.fields.map((f) => [f.key, e[f.key] ?? ""])));
    return new Response(JSON.stringify(rows, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` },
    });
  }
  if (format === "csv")
    return new Response(templateCsv(t.key), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    });
  const buf = await templateXlsx(t.key);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
