import { cookies } from "next/headers";
import { get } from "@/server/db";
import { audit } from "@/server/workflow";
import { appOrigin, createResetToken, googleEmail } from "@/server/password-reset";

// Google sends the person back here. When the Google address matches an active account, they choose a new password.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await appOrigin();
  const jar = await cookies();
  const state = jar.get("myseed_oauth_state")?.value;
  jar.delete("myseed_oauth_state");
  if (!state || state !== url.searchParams.get("state") || !url.searchParams.get("code")) return Response.redirect(`${origin}/login/forgot?error=google-failed`, 302);
  const email = await googleEmail(url.searchParams.get("code")!).catch(() => null);
  if (!email) return Response.redirect(`${origin}/login/forgot?error=google-failed`, 302);
  const u = await get<{ id: string; name: string; active: number }>("SELECT id, name, active FROM users WHERE lower(email) = ?", email);
  if (!u?.active) return Response.redirect(`${origin}/login/forgot?error=no-account`, 302);
  const token = await createResetToken(u.id, "google");
  await audit({ actor: null }, { action: "user.password_reset", summary: `${u.name} proved their account with Google to reset the password` });
  return Response.redirect(`${origin}/login/reset?token=${token}`, 302);
}
