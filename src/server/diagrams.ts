// draw.io (diagrams.net) diagrams in a department's documents: the editable drawing (draw.io XML) and its picture
// (SVG, with the drawing inside so it opens again for editing). A document shows the picture with
// ![Title](/api/diagrams/<id>); "Edit in draw.io" opens the editor (embed.diagrams.net, which runs in the browser:
// the drawing is not sent to a server) and saving replaces both. Starter drawings: blank, class, sequence, flow.

import { get, nowIso, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { workAccess } from "./dept-config";
import type { AppUser } from "./users";

const MAX = 4_000_000;
export type DiagramRow = { id: string; dept: string; project_id: string | null; title: string; xml: string; svg: string; updated_at: string };

export async function getDiagram(user: AppUser, id: string) {
  const r = await get<DiagramRow>("SELECT * FROM dept_diagrams WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Diagram not found.");
  await workAccess(user, r.dept);
  return r;
}

export async function createDiagram(user: AppUser, d: string, input: { title?: string | null; projectId?: string | null; starter?: string | null }) {
  const a = await workAccess(user, d, "write");
  const id = uid("dgm_");
  const now = nowIso();
  const title = (input.title ?? "").trim().slice(0, 120) || "Diagram";
  const xml = STARTERS[input.starter ?? "blank"] ?? STARTERS.blank!;
  await run("INSERT INTO dept_diagrams (id, dept, project_id, title, xml, svg, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)", id, a.dept, input.projectId ?? null, title, xml, user.id, user.id, now, now);
  await audit({ actor: user }, { action: `${a.dept}.diagram`, summary: `${user.name} started the diagram "${title}"` });
  return { id, title, xml };
}

export async function saveDiagram(user: AppUser, id: string, input: { xml: string; svg: string; title?: string | null }) {
  const r = await get<DiagramRow>("SELECT * FROM dept_diagrams WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Diagram not found.");
  await workAccess(user, r.dept, "write");
  if (typeof input.xml !== "string" || typeof input.svg !== "string" || input.xml.length > MAX || input.svg.length > MAX * 2) throw new WorkflowError("VALIDATION", "The diagram is too big.");
  const svg = input.svg.startsWith("data:image/svg+xml;base64,") ? Buffer.from(input.svg.slice(26), "base64").toString("utf8") : input.svg;
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw new WorkflowError("VALIDATION", "That is not a diagram picture.");
  await run("UPDATE dept_diagrams SET xml = ?, svg = ?, title = COALESCE(?, title), updated_by = ?, updated_at = ? WHERE id = ?", input.xml, svg, input.title?.trim().slice(0, 120) || null, user.id, nowIso(), id);
}

// Starter drawings (draw.io XML), so a class or sequence diagram does not start from nothing.
const cell = (id: string, value: string, style: string, x: number, y: number, w: number, h: number, parent = "1") =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, style: string, value = "") => `<mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const wrapXml = (cells: string) => `<mxfile><diagram name="Page-1"><mxGraphModel grid="1" gridSize="10" page="1" pageWidth="850" pageHeight="1100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
const CLASS = "swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;collapsible=0;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;";
const FIELD = "text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;html=1;";
export const STARTERS: Record<string, string> = {
  blank: wrapXml(""),
  class: wrapXml(
    cell("c1", "User", CLASS, 40, 40, 180, 112) +
      cell("c1a", "+ id: string<br>+ name: string<br>+ roles: Role[]", FIELD, 0, 26, 180, 50, "c1") +
      cell("c1b", "+ can(cap): boolean", FIELD, 0, 76, 180, 30, "c1") +
      cell("c2", "Project", CLASS, 340, 40, 180, 112) +
      cell("c2a", "+ id: string<br>+ key: string<br>+ status: string", FIELD, 0, 26, 180, 50, "c2") +
      cell("c2b", "+ progress(): number", FIELD, 0, 76, 180, 30, "c2") +
      edge("e1", "c1", "c2", "endArrow=open;html=1;endSize=12;", "leads 1..*"),
  ),
  sequence: wrapXml(
    cell("u", "User", "shape=umlLifeline;perimeter=lifelinePerimeter;container=1;collapsible=0;size=40;html=1;", 40, 40, 100, 300) +
      cell("p", "Page", "shape=umlLifeline;perimeter=lifelinePerimeter;container=1;collapsible=0;size=40;html=1;", 220, 40, 100, 300) +
      cell("s", "Server", "shape=umlLifeline;perimeter=lifelinePerimeter;container=1;collapsible=0;size=40;html=1;", 400, 40, 100, 300) +
      cell("db", "Database", "shape=umlLifeline;perimeter=lifelinePerimeter;container=1;collapsible=0;size=40;html=1;", 580, 40, 100, 300),
  ),
  flow: wrapXml(
    cell("a", "Start", "ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;", 160, 30, 120, 50) +
      cell("b", "Do the work", "rounded=1;whiteSpace=wrap;html=1;", 160, 120, 120, 60) +
      cell("c", "Done?", "rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;", 170, 220, 100, 80) +
      cell("d", "End", "ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;", 160, 340, 120, 50) +
      edge("e1", "a", "b", "endArrow=block;html=1;") +
      edge("e2", "b", "c", "endArrow=block;html=1;") +
      edge("e3", "c", "d", "endArrow=block;html=1;", "Yes"),
  ),
};
