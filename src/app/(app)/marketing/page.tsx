import { WorkPage } from "@/components/app/work-page";

export const metadata = { title: "Marketing" };

export default function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="marketing" searchParams={searchParams} />;
}
