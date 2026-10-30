// Help content written once: the training manual, workflow guides, tooltips and the get-started tours.
// Pages link here with a chapter key (PageHeader help="..."); tooltips read TIPS so wording stays the same everywhere.
import type { Role, Stage } from "@/lib/domain";

export type Audience = "member" | "lead" | "publication" | "manager" | "owner" | "department" | "hr";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  member: "Team member",
  lead: "Team lead",
  publication: "Publication",
  manager: "Manager and admin",
  owner: "Owner",
  department: "Department",
  hr: "HR",
};

// Which tour and first steps a person sees, from the role they are viewing as.
export function audienceFor(activeRole: Role, leads: Stage[]): Audience {
  if (activeRole === "owner") return "owner";
  if (activeRole === "hr_manager" || activeRole === "hr_officer") return "hr";
  if (activeRole === "manager" || activeRole === "admin") return "manager";
  if (activeRole === "developer" || activeRole === "content" || activeRole === "marketing") return "department";
  if (activeRole === "publication") return leads.includes("publication") ? "lead" : "publication";
  return leads.includes(activeRole) ? "lead" : "member";
}

export type HelpSection = { title: string; text?: string; steps?: string[] };
export type Chapter = { key: string; title: string; audiences: Audience[] | "all"; summary: string; image?: string; sections: HelpSection[] };

