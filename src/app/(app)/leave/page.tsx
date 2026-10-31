import { redirect } from "next/navigation";

// Leave is a tab of Profile; the month carries over.
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(`/profile?tab=leave${month && /^\d{4}-\d{2}$/.test(month) ? `&month=${month}` : ""}`);
}
