import { getViewer } from "@/server/auth";
import { IMPORT_MAX, importKb } from "@/server/kb-guides";

// Knowledge base import (support leads): the raw file in the body; its name, preview=1 for a dry run, and
// publish=1 or 0 to override the file's own published flags, in the query.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > IMPORT_MAX) return Response.json({ error: "The file is larger than 5 MB." }, { status: 400 });
  const u = new URL(request.url);
  const pub = u.searchParams.get("publish");
  try {
    const data = Buffer.from(await request.arrayBuffer());
    return Response.json(await importKb(viewer, { name: u.searchParams.get("name") ?? "file", data }, { preview: u.searchParams.get("preview") === "1", publish: pub === "1" ? true : pub === "0" ? false : null }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
