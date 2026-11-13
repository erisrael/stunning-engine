import { getViewer } from "@/server/auth";
import * as sd from "@/server/support-desk";
import { TICKET_FILE_MAX } from "@/server/support-help";

// An agent sends a file or voice note on a ticket: the raw file in the body, its name and type in the query.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in required" }, { status: 401 });
  const u = new URL(request.url);
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > TICKET_FILE_MAX) return Response.json({ error: "The file is larger than 10 MB." }, { status: 400 });
  try {
    const r = await sd.agentUpload(viewer, u.searchParams.get("ticket") ?? "", { name: u.searchParams.get("name") ?? "file", mime: request.headers.get("content-type") ?? "application/octet-stream", data: data.toString("base64") });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
