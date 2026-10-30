import { datasetRows, isDataset, toCsv, userForToken } from "@/server/feeds";

// Power BI, Excel and other tools read data here with an API key from Admin, Integrations:
//   /api/feeds/<dataset>?key=msk_...&format=csv   (or the header Authorization: Bearer msk_...)
export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!isDataset(dataset)) return Response.json({ error: "Unknown dataset." }, { status: 404 });
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const user = token ? await userForToken(token, dataset) : null;
  if (!user) return Response.json({ error: "The key is missing, revoked, or does not cover this dataset." }, { status: 401 });
  const rows = await datasetRows(user, dataset);
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (url.searchParams.get("format") === "csv")
    return new Response(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `inline; filename="${dataset}.csv"` } });
  return Response.json(rows, { headers });
}
