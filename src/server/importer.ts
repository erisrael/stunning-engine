import crypto from "node:crypto";
import { all, get, nowIso, run, tx, uid } from "./db";
import { getSettings } from "./settings";
import { hashPassword } from "./passwords";
import { can, canViewItem, isManager, scopeSql, type AppUser } from "./users";
import { notify } from "./notifications";
import {
  addAsset,
  assignStage,
  audit,
  recordStageCompletion,
  changeDeadline,
  createItem,
  syncItem,
  updateItemFields,
  WorkflowError,
  type Ctx,
} from "./workflow";
import { COMPLEXITIES, PRIORITIES, ROLES, STAGES, type Role, type Stage } from "@/lib/domain";
import { endOfLocalDayIso, localInputToIso } from "@/lib/format";

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export type FieldType = "string" | "int" | "number" | "date" | "datetime" | "enum" | "email" | "list" | "url" | "bool";

export type TemplateField = {
  key: string;
  label: string;
  required: boolean | "create" | "update";
  type: FieldType;
  description: string;
  options?: () => string[];
};

export type TemplateKey =
  | "progress"
  | "recording_progress"
  | "editing_progress"
  | "uploading_progress"
  | "publication_progress"
  | "curriculum"
  | "items"
  | "users"
  | "recording_sessions"
  | "historical";
export type ImportMode = "create" | "update" | "upsert";

export type TemplateDef = {
  key: TemplateKey;
  title: string;
  summary: string;
  managerOnly: boolean;
  // Templates open to stage roles; each row is still checked against the person's own stage.
  stageImport?: boolean;
  // One team's own progress template: every row is for this stage.
  stage?: Stage;
  // Team-specific column names mapped onto the shared progress columns (recorded_date -> done_date).
  aliases?: Record<string, string>;
  modes: ImportMode[];
  fields: TemplateField[];
  examples: () => Record<string, string>[];
  notes: string[];
};

// Allowed values are loaded once per import or template build so field checks stay synchronous.
const LK = { grades: [] as string[], subjects: [] as string[], deliverables: [] as string[], contents: [] as string[], languages: [] as string[], destinations: [] as string[], terms: [] as string[] };
export async function loadLookups() {
  const s = await getSettings();
  LK.grades = (await all<{ code: string }>("SELECT code FROM grades WHERE active = 1 ORDER BY sort")).map((r) => r.code);
  LK.subjects = (await all<{ code: string }>("SELECT code FROM subjects WHERE active = 1 ORDER BY sort")).map((r) => r.code);
  LK.deliverables = s.lists.deliverableTypes.map((d) => d.key);
  LK.contents = s.lists.contentTypes.map((d) => d.key);
  LK.languages = s.lists.languages.map((l) => l.code);
  LK.destinations = s.destinations.filter((d) => d.active).map((d) => d.key);
  LK.terms = s.lists.terms;
}
const gradeCodes = () => LK.grades;
const subjectCodes = () => LK.subjects;
const deliverableKeys = () => LK.deliverables;
const contentKeys = () => LK.contents;
const languageCodes = () => LK.languages;
const destinationKeys = () => LK.destinations;
const yesNo = () => ["yes", "no"];

// Per-team progress templates: the same rules as Stage progress, with only that team's columns and wording.
const STAGE_TEMPLATE_COPY: Record<Stage, { did: string; date: string; dateLabel: string; by: string; link?: { key: string; label: string; description: string }; summary: string }> = {
  recording: {
    did: "recorded",
    date: "recorded_date",
    dateLabel: "Date recorded",
    by: "recorded_by",
    summary: "Parts you have already recorded, with the date and camera codes. Done parts move on to Editing.",
  },
  editing: {
    did: "edited",
    date: "edited_date",
    dateLabel: "Date edited",
    by: "edited_by",
    link: { key: "master_link", label: "Edited master link", description: "Link to the final edited file (Drive, Dropbox, server path)." },
    summary: "Parts you have already edited, with the date and the master file link. Done parts move on to Uploading.",
  },
  uploading: {
    did: "uploaded",
    date: "uploaded_date",
    dateLabel: "Date uploaded",
    by: "uploaded_by",
    link: { key: "uploaded_link", label: "Uploaded link", description: "Link to the uploaded video. Marks the required destinations as uploaded." },
    summary: "Parts you have already uploaded, with the date and the uploaded link. Done parts move on to Publication.",
  },
  publication: {
    did: "published",
    date: "published_date",
    dateLabel: "Date published",
    by: "published_by",
    link: { key: "live_link", label: "Live link", description: "Public link where the lesson is live." },
    summary: "Parts you have already published, with the date and the live link. Done parts are marked Published.",
  },
};

