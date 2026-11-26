import { headers } from "next/headers";
import { verifyDocument } from "@/server/corr/signing";
import { clientIpFrom } from "@/server/client-ip";
import { VerifyView } from "../verify-view";

export const metadata = { title: "Verify a letter", robots: { index: false } };

// Opened from the QR code on a letter.
export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).slice(0, 80);
  const h = await headers();
  return <VerifyView r={await verifyDocument(code, { ip: clientIpFrom(h), ua: h.get("user-agent") })} query={code} />;
}
