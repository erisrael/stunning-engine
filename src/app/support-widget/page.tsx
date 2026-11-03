import { SupportWidget } from "./widget";

// The customer's side of customer support, opened by the SDK (public/support-sdk.js) in a frame inside the app, or
// by a mobile app in a web view: /support-widget?key=<app key>&id=&name=&email=&phone=&hash=. The SDK can also send
// who the customer is by postMessage, so it stays out of the address.
export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="h-dvh bg-background">
      <SupportWidget appKey={sp.key ?? ""} initialUser={sp.id || sp.name || sp.email ? { id: sp.id ?? null, name: sp.name ?? null, email: sp.email ?? null, phone: sp.phone ?? null, hash: sp.hash ?? null } : null} waitForParent={sp.embed === "1"} />
    </div>
  );
}
