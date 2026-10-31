import { WorkPage } from "@/components/app/work-page";
import { DEPT_VIEW_LABELS, type DeptView } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }) {
  return { title: `Marketing: ${DEPT_VIEW_LABELS[(await params).view as DeptView] ?? "View"}` };
}

// One view of the Marketing (/marketing/board, /marketing/list, ...).
export default async function MarketingViewPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="marketing" view={(await params).view} searchParams={searchParams} />;
}
