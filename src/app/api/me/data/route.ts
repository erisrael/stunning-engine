import { getViewer } from "@/server/auth";
import { myData } from "@/server/privacy";

// Download my data (Phase 16.5): everything the app keeps about the person signed in, as one JSON file.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const data = await myData(viewer);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
