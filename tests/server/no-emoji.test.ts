// No emojis in the product (Update 1.1): pages, bot texts, seeds and scripts use monochrome icons. The chat emoji
// picker is the one exception (team chat and the support conversation's chat kit), since people choose those themselves. Old help menus saved with emojis read as icons.
import fs from "node:fs";
import path from "node:path";
import { supportIconKey } from "../../src/lib/support-icon-keys";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 800)}` : ""}`);
};

const ALLOWED = [path.join("src", "app", "(app)", "chat", "chat-extras.tsx"), path.join("src", "components", "support-chat", "kit.tsx")];
const emoji = /\p{Extended_Pictographic}/u;
const found: string[] = [];
function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs|cjs|js|css|html|sql)$/.test(f) && st.size < 3e6 && !ALLOWED.includes(p))
      fs.readFileSync(p, "utf8")
        .split("\n")
        .forEach((l, i) => emoji.test(l) && found.push(`${p}:${i + 1}`));
  }
}
for (const root of ["src", "public", "scripts"]) if (fs.existsSync(root)) walk(root);
check("no emojis in src, public or scripts", found.length === 0, found);
check("old emoji icons read as icon keys", supportIconKey("\u{1F4B3}") === "card" && supportIconKey("⚡") === "zap" && supportIconKey("zap") === "zap" && supportIconKey(null) === "chat");
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
