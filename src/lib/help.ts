// Help content written once: the training manual, workflow guides, tooltips and the get-started tours.
// Pages link here with a chapter key (PageHeader help="..."); tooltips read TIPS so wording stays the same everywhere.
import type { Role, Stage } from "@/lib/domain";
import type { ExplainerKey } from "@/components/app/explainers";

export type Audience = "member" | "lead" | "publication" | "manager" | "owner" | "department" | "hr" | "finance";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  member: "Team member",
  lead: "Team lead",
  publication: "Publication",
  manager: "Manager and admin",
  owner: "Owner",
  department: "Department",
  hr: "HR",
  finance: "Finance",
};

// Which tour and first steps a person sees, from the role they are viewing as.
export function audienceFor(activeRole: Role, leads: Stage[]): Audience {
  if (activeRole === "owner") return "owner";
  if (activeRole === "hr_manager" || activeRole === "hr_officer") return "hr";
  if (activeRole === "finance_manager" || activeRole === "accountant") return "finance";
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
      {
        title: "Hiring",
        steps: [
          "HR, Hiring: press New to open a position, with the hiring manager who will lead the new person.",
          "Add applicants with their CV. Move them through Screening, Interview and Offer.",
          "Schedule interviews and choose the interviewers; they are told, open the CV and add their scorecard in My record.",
          "Press Hire: the person becomes an employee on probation under the hiring manager, gets an app account if you choose, and onboarding starts.",
        ],
      },
      {
        title: "Joiners and leavers",
        text: "Onboarding and offboarding are checklists on the person's record. HR ticks HR lines, the line manager ticks theirs and the person ticks their own. Offboarding (HR Manager) sets the last day, tells the line manager, and its App access line can remove the account straight away. The HR Manager edits the checklists in Joiners and leavers.",
      },
      {
        title: "Performance and training",
        text: "Goals and one-to-ones are on each person's record, shared with their line manager. The HR Manager starts review cycles: each person writes a self review in My record, then the line manager writes theirs, with production and task work attached as evidence. Training lists courses; assign them, record completion, and renewals are reminded 30 days ahead.",
      },
      {
        title: "Cases and reports",
        text: "Cases (disciplinary, grievance, investigation) are visible to the HR Manager only, and the audit log keeps their details out. Reports show headcount, joiners and leavers, turnover, leave taken and training completion, with a CSV download.",
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
      { title: "Goals, reviews and training", text: "Set goals with your line manager and read your one-to-one notes. When a review cycle opens, write your self review here; you see your manager's part once it is done. Training assigned to you is listed with its due date." },
      { title: "Interviews", text: "If HR asks you to interview someone, the interview appears at the top of My record with their CV. Add your scorecard afterwards." },
      { title: "Your team", text: "If people report to you, they are listed with their job and contact details." },
    ],
  },
  {
    key: "finance-me",
    title: "Claims, purchases and payslips",
    audiences: "all",
    summary: "Get your money back for work costs, ask to buy things, and read your payslips.",
    sections: [
      { title: "Expense claims", steps: ["Open Claims and pay in the sidebar, then New claim.", "Enter the date, amount and what it was for, and attach a photo of the receipt.", "Your line manager approves, then Finance checks and pays you. You are told at each step."] },
      { title: "Purchase requests", steps: ["Purchase requests, New request: what you need, the items and rough prices.", "Finance approves and orders it.", "When it arrives, press It arrived."] },
      { title: "Payslips", text: "Payslips appear when salaries are paid. Open one to see gross pay, income tax, pension and net pay, and print it or save it as PDF." },
      { title: "For line managers", text: "Claims from your team appear under To approve. Approve, or say why not." },
    ],
  },
  {
    key: "finance",
    title: "Finance: books, payroll and reports",
    audiences: ["finance", "manager", "owner"],
    summary: "Accounts, bills and invoices, claims and purchasing, budgets, payroll, closing months and reports.",
    sections: [
      { title: "Setting up", steps: ["Accounts: add each bank account, cash box, petty cash and mobile money with its opening balance.", "Settings: check the currency, VAT, pension rates and the income tax brackets against the current law; set the approval limit.", "Vendors and customers: add the people you pay and invoice.", "Budgets: set this year's budget per department, project or campaign."] },
      { title: "Money out", text: "Record a bill when it arrives (attach their invoice). Someone other than the person who recorded it approves; above the approval limit, the Finance Manager. Then Pay it from an account. Rent and internet can come back every month by themselves." },
      { title: "Money in", text: "Write an invoice (with VAT if needed), mark it sent, and record the payment when it arrives. Payments count as revenue by product and channel, which feeds the Company overview." },
      { title: "Claims and purchases", text: "Claims approved by the line manager and purchase requests arrive here. Approve, order, confirm delivery and record the bill; a bill far from the approved amount is flagged." },
      { title: "Payroll", steps: ["Payroll, Salaries: set each person's basic salary, allowances (taxable or not) and regular deductions.", "New payroll run for the month. Enter overtime hours and unpaid days; tax, pension and net pay are calculated.", "The Finance Manager checks it (not the person who prepared it), and the owner approves it.", "Pay it from an account: net salaries, income tax and pension are recorded, and everyone gets their payslip.", "Download the bank file for the bulk transfer and the tax and pension report for ERCA and POESSA, then Close month."] },
      { title: "Reports", text: "Reports show revenue, spending and net, profit and loss by department and by ledger account, and the cost per published video. Everything downloads to Excel; Admin, Integrations has Power BI feeds; a Finance department can export to Sage 50 (Peachtree)." },
      { title: "Closing months", text: "A closed month cannot be changed. Closing a payroll run closes its month; the Finance Manager can reopen one if a correction is needed." },
    ],
  },
  {
    key: "account",
    title: "Your profile, sign-in and devices",
    audiences: "all",
    summary: "Make your profile yours, see where you are signed in, and reset a forgotten password.",
    sections: [
      {
        title: "Your profile",
        steps: [
          "Open Profile from the account menu, then Edit profile.",
          "Add a photo and choose a cover colour, a headline, where you are, and whether you are studying.",
          "Add your skills with a level, your education, experience, languages and links.",
          "Upload your CV and certificates. Your lead or line manager, HR and Admin can open them; other colleagues cannot.",
          "Untick sections under Shown to colleagues to keep them to yourself.",
        ],
      },
      { title: "People", text: "People in the sidebar lists everyone with their headline and top skills. Search by a skill, for example Premiere, to find who can help." },
      {
        title: "Where you are signed in",
        text: "The bottom of Profile lists every device you are signed in on, with its browser, IP address and last use. End a session you do not recognise, or sign out all others, then change your password.",
      },
      {
        title: "Forgot your password",
        steps: [
          "On the sign-in page, press Forgot password?",
          "Press Reset with Google and choose your Gmail account (the same email you sign in with), or ask for an email link.",
          "Choose a new password. You are signed in, and signed out everywhere else.",
        ],
      },
    ],
  },
  {
    key: "admin-tools",
    title: "Admin: View as, devices, sign-in, sidebar and integrations",
    audiences: ["manager"],
    summary: "See what others see, control sessions and devices, connect Google, shape each role's sidebar, and connect Power BI.",
    sections: [
      { title: "View as", text: "Admin, View as: choose a role, department or position, then a person. You see exactly their sidebar and pages, read only. Their chat, email and private documents stay closed, and every use is in the audit log. Exit from the strip at the top." },
      { title: "Sessions and devices", text: "Admin, Sessions and devices lists everyone signed in with device, IP address and last use. End one session, sign a person out everywhere, or block a device so it cannot sign in again." },
      { title: "Sign-in", text: "Admin, Sign-in connects a free Google OAuth client so people can reset forgotten passwords with Gmail. The email link uses the account in Email, Settings." },
      { title: "Sidebar per role", text: "Admin, Sidebar hides entries a role does not need. Permissions still decide what each role can open." },
      { title: "Integrations", text: "Admin, Integrations creates API keys for Power BI, Excel and Google Sheets feeds. The Dev team connects GitHub in its Repositories tab; a Finance department exports paid items to Sage 50 (Peachtree), QuickBooks or Xero from its Accounting tab." },
    ],
  },
  {
    key: "talk",
    title: "Chat, calls and email",
    audiences: "all",
    summary: "Talk to people, call them in the app, and send email from the workspace.",
    sections: [
      { title: "Chat", text: "Open chat from the top bar. Message a person or a group, mention someone with @, and attach files." },
      { title: "Who is online, and seen messages", text: "A green dot means the person is online now; otherwise their last active time shows. One tick means sent, two ticks mean seen. Open a message's menu, Seen by, to see when each person saw it." },
      { title: "Search and going back in time", text: "The search button finds words, names, #tags and @mentions in this chat or all your groups. The calendar button shows the chat from any date; Back to the latest returns to now. Direct chats are end-to-end encrypted, so they are searched on your device." },
      { title: "Shared media and contact cards", text: "Tap a person's photo or name to see their contact card: online status, phone, email, Telegram, WhatsApp and more, as far as they allow. The menu (⋮), Shared media, lists photos and videos, files, voice messages and links in the chat. Set what you share in Profile, Contact details." },
      { title: "Mentions, tags and forwarding", text: "Type @ to pick someone to mention (they are notified); @all mentions everyone. Write #tags to label messages; tap a tag to find all messages with it. Forward a message from its menu to one or many people, groups and channels at once." },
      { title: "Groups", text: "Managers, team leads and department heads create groups and manage their members. Admin sets chat limits, storage and auto-delete in Admin, Chat, and can delete any chat." },
      { title: "Feedback and safety", text: "Send feedback to Admin from the account menu. Report a message, person or chat from its menu, or anything else from Safety and reporting; only Admin sees reports and the person reported is never told who reported them." },
      { title: "Calls", text: "Press the phone icon in a chat to call. The other person's app rings, even on their phone if push notifications are on." },
      { title: "Email", text: "If your role has email, the Email page sends and receives through the workspace's mailbox. In the send dialog, Send later schedules it; scheduled messages are listed under Scheduled, where you can cancel them." },
      { title: "Notifications by email", text: "In Notifications, Preferences, switch on Email for the kinds of notice you also want in your inbox, for example approvals or assignments." },
    ],
  },
  {
    key: "attendance",
    title: "Attendance: checking in, corrections and your team's day",
    audiences: "all",
    summary: "Check in and out at the kiosk or in the app; ask for corrections; leads record days by hand when the kiosk is down.",
    sections: [
      {
        title: "Checking in and out",
        steps: [
          "At the kiosk: scan your badge, or press Use my number and PIN and type your number (on your Attendance page) and PIN.",
          "In the app (when allowed): Attendance, Check in. From a phone, you may need to be at the site; the location is read once, when you press the button.",
          "Check out the same way when you leave. A night shift's check-out in the morning closes the night before.",
        ],
      },
      { title: "Your PIN", text: "Set or change your kiosk PIN on your Attendance page: 4 to 6 digits, not all the same and not in a row. Never share it; it records your time." },
      { title: "A wrong or missing time", text: "On your Attendance page, press Correct next to the day, give the right times and what happened. Your line manager approves it; HR sees every correction." },
      {
        title: "Team leads: recording the day by hand",
        steps: [
          "Attendance, My team shows who is in, late, not in yet, absent or on leave.",
          "When the kiosk is down (you are told), tick people and press Record.",
          "Choose present, late, half day, absent or on leave, add times if you know them, and give the reason. The person is told, and HR reviews it.",
        ],
      },
      { title: "HR", text: "Attendance, Setup holds the shifts, rotas, rules, check-in methods, site location, badges, PINs and kiosks. Review lists hand-made days to check; Timesheets downloads to Excel; Finance fills payroll from Attendance." },
    ],
  },
  {
    key: "sessions",
    title: "Studio sessions",
    audiences: ["lead", "member", "manager"],
    summary: "The Recording lead books the studio, presenter and camera operator for the parts to record.",
    sections: [
      {
        title: "Booking",
        steps: [
          "Studio sessions, Book a session.",
          "Choose the day, start, length and studio, the camera operator and the presenter.",
          "Tick the parts to record. Unassigned parts can go to the operator.",
          "Book. A studio or operator already booked then is refused; the operator is told.",
        ],
      },
      { title: "Moving and closing", text: "Drag a session to another day, or press Move to change the time or studio. The operator marks it Recorded when it is done; the lead can cancel it." },
      { title: "On your Home", text: "Recorders see the booked time and studio on each part's card." },
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
export type TourStep = { title: string; text: string; flow?: string[]; explainer?: ExplainerKey };

// The get-started tour: a few steps per audience, each with a short animation of the real screen or the flow.
const SIDEBAR_STEP: TourStep = {
  title: "Your sidebar",
  text: "My space at the top holds your own work, record and leave. Hover any entry to see what it is for, and press the gear at the bottom to hide what you do not use.",
  explainer: "sidebar",
};
const HELP_STEP: TourStep = {
  title: "Help is always one click away",
  text: "The question mark next to a page title opens its chapter of the manual; Show me how plays a short clip. Help and training is in the account menu, top right.",
};
const PROFILE_STEP: TourStep = { title: "Your profile", text: "Add a photo, your skills, education and certificates. Colleagues see your profile; your files stay private to you, your lead and HR.", explainer: "profile" };

export const TOURS: Record<Audience, TourStep[]> = {
  member: [
    { title: "Welcome", text: "This short tour shows how your day works. It takes a minute, and you can replay it from Help." },
    { title: "Your work, on one board", text: "Home shows only your work. Cards move from left to right as you go.", explainer: "my-board" },
    { title: "Everything on the card", text: "Tap a card to tick the checklist and fill in links and lengths. No other page needed." },
    { title: "Send when you are ready", text: "Mark work done whenever it is finished, then send it to your team lead one at a time or all at the end of the day. Your lead approves it and hands it to the next team.", flow: ["You: Done", "Send to team lead", "Lead approves", "Next team"] },
    { title: "Leave", text: "Ask for leave from Leave in the sidebar. Your line manager approves first, then HR.", explainer: "ask-leave" },
    SIDEBAR_STEP,
    PROFILE_STEP,
    HELP_STEP,
  ],
  lead: [
    { title: "Welcome, team lead", text: "This short tour shows your lead desk. You can replay it from Help." },
    { title: "The whole workflow at a glance", text: "The top of Home shows every stage from drafts to published, with your own stage highlighted.", flow: ["Drafts", "Recording", "Editing", "Uploading", "Publication", "Published"] },
    { title: "Approve and hand over", text: "Your team sends you finished work. Approve or return it, then hand it over to the next team's lead.", explainer: "lead-desk" },
    { title: "Accept and assign", text: "Work handed to your team arrives on your desk. Accept it, then assign it to someone.", explainer: "assign" },
    { title: "The whole workflow", text: "You also see Overview, Work views, Coverage, Reports and your Team. Overview's Present mode runs on a wall screen.", explainer: "present" },
    { title: "Your team's leave", text: "Leave requests from your team come to you first, then go to HR.", explainer: "ask-leave" },
    SIDEBAR_STEP,
    HELP_STEP,
  ],
  publication: [
    { title: "Welcome", text: "This short tour shows how releases work. You can replay it from Help." },
    { title: "Review and release", text: "Uploaded work comes to you for review. Approve it, schedule it, and confirm it is live.", flow: ["Uploaded", "Review", "Schedule", "Live"] },
    { title: "Calendar", text: "The Calendar shows what is scheduled and when." },
    SIDEBAR_STEP,
    HELP_STEP,
  ],
  manager: [
    { title: "Welcome", text: "This short tour shows where to plan and follow work. You can replay it from Help." },
    { title: "How work moves", text: "Each stage's team works on its own board. Team leads approve and hand work over to the next team's lead.", flow: ["Recording", "Editing", "Uploading", "Publication"] },
    { title: "Plan and assign", text: "Assign work in bulk from Assign work, and keep stage checklists current in Checklists.", explainer: "assign" },
    { title: "Present and analyse", text: "Overview's Present mode cycles through progress, explains the numbers aloud, compares periods and exports to PowerPoint or video.", explainer: "present" },
    { title: "See what others see", text: "Admin, View as shows the app exactly as a role, department, lead or person sees it, without changing anything.", explainer: "view-as" },
    SIDEBAR_STEP,
    HELP_STEP,
  ],
  owner: [
    { title: "Welcome", text: "This short tour shows where to see the company at a glance. You can replay it from Help." },
    { title: "Company overview", text: "Switch between the overall view and each department.", flow: ["Overall", "Departments", "Reports"] },
    { title: "Present in meetings", text: "Overview's Present button runs a full-screen summary that updates by itself, reads aloud, and exports to PowerPoint.", explainer: "present" },
    HELP_STEP,
  ],
  finance: [
    { title: "Welcome to Finance", text: "This short tour shows where money lives in the app. You can replay it from Help." },
    { title: "Money in and out", text: "Bills from vendors and invoices to customers become payments from your bank, cash or petty cash accounts.", flow: ["Bill or invoice", "Approve", "Pay", "Report"] },
    { title: "Claims and purchases", text: "People claim expenses and ask to buy things; their lead approves, then Finance.", flow: ["Request", "Lead", "Finance", "Paid"] },
    { title: "Payroll", text: "HR prepares, Finance checks, the owner approves, Finance pays and locks the month.", flow: ["Prepare", "Check", "Approve", "Pay", "Lock"] },
    { title: "Budgets and reports", text: "Set budgets per department, project and campaign; reports show profit and loss, cost per video, tax and pension." },
    HELP_STEP,
  ],
  department: [
    { title: "Welcome", text: "This short tour shows your department's workspace. You can replay it from Help." },
    { title: "Projects and tasks", text: "Tasks move across your board as they progress.", flow: ["To do", "In progress", "Review", "Done"] },
    { title: "Views and requests", text: "Your department's views are listed under it in the sidebar. Requests from other teams arrive in Requests." },
    { title: "Leave", text: "Ask for leave from Leave in the sidebar.", explainer: "ask-leave" },
    SIDEBAR_STEP,
    PROFILE_STEP,
    HELP_STEP,
  ],
  hr: [
    { title: "Welcome to HR", text: "This short tour shows where people records live. You can replay it from Help." },
    { title: "People", text: "Every employee has a record with job, line manager, dates and documents.", flow: ["Add", "Fill in", "Documents", "Reminders"] },
    { title: "Leave", text: "Requests come to HR after the line manager. Balances, holidays and leave types are in the Leave tab.", explainer: "ask-leave" },
    { title: "Hiring to leaving", text: "Open positions, interview, hire into an account, then onboarding; offboarding at the end.", flow: ["Opening", "Interview", "Hire", "Onboard", "Offboard"] },
    { title: "Equipment", text: "Issue equipment to people and take it back, so you always know who holds what.", flow: ["Register", "Issue", "Return"] },
    SIDEBAR_STEP,
    HELP_STEP,
  ],
};

// Short clips that belong with each manual chapter.
export const CHAPTER_EXPLAINERS: Record<string, ExplainerKey[]> = {
  basics: ["sidebar"],
  member: ["my-board"],
  lead: ["lead-desk", "assign"],
  leave: ["ask-leave"],
  overview: ["present"],
  manager: ["assign"],
  admin: ["view-as"],
  me: ["profile"],
  account: ["profile", "sidebar"],
  "admin-tools": ["view-as"],
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
  finance: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "accounts", label: "Add your bank and cash accounts", href: "/finance?tab=accounts" },
    { key: "settings", label: "Check tax brackets and pension rates", href: "/finance?tab=settings" },
    { key: "budgets", label: "Set this year's budgets", href: "/finance?tab=budgets" },
    { key: "manual", label: "Read the Finance chapter", href: "/profile/help#finance" },
  ],
  department: [
    { key: "password", label: "Set your own password", href: "/profile" },
    { key: "push", label: "Turn on push notifications", href: "/profile" },
    { key: "requests", label: "Look at Requests", href: "/requests" },
    { key: "manual", label: "Read the Departments chapter", href: "/profile/help#departments" },
  ],
};