function stageTemplate(stage: Stage): TemplateDef {
  const c = STAGE_TEMPLATE_COPY[stage];
  const label = stage[0].toUpperCase() + stage.slice(1);
  const evidence: TemplateField[] =
    stage === "recording"
      ? [
          { key: "camera_codes", label: "Camera codes", required: false, type: "string", description: "Camera file codes for this part. Separate several videos with ;." },
          { key: "video_title", label: "Video title", required: false, type: "string", description: "Title for the camera codes." },
        ]
      : [{ key: c.link!.key, label: c.link!.label, required: false, type: "url", description: c.link!.description }];
  const fields: TemplateField[] = [
    { key: "item_code", label: "Item code", required: false, type: "string", description: "Existing item code, for example MY-G05-MATH-U01-L01. Or use grade, subject, unit and part." },
    { key: "grade_code", label: "Grade code", required: false, type: "enum", options: gradeCodes, description: "For example G05." },
    { key: "subject_code", label: "Subject code", required: false, type: "enum", options: subjectCodes, description: "For example MATH." },
    { key: "unit_number", label: "Unit number", required: false, type: "int", description: "Unit number within the grade and subject." },
    { key: "part_number", label: "Part number", required: false, type: "int", description: "Part number within the unit." },
    { key: "part_title", label: "Part title (reference)", required: false, type: "string", description: "For your reference only. Not imported." },
    { key: "status", label: "Status", required: false, type: "enum", options: () => ["done", "in_process"], description: `done (already ${c.did}) or in_process. Blank means done.` },
    { key: c.date, label: c.dateLabel, required: false, type: "date", description: `YYYY-MM-DD, the day it was ${c.did}. Defaults to today for done rows.` },
    ...evidence,
    { key: c.by, label: `${label} by (email)`, required: false, type: "email", description: `Team member who ${c.did} it. Blank keeps the current owner.` },
    { key: "notes", label: "Notes", required: false, type: "string", description: "Saved on the stage." },
  ];
  const example = (unit: string, part: string, title: string, date: string): Record<string, string> => ({
    grade_code: "G05",
    subject_code: "MATH",
    unit_number: unit,
    part_number: part,
    part_title: title,
    status: "done",
    [c.date]: date,
    ...(c.link ? { [c.link.key]: `https://drive.example.com/${stage}/g05-math-u${unit}-p${part}.mp4` } : { camera_codes: "C0276; C0277", video_title: title }),
  });
  return {
    key: `${stage}_progress` as TemplateKey,
    title: `${label} progress`,
    summary: c.summary,
    managerOnly: false,
    stageImport: true,
    stage,
    aliases: { [c.date]: "done_date", [c.by]: "assign_to", ...(c.link ? { [c.link.key]: "link" } : {}) },
    modes: ["update"],
    notes: [
      `For the ${label} team. Every row is ${stage} progress, so there is no stage column.`,
      "Find the part by item_code, or by grade_code, subject_code, unit_number and part_number. Download My parts for a file that already lists the parts waiting for you.",
      `status done (or blank) marks it ${c.did} on ${c.date} and sends it to the next team. in_process only saves the evidence, notes or owner.`,
      `A part can only be ${c.did} after the stages before it are done. Rows for parts already past ${label} just correct the date.`,
      "Files can be CSV, Excel or JSON (an array of rows with these column names).",
    ],
    fields,
    examples: () => [example("1", "1", "Counting to 100", "2026-10-20"), example("1", "2", "Place value", "2026-10-21")],
  };
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  progress: {
    key: "progress",
    title: "Stage progress",
    summary: "Each team records the parts it has finished: recorded, edited, uploaded or published, with the date and evidence.",
    managerOnly: false,
    stageImport: true,
    modes: ["update"],
    notes: [
      "Find the part by item_code, or by grade_code, subject_code, unit_number and part_number.",
      "You can only record progress for your own stage (team leads and managers for any stage they run).",
      "status done finishes the stage on done_date and sends the part to the next team. status in_process only records evidence, notes or an assignee.",
      "A stage can only be done after the stages before it. Rows for parts already past that stage just correct the date.",
      "Recording rows can list camera codes (separate several with ;). Editing and uploading rows can give a file link; publication rows the live link.",
      "Files can be CSV, Excel or JSON (an array of rows with these column names).",
    ],
    fields: [
      { key: "item_code", label: "Item code", required: false, type: "string", description: "Existing item code, for example MY-G05-MATH-U01-L01. Or use the four columns below." },
      { key: "grade_code", label: "Grade code", required: false, type: "enum", options: gradeCodes, description: "For example G05." },
      { key: "subject_code", label: "Subject code", required: false, type: "enum", options: subjectCodes, description: "For example MATH." },
      { key: "unit_number", label: "Unit number", required: false, type: "int", description: "Unit number within the grade and subject." },
      { key: "part_number", label: "Part number", required: false, type: "int", description: "Part number within the unit." },
      { key: "stage", label: "Stage", required: true, type: "enum", options: () => [...STAGES], description: "recording, editing, uploading or publication." },
      { key: "status", label: "Status", required: true, type: "enum", options: () => ["done", "in_process"], description: "done or in_process." },
      { key: "done_date", label: "Date done", required: false, type: "date", description: "YYYY-MM-DD. Defaults to today for done rows." },
      { key: "camera_codes", label: "Camera codes", required: false, type: "string", description: "Recording only. Separate several videos with ;." },
      { key: "video_title", label: "Video title", required: false, type: "string", description: "Recording only. Title for the camera codes." },
      { key: "link", label: "File or live link", required: false, type: "url", description: "Editing: master link. Uploading: uploaded link. Publication: live link." },
      { key: "assign_to", label: "Assign to (email)", required: false, type: "email", description: "Team member to own this stage." },
      { key: "notes", label: "Notes", required: false, type: "string", description: "Saved on the stage." },
    ],
    examples: () => [
      { item_code: "", grade_code: "G05", subject_code: "MATH", unit_number: "1", part_number: "1", stage: "editing", status: "done", done_date: "2026-10-20", camera_codes: "", video_title: "", link: "https://drive.example.com/edited/g5-math-u1-p1.mp4", assign_to: "", notes: "Final cut approved" },
      { item_code: "", grade_code: "G07", subject_code: "MATH", unit_number: "1", part_number: "1", stage: "recording", status: "done", done_date: "2026-10-18", camera_codes: "C0276; C0277", video_title: "Basic concepts of sets", link: "", assign_to: "", notes: "" },
    ],
  },
  recording_progress: stageTemplate("recording"),
  editing_progress: stageTemplate("editing"),
  uploading_progress: stageTemplate("uploading"),
  publication_progress: stageTemplate("publication"),
  curriculum: {
    key: "curriculum",
    title: "Curriculum inventory",
    summary: "Planned units and lessons per grade and subject. Coverage reports compare production against this inventory.",
    managerOnly: true,
    modes: ["upsert"],
    notes: [
      "One row per lesson. Units are created automatically from the first row that mentions them.",
      "Existing lessons are matched by grade code, subject code, unit number and lesson number. Titles are never used for matching.",
      "This template never creates production items. Use the Production plan template for deliverables.",
    ],
    fields: [
      { key: "grade_code", label: "Grade code", required: true, type: "enum", options: gradeCodes, description: "Grade code from Settings > Taxonomy, for example G08." },
      { key: "subject_code", label: "Subject code", required: true, type: "enum", options: subjectCodes, description: "Subject code, for example MATH. The subject must be offered in that grade." },
      { key: "unit_number", label: "Unit number", required: true, type: "int", description: "Whole number, 1 or higher." },
      { key: "unit_title", label: "Unit title", required: true, type: "string", description: "Unit or chapter title in English." },
      { key: "unit_title_am", label: "Unit title (Amharic)", required: false, type: "string", description: "Optional Amharic title." },
      { key: "term", label: "Term", required: false, type: "enum", options: () => LK.terms, description: "Optional academic term." },
      { key: "lesson_number", label: "Lesson number", required: true, type: "int", description: "Lesson order within the unit." },
      { key: "lesson_title", label: "Lesson title", required: true, type: "string", description: "Lesson title in English." },
      { key: "lesson_title_am", label: "Lesson title (Amharic)", required: false, type: "string", description: "Optional Amharic title. Stored in full without truncation." },
      { key: "objectives", label: "Learning objectives", required: false, type: "string", description: "Objectives separated by semicolons." },
      { key: "language", label: "Language", required: false, type: "enum", options: languageCodes, description: "Delivery language code. Defaults to en." },
      { key: "planned_deliverables", label: "Planned deliverables", required: false, type: "int", description: "How many deliverables are expected for this lesson. Defaults to 1." },
    ],
    examples: () => [
      {
        grade_code: "G08",
        subject_code: "MATH",
        unit_number: "2",
        unit_title: "Linear equations",
        unit_title_am: "ቀጥተኛ እኩልታዎች",
        term: "Term 1",
        lesson_number: "4",
        lesson_title: "Solving equations with variables on both sides",
        lesson_title_am: "",
        objectives: "Collect like terms; Solve two-step equations; Check solutions",
        language: "en",
        planned_deliverables: "2",
      },
    ],
  },
  items: {
    key: "items",
    title: "Production plan",
    summary: "Create planned production items (deliverables) or update planning fields of existing items by item code.",
    managerOnly: true,
    modes: ["create", "update"],
    notes: [
      "Create mode adds new planned items. Rows whose item code already exists are skipped, so a retried file does not duplicate items.",
      "Update mode matches only by item_code (or item_id). It never matches by title.",
      "Imports cannot change workflow status, mark content published or overwrite completed-stage evidence.",
      "Changing due_date on an existing deadline requires change_reason. The original deadline is preserved.",
      "Owners are given by email address and must hold the matching role.",
      "also_in lists secondary curriculum placements such as G09-MATH or G09-MATH-U01, separated by semicolons.",
    ],
    fields: [
      { key: "item_code", label: "Item code", required: "update", type: "string", description: "Readable code such as MY-G08-MATH-U02-L04. Optional in create mode (generated when blank)." },
      { key: "item_id", label: "Item ID", required: false, type: "string", description: "Immutable system ID. Optional alternative to item_code in update mode." },
      { key: "grade_code", label: "Grade code", required: "create", type: "enum", options: gradeCodes, description: "Primary grade." },
      { key: "subject_code", label: "Subject code", required: "create", type: "enum", options: subjectCodes, description: "Primary subject." },
      { key: "unit_number", label: "Unit number", required: false, type: "int", description: "Unit in the curriculum inventory." },
      { key: "lesson_number", label: "Lesson number", required: false, type: "int", description: "Lesson in the unit. Created in the inventory when missing." },
      { key: "lesson_title", label: "Lesson title", required: false, type: "string", description: "Used only when the lesson does not exist yet." },
      { key: "deliverable_type", label: "Deliverable type", required: false, type: "enum", options: deliverableKeys, description: "Defaults to main_video." },
      { key: "title", label: "Title", required: "create", type: "string", description: "Deliverable title in English." },
      { key: "title_am", label: "Title (Amharic)", required: false, type: "string", description: "Optional Amharic title." },
      { key: "objectives", label: "Learning objectives", required: false, type: "string", description: "Separated by semicolons." },
      { key: "language", label: "Language", required: false, type: "enum", options: languageCodes, description: "Defaults to en." },
      { key: "content_type", label: "Content type", required: false, type: "enum", options: contentKeys, description: "Defaults to lesson_video." },
      { key: "teacher", label: "Teacher or presenter", required: false, type: "string", description: "Metadata only, not a user account." },
      { key: "target_duration_min", label: "Target duration (min)", required: false, type: "number", description: "Planned finished length in minutes." },
      { key: "complexity", label: "Complexity", required: false, type: "enum", options: () => [...COMPLEXITIES], description: "simple, standard or complex." },
      { key: "complexity_note", label: "Complexity justification", required: false, type: "string", description: "Short reason for the complexity band." },
      { key: "priority", label: "Priority", required: false, type: "enum", options: () => [...PRIORITIES], description: "low, normal, high or urgent." },
      { key: "planned_publish_date", label: "Planned publication date", required: false, type: "date", description: "YYYY-MM-DD in the workspace timezone." },
      { key: "due_date", label: "Due date", required: false, type: "date", description: "YYYY-MM-DD. Interpreted as end of day in the workspace timezone." },
      { key: "change_reason", label: "Change reason", required: false, type: "string", description: "Required in update mode when an existing due date changes." },
      { key: "recording_owner", label: "Recording owner email", required: false, type: "email", description: "Must hold the Recording role." },
      { key: "editing_owner", label: "Editing owner email", required: false, type: "email", description: "Must hold the Editing role." },
      { key: "uploading_owner", label: "Uploading owner email", required: false, type: "email", description: "Must hold the Uploading role." },
      { key: "publication_owner", label: "Publication owner email", required: false, type: "email", description: "Must hold the Publication role." },
      { key: "required_destinations", label: "Required destinations", required: false, type: "list", options: destinationKeys, description: "Semicolon list. Defaults to destinations marked required in Settings." },
      { key: "optional_destinations", label: "Optional destinations", required: false, type: "list", options: destinationKeys, description: "Semicolon list. Optional destinations never block Published." },
      { key: "also_in", label: "Also in (secondary placements)", required: false, type: "string", description: "Semicolon list such as G09-MATH or G09-MATH-U01." },
      { key: "tags", label: "Tags", required: false, type: "string", description: "Semicolon list." },
      { key: "release_now", label: "Release to production", required: false, type: "bool", options: yesNo, description: "yes releases the item into the Recording queue immediately. Defaults to no (draft)." },
    ],
    examples: () => [
      {
        item_code: "",
        item_id: "",
        grade_code: "G08",
        subject_code: "MATH",
        unit_number: "2",
        lesson_number: "4",
        lesson_title: "Solving equations with variables on both sides",
        deliverable_type: "main_video",
        title: "Solving equations with variables on both sides",
        title_am: "",
        objectives: "Collect like terms; Solve two-step equations",
        language: "en",
        content_type: "lesson_video",
        teacher: "Ato Tesfaye Mulugeta",
        target_duration_min: "18",
        complexity: "standard",
        complexity_note: "Board work with two worked examples",
        priority: "normal",
        planned_publish_date: "2026-11-20",
        due_date: "2026-11-18",
        change_reason: "",
        recording_owner: "",
        editing_owner: "",
        uploading_owner: "",
        publication_owner: "",
        required_destinations: "myseed_app",
        optional_destinations: "youtube",
        also_in: "G09-MATH",
        tags: "pilot; algebra",
        release_now: "no",
      },
    ],
  },
  users: {
    key: "users",
    title: "Users and access",
    summary: "Invite staff, assign the five roles, set grade and subject scope and weekly production capacity.",
    managerOnly: true,
    modes: ["upsert"],
    notes: [
      "Rows are matched by email. Existing users have their roles, scope and capacity replaced by the row values.",
      "New users receive a temporary password shown once in the job report. They must change it at first sign-in.",
      "Leave grade_scope and subject_scope blank for access to all content.",
      "capacity_hours accepts a single number (split across the user's stage roles) or stage:hours pairs such as editing:30;recording:6.",
    ],
    fields: [
      { key: "name", label: "Full name", required: true, type: "string", description: "Display name." },
      { key: "email", label: "Email", required: true, type: "email", description: "Sign-in email. Used to match existing users." },
      { key: "title", label: "Job title", required: false, type: "string", description: "Optional." },
      { key: "roles", label: "Roles", required: true, type: "list", options: () => [...ROLES], description: "Semicolon list of recording, editing, uploading, publication, manager." },
      { key: "grade_scope", label: "Grade scope", required: false, type: "list", options: gradeCodes, description: "Semicolon list of grade codes. Blank means all grades." },
      { key: "subject_scope", label: "Subject scope", required: false, type: "list", options: subjectCodes, description: "Semicolon list of subject codes. Blank means all subjects." },
      { key: "capacity_hours", label: "Production hours per week", required: false, type: "string", description: "Realistic production hours after meetings and other duties." },
      { key: "active", label: "Active", required: false, type: "bool", options: yesNo, description: "no deactivates the account without deleting history." },
    ],
    examples: () => [
      {
        name: "Tigist Alemayehu",
        email: "tigist.alemayehu@myseed.test",
        title: "Video editor",
        roles: "editing",
        grade_scope: "G09; G10",
        subject_scope: "",
        capacity_hours: "editing:30",
        active: "yes",
      },
    ],
  },
  recording_sessions: {
    key: "recording_sessions",
    title: "Recording schedule",
    summary: "Book presenter recording sessions against existing items.",
    managerOnly: false,
    modes: ["create"],
    notes: [
      "Rows are matched to items by item_code. Sessions for items outside your scope are rejected.",
      "Times are in the workspace timezone (YYYY-MM-DD HH:mm, 24-hour clock).",
      "A row identical to an existing session (same item and start time) is skipped.",
    ],
    fields: [
      { key: "item_code", label: "Item code", required: true, type: "string", description: "Existing item code." },
      { key: "scheduled_start", label: "Scheduled start", required: true, type: "datetime", description: "YYYY-MM-DD HH:mm in the workspace timezone." },
      { key: "duration_min", label: "Duration (min)", required: false, type: "int", description: "Defaults to 60." },
      { key: "presenter", label: "Presenter", required: false, type: "string", description: "Teacher or presenter name." },
      { key: "location", label: "Studio or location", required: false, type: "string", description: "Optional." },
      { key: "notes", label: "Notes", required: false, type: "string", description: "Preparation notes." },
    ],
    examples: () => [
      { item_code: "MY-G08-MATH-U02-L04", scheduled_start: "2026-11-03 09:30", duration_min: "90", presenter: "Ato Tesfaye Mulugeta", location: "Studio A", notes: "Bring printed worked examples" },
    ],
  },
  historical: {
    key: "historical",
    title: "Historical migration",
    summary: "Manager-only migration of content produced before this system, with provenance and partial history.",
    managerOnly: true,
    modes: ["create"],
    notes: [
      "Historical items are marked with provenance 'historical' and are excluded from timing and performance metrics.",
      "Source dates are stored as source events. Unknown dates stay unknown; nothing is assumed.",
      "A row is published only when both published_at and live_url are given. Otherwise it becomes a draft item.",
      "source_reference must be unique per source system. Re-importing the same reference is skipped.",
    ],
    fields: [
      { key: "source_system", label: "Source system", required: true, type: "string", description: "Where the record came from, for example 'Tracking sheet 2025'." },
      { key: "source_reference", label: "Source reference", required: true, type: "string", description: "Row or record ID in the source. Used to prevent duplicates." },
      { key: "grade_code", label: "Grade code", required: true, type: "enum", options: gradeCodes, description: "Primary grade." },
      { key: "subject_code", label: "Subject code", required: true, type: "enum", options: subjectCodes, description: "Primary subject." },
      { key: "unit_number", label: "Unit number", required: false, type: "int", description: "Unit in the curriculum inventory." },
      { key: "lesson_number", label: "Lesson number", required: false, type: "int", description: "Lesson in the unit." },
      { key: "lesson_title", label: "Lesson title", required: false, type: "string", description: "Used when the lesson does not exist yet." },
      { key: "title", label: "Title", required: true, type: "string", description: "Deliverable title." },
      { key: "title_am", label: "Title (Amharic)", required: false, type: "string", description: "Optional." },
      { key: "language", label: "Language", required: false, type: "enum", options: languageCodes, description: "Defaults to en." },
      { key: "content_type", label: "Content type", required: false, type: "enum", options: contentKeys, description: "Defaults to lesson_video." },
      { key: "teacher", label: "Teacher or presenter", required: false, type: "string", description: "Optional." },
      { key: "final_duration_min", label: "Final duration (min)", required: false, type: "number", description: "Optional." },
      { key: "recorded_on", label: "Recorded on", required: false, type: "date", description: "YYYY-MM-DD, if known." },
      { key: "edited_on", label: "Edited on", required: false, type: "date", description: "YYYY-MM-DD, if known." },
      { key: "uploaded_on", label: "Uploaded on", required: false, type: "date", description: "YYYY-MM-DD, if known." },
      { key: "published_at", label: "Published at", required: false, type: "datetime", description: "YYYY-MM-DD HH:mm or YYYY-MM-DD, if known." },
      { key: "platform", label: "Platform", required: false, type: "enum", options: destinationKeys, description: "Destination where it is live." },
      { key: "live_url", label: "Live link", required: false, type: "url", description: "Confirmed live link." },
      { key: "notes", label: "Notes", required: false, type: "string", description: "Anything else worth keeping from the source." },
    ],
    examples: () => [
      {
        source_system: "Tracking sheet 2025",
        source_reference: "ROW-0142",
        grade_code: "G09",
        subject_code: "PHYS",
        unit_number: "1",
        lesson_number: "1",
        lesson_title: "Physical quantities and units",
        title: "Physical quantities and units",
        title_am: "",
        language: "en",
        content_type: "lesson_video",
        teacher: "W/ro Almaz Bekele",
        final_duration_min: "21",
        recorded_on: "2025-03-04",
        edited_on: "",
        uploaded_on: "2025-03-12",
        published_at: "2025-03-14 10:00",
        platform: "myseed_app",
        live_url: "https://app.myseed.example/lessons/legacy-0142",
        notes: "Edited date unknown in source",
      },
    ],
  },
};

