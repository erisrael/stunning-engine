// Fresh demo workspace for the workflow video: one person per team plus a lead, a small curriculum, no history.
// Run from the repo with PGLITE_DIR pointing at a throwaway folder and DATABASE_URL empty.
import { closeDb, run } from "../../src/server/db";
import { DEFAULT_SETTINGS, saveSetting } from "../../src/server/settings";
import { emptyWorkspace, importCurriculumBackup, upsertAccount } from "../../src/server/workspace-data";

const PASSWORD = "Demo-Workflow-2026";
const PEOPLE = [
  { key: "admin", name: "Admin", email: "admin@demo.local", title: "Administrator", roles: ["admin"], leads: [] },
  { key: "hana", name: "Hana", email: "hana@demo.local", title: "Recording team lead", roles: ["recording"], leads: ["recording"] },
  { key: "dawit", name: "Dawit", email: "dawit@demo.local", title: "Camera operator", roles: ["recording"], leads: [] },
  { key: "meron", name: "Meron", email: "meron@demo.local", title: "Editing team lead", roles: ["editing"], leads: ["editing"] },
  { key: "yonas", name: "Yonas", email: "yonas@demo.local", title: "Video editor", roles: ["editing"], leads: [] },
  { key: "liya", name: "Liya", email: "liya@demo.local", title: "Uploading team lead", roles: ["uploading"], leads: ["uploading"] },
  { key: "abel", name: "Abel", email: "abel@demo.local", title: "Uploader", roles: ["uploading"], leads: [] },
  { key: "sara", name: "Sara", email: "sara@demo.local", title: "Publication team lead", roles: ["publication"], leads: ["publication"] },
] as const;

const part = (id: string, title: string) => ({ id, title, videos: [] });

async function main() {
  await emptyWorkspace();
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) await saveSetting(key, structuredClone(DEFAULT_SETTINGS[key]) as never);
  const ids: Record<string, string> = {};
  const seen = JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } });
  for (const p of PEOPLE) {
    ids[p.key] = (await upsertAccount({ name: p.name, email: p.email, title: p.title, roles: [...p.roles], password: PASSWORD, mustChangePassword: false })).id;
    await run("UPDATE users SET prefs = ? WHERE id = ?", seen, ids[p.key]);
    for (const st of p.leads) await run("INSERT INTO team_leads (stage, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", st, ids[p.key]);
  }
  await importCurriculumBackup(
    {
      "grade-9": {
        name: "Grade 9",
        type: "Secondary School",
        subjects: [
          {
            id: "g9-bio",
            name: "Biology",
            units: [
              {
                id: "u-bio-1",
                title: "Unit 1: Introduction to biology",
                parts: [part("p-bio-1", "Part 1: What is biology?"), part("p-bio-2", "Part 2: The scientific method"), part("p-bio-3", "Part 3: Tools of a biologist"), part("p-bio-4", "Part 4: Safety in the lab")],
              },
            ],
          },
        ],
      },
    } as never,
    { createItems: true, actorId: ids.hana, fileName: "demo.json" },
  );
  console.log(JSON.stringify(ids));
  await closeDb();
}
main();
