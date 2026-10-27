# Accounts and teams

`npm run db:reset` creates these accounts. Each gets a generated starting password. It's printed once and saved to `data/initial-credentials.md` on the machine that ran the command (that folder is never committed). Everyone must choose a new password at first sign-in. Delete the credentials file once the passwords have been handed out.

| Name | Email (sign-in) | Roles | Team lead of |
| --- | --- | --- | --- |
| Kidus | kidus@myseed.local | Admin | - |
| Biniyam | biniyam@myseed.local | Manager | - |
| Michael | michael@myseed.local | Recording | Recording |
| Wasihun | wasihun@myseed.local | Editing, Uploading, Publication | Editing |
| Amanuel | amanuel@myseed.local | Uploading, Publication | Uploading, Publication |

The email addresses are sign-in names only; nothing is ever sent to them. Change them to real addresses in **Admin → People** if you like.

## What each person can do

| Who | Can do |
| --- | --- |
| Admin (Kidus) | People and profiles, roles and permissions, teams and leads, access by grade and subject, workspace data (import, backup, empty). Creates new items and edits planning fields. Chooses, per role and per team lead, which sidebar pages and import or export options people see (**Admin → Roles and permissions**). |
| Manager (Biniyam) | Views everything and follows delivery: reports, team view, questions, exports. Does not edit item data or start work; Recording staff start items themselves. Home shows the Overview insights and quick actions. |
| Team lead | Everything their team does, plus: assign the team's work to members, get an alert whenever work arrives in their stage (handoffs and redo requests), see reports and the team page, and import their stage's progress. One person can lead several teams; a team can have several leads. The Recording lead can also create new items. |
| Team member | Works on their own stage only. Recording staff press **Start recording** on a new item and it shows In progress. On the Board they move only items in their stage and send them to the next team when ready, which alerts that team's leads. Everything else is view and comment. |
| Own-work member | A team member flagged **Own work only** in **Admin → Teams** sees only the items assigned to them, on every page, with a personal **My work** board. Use this for members under a team lead (for example editors under Wasihun). |

## Adding team members

1. **Admin → People → Add person.** Give them the stage role (for example Editing).
2. **Admin → Teams**: switch on **Own work only** for members who should see just their assigned work.
3. The team lead assigns work with right-click → **Assign to a team member** on any List, Sheet or Board row.
