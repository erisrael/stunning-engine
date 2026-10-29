import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireCapability } from "@/server/auth";
import { getHandover } from "@/server/editorial";
import { getSettings } from "@/server/settings";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { STAGE_LABELS } from "@/lib/domain";
import { HandoverDetail } from "./detail-client";

export const metadata = { title: "Handover" };

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireCapability("nav.handovers");
  const { id } = await params;
  // Handovers the person is not involved in look the same as ones that do not exist.
  const data = await getHandover(viewer, id).catch(() => null);
  if (!data) notFound();
  const h = data.handover;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Handover"
        title={`${h.code}: ${STAGE_LABELS[h.from_stage]} to ${STAGE_LABELS[h.to_stage]}`}
        description={data.canReceive ? "Check each item against what you actually received. Accept what arrived; mark anything missing with a note, and it goes back to the sender and their lead." : undefined}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/handovers">
              <ArrowLeftIcon /> Handovers
            </Link>
          </Button>
        }
      />
      <HandoverDetail data={data} viewerId={viewer.id} tz={(await getSettings()).workspace.timezone} />
    </div>
  );
}
