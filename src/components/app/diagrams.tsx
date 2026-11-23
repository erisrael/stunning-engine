"use client";

// Diagrams in documents and the project book: Mermaid blocks drawn as pictures in the browser (class, sequence,
// entity-relationship, state, flow, Gantt, journey), and draw.io diagrams that open in the draw.io editor
// (embed.diagrams.net runs in the browser; the drawing is sent only to this app when saved).

import * as React from "react";
import { toast } from "sonner";
import { ChevronDownIcon, ShapesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createDiagramAction, loadDiagramAction, saveDiagramAction } from "@/app/actions/departments";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
const loadMermaid = () =>
  (mermaidReady ??= import("mermaid").then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default", fontFamily: "Inter, Segoe UI, Roboto, Arial, sans-serif" });
    return m.default;
  }));
let seq = 0;

// Draws the Mermaid blocks under `root` and adds Edit buttons to draw.io pictures (when `onEdit` is given).
export async function drawDiagrams(root: HTMLElement, onEdit?: (id: string) => void) {
  const blocks = [...root.querySelectorAll<HTMLElement>("figure[data-mermaid]:not(.is-drawn)")];
  if (blocks.length) {
    const mermaid = await loadMermaid().catch(() => null);
    for (const f of blocks) {
      const src = f.querySelector("code")?.textContent ?? "";
      if (!mermaid || !src.trim()) continue;
      try {
        const { svg } = await mermaid.render(`mmd-${Date.now().toString(36)}-${seq++}`, src);
        const box = document.createElement("div");
        box.className = "spec-mermaid-svg";
        box.innerHTML = svg;
        f.prepend(box);
        f.classList.add("is-drawn");
      } catch (e) {
        f.classList.add("is-broken");
        f.title = `This diagram has a mistake: ${(e as Error).message?.slice(0, 160) ?? ""}`;
      }
    }
  }
  if (onEdit)
    for (const f of root.querySelectorAll<HTMLElement>("figure[data-drawio]")) {
      if (f.querySelector(".spec-drawio-edit")) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "spec-drawio-edit";
      b.textContent = "Edit in draw.io";
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onEdit(f.dataset.drawio!);
      };
      f.append(b);
    }
}

// After a draw.io save, the pictures of that diagram load again.
export function refreshDiagram(id: string) {
  for (const img of document.querySelectorAll<HTMLImageElement>(`figure[data-drawio="${id}"] img`)) {
    const u = new URL(img.src, window.location.href);
    u.searchParams.set("v", String(Date.now()));
    img.src = u.pathname + u.search;
  }
}

const ORIGIN = "https://embed.diagrams.net";

// The draw.io editor, full screen. Save keeps the drawing and its picture; Exit closes.
export function DrawioEditor({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const state = React.useRef<{ xml: string; title: string; exit: boolean; loaded: boolean }>({ xml: "", title: "", exit: false, loaded: false });
  React.useEffect(() => {
    let alive = true;
    const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), ORIGIN);
    const load = async () => {
      const r = await loadDiagramAction(id);
      if (!alive) return;
      if (!r.ok) {
        toast.error(r.error);
        return onClose();
      }
      state.current.xml = r.data!.xml;
      state.current.title = r.data!.title;
      state.current.loaded = true;
    };
    const ready = load();
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let m: { event?: string; xml?: string; data?: string; exit?: boolean } = {};
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.event === "init") {
        await ready;
        post({ action: "load", xml: state.current.xml, title: state.current.title, autosave: 0 });
      } else if (m.event === "save") {
        state.current.xml = m.xml ?? state.current.xml;
        state.current.exit = !!m.exit;
        post({ action: "export", format: "xmlsvg", xml: state.current.xml, spinKey: "saving" });
      } else if (m.event === "export") {
        const r = await saveDiagramAction(id, { xml: state.current.xml, svg: m.data ?? "" });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        post({ action: "status", message: "Saved", modified: false });
        toast.success("Diagram saved");
        refreshDiagram(id);
        onSaved?.(id);
        if (state.current.exit) onClose();
      } else if (m.event === "exit") onClose();
    };
    window.addEventListener("message", onMsg);
    return () => {
      alive = false;
      window.removeEventListener("message", onMsg);
    };
  }, [id, onClose, onSaved]);
  return (
    <div className="fixed inset-0 z-[95] bg-background" role="dialog" aria-label="draw.io editor" data-drawio-editor>
      {/* draw.io has its own Save and Exit; this closes it if the editor cannot load (no internet). */}
      <button type="button" onClick={onClose} className="absolute right-2 bottom-2 z-10 rounded-md border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground" data-drawio-close>
        Close without saving
      </button>
      <iframe ref={frame} title="draw.io" className="size-full border-0" src={`${ORIGIN}/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=1&noExitBtn=0&ui=kennedy&lang=en`} allow="clipboard-read; clipboard-write" />
    </div>
  );
}

