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
  if (checklists.length)
    sections.push({
      title: "Checklists",
      text: `${list(checklists.map((x) => x.label))} ${checklists.length === 1 ? "has" : "have"} a checklist. A ${t} cannot be finished with lines unticked; some lines are checked by a lead as well.`,
    });
  if (c.features.review)
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