// Who can record progress for a stage: its team, its lead, or managers who override owners.
export function runsStage(user: AppUser, stage: Stage) {
  return isManager(user) || user.leads.includes(stage) || user.roles.includes(stage);
}

export function templateList(user: AppUser) {
  return Object.values(TEMPLATES).filter((t) => {
    if (t.stageImport && !can(user, "import.stage") && !can(user, "import.run")) return false;
    if (t.stage) return runsStage(user, t.stage);
    return t.stageImport || !t.managerOnly || can(user, "import.run");
  });
}

// "My parts" file for a team template: the parts in the person's access waiting at that stage, ready to fill in.
export async function stagePrefillRows(user: AppUser, stage: Stage): Promise<Record<string, string>[]> {
  const sc = scopeSql(user, "i");
  const rows = await all<{ code: string; grade_code: string | null; subject_code: string | null; unit_number: number | null; part_number: number | null; title: string }>(
    `SELECT i.code, g.code AS grade_code, s.code AS subject_code, u.number AS unit_number, l.number AS part_number, i.title
       FROM items i
       LEFT JOIN lessons l ON l.id = i.lesson_id
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN grades g ON g.id = u.grade_id
       LEFT JOIN subjects s ON s.id = u.subject_id
      WHERE ((i.lifecycle = 'in_production' AND i.stage = ?) OR (? = 'recording' AND i.lifecycle = 'draft')) AND ${sc.sql}
      ORDER BY g.sort, s.sort, u.number, l.number, i.code
      LIMIT 5000`,
    stage,
    stage,
    ...sc.params,
  );
  return rows.map((r) => ({
    item_code: r.code,
    grade_code: r.grade_code ?? "",
    subject_code: r.subject_code ?? "",
    unit_number: r.unit_number === null ? "" : String(r.unit_number),
    part_number: r.part_number === null ? "" : String(r.part_number),
    part_title: r.title,
  }));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParsedSheet = { headers: string[]; rows: string[][]; sheetName?: string };

export async function parseUpload(fileName: string, data: ArrayBuffer): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const Papa = (await import("papaparse")).default;
    const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    const [headers = [], ...rows] = parsed.data;
    return { headers: headers.map((h) => String(h ?? "").trim()), rows: rows.map((r) => r.map((c) => String(c ?? "").trim())) };
  }
  if (lower.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const ws = wb.getWorksheet("Template") ?? wb.worksheets.find((w) => w.state !== "hidden" && w.name !== "Instructions" && w.name !== "Lists") ?? wb.worksheets[0];
    if (!ws) throw new WorkflowError("VALIDATION", "The workbook has no worksheets.");
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      const count = Math.max(row.cellCount, ws.columnCount);
      for (let c = 1; c <= count; c++) values.push(cellText(row.getCell(c).value));
      out.push(values);
    });
    const [headers = [], ...rows] = out;
    const width = headers.length;
    return {
      sheetName: ws.name,
      headers: headers.map((h) => h.trim()),
      rows: rows.map((r) => r.slice(0, width)).filter((r) => r.some((c) => c.trim() !== "")),
    };
  }
  if (lower.endsWith(".json")) {
    // An array of row objects, or { rows: [...] } as written by the JSON export.
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, ""));
    } catch {
      throw new WorkflowError("VALIDATION", "The JSON file could not be read.");
    }
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { rows?: unknown })?.rows) ? (parsed as { rows: unknown[] }).rows : null;
    if (!list) throw new WorkflowError("VALIDATION", "The JSON must be an array of rows (or have a rows array). Curriculum tracker backups are imported in Admin, Data.");
    const objects = list.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
    const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    return { headers, rows: objects.map((o) => headers.map((h) => (o[h] === null || o[h] === undefined ? "" : String(o[h]).trim()))) };
  }
  throw new WorkflowError("VALIDATION", "Upload a .csv, .xlsx or .json file.");
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text) return String(o.text).trim();
    if (o.hyperlink) return String(o.hyperlink).trim();
    if (o.result !== undefined) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function autoMap(template: TemplateDef, headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of template.fields) {
    const hit = headers.find((h) => norm(h) === norm(f.key) || norm(h) === norm(f.label));
    if (hit) map[f.key] = hit;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Validation and execution
// ---------------------------------------------------------------------------

export type RowOutcome = {
  row: number;
  action: "create" | "update" | "skip" | "error";
  key: string;
  summary: string;
  errors: string[];
  warnings: string[];
};

type Row = Record<string, string>;

function toRecords(template: TemplateDef, sheet: ParsedSheet, mapping: Record<string, string>): Row[] {
  const idx: Record<string, number> = {};
  for (const [field, header] of Object.entries(mapping)) {
    const i = sheet.headers.indexOf(header);
    if (i >= 0) idx[field] = i;
  }
  return sheet.rows.map((r) => {
    const rec: Row = {};
    for (const f of template.fields) rec[f.key] = idx[f.key] !== undefined ? (r[idx[f.key]] ?? "").trim() : "";
    return rec;
  });
}

const splitList = (v: string) => v.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);

