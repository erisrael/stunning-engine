/*
 * Writes every import template (Excel with dropdowns and instructions, plus CSV) to ./templates.
 * Dropdown values come from the current database, so run it after seeding or after changing taxonomy.
 *
 *   npm run templates
 */
import fs from "node:fs";
import path from "node:path";
import { TEMPLATES, type TemplateKey } from "../src/server/importer";
import { templateCsv, templateXlsx } from "../src/server/templates";
import { closeDb } from "../src/server/db";

async function main() {
  const dir = path.join(process.cwd(), "templates");
  fs.mkdirSync(dir, { recursive: true });
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
    const base = `myseed-${key.replace(/_/g, "-")}-template`;
    fs.writeFileSync(path.join(dir, `${base}.csv`), templateCsv(key), "utf8");
    fs.writeFileSync(path.join(dir, `${base}.xlsx`), await templateXlsx(key));
    console.log(`Wrote templates/${base}.xlsx and .csv`);
  }
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