export const CHAPTERS: Chapter[] = [
  {
    key: "basics",
    title: "Getting around",
    audiences: "all",
    summary: "Signing in, Home, the sidebar, search, notifications and your profile.",
    sections: [
      {
        title: "Home",
        text: "Home is where your day starts. Team members see their own work board; team leads also see their lead desk; managers see the whole picture. The sidebar only shows the pages your role uses.",
      },
      {
        title: "Search",
        steps: ["Press Ctrl K (Cmd K on a Mac) or click the search box at the top.", "Type a code, a title or a teacher's name.", "Pick a result to open it."],
      },
      {
        title: "Role switcher",
        text: "If you have more than one role, the button next to search changes which role you are viewing as. It changes your view only, not what you are allowed to do.",
      },
      {
        title: "Notifications",
        text: "The bell shows what needs you: work sent to you, approvals, questions and mentions. Turn on push notifications in Profile to get them on your phone.",
      },
      {
        title: "Getting help",
        text: "The question mark next to a page title opens the matching chapter here. Hover over buttons and status chips for a short explanation. Replay the get-started tour from the top of this page at any time.",
      },
    ],
  },
  {
    key: "member",
    title: "Recording, Editing and Uploading: your work",
    audiences: ["member", "lead"],
    summary: "Take assigned work into progress, fill in what it needs on the card, mark it done and send it to your team lead.",
    image: "/help/my-board.png",
    sections: [
      {
        title: "Your board",
        text: "Home shows your work in four columns: To do (assigned to you), In progress (your timer is running), Done, not sent, and With team lead. You only see your own work.",
      },
      {
        title: "Doing the work",
        steps: [
          "Press Start on a card in To do. It moves to In progress and your time is counted.",
          "Tap the card to open it. Tick the checklist lines as you go.",
          "Fill in what your stage needs: the camera code and minutes for Recording; the master link and final length for Editing; the platform ID or link for Uploading.",
          "Press Pause when you stop for the day or switch to something else.",
        ],
      },
      {
        title: "Finishing",
        steps: [
          "Press Done. If something is still needed, the card opens and lists it.",
          "Done work waits in Done, not sent. Press Reopen if you need to change something.",
          "Press Send to the team lead on one card, or Send all done to the team lead at the end of the day.",
        ],
      },
      {
        title: "When work comes back",
        text: "If your team lead returns work, it goes back to your board with their note on the card. Fix what they asked and send it again.",
      },
    ],
  },
  {
    key: "lead",
    title: "Team lead: approve, hand over, assign",
    audiences: ["lead", "manager"],
    summary: "Approve or return what your team sends, hand over what is ready to the next team's lead, accept what arrives and assign it.",
    image: "/help/lead-desk.png",
    sections: [
      {
        title: "Your lead desk",
        text: "Home shows your lead desk above your own board: To approve, Ready for handover, Arriving from the previous team, To assign, and Your team now. Only team leads hand work over between teams.",
      },
      {
        title: "Approve or return",
        steps: [
          "Open a card in To approve to check the checklist, links and notes. Verify the lines that need your check.",
          "Press Approve, or Approve all. Approved work moves to Ready for handover.",
          "Press Return and say what needs to change. It goes back to the person with your note.",
        ],
      },
      {
        title: "Hand over to the next team",
        steps: [
          "Tick the cards you want to send in Ready for handover, or send all.",
          "Press Hand over. The next team's lead is told and sees it under Arriving.",
          "Your own work goes straight to Ready when you send it.",
        ],
      },
      {
        title: "Accept and assign",
        steps: [
          "Under Arriving, press Accept, or Return with a reason if something is wrong or missing.",
          "Accepted work lands in To assign. Choose a person and press Assign, or tick several and assign them together.",
          "Your team now shows how much each person has in progress and to do.",
        ],
      },
      {
        title: "The whole picture",
        text: "Team leads also see Overview, List, Sheet, Board, Coverage and Reports for the whole workflow from recording to published.",
      },
    ],
  },
  {
    key: "publication",
    title: "Publication: review and release",
    audiences: ["publication", "lead", "manager"],
    summary: "Review uploaded work, request changes, schedule and confirm it is live.",
    sections: [
      {
        title: "Review",
        steps: ["Open the item from Home or the Calendar.", "Press Review. Approve it, or request changes with a note.", "Changes go back to the uploading team."],
      },
      {
        title: "Release",
        steps: ["Press Schedule to choose the release date, or Confirm live when it is published.", "If a release fails, use Report failed release from the item's menu."],
      },
    ],
  },
  {
    key: "overview",
    title: "Overview and presentation",
    audiences: ["lead", "manager", "owner", "publication"],
    summary: "Where every unit and part stands in each stage, and a full-screen presentation for a wall screen or a meeting.",
    image: "/help/present.png",
    sections: [
      {
        title: "Reading the Overview",
        text: "Choose grade-first or subject-first, a table or a hierarchy, and filter by grade, subject or status. Each part shows Done, In process or Missing for Recording, Editing, Uploading and Publication.",
      },
      {
        title: "Presenting",
        steps: [
          "Set the filters you want on the Overview.",
          "Press Present. The presentation keeps the same filters.",
          "It cycles through the whole picture, each grade (or subject), recent completions and what is in process. It refreshes every minute.",
          "Use the arrows, Space to pause, the speed menu, Full screen, and Exit (or Esc).",
        ],
      },
    ],
  },
  {
    key: "manager",
    title: "Managers: plan, assign and keep work moving",
    audiences: ["manager"],
    summary: "Plan work, assign it in bulk, keep checklists current, follow progress and fix problems.",
    sections: [
      {
        title: "Assign work",
        steps: [
          "Open Assign work. Choose Grade then Subject, or Subject then Grade.",
          "Select whole units or single parts. Filter to what is not done or unassigned.",
          "Pick one or several people and how to split the work, set a due date, and assign. Each person gets one notice.",
        ],
      },
      {
        title: "Checklists",
        text: "Checklists holds the template for each stage. Mark lines as required, or as needing the team lead's check. Changing a template does not change work already in progress.",
      },
      {
        title: "Following progress",
        text: "Use Home for alerts and workload, Overview and Coverage for where things stand, Reports for output and time, and the Company overview to switch between departments.",
      },
      {
        title: "Fixing a status",
        text: "Open the item page (or Sheet) and change its status. You will be asked for a reason, which is kept in the audit log.",
      },
    ],
  },
  {
    key: "admin",
    title: "Admin: people, permissions and data",
    audiences: ["manager"],
    summary: "Add people, set roles, team leads and permissions, and keep the data clean.",
    sections: [
      {
        title: "People and roles",
        steps: ["Open Admin, then People.", "Add a person with their email and roles, and their grade and subject scope if needed.", "Mark someone as team lead of a stage under Team leads."],
      },
      {
        title: "Permissions",
        text: "Admin, Roles and permissions lists what each role and each team lead can see and do. Team members see only their own work by default; team leads see the whole workflow.",
      },
      {
        title: "Data manager and Trash",
        text: "Data manager finds and fixes records, checks data health and undoes import batches. Deleted records stay in Trash for a while and can be restored from there.",
      },
    ],
  },
  {
    key: "owner",
    title: "Owners: the company at a glance",
    audiences: ["owner", "manager"],
    summary: "Company overview across departments, department reports and the presentation for meetings.",
    sections: [
      {
        title: "Company overview",
        text: "Switch between the overall view and each department to see progress, what is late and who is busy. Finance figures will appear here once Finance is set up.",
      },
      {
        title: "Reports",
        text: "Owners, Reports shows each department's report. Export it to Excel or print it.",
      },
    ],
  },
  {
    key: "departments",
    title: "Departments: projects and tasks",
    audiences: ["department", "manager", "owner"],
    summary: "Each department has its own dashboard, views, requests and settings.",
    sections: [
      {
        title: "Views",
        text: "Switch between Dashboard, List, Board, Sheet, Timeline, Overview, Team and Report at the top of the department page. Save a view to come back to the same filters.",
      },
      {
        title: "Tasks",
        steps: ["Add a task with quick add on the board, or New task.", "Open a task to set the assignee, dates, estimate, subtasks, files and what it waits on.", "Move it across the board as it progresses; reviews and approvals follow the department's settings."],
      },
      {
        title: "Requests",
        text: "Anyone can send a department a request from Requests. The department accepts it into a task or declines it with a note.",
      },
    ],
  },
  {
    key: "hr",
    title: "HR: people records, documents and equipment",
    audiences: ["hr", "manager"],
    summary: "Keep employee records, reporting lines, documents and equipment up to date.",
    sections: [
      {
        title: "Employee records",
        steps: [
          "Open HR, then People. Press Add everyone with an account the first time, so each person has a record.",
          "Open a person to fill in their job, department, line manager, employment type and dates.",
          "Salary grade, ID, tax and bank details are visible only to people allowed to see them (HR Manager by default).",
        ],
      },
      {
        title: "Documents and reminders",
        text: "Attach IDs, contracts and certificates with an expiry date. HR is reminded 30 days before a document or contract ends and 14 days before probation ends. The Documents tab lists everything due soon.",
      },
      {
        title: "Org chart",
        text: "The org chart follows each person's line manager. Team leads see their own team in My record.",
      },
      {
        title: "Equipment",
        text: "Register cameras, microphones and laptops. Issue them to a person with a return date, and take them back with their condition. Each person sees what they hold in My record.",
      },
    ],
  },
  {
    key: "leave",
    title: "Leave",
    audiences: "all",
    summary: "See your balances, ask for leave, and approve your team's leave.",
    sections: [
      {
        title: "Asking for leave",
        steps: [
          "Open Leave in the sidebar.",
          "Choose the leave type and the first and last day (tick Half a day for a single half day). Weekends and public holidays are not counted.",
          "Press Ask for leave. Your line manager approves first, then HR. You are told either way.",
          "You can cancel a request while it waits, or approved leave before it starts.",
        ],
      },
      {
        title: "Balances",
        text: "Annual leave is 16 working days a year plus one day for every two years of service, built up month by month. Sick, maternity, paternity, compassionate and marriage leave have their own allowances; unpaid leave has no limit. HR can add days, for example days carried over.",
      },
      {
        title: "Approving your team's leave",
        text: "If people report to you, their requests appear at the top of Leave. Approve, or say why not. The calendar shows who in your team is off.",
      },
      {
        title: "For HR",
        text: "HR, Leave shows what waits for final approval, everyone's leave on a calendar, balances with adjustments, leave types and public holidays. Add Ethiopian holidays for a year in one go, and add Eid al-Fitr, Eid al-Adha and Mawlid once their dates are announced.",
      },
    ],
  },
  {
    key: "me",
    title: "My record",
    audiences: "all",
    summary: "Your own HR record, documents, equipment and team.",
    sections: [
      {
        title: "What you can see and change",
        text: "Open My record from the account menu. You can update your phone, address and emergency contacts yourself. Ask HR to change anything else.",
      },
      { title: "Your team", text: "If people report to you, they are listed with their job and contact details." },
    ],
  },
  {
    key: "talk",
    title: "Chat, calls and email",
    audiences: "all",
    summary: "Talk to people, call them in the app, and send email from the workspace.",
    sections: [
      { title: "Chat", text: "Open chat from the top bar. Message a person or a group, mention someone with @, and attach files." },
      { title: "Calls", text: "Press the phone icon in a chat to call. The other person's app rings, even on their phone if push notifications are on." },
      { title: "Email", text: "If your role has email, the Email page sends and receives through the workspace's mailbox." },
    ],
  },
];

