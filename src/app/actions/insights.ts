"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { stageInsights, teamInsights } from "@/server/team-insights";
import { askAnalysis } from "@/server/assistant-ai";

// The team analyzer's AI write-up: the analysis the app worked out, explained and with what to do next.
export async function analyzeTeamAction(dept: string, question?: string | null, weeks?: number) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      const data = dept.startsWith("stage:") ? await stageInsights(viewer, dept.slice(6), { weeks }) : await teamInsights(viewer, dept, { weeks });
      const text = await askAnalysis(viewer, {
        task: `You are helping the lead of the ${data.title} team read how their team works. Write a short analysis for the lead: what goes well, where work gets stuck and why, who needs help or has room, and the three most useful things to do this week (naming tasks by code). Plain words, short paragraphs and "- " bullets, no tables.`,
        data,
        question,
      });
      return { text };
    },
    { revalidate: false },
  );
}
