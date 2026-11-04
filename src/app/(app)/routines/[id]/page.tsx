import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getRoutine, routinesConfig } from "@/server/routines";
import { WorkflowError } from "@/server/workflow";
import { PageHeader } from "@/components/app/primitives";
import { RoutineEditor } from "./routine-editor";

export const metadata = { title: "Routine" };

export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const routine = await getRoutine(viewer, id).catch((e) => {
    if (e instanceof WorkflowError) return null;
    throw e;
  });
  if (!routine) notFound();
  const cfg = await routinesConfig();
  return (
    <div className="space-y-4">
      <PageHeader title={routine.name} description={routine.mine ? "Change its steps, fill its form from a file, or delete it." : `Shared by ${routine.ownerName}. Make your own copy to change it.`} />
      <RoutineEditor routine={routine} sharing={cfg.sharing} imports={cfg.imports} maxRows={cfg.maxImportRows} maxSteps={cfg.maxSteps} approval={cfg.approval} />
    </div>
  );
}
