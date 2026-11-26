import { redirect } from "next/navigation";
import { corrPage } from "@/server/corr/page";
import { listRules, listWorkflows } from "@/server/corr/workflow";
import { orgChart, ACTION_LABELS } from "@/server/corr/org";
import { listCategories } from "@/server/corr/setup";
import { listTemplates } from "@/server/corr/templates";
import { roleCatalog } from "@/server/role-catalog";
import { userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { WorkflowsClient } from "./workflows-client";

export const metadata = { title: "Workflows and rules" };

export default async function WorkflowsPage() {
  const { viewer, rights } = await corrPage();
  if (!rights.workflow && !rights.admin) redirect("/correspondence");
  const [wfs, rules, chart, cats, roles, people, templates] = await Promise.all([listWorkflows(), listRules(), orgChart(), listCategories({ includeInactive: true }), roleCatalog(), userDirectory(), listTemplates(viewer, { publishedOnly: true })]);
  return (
    <div className="space-y-4">
      <PageHeader title="Workflows and rules" description="Who reviews, approves, signs and stamps each kind of letter, in what order, and the rules that add steps (for example by amount or recipient)." />
      <CorrNav active="workflows" rights={rights} />
      <WorkflowsClient
        workflows={wfs}
        rules={rules}
        positions={chart.positions.filter((p) => p.current).map((p) => ({ id: p.id, title: p.title }))}
        roles={roles.map((r) => ({ key: r.key, label: r.label }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        categories={cats.map((c) => ({ id: c.id, code: c.code, name: c.name, workflowId: c.config.workflowId ?? null, templateId: c.config.templateId ?? null, raw: c }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        actions={Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label }))}
        canEditCategories={rights.admin}
      />
    </div>
  );
}
