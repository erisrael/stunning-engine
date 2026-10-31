import { redirect } from "next/navigation";

// Claims and pay is a tab of Profile; its own tab (claims, purchases, payslips, approve) carries over.
export default async function PayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/profile?tab=pay${tab && /^[a-z]+$/.test(tab) ? `&pay=${tab}` : ""}`);
}
