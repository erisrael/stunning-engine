import { notFound } from "next/navigation";
import { customDepartment } from "@/server/departments";
import { WorkPage } from "@/components/app/work-page";
import { DEPT_VIEW_LABELS, type DeptView } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ key: string; view: string }> }) {
  const { key, view } = await params;
  const d = await customDepartment(key);
  return { title: `${d?.title ?? "Department"}: ${DEPT_VIEW_LABELS[view as DeptView] ?? "View"}` };
}

// One view of a department created in Admin (/d/sales/board, ...).
export default async function CustomDeptViewPage({ params, searchParams }: { params: Promise<{ key: string; view: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key, view } = await params;
  if (!(await customDepartment(key))) notFound();
  return <WorkPage dept={key} view={view} searchParams={searchParams} />;
}
