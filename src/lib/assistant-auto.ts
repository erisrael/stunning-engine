import type { ShowStep } from "./assistant";

// "Do it for me" (Update 1.0 spec, AI Assistant: "when a button is selected it should do tasks on its own:
// browse pages, hover and press buttons; forms and imports are done by the user; exports by the AI only if
// requested and allowed for that role"). The rules for what the assistant presses itself.

// Buttons that change or remove something for good, decide for someone, or move money: the person presses them.
export const RISKY = /\b(delete|remove|archive|reject|decline|approve|refund|withdraw|transfer|pay|send|submit|publish|revoke|reset|sign out|log out|deactivate|purge|clear)\b/i;
export const IMPORT = /\b(import|upload|attach|choose file)\b/i;
export const EXPORT = /\b(export|download)\b/i;

// The parts of an element the rules read (an HTMLElement in the browser).
export type AutoTarget = {
  tagName: string;
  isContentEditable?: boolean;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(sel: string): unknown;
  closest(sel: string): unknown;
};

export function autoKind(el: AutoTarget, step: ShowStep, autoExport: boolean): "click" | "hover" | "user" {
  if (step.act === "hover") return "hover";
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") ?? "").toLowerCase();
  const role = el.getAttribute("role");
  // Typing and choosing values: the person's.
  if (["input", "textarea", "select"].includes(tag) || el.isContentEditable || role === "combobox" || role === "textbox") return "user";
  if (type === "file" || el.querySelector("input[type=file]")) return "user";
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`.trim();
  if (EXPORT.test(label)) return autoExport ? "click" : "user";
  if (IMPORT.test(label)) return "user";
  // Links and tabs only move between pages and sections: always safe to press.
  if ((tag === "a" && !!el.getAttribute("href")) || role === "tab") return "click";
  if (RISKY.test(label)) return "user";
  // Saving a form is the person's (navigation-only steps the flow marks as "click" are pressed).
  if (type === "submit" || (!!el.closest("form") && tag === "button" && type !== "button")) return step.act === "click" ? "click" : "user";
  return "click";
}

// A written tutorial as steps the assistant can carry out: "press X" / "choose X" names the control to press.
export function guideSteps(f: { steps: string[]; href?: string }): ShowStep[] {
  return f.steps.map((t, n) => {
    const m = t.match(/\b(?:[Pp]ress|[Tt]ap|[Cc]lick|[Cc]hoose|[Pp]ick|[Ss]elect)\s+(?:the\s+)?(?:"([^"]+)"|“([^”]+)”|([A-Z][^.,;:"]*?))(?=\s+(?:and|to|then|on|in|under|beside|at|for)\b|[.,;:]|$)/);
    const text = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
    return { ...(n === 0 && f.href ? { href: f.href } : {}), ...(text && text.length <= 40 ? { text } : {}), note: t };
  });
}
