import { WorkPage } from "@/components/app/work-page";

export const metadata = { title: "Operations" };

export default function OperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="operations" searchParams={searchParams} />;
}
