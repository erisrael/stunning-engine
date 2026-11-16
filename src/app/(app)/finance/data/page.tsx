import { DepartmentRecordsPage } from "@/components/app/department-records-page";
export const metadata = { title: "FINANCE Data Manager" };
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DepartmentRecordsPage scope="finance" searchParams={searchParams} />;
}
