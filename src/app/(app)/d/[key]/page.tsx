import { notFound } from "next/navigation";
import { customDepartment } from "@/server/departments";
import { WorkPage } from "@/components/app/work-page";

// Departments created in Admin (Support, Sales, ...) share the Dev and Marketing engine.
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const d = await customDepartment((await params).key);
  return { title: d?.title ?? "Department" };
}

export default async function CustomDeptPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params;
  if (!(await customDepartment(key))) notFound();
  return <WorkPage dept={key} searchParams={searchParams} />;
}
