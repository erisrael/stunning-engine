import { WorkPage } from "@/components/app/work-page";
import { DEPT_VIEW_LABELS, type DeptView } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }) {
  return { title: `Operations: ${DEPT_VIEW_LABELS[(await params).view as DeptView] ?? "View"}` };
}

// One view of Operations (/operations/board, /operations/list, ...).
export default async function OperationsViewPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="operations" view={(await params).view} searchParams={searchParams} />;
}
