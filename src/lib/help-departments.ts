// Help chapters written from each department's own configuration, so a department made from a template (or one
// whose statuses, types and fields were changed) is explained in its own words.
import type { Chapter } from "./help";
import type { DeptConfig } from "./dept-config";

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function departmentChapter(key: string, c: DeptConfig): Chapter {
  const t = c.names.task.toLowerCase();
  const ts = c.names.tasks.toLowerCase();
  const p = c.names.project.toLowerCase();
  const statuses = c.statuses.filter((s) => s.active);
  const types = c.types.filter((x) => x.active);
  const required = c.fields.filter((f) => f.active && f.requiredFrom);
  const checklists = types.filter((x) => x.checklist.length);
  const sections: Chapter["sections"] = [
    {
      title: `How ${ts} move`,
      text: `${c.names.tasks} go through ${list(statuses.map((s) => s.label))}.${statuses.some((s) => s.restricted) ? ` Only heads and leads move ${ts} out of ${list(statuses.filter((s) => s.restricted).map((s) => s.label))}.` : ""}${
        statuses.some((s) => s.limit) ? ` Some columns have a limit: ${list(statuses.filter((s) => s.limit).map((s) => `${s.label} (${s.limit})`))}.` : ""
      }`,
    },
    {
      title: `Adding a ${t}`,
      steps: [
        `Open ${c.title} and press New ${t}, or type a title straight into a board column.`,
        types.length ? `Choose the type: ${list(types.map((x) => x.label))}.` : `Give it a clear title.`,
        `Set the ${p}, the person, the due date and an estimate.`,
        ...(required.length ? [`Fill in what is required: ${list(required.map((f) => f.label))}.`] : []),
      ],
    },
  ];
  if (c.flow?.on) sections.push(...flowSections(c));
  if (checklists.length)
    sections.push({
      title: "Checklists",
      text: `${list(checklists.map((x) => x.label))} ${checklists.length === 1 ? "has" : "have"} a checklist. A ${t} cannot be finished with lines unticked; some lines are checked by a lead as well.`,
    });
  if (c.features.review && !c.flow?.on)
    sections.push({ title: "Review", text: `Before a ${t} is done, a reviewer approves it or sends it back with a note. Choose the reviewer when you move it to review.` });
  if (c.features.timeTracking) sections.push({ title: "Time", text: `Start the timer on a ${t} while you work on it, or add time by hand. Your hours feed the Team view and reports.` });
  if (c.features.requests)
    sections.push({ title: "Requests", text: `Other departments ask ${c.title} for work from Requests${c.intake.intro ? `: ${c.intake.intro}` : ""}. A head or lead accepts it into a ${t} or declines it with a reason.` });
  if (c.kpis.some((k) => k.active)) sections.push({ title: "Numbers", text: `${c.title} tracks ${list(c.kpis.filter((k) => k.active).map((k) => k.label))}, against targets per ${p}.` });
  sections.push({ title: "Views", text: `Dashboard, List, Board, Sheet, Timeline, Overview, Team and Report are at the top of ${c.title}. Save a view to come back to the same filters.` });
  return {
    key: `dept-${key}`,
    title: `${c.title}: how it works`,
    audiences: ["department", "manager", "owner"],
    summary: c.description || `${c.names.projects}, ${ts} and how they move in ${c.title}.`,
    sections,
  };
}

// The department's own flow (Configure, Flow), stage by stage, as members and leads meet it on Home.
function flowSections(c: DeptConfig): Chapter["sections"] {
  const t = c.names.task.toLowerCase();
  const label = (k: string | null) => (k ? (c.statuses.find((s) => s.key === k)?.label ?? k) : "");
  const order: typeof c.flow.stages = [];
  for (let cur: (typeof c.flow.stages)[number] | undefined = c.flow.stages[0]; cur && !order.includes(cur); cur = c.flow.stages.find((s) => s.status === cur!.next)) order.push(cur);
  for (const s of c.flow.stages) if (!order.includes(s)) order.push(s);
  const line = (s: (typeof order)[number]) => {
    const name = label(s.status);
    const then = s.next ? ` Then it goes to ${label(s.next)}.` : s.kind === "final" ? "" : " Then it is finished.";
    const dept = s.nextDept ? " It is also handed to another department as a request." : "";
    const target = s.days ? ` Target: ${s.days} day${s.days === 1 ? "" : "s"}.` : "";
    switch (s.kind) {
      case "intake":
        return `${name}: new work, bugs and requests land here. A lead sets the priority${c.features.sprints ? ", the sprint" : ""} and the person, and plans it.${then}${dept}`;
      case "work":
        return `${name}: the person it is assigned to starts it, fills in the card${s.needChecklist ? " (every checklist line ticked)" : ""}, marks it done and sends it${s.review ? " to the lead, who approves it or returns it with a note" : ""}.${s.wip ? ` At most ${s.wip} in progress per person.` : ""}${s.accept ? " Work arriving here is accepted by the lead first." : ""}${then}${dept}${target}`;
      case "check":
        return `${name}: ${s.checkers === "people" ? "the people named for it" : "a head or lead"} ${s.accept ? "accept what arrives, then " : ""}pass it on or return it${s.returnAsBug ? " as a bug, with steps to reproduce" : " with what to change"}.${s.autoOnMerge ? " A merged pull request naming the task passes it by itself." : ""}${then}${dept}${target}`;
      case "release":
        return `${name}: a lead groups what is ready into a release, writes the release notes and releases it.${then}`;
      default:
        return `${name}: finished.`;
    }
  };
  return [
    {
      title: "The flow",
      text: `${c.names.tasks} go through ${list(order.map((s) => label(s.status)))}. Only finished work moves on: a ${t} reaches the next stage through Done, Send, Approve or Pass, never half done. Members see their own work as a board on Home (To do, In progress, Done not sent, With the lead); leads see a desk with what to approve, hand over, accept and assign.`,
    },
    { title: "Stage by stage", steps: order.map(line) },
  ];
}