function checkField(f: TemplateField, value: string, mode: ImportMode, errors: string[]) {
  const required = f.required === true || f.required === mode || (f.required === "create" && mode === "upsert");
  if (!value) {
    if (required) errors.push(`${f.label} is required.`);
    return;
  }
  switch (f.type) {
    case "int":
      if (!/^\d+$/.test(value)) errors.push(`${f.label} must be a whole number.`);
      break;
    case "number":
      if (Number.isNaN(Number(value)) || Number(value) < 0) errors.push(`${f.label} must be a positive number.`);
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) errors.push(`${f.label} must be a date as YYYY-MM-DD.`);
      break;
    case "datetime":
      if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$/.test(value)) errors.push(`${f.label} must be YYYY-MM-DD HH:mm.`);
      break;
    case "email":
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push(`${f.label} is not a valid email.`);
      break;
    case "url":
      if (!/^https?:\/\/\S+$/i.test(value)) errors.push(`${f.label} must start with https://.`);
      break;
    case "bool":
      if (!["yes", "no", "true", "false", "1", "0", "y", "n"].includes(value.toLowerCase())) errors.push(`${f.label} must be yes or no.`);
      break;
    case "enum": {
      const opts = f.options?.() ?? [];
      if (opts.length && !opts.map((o) => o.toLowerCase()).includes(value.toLowerCase()))
        errors.push(`${f.label} "${value}" is not one of: ${opts.join(", ")}.`);
      break;
    }
    case "list": {
      const opts = (f.options?.() ?? []).map((o) => o.toLowerCase());
      const bad = splitList(value).filter((v) => opts.length && !opts.includes(v.toLowerCase()));
      if (bad.length) errors.push(`${f.label} has unknown values: ${bad.join(", ")}.`);
      break;
    }
  }
}