const SNIPPETS: { label: string; text: string }[] = [
  { label: "Class diagram", text: "```mermaid\nclassDiagram\n  class Order {\n    +string id\n    +total() number\n  }\n  class Customer {\n    +string name\n  }\n  Customer \"1\" --> \"*\" Order : places\n```" },
  { label: "Sequence diagram", text: "```mermaid\nsequenceDiagram\n  actor U as User\n  participant S as Server\n  U->>S: Request\n  S-->>U: Response\n```" },
  { label: "Entity-relationship (data)", text: "```mermaid\nerDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER {\n    text id PK\n    text customer_id FK\n  }\n```" },
  { label: "Use cases", text: "```mermaid\nflowchart LR\n  user([User])\n  subgraph System\n    a((Sign in))\n    b((Do the task))\n  end\n  user --- a & b\n```" },
  { label: "Flowchart", text: "```mermaid\nflowchart TD\n  A[Start] --> B{Decision}\n  B -- Yes --> C[Do it]\n  B -- No --> D[Stop]\n```" },
  { label: "States", text: "```mermaid\nstateDiagram-v2\n  [*] --> Draft\n  Draft --> Approved\n  Approved --> [*]\n```" },
  { label: "Schedule (Gantt)", text: "```mermaid\ngantt\n  dateFormat YYYY-MM-DD\n  Design :a, 2026-12-01, 14d\n  Build :b, after a, 30d\n```" },
];

// The editor's Diagram menu: a Mermaid diagram written as text, or a draw.io drawing (opens the editor).
export function InsertDiagramMenu({ dept, projectId, onInsert, disabled }: { dept: string; projectId?: string | null; onInsert: (text: string) => void; disabled?: boolean }) {
  const [editing, setEditing] = React.useState<{ id: string; title: string } | null>(null);
  const drawio = async (starter: string, title: string) => {
    const r = await createDiagramAction(dept, { title, projectId: projectId ?? null, starter });
    if (!r.ok) return void toast.error(r.error);
    onInsert(`![${title}](/api/diagrams/${r.data!.id})`);
    setEditing({ id: r.data!.id, title });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled} data-insert-diagram>
            <ShapesIcon /> Diagram <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>draw.io (draw and edit)</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void drawio("blank", "Diagram")} data-drawio-new="blank">Blank drawing</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void drawio("class", "Class diagram")}>Class diagram</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void drawio("sequence", "Sequence diagram")}>Sequence diagram</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void drawio("flow", "Flowchart")}>Flowchart</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Written as text (Mermaid)</DropdownMenuLabel>
          {SNIPPETS.map((s) => (
            <DropdownMenuItem key={s.label} onSelect={() => onInsert(s.text)} data-mermaid-snippet={s.label}>
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <DrawioEditor id={editing.id} onClose={() => setEditing(null)} />}
    </>
  );
}

// Draws the diagrams inside an element whenever its HTML changes; draw.io pictures get Edit buttons when editable.
export function useDiagrams(ref: React.RefObject<HTMLElement | null>, html: string, editable: boolean) {
  const [editing, setEditing] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (ref.current) void drawDiagrams(ref.current, editable ? setEditing : undefined);
  }, [ref, html, editable]);
  const editor = editing ? <DrawioEditor id={editing} onClose={() => setEditing(null)} /> : null;
  return editor;
}