export type Guide = { key: string; title: string; chapter: string; steps: string[] };

export const GUIDES: Guide[] = [
  {
    key: "start-submit",
    title: "Start work and send it to your team lead",
    chapter: "member",
    steps: ["Home: press Start on the card.", "Tap the card and fill in the checklist and links.", "Press Done.", "Press Send to the team lead, or send all done at the end of the day."],
  },
  {
    key: "approve-handover",
    title: "Approve your team's work and hand it over",
    chapter: "lead",
    steps: ["Home: open a card in To approve and check it.", "Press Approve (or Return with a note).", "In Ready for handover, press Hand over."],
  },
  {
    key: "accept-assign",
    title: "Accept handed-over work and assign it",
    chapter: "lead",
    steps: ["Home: under Arriving, press Accept.", "Under To assign, choose a person and press Assign."],
  },
  {
    key: "assign-bulk",
    title: "Assign many parts at once",
    chapter: "manager",
    steps: ["Open Assign work.", "Choose grade and subject, then tick units or parts.", "Choose people and how to split, then Assign."],
  },
  {
    key: "import-progress",
    title: "Import progress from a spreadsheet",
    chapter: "manager",
    steps: ["Open Overview and press Import progress (or Import and export).", "Download the template, fill it in and upload it.", "Check the preview and confirm. The next team and the leads are told."],
  },
  {
    key: "fix-data",
    title: "Fix a record in the Data manager",
    chapter: "admin",
    steps: ["Open Data manager.", "Find the record by code or name.", "Edit it, or use Health to find and fix problems in bulk."],
  },
  {
    key: "restore",
    title: "Restore something from Trash",
    chapter: "admin",
    steps: ["Open Data manager, then the Trash tab.", "Find what was deleted.", "Press Restore."],
  },
  {
    key: "present",
    title: "Show progress on a wall screen",
    chapter: "overview",
    steps: ["Open Overview and set the filters.", "Press Present, then Full screen.", "Leave it running; it refreshes by itself."],
  },
];

