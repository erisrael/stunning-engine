import { headers } from "next/headers";
import { verifyDocument } from "@/server/corr/signing";
import { clientIpFrom } from "@/server/client-ip";
import { VerifyView } from "./verify-view";

export const metadata = { title: "Verify a letter", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const h = await headers();
  const r = q ? await verifyDocument(q, { ip: clientIpFrom(h), ua: h.get("user-agent") }) : null;
  return <VerifyView r={r} query={q} />;
}
