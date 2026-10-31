import { WorkPage } from "@/components/app/work-page";
import { DEPT_VIEW_LABELS, type DeptView } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }) {
  return { title: `Dev team: ${DEPT_VIEW_LABELS[(await params).view as DeptView] ?? "View"}` };
}

// One view of the Dev team (/dev/board, /dev/list, ...).
export default async function DevViewPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  return <WorkPage dept="dev" view={(await params).view} searchParams={searchParams} />;
}
