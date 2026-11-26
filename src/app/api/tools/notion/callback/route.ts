import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { checkNotionState, finishNotionOAuth } from "@/server/tools-notion";

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.previewBy) redirect("/login");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code || !checkNotionState(state, viewer.id)) redirect("/tools?notion=failed");
  let ok = true;
  try {
    await finishNotionOAuth(viewer, code, `${await appOrigin()}/api/tools/notion/callback`);
  } catch {
    ok = false;
  }
  redirect(ok ? "/tools?notion=connected" : "/tools?notion=failed");
}
