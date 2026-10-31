import { cookies } from "next/headers";
import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { finishConnect } from "@/server/google";

// Google returns here after the person allowed (or refused) the connection.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await appOrigin();
  const jar = await cookies();
  const raw = jar.get("myseed_google_connect")?.value;
  jar.delete("myseed_google_connect");
  let st: { state?: string; back?: string; user?: string } = {};
  try {
    st = JSON.parse(raw ?? "{}");
  } catch {}
  const back = st.back?.startsWith("/") ? st.back : "/profile";
  const done = (r: string) => Response.redirect(`${origin}${back}${back.includes("?") ? "&" : "?"}google=${r}`, 302);
  const viewer = await getViewer();
  if (!viewer || !st.state || st.state !== url.searchParams.get("state") || st.user !== viewer.id) return done("failed");
  const code = url.searchParams.get("code");
  if (!code) return done("refused");
  try {
    await finishConnect(viewer, code);
    return done("connected");
  } catch {
    return done("failed");
  }
}
