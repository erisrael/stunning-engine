import { redirect } from "next/navigation";

// The team's overview is Production, Overview (each team sees its own team's column; Admin sets who sees which).
export default function TeamOverviewPage() {
  redirect("/overview");
}