// Short explanations shown on hover. Keys: "status.<status>", "flow.<column>", "action.<action>".
export const TIPS: Record<string, string> = {
  "status.queued": "Assigned and waiting to be started.",
  "status.in_progress": "Being worked on now; the timer is running.",
  "status.paused": "Started, then paused. Resume to continue.",
  "status.blocked": "Cannot continue until a problem is solved.",
  "status.finished": "Marked done by the person but not yet sent to the team lead.",
  "status.lead_review": "Sent to the team lead, waiting for approval.",
  "status.ready": "Approved by the team lead, waiting to be handed over.",
  "status.awaiting_handoff": "Handed over; waiting for the next team's lead to accept it.",
  "status.completed": "This stage is finished.",
  "status.published": "Live for learners.",
  "status.draft": "Planned, not started yet.",
  "flow.todo": "Work assigned to you. Press Start to begin.",
  "flow.doing": "What you are working on. Your time is counted while it is here.",
  "flow.done": "Done but not sent. Send it to the team lead when you are ready, one by one or all at once.",
  "flow.lead": "Waiting for your team lead to approve it or send it back with a note.",
  "flow.review": "Sent to you by your team. Approve it or return it with a note.",
  "flow.ready": "Approved and ready to hand over to the next team's lead.",
  "flow.incoming": "Handed over to your team. Accept it, or return it with a reason.",
  "flow.assign": "Work in your stage that nobody has yet. Choose a person and assign it.",
  "action.start": "Start working on it; the timer starts.",
  "action.pause": "Stop the timer for now. It stays yours.",
  "action.finish": "Mark your part done. It is not sent until you send it to the team lead.",
  "action.submitLead": "Send it to your team lead for approval.",
  "action.reopenFinished": "Take it back to keep working on it.",
  "action.leadApprove": "Approve it. It moves to Ready for handover.",
  "action.leadReturn": "Send it back to the person with a note on what to change.",
  "action.submit": "Hand it over to the next team's lead.",
  "action.accept": "Accept it into your team.",
  "action.return": "Send it back to the previous team with a reason.",
  "simple.done": "Finished in this stage.",
  "simple.in_process": "Being worked on in this stage.",
  "simple.missing": "Not started in this stage.",
};

export const tip = (key: string): string | undefined => TIPS[key];

// The get-started tour: a few steps per audience, each with an optional animated flow.
export type TourStep = { title: string; text: string; flow?: string[] };

