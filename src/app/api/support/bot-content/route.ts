import { getViewer } from "@/server/auth";
import { BOT_FILE_MAX, saveContent } from "@/server/bot-manager";

// A lead uploads a file to a bot's content library: the raw file in the body; bot, title, caption and name in the query.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in required" }, { status: 401 });
  const u = new URL(request.url);
  if (Number(request.headers.get("content-length") ?? 0) > BOT_FILE_MAX) return Response.json({ error: "The file is larger than 20 MB." }, { status: 400 });
  const data = Buffer.from(await request.arrayBuffer());
  try {
    const r = await saveContent(viewer, u.searchParams.get("bot") ?? "", {
      title: u.searchParams.get("title") ?? "",
      caption: u.searchParams.get("caption"),
      file: { name: u.searchParams.get("name") ?? "file", mime: request.headers.get("content-type") ?? "application/octet-stream", data },
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
