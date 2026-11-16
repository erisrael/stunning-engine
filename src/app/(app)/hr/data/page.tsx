import { DepartmentRecordsPage } from "@/components/app/department-records-page";
export const metadata = { title: "HR Data Manager" };
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DepartmentRecordsPage scope="hr" searchParams={searchParams} />;
}