// What each sidebar and top-bar entry is for, shown when hovering it. Keyed by the link (or the control's name).
export const NAV_TIPS: Record<string, string> = {
  "/dashboard": "Your starting point: your own work board, or your team's desk if you lead a team.",
  "/me": "Your HR record: job, contact details, documents, equipment, goals, reviews and interviews.",
  "/leave": "Your leave balances, asking for leave, and approving your team's leave.",
  "/team": "Time and effort: your own as a member, your team's workload as a lead.",
  "/profile": "Your profile: photo, skills, education, files, password, devices and preferences.",
  "/overview": "Every unit and part in each stage, by grade or subject, with the Present mode for wall screens.",
  "views": "The same records as a table, a spreadsheet, a board or a calendar. Switch views at the top right of the page.",
  "/handovers": "Batches of work handed from one team lead to the next, to accept or return.",
  "/questions": "Tracked questions between managers and the people doing the work.",
  "/coverage": "Which grades, subjects and units are covered, and where the gaps are.",
  "/reports": "Output, time, quality and deadlines, with exports for Excel and Power BI.",
  "/email": "Send email from the workspace, with templates and a sent log.",
  "/company": "All departments at once: progress, money and each department's dashboard.",
  "/dev": "Dev team projects, tasks, sprints and GitHub repositories.",
  "/studio": "Notes, exams, the question bank and flash cards.",
  "/marketing": "Campaigns, the content calendar, tasks and KPIs.",
  "/hr": "People records, leave, hiring, joiners and leavers, performance, training and reports.",
  "/requests": "Ask another department for something, and follow what happens to it.",
  "/pay": "Claim expenses, ask to buy things, read your payslips, and approve your team's claims.",
  "/finance": "Money accounts, bills, invoices, claims, purchasing, budgets, payroll and reports.",
  "/feedback": "Your feedback to Admin and their replies.",
  "/safety": "The safety policy, and reporting a problem.",
  "/people": "Everyone in the workspace: find colleagues by name, job or skill and open their profiles.",
  "/owners": "Read-only stats and reports from every department, for owners.",
  "/items/new": "Add a new production item.",
  "/assign": "Assign many parts to people at once, with due dates.",
  "/checklists": "Checklist templates for each stage.",
  "/import-export": "Bring spreadsheets in and take data out, including Power BI feeds.",
  "/settings": "Workflow settings: calendar, holidays, lists, policies and alerts.",
  "/admin": "People, roles, permissions, sessions and devices, View as, and sign-in options.",
  "/admin/data": "Find and fix records, check data health, undo imports and restore from Trash.",
  "/audit": "Every recorded change, who made it and when.",
  "/admin/preview": "See the app exactly as a role, department, team lead or person sees it. Read only.",
  "/admin?tab=sessions": "Who is signed in where: devices, IP addresses, ending sessions and blocking devices.",
  "top.search": "Search codes, titles and teachers (Ctrl K).",
  "top.role": "If you hold more than one role, choose which one you are working as. It changes your view only.",
  "top.chat": "Chat with people and groups, and start calls.",
  "top.bell": "Notifications: work sent to you, approvals, reminders and mentions.",
  "top.account": "Your profile, My record, help and training, theme, and signing out.",
  "top.sidebar": "Show or hide the sidebar (Ctrl B).",
};
