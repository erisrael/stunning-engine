import { WorkPage } from "@/components/app/work-page";

export const metadata = { title: "Dev team" };

export default function DevPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="dev" searchParams={searchParams} />;
}
