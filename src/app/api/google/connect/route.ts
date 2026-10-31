import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { authUrl, type GooglePurpose } from "@/server/google";

// Connect your own Google account: ?for=meet|youtube&back=/path. Google asks for consent, then returns to the callback.
export async function GET(request: Request) {
  const viewer = await getViewer();
  const origin = await appOrigin();
  if (!viewer) return Response.redirect(`${origin}/login`, 302);
  const url = new URL(request.url);
  const purpose: GooglePurpose = url.searchParams.get("for") === "youtube" ? "youtube" : "meet";
  const back = (url.searchParams.get("back") ?? "/profile").startsWith("/") ? (url.searchParams.get("back") ?? "/profile") : "/profile";
  const state = crypto.randomBytes(16).toString("hex");
  (await cookies()).set("myseed_google_connect", JSON.stringify({ state, back, user: viewer.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1", path: "/", maxAge: 600 });
  try {
    return Response.redirect(await authUrl(purpose, state), 302);
  } catch {
    return Response.redirect(`${origin}${back}${back.includes("?") ? "&" : "?"}google=off`, 302);
  }
}
