import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { canPresenters, listPresenters, presenterConfig, statements } from "@/server/presenters";
import { PageHeader } from "@/components/app/primitives";
import { PresentersClient } from "./presenters-client";

export const metadata = { title: "Presenters" };

// Presenters, releases and fees (Phase 16.1). Parts: Presenters (default) and Fees, as links under Presenters in
// the sidebar.
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  const viewer = await requireViewer();
  const manage = canPresenters(viewer);
  const finance = can(viewer, "finance.access");
  if (!manage && !finance) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const tab = sp.tab === "fees" || !manage ? "fees" : "people";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  return (
    <div className="space-y-4">
      <PageHeader title="Presenters" description="Teachers and guests on camera: their signed releases (consent to be filmed and for the videos to be used), and their fees." />
      <PresentersClient
        tab={tab}
        month={month}
        manage={manage}
        finance={finance}
        presenters={manage ? await listPresenters(viewer) : []}
        config={await presenterConfig()}
        statements={tab === "fees" ? await statements(viewer, month) : []}
      />
    </div>
  );
}
