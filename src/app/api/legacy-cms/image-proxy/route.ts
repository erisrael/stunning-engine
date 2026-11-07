import { NextRequest, NextResponse } from "next/server";
import { getLegacyCmsConfig, authenticateFilament } from "@/server/legacy-cms";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new NextResponse("Missing url parameter", { status: 400 });
    }

    const config = await getLegacyCmsConfig();
    const baseUrl = config.baseUrl.replace(/\/+$/, "");

    // Normalize full target URL
    let fullUrl = targetUrl;
    if (targetUrl.startsWith("/")) {
      fullUrl = `${baseUrl}${targetUrl}`;
    } else if (!targetUrl.startsWith("http")) {
      fullUrl = `${baseUrl}/${targetUrl}`;
    }

    // Prepare auth headers
    let cookieHeader = config.sessionCookie || "";
    if (!cookieHeader && config.username && config.password) {
      try {
        cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
      } catch (err) {
        console.warn("[image-proxy] Auth error:", err);
      }
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "image/*,application/pdf,*/*",
    };
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const upstreamRes = await fetch(fullUrl, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      return new NextResponse(`Upstream returned HTTP ${upstreamRes.status}`, { status: upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await upstreamRes.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Failed to fetch image: ${err?.message || err}`, { status: 500 });
  }
}

