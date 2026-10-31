import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { finishProviderAuth, isProvider } from "@/server/oidc";
import { linkIdentity, logSignIn, providerSignIn } from "@/server/signin";

// The provider sends the person back here with a code; it becomes a sign-in, an account request, or a link.
export async function GET(request: Request, ctx: RouteContext<"/api/auth/oauth/[provider]/callback">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const origin = await appOrigin();
  const to = (path: string, key: string, msg: string) => Response.redirect(`${origin}${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`, 302);
  if (!isProvider(provider)) return to("/login", "error", "Unknown way of signing in.");
  let claims;
  try {
    claims = await finishProviderAuth(provider, url);
  } catch (e) {
    await logSignIn({ event: "provider_refused", method: provider, detail: e instanceof Error ? e.message : "failed" });
    return to("/login", "error", e instanceof Error ? e.message : "Signing in did not work. Try again.");
  }
  if (claims.mode === "link") {
    const viewer = await getViewer();
    if (!viewer || viewer.previewBy) return Response.redirect(`${origin}/login`, 302);
    try {
      await linkIdentity(viewer, provider, claims.subject, claims.email);
      return to("/profile", "linked", provider);
    } catch (e) {
      return to("/profile", "error", e instanceof Error ? e.message : "Linking did not work.");
    }
  }
  const r = await providerSignIn(provider, claims, claims.next);
  if (!r.ok) return to("/login", "error", r.error);
  if ("requested" in r) return to("/login", "notice", "requested");
  return Response.redirect(`${origin}${r.next}`, 302);
}
