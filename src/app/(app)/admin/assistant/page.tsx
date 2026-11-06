import { requireCapability } from "@/server/auth";
import { assistantConfig, assistantStats } from "@/server/assistant";
import { PageHeader } from "@/components/app/primitives";
import { ROLES, ROLE_LABELS } from "@/lib/domain";
import { FLOWS } from "@/lib/assistant";
import { AssistantAdmin } from "./assistant-admin";
import { AiAdmin } from "./ai-admin";
import { RolesAdmin } from "./roles-admin";
import { allRoleOptions } from "@/server/assistant";
import { routinesConfig } from "@/server/routines";
import { OPS } from "@/server/assistant-ops";
import { AI_MODELS, aiConfig, aiUsage, listAiModels } from "@/server/assistant-ai";

export const metadata = { title: "Assistant" };

// Admin, Assistant (Phase 13): which flows are on for which roles, extra keywords, short answers; and how the
// assistant is used: flows started and finished, where people give up, what matched nothing.
export default async function AssistantAdminPage() {
  const viewer = await requireCapability("users.manage");
  const [cfg, stats, ai, usage, roleOpts, rc, savedModels] = await Promise.all([
    assistantConfig(),
    assistantStats(viewer),
    aiConfig(),
    aiUsage(viewer),
    allRoleOptions(),
    routinesConfig(),
    listAiModels(viewer),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Assistant" description="The guide in the corner of every page, by typing or by voice. It follows written flows; with AI answers on, Claude also answers questions from each person's own data and prepares actions they confirm." />
      <AiAdmin config={ai} usage={usage} models={AI_MODELS.map((m) => ({ id: m.id, label: m.label, provider: m.provider }))} roles={ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} savedModels={savedModels} />
      <RolesAdmin roles={ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} ops={OPS.map((o) => ({ key: o.key, label: o.label, group: o.group }))} options={roleOpts} routines={rc} />
      <AssistantAdmin config={cfg} stats={stats} flows={FLOWS.map((f) => ({ key: f.key, title: f.title, keywords: f.keywords }))} roles={ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} />
    </div>
  );
}
