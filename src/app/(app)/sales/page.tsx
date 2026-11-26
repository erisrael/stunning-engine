import { WorkPage } from "@/components/app/work-page";

export const metadata = { title: "Sales & Outreach" };

export default function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="sales" searchParams={searchParams} />;
}