const truthy = (v: string) => ["yes", "true", "1", "y"].includes(v.trim().toLowerCase());

async function gradeByCode(code: string) {
  return await get<{ id: string; code: string }>("SELECT id, code FROM grades WHERE code = ? COLLATE NOCASE", code);
}
async function subjectByCode(code: string) {
  return await get<{ id: string; code: string }>("SELECT id, code FROM subjects WHERE code = ? COLLATE NOCASE", code);
}
async function offered(gradeId: string, subjectId: string) {
  return !!await get("SELECT 1 AS x FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
}
async function unitFor(gradeId: string, subjectId: string, n: number) {
  return await get<{ id: string; title: string }>("SELECT id, title FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", gradeId, subjectId, n);
}
async function userByEmail(email: string) {
  return await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE email = ? COLLATE NOCASE AND active = 1", email);
}
async function userHasRole(userId: string, role: Role) {
  return !!await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = ?", userId, role);
}

async function parsePlacement(token: string) {
  const [g, s, u] = token.split("-").map((x) => x.trim());
  const grade = g ? await gradeByCode(g) : undefined;
  const subject = s ? await subjectByCode(s) : undefined;
  if (!grade || !subject) return { error: `Placement "${token}" must look like G09-MATH or G09-MATH-U01.` };
  if (!await offered(grade.id, subject.id)) return { error: `${subject.code} is not offered in ${grade.code}.` };
  let unitId: string | null = null;
  if (u) {
    const n = Number(u.replace(/^U/i, ""));
    const unit = await unitFor(grade.id, subject.id, n);
    if (!unit) return { error: `Unit ${u} does not exist in ${grade.code}-${subject.code}.` };
    unitId = unit.id;
  }
  return { gradeId: grade.id, subjectId: subject.id, unitId };
}

type Plan = { outcome: RowOutcome; apply?: (ctx: Ctx) => Promise<void> | void };

async function planRow(template: TemplateDef, rec: Row, rowNo: number, mode: ImportMode, user: AppUser, seenKeys: Set<string>): Promise<Plan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const f of template.fields) checkField(f, rec[f.key] ?? "", mode, errors);
  const tz = (await getSettings()).workspace.timezone;
  const out = (action: RowOutcome["action"], key: string, summary: string): RowOutcome => ({
    row: rowNo,
    action: errors.length ? "error" : action,
    key,
    summary: errors.length ? errors[0] : summary,
    errors,
    warnings,
  });

  if (template.key === "progress" || template.stage) {
    if (template.stage) {
      for (const [from, to] of Object.entries(template.aliases ?? {})) rec[to] = rec[from] ?? "";
      rec.stage = template.stage;
      rec.status ||= "done";
    }
    const stage = rec.stage?.toLowerCase() as Stage;
    let item: { id: string; code: string; lifecycle: string; stage: Stage | null } | undefined;
    if (rec.item_code) {
      item = await get("SELECT id, code, lifecycle, stage FROM items WHERE code = ? COLLATE NOCASE", rec.item_code);
      if (!item) errors.push(`No item with code ${rec.item_code}.`);
    } else if (rec.grade_code && rec.subject_code && rec.unit_number && rec.part_number) {
      const grade = await gradeByCode(rec.grade_code);
      const subject = await subjectByCode(rec.subject_code);
      const unit = grade && subject ? await unitFor(grade.id, subject.id, Number(rec.unit_number)) : undefined;
      const lesson = unit ? await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", unit.id, Number(rec.part_number)) : undefined;
      item = lesson
        ? await get("SELECT id, code, lifecycle, stage FROM items WHERE lesson_id = ? AND lifecycle NOT IN ('archived','cancelled') ORDER BY created_at LIMIT 1", lesson.id)
        : undefined;
      if (!item) errors.push(`No part ${rec.grade_code} ${rec.subject_code} unit ${rec.unit_number} part ${rec.part_number}.`);
    } else errors.push("Give an item_code, or grade_code, subject_code, unit_number and part_number.");
    if (item && !(await canViewItem(user, item.id))) errors.push(`${item.code} is outside your access.`);
    if (STAGES.includes(stage) && !isManager(user) && !user.leads.includes(stage) && !user.roles.includes(stage))
      errors.push(`You are not on the ${stage} team, so you cannot record ${stage} progress.`);
    const key = `${item?.code ?? rec.item_code}:${stage}`;
    if (seenKeys.has(key)) errors.push("Duplicate stage row for this part in this file.");
    seenKeys.add(key);
    const assignee = rec.assign_to ? await userByEmail(rec.assign_to) : undefined;
    if (rec.assign_to && !assignee) errors.push(`No active user ${rec.assign_to}.`);
    if (assignee && STAGES.includes(stage) && !(await userHasRole(assignee.id, stage))) errors.push(`${assignee.name} is not on the ${stage} team.`);
    if (errors.length || !item) return { outcome: out("error", key, "") };
    const done = rec.status?.toLowerCase() === "done";
    const at = rec.done_date ? new Date(`${rec.done_date}T09:00:00+03:00`).toISOString() : nowIso();
    const pos = (s: Stage | null) => (s ? STAGES.indexOf(s) : -1);
    const current = item.lifecycle === "published" ? 4 : item.lifecycle === "in_production" ? pos(item.stage) : 0;
    if (done && current < pos(stage)) {
      errors.push(`${item.code} is still in ${item.stage ?? "draft"}; ${stage} cannot be done yet.`);
      return { outcome: out("error", key, "") };
    }
    const already = current > pos(stage);
    if (already) warnings.push(`${stage} is already done; only the date will be updated.`);
    const codes = (rec.camera_codes ?? "").split(/[;\n]/).map((c) => c.trim()).filter(Boolean);
    return {
      outcome: out("update", key, `${item.code}: ${stage} ${done ? (already ? "date updated" : `done on ${rec.done_date || "today"}`) : "in process"}`),
      apply: async (ctx) => {
        if (assignee && !already) await assignStage(ctx, item!.id, { stage, userId: assignee.id, reason: "Imported" });
        const inStage = current === pos(stage) && !already;
        if (inStage && stage === "recording")
          for (const c of codes) {
            const exists = await get("SELECT 1 AS x FROM assets WHERE item_id = ? AND kind = 'raw' AND camera_code = ?", item!.id, c);
            if (!exists) await addAsset(ctx, item!.id, { kind: "raw", cameraCode: c, label: rec.video_title || null, notes: rec.notes || null });
          }
        if (inStage && rec.link && (stage === "editing" || stage === "uploading")) {
          if (stage === "editing") await addAsset(ctx, item!.id, { kind: "master", url: rec.link, label: "Imported master" });
          else await run("UPDATE publication_targets SET upload_status = 'uploaded', upload_url = ? WHERE item_id = ? AND required = 1", rec.link, item!.id);
        }
        if (done) await recordStageCompletion(ctx, item!.id, stage, { doneAt: at, note: rec.notes || null, liveUrl: stage === "publication" ? rec.link || null : null });
      },
    };
  }

  if (template.key === "curriculum") {
    const grade = rec.grade_code ? await gradeByCode(rec.grade_code) : undefined;
    const subject = rec.subject_code ? await subjectByCode(rec.subject_code) : undefined;
    if (grade && subject && !await offered(grade.id, subject.id)) errors.push(`${subject.code} is not offered in ${grade.code}. Add it in Settings > Taxonomy first.`);
    const key = `${rec.grade_code}-${rec.subject_code}-U${rec.unit_number}-L${rec.lesson_number}`.toUpperCase();
    if (seenKeys.has(key)) errors.push(`Duplicate lesson ${key} in this file.`);
    seenKeys.add(key);
    if (errors.length || !grade || !subject) return { outcome: out("error", key, "") };
    const unit = await unitFor(grade.id, subject.id, Number(rec.unit_number));
    const lesson = unit ? await get<{ id: string; title: string }>("SELECT id, title FROM lessons WHERE unit_id = ? AND number = ?", unit.id, Number(rec.lesson_number)) : undefined;
    if (unit && unit.title !== rec.unit_title) warnings.push(`Unit title will change from "${unit.title}".`);
    const action = lesson ? "update" : "create";
    return {
      outcome: out(action, key, lesson ? `Update lesson "${lesson.title}"` : `Create lesson "${rec.lesson_title}"${unit ? "" : " and its unit"}`),
      apply: async (ctx) => {
        const now = ctx.now ?? nowIso();
        let unitId = (await unitFor(grade.id, subject.id, Number(rec.unit_number)))?.id;
        if (!unitId) {
          unitId = uid("unt_");
          await run(
                        "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am, term) VALUES (?, (SELECT id FROM curricula WHERE active = 1 LIMIT 1), ?, ?, ?, ?, ?, ?)",
                        unitId,
                        grade.id,
                        subject.id,
                        Number(rec.unit_number),
                        rec.unit_title,
                        rec.unit_title_am || null,
                        rec.term || null,
                      );
        } else {
          await run("UPDATE units SET title = ?, title_am = COALESCE(?, title_am), term = COALESCE(?, term) WHERE id = ?", rec.unit_title, rec.unit_title_am || null, rec.term || null, unitId);
        }
        const existing = await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", unitId, Number(rec.lesson_number));
        if (existing)
          await run(
                        "UPDATE lessons SET title = ?, title_am = COALESCE(?, title_am), objectives = COALESCE(?, objectives), language = COALESCE(?, language), planned_deliverables = ? WHERE id = ?",
                        rec.lesson_title,
                        rec.lesson_title_am || null,
                        rec.objectives || null,
                        rec.language || null,
                        Number(rec.planned_deliverables || 1),
                        existing.id,
                      );
        else
          await run(
                        "INSERT INTO lessons (id, unit_id, number, title, title_am, objectives, language, planned_deliverables, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        uid("les_"),
                        unitId,
                        Number(rec.lesson_number),
                        rec.lesson_title,
                        rec.lesson_title_am || null,
                        rec.objectives || null,
                        rec.language || "en",
                        Number(rec.planned_deliverables || 1),
                        now,
                      );
      },
    };
  }

  if (template.key === "items") {
    const existing = rec.item_id
      ? await get<{ id: string; code: string; current_due_at: string | null }>("SELECT id, code, current_due_at FROM items WHERE id = ?", rec.item_id)
      : rec.item_code
        ? await get<{ id: string; code: string; current_due_at: string | null }>("SELECT id, code, current_due_at FROM items WHERE code = ? COLLATE NOCASE", rec.item_code)
        : undefined;
    const key = rec.item_code || rec.item_id || `row ${rowNo}`;
    if (rec.item_code || rec.item_id) {
      if (seenKeys.has(key.toUpperCase())) errors.push(`Item ${key} appears more than once in this file.`);
      seenKeys.add(key.toUpperCase());
    }
    const owners: Partial<Record<Stage, string>> = {};
    for (const st of STAGES) {
      const email = rec[`${st}_owner`];
      if (!email) continue;
      const u = await userByEmail(email);
      if (!u) errors.push(`No active user with email ${email}.`);
      else if (!await userHasRole(u.id, st)) errors.push(`${u.name} does not hold the ${st} role.`);
      else owners[st] = u.id;
    }
    const placements: { gradeId: string; subjectId: string; unitId: string | null }[] = [];
    for (const token of splitList(rec.also_in ?? "")) {
      const p = await parsePlacement(token);
      if ("error" in p) errors.push(p.error!);
      else placements.push(p as { gradeId: string; subjectId: string; unitId: string | null });
    }
    const dueAt = rec.due_date ? endOfLocalDayIso(rec.due_date, tz) : null;
    const plannedAt = rec.planned_publish_date ? localInputToIso(`${rec.planned_publish_date}T09:00`, tz) : null;

    if (mode === "update") {
      if (!existing) {
        errors.push(`No item found with ${rec.item_id ? "ID" : "code"} ${key}. Update mode never matches by title.`);
        return { outcome: out("error", key, "") };
      }
      if (dueAt && existing.current_due_at && dueAt !== existing.current_due_at && !rec.change_reason)
        errors.push("change_reason is required when changing an existing due date.");
      const fields: Record<string, unknown> = {};
      if (rec.title) fields.title = rec.title;
      if (rec.title_am) fields.title_am = rec.title_am;
      if (rec.objectives) fields.objectives = rec.objectives;
      if (rec.teacher) fields.teacher = rec.teacher;
      if (rec.target_duration_min) fields.target_duration_min = Number(rec.target_duration_min);
      if (rec.complexity) fields.complexity = rec.complexity.toLowerCase();
      if (rec.complexity_note) fields.complexity_note = rec.complexity_note;
      if (rec.priority) fields.priority = rec.priority.toLowerCase();
      if (rec.language) fields.language = rec.language;
      if (rec.content_type) fields.content_type = rec.content_type;
      if (rec.tags) fields.tags = splitList(rec.tags);
      if (plannedAt) fields.planned_publish_at = plannedAt;
      const changes = Object.keys(fields).length + Object.keys(owners).length + (dueAt && dueAt !== existing.current_due_at ? 1 : 0);
      if (rec.release_now && truthy(rec.release_now)) warnings.push("release_now is ignored in update mode.");
      if (!changes) return { outcome: { ...out("skip", existing.code, "No changes"), action: errors.length ? "error" : "skip" } };
      return {
        outcome: out("update", existing.code, `Update ${changes} field${changes === 1 ? "" : "s"} on ${existing.code}`),
        apply: async (ctx) => {
          await updateItemFields(ctx, existing.id, fields);
          for (const [st, uid_] of Object.entries(owners)) await assignStage(ctx, existing.id, { stage: st as Stage, userId: uid_!, reason: "Import update" });
          if (dueAt && dueAt !== existing.current_due_at) await changeDeadline(ctx, existing.id, { dueAt, reason: rec.change_reason || "Import" });
        },
      };
    }

    // create mode
    if (existing) {
      return { outcome: { ...out("skip", existing.code, `${existing.code} already exists; skipped to avoid a duplicate`), action: errors.length ? "error" : "skip" } };
    }
    const grade = rec.grade_code ? await gradeByCode(rec.grade_code) : undefined;
    const subject = rec.subject_code ? await subjectByCode(rec.subject_code) : undefined;
    if (grade && subject && !await offered(grade.id, subject.id)) errors.push(`${subject.code} is not offered in ${grade.code}.`);
    let unitId: string | null = null;
    if (grade && subject && rec.unit_number) {
      const unit = await unitFor(grade.id, subject.id, Number(rec.unit_number));
      if (!unit) errors.push(`Unit ${rec.unit_number} does not exist for ${grade.code}-${subject.code}. Import the curriculum inventory first.`);
      else unitId = unit.id;
    }
    if (rec.lesson_number && !rec.unit_number) errors.push("lesson_number requires unit_number.");
    if (rec.lesson_number && unitId) {
      const lesson = await get("SELECT 1 AS x FROM lessons WHERE unit_id = ? AND number = ?", unitId, Number(rec.lesson_number));
      if (!lesson) warnings.push(`Lesson ${rec.lesson_number} will be added to the inventory.`);
    }
    if (!grade || !subject) return { outcome: out("error", key, "") };
    return {
      outcome: out("create", rec.item_code || "(generated)", `Create "${rec.title}"${truthy(rec.release_now ?? "") ? " and release to Recording" : " as draft"}`),
      apply: async (ctx) => {
        await createItem(ctx, {
                    gradeId: grade.id,
                    subjectId: subject.id,
                    unitId,
                    lessonNumber: rec.lesson_number ? Number(rec.lesson_number) : null,
                    lessonTitle: rec.lesson_title || null,
                    deliverableType: rec.deliverable_type || "main_video",
                    title: rec.title,
                    titleAm: rec.title_am || null,
                    objectives: rec.objectives || null,
                    language: rec.language || "en",
                    contentType: rec.content_type || "lesson_video",
                    teacher: rec.teacher || null,
                    targetDurationMin: rec.target_duration_min ? Number(rec.target_duration_min) : null,
                    complexity: (rec.complexity || "standard").toLowerCase(),
                    complexityNote: rec.complexity_note || null,
                    priority: (rec.priority || "normal").toLowerCase(),
                    tags: splitList(rec.tags ?? ""),
                    plannedPublishAt: plannedAt,
                    dueAt,
                    owners,
                    requiredDestinations: splitList(rec.required_destinations ?? ""),
                    optionalDestinations: splitList(rec.optional_destinations ?? ""),
                    secondaryMemberships: placements,
                    release: truthy(rec.release_now ?? ""),
                    provenance: "imported",
                    importBatchId: ctx.jobId ?? null,
                    code: rec.item_code || null,
                  });
      },
    };
  }

  if (template.key === "users") {
    const key = rec.email.toLowerCase();
    if (seenKeys.has(key)) errors.push(`${rec.email} appears more than once in this file.`);
    seenKeys.add(key);
    const roles = splitList(rec.roles ?? "").map((r) => r.toLowerCase()) as Role[];
    const grades: string[] = [];
    for (const c of splitList(rec.grade_scope ?? "")) {
      const g = await gradeByCode(c);
      if (g) grades.push(g.id);
    }
    const subjects: string[] = [];
    for (const c of splitList(rec.subject_scope ?? "")) {
      const x = await subjectByCode(c);
      if (x) subjects.push(x.id);
    }
    const cap: Partial<Record<Stage, number>> = {};
    const stageRoles = roles.filter((r) => r !== "manager") as Stage[];
    if (rec.capacity_hours) {
      if (/^\d+(\.\d+)?$/.test(rec.capacity_hours)) {
        for (const st of stageRoles) cap[st] = Number(rec.capacity_hours) / Math.max(1, stageRoles.length);
      } else {
        for (const pair of splitList(rec.capacity_hours)) {
          const [st, h] = pair.split(":").map((x) => x.trim());
          if (!(STAGES as readonly string[]).includes(st) || Number.isNaN(Number(h))) errors.push(`capacity_hours entry "${pair}" must look like editing:30.`);
          else cap[st as Stage] = Number(h);
        }
      }
    }
    const existing = await get<{ id: string }>("SELECT id FROM users WHERE email = ? COLLATE NOCASE", rec.email);
    if (existing && existing.id === user.id && !roles.includes("manager")) errors.push("You cannot remove your own manager role through an import.");
    return {
      outcome: out(existing ? "update" : "create", rec.email, existing ? `Update ${rec.name}: ${roles.join(", ")}` : `Invite ${rec.name} as ${roles.join(", ")}`),
      apply: async (ctx) => {
        const now = ctx.now ?? nowIso();
        let id = existing?.id;
        if (!id) {
          id = uid("usr_");
          const temp = tempPassword();
          const handle = await uniqueHandle(rec.email.split("@")[0]);
          await run(
                        "INSERT INTO users (id, name, email, handle, title, password_hash, must_change_password, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
                        id,
                        rec.name,
                        rec.email.toLowerCase(),
                        handle,
                        rec.title || null,
                        hashPassword(temp),
                        rec.active ? (truthy(rec.active) ? 1 : 0) : 1,
                        now,
                      );
          (ctx as Ctx & { secrets?: string[] }).secrets?.push(`${rec.email}: ${temp}`);
        } else {
          await run(
                        "UPDATE users SET name = ?, title = COALESCE(?, title), active = ? WHERE id = ?",
                        rec.name,
                        rec.title || null,
                        rec.active ? (truthy(rec.active) ? 1 : 0) : 1,
                        id,
                      );
        }
        await run("DELETE FROM role_assignments WHERE user_id = ?", id);
        for (const r of roles) await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?)", id, r);
        await run("DELETE FROM access_scopes WHERE user_id = ?", id);
        if (grades.length && subjects.length) {
          for (const g of grades) for (const s of subjects) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, ?, ?)", id, g, s);
        } else {
          for (const g of grades) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, ?, NULL)", id, g);
          for (const s of subjects) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, NULL, ?)", id, s);
        }
        if (Object.keys(cap).length) {
          await run("DELETE FROM user_capacity WHERE user_id = ?", id);
          for (const [st, h] of Object.entries(cap)) await run("INSERT INTO user_capacity (user_id, stage, hours_per_week) VALUES (?, ?, ?)", id, st, h!);
        }
        await audit(ctx, { action: existing ? "user.updated" : "user.invited", summary: `${ctx.actor?.name ?? "Import"} ${existing ? "updated" : "invited"} ${rec.name} (${roles.join(", ")})` });
      },
    };
  }

  if (template.key === "recording_sessions") {
    const item = rec.item_code ? await get<{ id: string; code: string }>("SELECT id, code FROM items WHERE code = ? COLLATE NOCASE", rec.item_code) : undefined;
    if (rec.item_code && !item) errors.push(`No item with code ${rec.item_code}.`);
    if (item && !await canViewItem(user, item.id)) errors.push(`${item.code} is outside your access scope.`);
    const start = rec.scheduled_start ? localInputToIso(rec.scheduled_start.replace(" ", "T"), tz) : null;
    const key = `${rec.item_code}@${rec.scheduled_start}`;
    if (seenKeys.has(key)) errors.push("Duplicate session in this file.");
    seenKeys.add(key);
    if (item && start && await get("SELECT 1 AS x FROM recording_sessions WHERE item_id = ? AND scheduled_start = ?", item.id, start))
      return { outcome: { ...out("skip", key, "Session already booked"), action: errors.length ? "error" : "skip" } };
    if (start && start < nowIso()) warnings.push("The session time is in the past.");
    return {
      outcome: out("create", key, `Book ${rec.item_code} at ${rec.scheduled_start}`),
      apply: async (ctx) => {
        await run(
                    "INSERT INTO recording_sessions (id, item_id, scheduled_start, duration_min, presenter, location, status, outcome_note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)",
                    uid("rs_"),
                    item!.id,
                    start,
                    Number(rec.duration_min || 60),
                    rec.presenter || null,
                    rec.location || null,
                    rec.notes || null,
                    ctx.actor?.id ?? null,
                    ctx.now ?? nowIso(),
                  );
        await audit(ctx, { itemId: item!.id, stage: "recording", action: "recording.scheduled", summary: `Recording session booked for ${rec.scheduled_start}` });
      },
    };
  }

  // historical
  const key = `${rec.source_system}::${rec.source_reference}`;
  if (seenKeys.has(key)) errors.push("Duplicate source reference in this file.");
  seenKeys.add(key);
  const dup = await get<{ code: string }>("SELECT code FROM items WHERE source_reference = ?", key);
  if (dup) return { outcome: { ...out("skip", key, `Already migrated as ${dup.code}`), action: errors.length ? "error" : "skip" } };
  const grade = rec.grade_code ? await gradeByCode(rec.grade_code) : undefined;
  const subject = rec.subject_code ? await subjectByCode(rec.subject_code) : undefined;
  if (grade && subject && !await offered(grade.id, subject.id)) errors.push(`${subject.code} is not offered in ${grade.code}.`);
  let unitId: string | null = null;
  if (grade && subject && rec.unit_number) {
    const unit = await unitFor(grade.id, subject.id, Number(rec.unit_number));
    if (!unit) errors.push(`Unit ${rec.unit_number} does not exist for ${grade.code}-${subject.code}.`);
    else unitId = unit.id;
  }
  const published = !!(rec.published_at && rec.live_url);
  if (rec.published_at && !rec.live_url) warnings.push("published_at without live_url: imported as draft, not published.");
  if (published && !rec.platform) errors.push("platform is required when the item is published.");
  if (!grade || !subject) return { outcome: out("error", key, "") };
  return {
    outcome: out("create", key, published ? `Migrate "${rec.title}" as published (excluded from metrics)` : `Migrate "${rec.title}" as draft`),
    apply: async (ctx) => await importHistoricalRow(ctx, rec, { gradeId: grade.id, subjectId: subject.id, unitId, key }),
  };
}