export const TOURS: Record<Audience, TourStep[]> = {
  member: [
    { title: "Welcome", text: "This short tour shows how your day works. It takes a minute, and you can replay it from Help." },
    { title: "Your work, on one board", text: "Home shows only your work. Cards move from left to right as you go.", flow: ["To do", "In progress", "Done, not sent", "With team lead"] },
    { title: "Everything on the card", text: "Tap a card to tick the checklist and fill in links and lengths. No other page needed." },
    { title: "Send when you are ready", text: "Mark work done whenever it is finished, then send it to your team lead one at a time or all at the end of the day. Your lead approves it and hands it to the next team.", flow: ["You: Done", "Send to team lead", "Lead approves", "Next team"] },
  ],
  lead: [
    { title: "Welcome, team lead", text: "This short tour shows your lead desk. You can replay it from Help." },
    { title: "Your team's flow", text: "Your team sends you finished work. You approve or return it, then hand it over to the next team's lead.", flow: ["Team sends", "You approve", "Ready", "Hand over"] },
    { title: "Arriving work", text: "Work handed to your team arrives on your desk. Accept it, then assign it to someone.", flow: ["Arriving", "Accept", "Assign", "Their board"] },
    { title: "The whole workflow", text: "You also see Overview, Board, Coverage and Reports for everything from recording to published." },
  ],
  publication: [
    { title: "Welcome", text: "This short tour shows how releases work. You can replay it from Help." },
    { title: "Review and release", text: "Uploaded work comes to you for review. Approve it, schedule it, and confirm it is live.", flow: ["Uploaded", "Review", "Schedule", "Live"] },
    { title: "Calendar", text: "The Calendar shows what is scheduled and when." },
  ],
  manager: [
    { title: "Welcome", text: "This short tour shows where to plan and follow work. You can replay it from Help." },
    { title: "How work moves", text: "Each stage's team works on its own board. Team leads approve and hand work over to the next team's lead.", flow: ["Recording", "Editing", "Uploading", "Publication"] },
    { title: "Plan and assign", text: "Assign work in bulk from Assign work, and keep stage checklists current in Checklists." },
    { title: "Follow progress", text: "Home shows alerts and workload. Overview shows where everything stands; press Present to show it on a wall screen." },
  ],
  owner: [
    { title: "Welcome", text: "This short tour shows where to see the company at a glance. You can replay it from Help." },
    { title: "Company overview", text: "Switch between the overall view and each department.", flow: ["Overall", "Departments", "Reports"] },
    { title: "Present in meetings", text: "Overview's Present button runs a full-screen summary that updates by itself." },
  ],
  hr: [
    { title: "Welcome to HR", text: "This short tour shows where people records live. You can replay it from Help." },
    { title: "People", text: "Every employee has a record with job, line manager, dates and documents.", flow: ["Add", "Fill in", "Documents", "Reminders"] },
    { title: "Equipment", text: "Issue equipment to people and take it back, so you always know who holds what.", flow: ["Register", "Issue", "Return"] },
  ],
  department: [
    { title: "Welcome", text: "This short tour shows your department's workspace. You can replay it from Help." },
    { title: "Projects and tasks", text: "Tasks move across your board as they progress.", flow: ["To do", "In progress", "Review", "Done"] },
    { title: "Views and requests", text: "Switch views at the top of the department page, and handle requests from other teams in Requests." },
  ],
};

export type FirstStep = { key: string; label: string; href: string };

export const FIRST_STEPS: Record<Audience, FirstStep[]> = {
  member: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "push", label: "Turn on push notifications", href: "/profile" },
    { key: "board", label: "Open your board and start a card", href: "/dashboard" },
    { key: "manual", label: "Read your chapter of the manual", href: "/profile/help#member" },
  ],
  lead: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "push", label: "Turn on push notifications", href: "/profile" },
    { key: "desk", label: "Look over your lead desk", href: "/dashboard" },
    { key: "overview", label: "Open the Overview", href: "/overview" },
    { key: "manual", label: "Read the team lead chapter", href: "/profile/help#lead" },
  ],
  publication: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "push", label: "Turn on push notifications", href: "/profile" },
    { key: "calendar", label: "Open the Calendar", href: "/calendar" },
    { key: "manual", label: "Read the Publication chapter", href: "/profile/help#publication" },
  ],
  manager: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "people", label: "Check people, roles and team leads", href: "/admin" },
    { key: "checklists", label: "Review the stage checklists", href: "/checklists" },
    { key: "assign", label: "Assign some work", href: "/assign" },
    { key: "present", label: "Try the Overview presentation", href: "/overview/present" },
  ],
  owner: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "company", label: "Open the Company overview", href: "/company" },
    { key: "present", label: "Try the Overview presentation", href: "/overview/present" },
  ],
  hr: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "sync", label: "Create records for everyone with an account", href: "/hr" },
    { key: "org", label: "Set line managers and check the org chart", href: "/hr?tab=org" },
    { key: "holidays", label: "Check this year's public holidays", href: "/hr?tab=leave" },
    { key: "manual", label: "Read the HR chapter", href: "/profile/help#hr" },
  ],
  department: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "push", label: "Turn on push notifications", href: "/profile" },
    { key: "requests", label: "Look at Requests", href: "/requests" },
    { key: "manual", label: "Read the Departments chapter", href: "/profile/help#departments" },
  ],
};
