import crypto from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin, googleConfig } from "@/server/password-reset";

// Starts "Reset with Google": Google asks the person to choose their account, then returns to the callback.
export async function GET() {
  const g = await googleConfig();
  if (!g) return Response.redirect(`${await appOrigin()}/login/forgot?error=google-off`, 302);
  const state = crypto.randomBytes(16).toString("hex");
  (await cookies()).set("myseed_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: g.clientId, redirect_uri: `${await appOrigin()}/api/auth/google/callback`, response_type: "code", scope: "openid email", state, prompt: "select_account" }).toString();
  return Response.redirect(url.toString(), 302);
}
