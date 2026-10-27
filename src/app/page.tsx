import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? "/dashboard" : "/login");
}
