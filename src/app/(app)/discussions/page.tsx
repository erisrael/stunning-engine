import { redirect } from "next/navigation";

// Discussions became chat groups.
export default function DiscussionsPage() {
  redirect("/chat");
}
