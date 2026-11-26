import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { notionOAuthConfigured, notionState } from "@/server/tools-notion";

// "Connect with Notion": sends the person to Notion's own consent screen (Tools, Connections).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || viewer.previewBy) redirect("/login");
  if (!notionOAuthConfigured()) redirect("/tools?notion=not-configured");
  const u = new URL("https://api.notion.com/v1/oauth/authorize");
  u.searchParams.set("client_id", process.env.NOTION_OAUTH_CLIENT_ID!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("owner", "user");
  u.searchParams.set("redirect_uri", `${await appOrigin()}/api/tools/notion/callback`);
  u.searchParams.set("state", notionState(viewer.id));
  redirect(u.toString());
}
