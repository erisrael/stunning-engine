// How each production team works, set in Settings, Teams. Shared by the server and the client.
import { PREV_STAGE, STAGE_LABELS, type AttemptStatus, type Stage } from "./domain";

export type TeamRules = {
  // What the team lead sees on Assign: only work the previous team finished and handed over, or every planned part.
  intake: "handed_over" | "all";
  // What the lead may hand over: only work the lead approved, or anything the team marked done.
  handoverFrom: "approved" | "done";
  // Members send finished work to the lead to approve; off, sending it makes it ready for handover at once.
  leadReview: boolean;
  // Most parts one person may have started and not marked done (0: no limit).
  wipLimit: number;
  // Days the team has once work arrives (sets the stage due date when none is set; 0: none).
  targetDays: number;
  // The team's own procedure, shown to its members on Home and in Help. One step per line.
  guide: string;
};

export const DEFAULT_TEAM_RULES: Record<Stage, TeamRules> = {
  recording: {
    intake: "all",
    handoverFrom: "approved",
    leadReview: true,
    wipLimit: 0,
    targetDays: 0,
    guide: [
      "The Recording lead adds the parts to record (New item, or the curriculum import) and assigns them on Assign work, with a date and a checklist per person.",
      "Open Home: your parts are under To do. Press Start when the session begins; the timer runs while you record.",
      "Log each camera code and the raw footage link on the card, and the raw length in minutes.",
      "Tick the checklist: presenter and script, audio, framing and light, files copied to shared storage.",
      "Press Mark done. It waits under Done, not sent, so you can still fix it.",
      "Send to lead, one at a time or all together at the end of the day.",
      "The lead approves it (Ready for handover) or returns it with a note; returned work comes back to To do with the note on the card.",
      "The lead hands over approved parts to Editing as one batch. Parts still in progress, or not recorded, never go over.",
    ].join("\n"),
  },
  editing: {
    intake: "handed_over",
    handoverFrom: "approved",
    leadReview: true,
    wipLimit: 0,
    targetDays: 3,
    guide: [
      "Work arrives as a handover from Recording. The Editing lead checks each part: Accept, or Missing with a note (it goes back to Recording).",
      "The lead assigns accepted parts on Home (Incoming) or on Assign work. Assign only lists parts Recording finished and handed over.",
      "Open Home: Start the part, cut it against the script, clean the audio, add titles and graphics.",
      "Add the edited master link, captions and thumbnail, and the final length.",
      "Tick the checklist, then Mark done and Send to lead.",
      "The lead reviews the master: Approve (Ready for handover) or Return with what to change.",
      "The lead hands over approved parts to Uploading.",
    ].join("\n"),
  },
  uploading: {
    intake: "handed_over",
    handoverFrom: "approved",
    leadReview: true,
    wipLimit: 0,
    targetDays: 2,
    guide: [
      "Work arrives as a handover from Editing. The Uploading lead accepts each part or marks it missing with a note.",
      "The lead assigns accepted parts. Assign only lists parts Editing finished and handed over.",
      "Start the part and upload the approved master to each required destination.",
      "Record the video ID or link per destination, wait for processing, then check playback and metadata.",
      "Tick the checklist, Mark done and Send to lead.",
      "The lead approves and hands over to Publication.",
    ].join("\n"),
  },
  publication: {
    intake: "handed_over",
    handoverFrom: "approved",
    leadReview: true,
    wipLimit: 0,
    targetDays: 2,
    guide: [
      "Work arrives as a handover from Uploading. The Publication lead accepts each part or marks it missing.",
      "Review educational accuracy, placement, thumbnail and public title: Approve or Request changes.",
      "Schedule the release, or publish now.",
      "Confirm each destination live with its link. The part is Published when every required destination is live.",
    ].join("\n"),
  },
};

export function teamRules(all: Partial<Record<Stage, Partial<TeamRules>>> | undefined, stage: Stage): TeamRules {
  return { ...DEFAULT_TEAM_RULES[stage], ...(all?.[stage] ?? {}) };
}

// Statuses the lead may hand over from, under the team's rules.
export function handoverStatuses(rules: TeamRules): AttemptStatus[] {
  return rules.handoverFrom === "approved" ? ["ready"] : ["finished", "lead_review", "ready"];
}

export function intakeHint(stage: Stage) {
  const prev = PREV_STAGE[stage];
  return prev ? `Only parts ${STAGE_LABELS[prev]} finished and handed over` : "Every planned part";
}