export async function importHistoricalRow(
  ctx: Ctx,
  rec: Row,
  place: { gradeId: string; subjectId: string; unitId: string | null; key: string },
) {
  const tz = (await getSettings()).workspace.timezone;
  const now = ctx.now ?? nowIso();
  const toIso = (v: string) => (!v ? null : v.length <= 10 ? localInputToIso(`${v}T12:00`, tz) : localInputToIso(v.replace(" ", "T"), tz));
  const published = !!(rec.published_at && rec.live_url);
  const item = await createItem(
      { ...ctx, silent: true, source: "import" },
      {
        gradeId: place.gradeId,
        subjectId: place.subjectId,
        unitId: place.unitId,
        lessonNumber: rec.lesson_number ? Number(rec.lesson_number) : null,
        lessonTitle: rec.lesson_title || null,
        title: rec.title,
        titleAm: rec.title_am || null,
        language: rec.language || "en",
        contentType: rec.content_type || "lesson_video",
        teacher: rec.teacher || null,
        provenance: "historical",
        excludeFromMetrics: true,
        importBatchId: ctx.jobId ?? null,
        sourceReference: place.key,
        requiredDestinations: rec.platform ? [rec.platform] : undefined,
      },
    );
  const events: [string, string, string][] = [
    ["recorded_on", "history.recorded", "Recorded (source date)"],
    ["edited_on", "history.edited", "Edited (source date)"],
    ["uploaded_on", "history.uploaded", "Uploaded (source date)"],
  ];
  for (const [field, action, label] of events) {
    const iso = toIso(rec[field]);
    if (iso) await audit(ctx, { itemId: item.id, action, summary: `${label} from ${rec.source_system}`, sourceOccurredAt: iso });
  }
  if (rec.notes) await audit(ctx, { itemId: item.id, action: "history.note", summary: `Source note: ${rec.notes}` });
  const updates: Record<string, unknown> = {
    actual_duration_min: rec.final_duration_min ? Number(rec.final_duration_min) : null,
  };
  if (published) {
    const pubIso = toIso(rec.published_at)!;
    await run(
            "UPDATE publication_targets SET release_status = 'live', upload_status = 'uploaded', live_url = ?, published_at = ?, verified_at = ?, verified_by = ? WHERE item_id = ? AND platform = ?",
            rec.live_url,
            pubIso,
            now,
            ctx.actor?.id ?? null,
            item.id,
            rec.platform,
          );
    Object.assign(updates, { lifecycle: "published", published_at: pubIso, publication_verified_at: now, live_url: rec.live_url, next_action: null });
    await audit(ctx, {
            itemId: item.id,
            action: "history.published",
            summary: `Published (source date) on ${rec.platform}; verified during migration`,
            sourceOccurredAt: pubIso,
            newValue: { url: rec.live_url },
          });
  }
  await syncItem(item.id, now, updates);
}

