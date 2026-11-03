import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deckPage } from "@/server/deck-page";
import { seesCompanyDeck } from "@/server/decks";
import { myDepartments } from "@/server/departments";
import { Deck } from "@/components/app/deck/deck-client";

export const metadata = { title: "Company presentation" };

// The company deck (Phase 12c): production, departments, people and attendance, money, customer support and
// recognition, for owners' reviews and management meetings. Actions agreed become tasks in the chosen department.
export default async function CompanyPresentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!seesCompanyDeck(viewer)) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const pg = await deckPage(viewer, "company", sp.deck ?? null);
  const departments = (await myDepartments(viewer)).filter((d) => !d.readOnly).map((d) => ({ key: d.dept, title: d.title }));
  return <Deck scope="company" {...pg} departments={departments} back="/company" presenter={sp.presenter === "1"} />;
}
