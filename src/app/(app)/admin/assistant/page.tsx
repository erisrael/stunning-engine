import { requireCapability } from "@/server/auth";
import { assistantConfig, assistantStats } from "@/server/assistant";
import { PageHeader } from "@/components/app/primitives";
import { ROLES, ROLE_LABELS } from "@/lib/domain";
import { FLOWS } from "@/lib/assistant";
import { AssistantAdmin } from "./assistant-admin";

export const metadata = { title: "Assistant" };

// Admin, Assistant (Phase 13): which flows are on for which roles, extra keywords, short answers; and how the
// assistant is used: flows started and finished, where people give up, what matched nothing.
export default async function AssistantAdminPage() {
  const viewer = await requireCapability("users.manage");
  const [cfg, stats] = await Promise.all([assistantConfig(), assistantStats(viewer)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Assistant" description="The guide in the corner of every page. It follows written flows (no AI, nothing sent outside); here you choose them per role and see how they are used." />
      <AssistantAdmin config={cfg} stats={stats} flows={FLOWS.map((f) => ({ key: f.key, title: f.title, keywords: f.keywords }))} roles={ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} />
    </div>
  );
}
