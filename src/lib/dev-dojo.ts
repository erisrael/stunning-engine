// The Dev dojo's lessons: short games that teach real development, used by src/components/app/dev-dojo.tsx.
// Bug hunt (find the line with the bug), Regex lab (match one list and not the other) and quizzes (the terminal and
// Git, complexity, security). Every answer explains why, so a wrong answer still teaches.

export type BugRound = { id: string; lang: string; title: string; code: string[]; bug: number; why: string; fix: string };
export type RegexLevel = { id: string; title: string; brief: string; match: string[]; skip: string[]; hint: string; answer: string };
export type QuizQuestion = { id: string; q: string; options: string[]; answer: number; why: string };
export type Quiz = { key: string; title: string; blurb: string; questions: QuizQuestion[] };

export const BUG_ROUNDS: BugRound[] = [
  {
    id: "sql-injection",
    lang: "ts",
    title: "Find a student by phone",
    code: [
      "export async function findStudent(phone: string) {",
      "  const clean = phone.trim();",
      "  return db.query(`SELECT * FROM students WHERE phone = '${clean}'`);",
      "}",
    ],
    bug: 2,
    why: "The phone is pasted into the SQL text. Someone can type ' OR '1'='1 and read every student (SQL injection).",
    fix: "Use a placeholder: get(\"SELECT * FROM students WHERE phone = ?\", clean).",
  },
  {
    id: "missing-await",
    lang: "ts",
    title: "Save, then send the receipt",
    code: ["async function pay(order: Order) {", "  const payment = chapa.charge(order);", "  await saveReceipt(order.id, payment.reference);", "  return payment;", "}"],
    bug: 1,
    why: "chapa.charge returns a promise. Without await, payment is a Promise and payment.reference is undefined.",
    fix: "const payment = await chapa.charge(order);",
  },
  {
    id: "off-by-one",
    lang: "ts",
    title: "The last three sprints",
    code: ["const sprints = closed.sort(byEndDate);", "const last = sprints.slice(sprints.length - 3, sprints.length - 1);", "const velocity = avg(last.map((s) => s.points));"],
    bug: 1,
    why: "slice's end is exclusive: sprints.length - 1 leaves out the newest sprint, so it averages two, not three.",
    fix: "sprints.slice(-3)",
  },
  {
    id: "xss",
    lang: "tsx",
    title: "Show a customer's message",
    code: ["function Message({ text }: { text: string }) {", "  return <div className=\"bubble\" dangerouslySetInnerHTML={{ __html: text }} />;", "}"],
    bug: 1,
    why: "Customer text goes into the page as HTML. A message with <img onerror=...> runs script in the agent's browser (XSS).",
    fix: "Render it as text: <div className=\"bubble\">{text}</div>, or sanitise to a safe subset first.",
  },
  {
    id: "money-float",
    lang: "ts",
    title: "Add VAT to an invoice",
    code: ["const subtotal = 0.1 + 0.2; // birr", "const vat = subtotal * 0.15;", "if (subtotal + vat === 0.345) markPaid();"],
    bug: 2,
    why: "Floating point: 0.1 + 0.2 is 0.30000000000000004, so the exact comparison fails. Money in floats drifts.",
    fix: "Keep money in cents (integers): 10 + 20 = 30 cents, VAT Math.round(30 * 0.15).",
  },
  {
    id: "permission",
    lang: "ts",
    title: "Delete a payroll row",
    code: ["export async function deletePayrollAction(id: string) {", "  const user = await requireViewer();", "  await run(\"DELETE FROM payroll WHERE id = ?\", id);", "}"],
    bug: 2,
    why: "It checks who is signed in but not whether they may delete payroll. Any signed-in person can call the action.",
    fix: "if (!can(user, \"finance.payroll\")) throw new WorkflowError(\"FORBIDDEN\", \"...\"); before the DELETE.",
  },
  {
    id: "timezone",
    lang: "ts",
    title: "Is it today in Addis?",
    code: ["const today = new Date().toISOString().slice(0, 10);", "const due = task.due_date; // '2026-11-24'", "if (due === today) remind(task);"],
    bug: 0,
    why: "toISOString is UTC. Between 00:00 and 03:00 in Addis Ababa (UTC+3) it still says yesterday, so reminders come a day late.",
    fix: "Compute the date in the workspace time zone (Intl.DateTimeFormat with timeZone: \"Africa/Addis_Ababa\").",
  },
  {
    id: "mutation",
    lang: "ts",
    title: "Sort without surprises",
    code: ["function topThree(scores: number[]) {", "  return scores.sort((a, b) => b - a).slice(0, 3);", "}", "const board = [5, 9, 1, 7];", "topThree(board); // board is now [9, 7, 5, 1]"],
    bug: 1,
    why: "Array.sort sorts in place, so the caller's array changes order. Shared state changing behind your back causes odd bugs.",
    fix: "[...scores].sort(...) or scores.toSorted(...)",
  },
  {
    id: "equality",
    lang: "ts",
    title: "Count unpaid invoices",
    code: ["let unpaid = 0;", "for (const inv of invoices) {", "  if (inv.status = \"unpaid\") unpaid++;", "}"],
    bug: 2,
    why: "= assigns instead of comparing, so every invoice becomes unpaid and every one is counted.",
    fix: "if (inv.status === \"unpaid\")",
  },
  {
    id: "n-plus-one",
    lang: "ts",
    title: "Projects with their tasks",
    code: ["const projects = await all(\"SELECT * FROM projects\");", "for (const p of projects) {", "  p.tasks = await all(\"SELECT * FROM tasks WHERE project_id = ?\", p.id);", "}"],
    bug: 2,
    why: "One query per project (N+1). With 300 projects that is 301 round trips to the database.",
    fix: "One query for all: SELECT * FROM tasks WHERE project_id IN (...), then group by project in code.",
  },
  {
    id: "secret",
    lang: "ts",
    title: "Call the SMS gateway",
    code: ["const SMS_KEY = \"sk_live_9f2c...\";", "export async function sendSms(to: string, text: string) {", "  return fetch(GATEWAY, { method: \"POST\", headers: { Authorization: `Bearer ${SMS_KEY}` }, body: JSON.stringify({ to, text }) });", "}"],
    bug: 0,
    why: "A live key in the code ends up in git history, backups and screenshots for ever.",
    fix: "Read it from the server's settings or process.env, and rotate the key that was committed.",
  },
  {
    id: "race",
    lang: "ts",
    title: "Take the next free part",
    code: ["const part = await get(\"SELECT id FROM parts WHERE owner IS NULL LIMIT 1\");", "await run(\"UPDATE parts SET owner = ? WHERE id = ?\", me, part.id);", "return part.id;"],
    bug: 1,
    why: "Two editors can read the same free part, then both claim it (a race). The second silently overwrites the first.",
    fix: "Claim and check in one step: UPDATE parts SET owner = ? WHERE id = ? AND owner IS NULL, and retry if no row changed.",
  },
];

