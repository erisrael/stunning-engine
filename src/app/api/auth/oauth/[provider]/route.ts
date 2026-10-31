import { getViewer } from "@/server/auth";
import { appOrigin } from "@/server/password-reset";
import { isProvider, startProviderAuth } from "@/server/oidc";

// Starts "Sign in with Google / Microsoft / single sign-on", or linking one to the signed-in account (?mode=link).
export async function GET(request: Request, ctx: RouteContext<"/api/auth/oauth/[provider]">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const origin = await appOrigin();
  const mode = url.searchParams.get("mode") === "link" ? "link" : "signin";
  const next = url.searchParams.get("next") ?? "/dashboard";
  const back = mode === "link" ? "/profile" : "/login";
  if (!isProvider(provider)) return Response.redirect(`${origin}${back}?error=${encodeURIComponent("Unknown way of signing in.")}`, 302);
  if (mode === "link" && !(await getViewer())) return Response.redirect(`${origin}/login`, 302);
  try {
    return Response.redirect(await startProviderAuth(provider, mode, next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"), 302);
  } catch (e) {
    return Response.redirect(`${origin}${back}?error=${encodeURIComponent(e instanceof Error ? e.message : "Try again.")}`, 302);
  }
}
