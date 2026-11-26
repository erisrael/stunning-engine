import { WorkPage } from "@/components/app/work-page";
import { DEPT_VIEW_LABELS, type DeptView } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }) {
  return { title: `Sales & Outreach: ${DEPT_VIEW_LABELS[(await params).view as DeptView] ?? "View"}` };
}

// One view of Sales & Outreach (/sales/board, /sales/list, ...).
export default async function SalesViewPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="sales" view={(await params).view} searchParams={searchParams} />;
}
