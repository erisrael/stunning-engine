import { handleDeliveryReport } from "@/server/sms";

// SMS delivery reports: /api/integrations/sms/dlr?t=<token>. Providers post a form (Africa's Talking) or JSON.
async function body(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  const text = (await request.text()).slice(0, 100_000);
  if (type.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(request: Request) {
  const r = await handleDeliveryReport(new URL(request.url).searchParams.get("t"), await body(request));
  return Response.json(r, { status: r.status });
}

// Some providers send reports as GET with the fields in the address.
export async function GET(request: Request) {
  const u = new URL(request.url);
  const fields = Object.fromEntries(u.searchParams);
  delete fields.t;
  const r = await handleDeliveryReport(u.searchParams.get("t"), fields);
  return Response.json(r, { status: r.status });
}
