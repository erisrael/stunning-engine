import { requireViewer } from "@/server/auth";
import { resourceView } from "@/server/resources";
import { PageImport } from "@/components/app/page-import";
import { ResourceCenter } from "./resource-center";
export const metadata = { title: "Finance requests & equipment" };
export default async function Page() {
  const user = await requireViewer();
  return (
    <ResourceCenter
      data={await resourceView(user)}
      viewerId={user.id}
      viewer={user}
      importAction={<PageImport viewer={user} page="resources" label="Import" />}
    />
  );
}
