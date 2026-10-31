import { redirect } from "next/navigation";

// My record is a tab of Profile.
export default function MePage() {
  redirect("/profile?tab=record");
}
