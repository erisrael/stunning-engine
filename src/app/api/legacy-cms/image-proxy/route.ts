import { NextRequest, NextResponse } from "next/server";
import { getLegacyCmsConfigForUser, authenticateFilament, requireCmsCategories } from "@/server/legacy-cms";
import { requireViewer } from "@/server/auth";

export async function GET(request: NextRequest) {
  let viewer;
  try {
    viewer = await requireViewer();
    await requireCmsCategories(viewer, ["invoices"]);
  } catch {
    return new NextResponse("Receipt access denied", { status: 403 });
  }
  try {
    const target = request.nextUrl.searchParams.get("url");
    if (!target) return new NextResponse("Missing receipt URL", { status: 400 });
    const config = await getLegacyCmsConfigForUser(viewer);
    const base = new URL(config.baseUrl);
    const url = new URL(target, base);
    if (url.origin !== base.origin || url.username || url.password || !["https:", "http:"].includes(url.protocol)) {
      return new NextResponse("Receipt must belong to the configured CMS", { status: 400 });
    }
    // The account's shared Noor session (a new sign-in would end the one everyone else is using).
    const { cmsSession } = await import("@/server/cms-session");
    let cookie = config.username && config.password ? await cmsSession(config, authenticateFilament) : config.sessionCookie || "";
    let current = url;
    let response: Response | undefined;
    let renewed = false;
    for (let i = 0; i < 5; i++) {
      response = await fetch(current, { headers: { Cookie: cookie, Accept: "image/*,application/pdf" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current);
      // Sent to Noor's login page: the shared session expired; renew it once and ask for the slip again.
      if (current.pathname.includes("/login") && !renewed && config.username && config.password) {
        renewed = true;
        cookie = await cmsSession(config, authenticateFilament, true);
        current = url;
        continue;
      }
      if (current.origin !== base.origin || current.pathname.includes("/login")) return new NextResponse("CMS receipt session expired or redirected outside the CMS", { status: 502 });
    }
    if (!response?.ok) return new NextResponse(`Noor could not provide this receipt (HTTP ${response?.status ?? "unavailable"}). Open the invoice in Noor or ask its administrator to check receipt access.`, { status: 502 });
    const contentType = response.headers.get("content-type")?.split(";")[0] || "";
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(contentType) && contentType !== "application/pdf") return new NextResponse("The CMS returned a page instead of a receipt", { status: 502 });
    return new NextResponse(response.body, { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
  } catch {
    return new NextResponse("Unable to load receipt from CMS", { status: 502 });
  }
}
