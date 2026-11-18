import { redirect } from "next/navigation";

// The breadcrumb's "Admin" step: the catalogue of Noor's admin pages lives in Legacy CMS.
export default function NoorAdminIndex() {
  redirect("/legacy-cms?view=admin");
}