export const REGEX_LEVELS: RegexLevel[] = [
  { id: "digits", title: "Only digits", brief: "Match strings made only of digits.", match: ["2026", "7", "0911"], skip: ["12a", "", "3.5"], hint: "^ and $ anchor the whole string; \\d+ is one or more digits.", answer: "^\\d+$" },
  { id: "phone", title: "Ethiopian mobile", brief: "Match 09 or 07 followed by 8 digits.", match: ["0911223344", "0711223344"], skip: ["091122334", "0811223344", "09112233445"], hint: "^0[79]\\d{8}$", answer: "^0[79]\\d{8}$" },
  { id: "intl", title: "Mobile, either form", brief: "Match 09/07 numbers, or +2519/+2517 numbers.", match: ["0911223344", "+251911223344", "+251711223344"], skip: ["251911223344", "+25191122334", "0611223344"], hint: "Two shapes joined with | inside a group.", answer: "^(0|\\+251)[79]\\d{8}$" },
  { id: "code", title: "Task codes", brief: "Match codes like DEV-12 or SHAP-7: capitals, a dash, a number.", match: ["DEV-12", "SHAP-7", "WEB-140"], skip: ["dev-12", "DEV12", "DEV-", "D-1x"], hint: "[A-Z]+ then - then \\d+, anchored.", answer: "^[A-Z]+-\\d+$" },
  { id: "date", title: "ISO dates", brief: "Match YYYY-MM-DD with a month 01 to 12.", match: ["2026-11-23", "2027-01-05"], skip: ["2026-13-01", "26-11-23", "2026-1-5"], hint: "Month is 0[1-9] or 1[0-2].", answer: "^\\d{4}-(0[1-9]|1[0-2])-\\d{2}$" },
  { id: "email", title: "Simple email", brief: "Something, an @, a domain with a dot.", match: ["kidus@myseed.com.et", "a.b@x.io"], skip: ["kidus@", "@myseed.com", "kidus myseed.com"], hint: "No spaces or @ before and after: [^\\s@]+", answer: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
  { id: "camera", title: "Camera codes", brief: "CLIP followed by exactly four digits.", match: ["CLIP0250", "CLIP9999"], skip: ["CLIP25", "clip0250", "CLIP02500"], hint: "Literal letters, then \\d{4}.", answer: "^CLIP\\d{4}$" },
  { id: "semver", title: "Versions", brief: "Semantic versions like 1.4.0, with an optional v.", match: ["1.4.0", "v2.10.3", "0.1.0"], skip: ["1.4", "v1.4.0.1", "1.a.0"], hint: "v? then three groups of digits joined by \\.", answer: "^v?\\d+\\.\\d+\\.\\d+$" },
];

export const QUIZZES: Quiz[] = [
  {
    key: "git",
    title: "Terminal and Git",
    blurb: "The commands you reach for every day, and the ones that save you.",
    questions: [
      { id: "g1", q: "You committed to main by mistake and have not pushed. How do you move the commit to a new branch?", options: ["git branch fix && git reset --hard origin/main", "git revert HEAD", "git push --force", "git stash pop"], answer: 0, why: "Make a branch at the commit, then put main back where the remote has it. revert would add a second commit on main." },
      { id: "g2", q: "A bad commit is already on main and others pulled it. How do you undo it safely?", options: ["git reset --hard HEAD~1 && git push --force", "git revert <commit>", "Delete the repository", "git checkout HEAD~1"], answer: 1, why: "revert adds a new commit that undoes it, without rewriting history others already have." },
      { id: "g3", q: "You need to switch branches but have half-done changes. What keeps them?", options: ["git clean -fd", "git stash", "git reset --hard", "git rm -r ."], answer: 1, why: "git stash puts the changes aside; git stash pop brings them back." },
      { id: "g4", q: "Which command shows what you are about to commit?", options: ["git log", "git diff --staged", "git show HEAD", "git blame"], answer: 1, why: "--staged (or --cached) shows the staged changes, what the next commit will contain." },
      { id: "g5", q: "Who last changed line 120 of work.ts, and why?", options: ["git blame -L 120,120 src/server/work.ts", "git status", "git branch -a", "grep 120 work.ts"], answer: 0, why: "blame names the commit for each line; git show <commit> then gives the message." },
      { id: "g6", q: "Find every file that mentions dept_access_grants, fast.", options: ["find . -name dept_access_grants", "grep -rn dept_access_grants src", "ls -R | dept_access_grants", "cat src/*"], answer: 1, why: "grep -rn searches file contents recursively with line numbers (rg is faster still)." },
      { id: "g7", q: "Which file should never be committed?", options: ["package-lock.json", ".env", "README.md", "tsconfig.json"], answer: 1, why: ".env holds secrets. The lock file should be committed so everyone installs the same versions." },
      { id: "g8", q: "You want to see the last 50 lines of the app's log on the VPS and keep watching.", options: ["cat app.log", "tail -n 50 -f app.log", "head app.log", "less +F"], answer: 1, why: "tail -f follows the file as it grows; docker compose logs -f app does the same for a container." },
    ],
  },
  {
    key: "bigo",
    title: "Complexity",
    blurb: "How the work grows when the data grows.",
    questions: [
      { id: "b1", q: "Finding a task by id in a Map with 10,000 tasks takes about:", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], answer: 0, why: "A hash map looks a key up in constant time on average." },
      { id: "b2", q: "Checking every task against every other task for duplicates is:", options: ["O(n)", "O(n log n)", "O(n²)", "O(1)"], answer: 2, why: "Two nested loops over n items: n × n. Sort first or use a Set to get O(n log n) or O(n)." },
      { id: "b3", q: "Binary search in a sorted list of a million names needs about how many steps?", options: ["20", "1,000", "500,000", "1,000,000"], answer: 0, why: "log₂(1,000,000) ≈ 20: each step halves what is left." },
      { id: "b4", q: "rows.filter(...).map(...) over n rows is:", options: ["O(n²)", "O(n)", "O(log n)", "O(1)"], answer: 1, why: "Two passes are still linear: 2n is O(n)." },
      { id: "b5", q: "Which speeds up WHERE dept = ? AND user_id = ? on a big table the most?", options: ["A bigger server", "An index on (dept, user_id)", "SELECT * instead of columns", "ORDER BY dept"], answer: 1, why: "An index lets the database jump to matching rows instead of scanning them all." },
      { id: "b6", q: "Array.includes inside a loop over the same array is:", options: ["O(n)", "O(n²)", "O(n log n)", "O(1)"], answer: 1, why: "includes is itself a scan. Build a Set once, then has() is O(1)." },
    ],
  },
  {
    key: "security",
    title: "Security",
    blurb: "The mistakes that leak data, and how to avoid them.",
    questions: [
      { id: "s1", q: "Where must a permission check live?", options: ["On the button (hide it)", "On the server, in every action and route", "In the CSS", "In the database name"], answer: 1, why: "Anyone can call a server action or API directly; the browser is not in your control." },
      { id: "s2", q: "A password must be stored as:", options: ["Plain text", "Base64", "A slow salted hash (Argon2, bcrypt, scrypt)", "MD5"], answer: 2, why: "Slow, salted hashes make stolen hashes expensive to crack. Base64 is just encoding." },
      { id: "s3", q: "A key was committed to git last month. What now?", options: ["Delete the line and commit", "Rotate the key, then remove it from history", "Make the repository private", "Nothing, it is old"], answer: 1, why: "Anyone with a copy of the history has it. Rotating makes the leaked key useless." },
      { id: "s4", q: "Which stops a script in a customer's message from running in an agent's browser?", options: ["Rendering it as text (escaping)", "A longer password", "HTTPS", "Rate limiting"], answer: 0, why: "Escaping turns < into &lt;, so HTML is shown, not run. React does this unless you use dangerouslySetInnerHTML." },
      { id: "s5", q: "Someone signs in from a new country at 3 am and exports all payroll. Good defences include:", options: ["Audit logs, alerts and least privilege", "A darker theme", "Bigger fonts", "More emojis"], answer: 0, why: "Give people only what they need, log sensitive actions, and alert on unusual ones." },
      { id: "s6", q: "Why use ? placeholders in SQL?", options: ["Speed only", "So values can never change the query (no SQL injection)", "To make it shorter", "Postgres requires it"], answer: 1, why: "The database receives the values separately from the query text." },
    ],
  },
];

// XP: 10 for a right answer, 5 for each right answer in a row after the first (a streak), levels every 100.
export const xpFor = (streak: number) => 10 + Math.max(0, streak - 1) * 5;
export const levelOf = (xp: number) => ({ level: Math.floor(xp / 100) + 1, into: xp % 100 });