function tempPassword() {
  return `Seed-${crypto.randomBytes(5).toString("hex")}9`;
}

export async function uniqueHandle(base: string) {
  const clean = base.toLowerCase().replace(/[^a-z0-9.]/g, "") || "user";
  let h = clean;
  let n = 2;
  while (await get("SELECT 1 AS x FROM users WHERE handle = ?", h)) h = `${clean}${n++}`;
  return h;
}

export type ImportResult = {
  jobId: string | null;
  dryRun: boolean;
  duplicateOf?: string;
  outcomes: RowOutcome[];
  counts: { create: number; update: number; skip: number; error: number; total: number };
  secrets?: string[];
};

function countOutcomes(outcomes: RowOutcome[]) {
  return {
    create: outcomes.filter((o) => o.action === "create").length,
    update: outcomes.filter((o) => o.action === "update").length,
    skip: outcomes.filter((o) => o.action === "skip").length,
    error: outcomes.filter((o) => o.action === "error").length,
    total: outcomes.length,
  };
}

export async function runImport(
  user: AppUser,
  input: { template: TemplateKey; mode: ImportMode; sheet: ParsedSheet; mapping: Record<string, string>; dryRun: boolean; fileName: string; validOnly?: boolean },
): Promise<ImportResult> {
  await loadLookups();
  const template = TEMPLATES[input.template];
  if (!template) throw new WorkflowError("VALIDATION", "Unknown template.");
  if (template.managerOnly && !can(user, "import.run")) throw new WorkflowError("FORBIDDEN", "You do not have permission to run this import.");
  if (template.stageImport && !can(user, "import.stage") && !can(user, "import.run")) throw new WorkflowError("FORBIDDEN", "You do not have permission to import stage progress.");
  if (!template.modes.includes(input.mode)) throw new WorkflowError("VALIDATION", `${template.title} does not support ${input.mode} mode.`);
  if (input.sheet.rows.length > 5000) throw new WorkflowError("VALIDATION", "Split files larger than 5,000 rows into several imports.");
  const required = template.fields.filter((f) => f.required === true || f.required === input.mode || (f.required === "create" && input.mode === "upsert"));
  const unmapped = required.filter((f) => !input.mapping[f.key] && !(template.key === "items" && input.mode === "update" && (f.key === "item_code") && input.mapping.item_id));
  if (unmapped.length) throw new WorkflowError("VALIDATION", `Map the required columns: ${unmapped.map((f) => f.label).join(", ")}.`);

  const records = toRecords(template, input.sheet, input.mapping);
  const seen = new Set<string>();
  const plans: Plan[] = [];
  for (let i = 0; i < records.length; i++) plans.push(await planRow(template, records[i], i + 2, input.mode, user, seen));
  const outcomes = plans.map((p) => p.outcome);
  const counts = countOutcomes(outcomes);
  if (input.dryRun) return { jobId: null, dryRun: true, outcomes, counts };

  if (counts.error && !input.validOnly)
    throw new WorkflowError("VALIDATION", "The file has rows with errors. Fix them, or confirm importing valid rows only.");

  // Same file, template and mode is the idempotency key: a retried confirmation returns the earlier job.
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify([input.template, input.mode, input.sheet.headers, input.sheet.rows, input.mapping]))
    .digest("hex");
  const prior = await get<{ id: string; report: string }>("SELECT id, report FROM jobs WHERE idempotency_key = ? AND status IN ('completed','completed_with_errors')", fingerprint);
  if (prior) {
    const rep = JSON.parse(prior.report) as { outcomes: RowOutcome[] };
    return { jobId: prior.id, dryRun: false, duplicateOf: prior.id, outcomes: rep.outcomes, counts: countOutcomes(rep.outcomes) };
  }
  const jobId = uid("job_");
  const now = nowIso();
  await run(
        "INSERT INTO jobs (id, kind, template, mode, file_name, status, dry_run, idempotency_key, total_rows, actor_id, created_at) VALUES (?, 'import', ?, ?, ?, 'running', 0, ?, ?, ?, ?)",
        jobId,
        input.template,
        input.mode,
        input.fileName,
        fingerprint,
        records.length,
        user.id,
        now,
      );
  const secrets: string[] = [];
  const ctx: Ctx & { secrets: string[] } = { actor: user, now, jobId, source: "import", secrets };
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    if (p.outcome.action === "error" || p.outcome.action === "skip" || !p.apply) continue;
    try {
      await tx(async () => {
        await p.apply!(ctx);
      });
    } catch (err) {
      p.outcome.action = "error";
      p.outcome.errors.push(err instanceof Error ? err.message : String(err));
      p.outcome.summary = p.outcome.errors.at(-1)!;
    }
  }
  const final = countOutcomes(outcomes);
  await run(
        `UPDATE jobs SET status = ?, created_count = ?, updated_count = ?, skipped_count = ?, error_count = ?, report = ?, finished_at = ? WHERE id = ?`,
        final.error ? "completed_with_errors" : "completed",
        final.create,
        final.update,
        final.skip,
        final.error,
        JSON.stringify({ outcomes, headers: input.sheet.headers, rows: input.sheet.rows, mapping: input.mapping }),
        nowIso(),
        jobId,
      );
  await notify(
        [user.id],
        {
          type: "job",
          title: `Import finished: ${template.title}`,
          body: `${final.create} created, ${final.update} updated, ${final.skip} skipped, ${final.error} errors`,
          link: `/import-export?job=${jobId}`,
          dedupeKey: `job:${jobId}`,
        },
        nowIso(),
      );
  return { jobId, dryRun: false, outcomes, counts: final, secrets: secrets.length ? secrets : undefined };
}
