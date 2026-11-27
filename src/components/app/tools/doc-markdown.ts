// Documents as Markdown and back (no browser APIs, so the server uses it too: the Claude and ChatGPT connectors
// write and read documents as Markdown).

import { bid, type Block } from "./doc-model";

// Blocks back to Markdown, for Notion and for a .md download.
export function toMarkdown(title: string, blocks: Block[]) {
  return [
    `# ${title}`,
    "",
    ...blocks.map((b) => {
      switch (b.type) {
        case "heading":
          return `${"#".repeat(b.level + (b.level < 3 ? 1 : 0))} ${b.text}`;
        case "paragraph":
          return b.text;
        case "list":
          return b.items.map((i, n) => (b.ordered ? `${n + 1}. ${i}` : `- ${i}`)).join("\n");
        case "table":
          return b.rows.map((r, i) => `| ${r.join(" | ")} |${i === 0 && b.header ? `\n|${r.map(() => "---").join("|")}|` : ""}`).join("\n");
        case "quote":
          return `> ${b.text}`;
        case "toc":
          return `**${b.title || "Contents"}**`;
        case "columns":
          return `${b.left}\n\n${b.right}`;
        case "image":
          return `![${b.caption ?? ""}](picture)`;
        case "textbox":
          return `> ${b.text}`;
        case "pagebreak":
        case "section":
          return "\n---\n";
        default:
          return "---";
      }
    }),
  ].join("\n\n");
}

// Markdown (or plain text) to blocks: headings, lists, tables, quotes, rules, paragraphs.
export function markdownToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.join("").trim()) out.push({ id: bid(), type: "paragraph", text: para.join("\n").trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      flush();
      out.push({ id: bid(), type: "heading", level: Math.min(3, h[1]!.length) as 1 | 2 | 3, text: h[2]! });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d/.test(l);
      const items: string[] = [];
      const checked: boolean[] = [];
      let boxes = 0;
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) {
        const t = lines[i]!.replace(/^\s*([-*+]|\d+[.)])\s+/, "");
        const c = /^\[( |x|X)\]\s*/.exec(t);
        items.push(c ? t.slice(c[0].length) : t);
        checked.push(!!c && c[1] !== " ");
        if (c) boxes++;
        i++;
      }
      i--;
      const isCheck = boxes > 0 && boxes === items.length;
      out.push({ id: bid(), type: "list", ordered: ordered && !isCheck, items, ...(isCheck ? { style: "check" as const, checked } : {}) });
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) {
        if (!/^\|[\s:|-]+\|\s*$/.test(lines[i]!)) rows.push(lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      out.push({ id: bid(), type: "table", header: true, rows });
      continue;
    }
    if (/^>\s?/.test(l)) {
      flush();
      out.push({ id: bid(), type: "quote", text: l.replace(/^>\s?/, "") });
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      flush();
      out.push({ id: bid(), type: "divider" });
      continue;
    }
    if (!l.trim()) flush();
    else para.push(l);
  }
  flush();
  return out.length ? out : [{ id: bid(), type: "paragraph", text: "" }];
}
