import { all, get, run, uid, nowIso, parseJson, tx } from "./db";
import { requireDept, deptManagers, deptPeople } from "./departments";
import { listProjects } from "./work";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import type { AppUser } from "./users";

export type BoardCard = { id: string; lane: string; title: string; author: string; text: string; createdAt: string; projectId?: string; feature?: string; members?: string[]; replies?: { author: string; text: string; at: string }[] };
export type OneOnOne = { id: string; devId: string; devName: string; topic: string; preferredDate: string; timeSlot: string; notes: string; status: "requested" | "confirmed" | "completed" };
type Row = { id: string; author_id: string; project_id: string | null; body_json: string };
async function visible(user: AppUser, dept: string, row: Row, manage: boolean) {
  if (manage || row.author_id === user.id) return true;
  const data = parseJson<BoardCard>(row.body_json, {} as BoardCard);
  if (data.members?.length) return data.members.includes(user.id);
  if (!row.project_id) return true;
  return !!await get("SELECT id FROM dept_tasks WHERE dept = ? AND project_id = ? AND assignee_id = ? LIMIT 1", dept, row.project_id, user.id);
}
export async function collaborationView(user: AppUser, dept: string) {
  const access = await requireDept(user, dept);
  const rows = await all<Row & { kind: string }>("SELECT * FROM dev_collaboration WHERE dept = ? ORDER BY created_at DESC", dept);
  const cards: BoardCard[] = []; const sessions: OneOnOne[] = [];
  for (const row of rows) {
    if (row.kind === "session" && (access.manage || row.author_id === user.id)) sessions.push(parseJson<OneOnOne>(row.body_json, {} as OneOnOne));
    if (row.kind === "card" && await visible(user, dept, row, access.manage)) cards.push(parseJson<BoardCard>(row.body_json, {} as BoardCard));
  }
  const setting = await get<{value:string}>("SELECT value FROM settings WHERE key = ?", `dev.board.${dept}`);
  return { cards, sessions, enabled: setting?.value !== "closed", canManage: access.manage, readOnly: access.readOnly, projects: await listProjects(user, dept), people: (await deptPeople(dept)).map(p => ({id:p.id,name:p.name})) };
}
async function changeCollaborationLocked(user: AppUser, dept: string, input: { action: "card" | "delete" | "reply" | "enabled" | "session" | "status"; id?: string; card?: Partial<BoardCard>; session?: Partial<OneOnOne>; enabled?: boolean; text?: string; status?: OneOnOne["status"] }) {
  const access = await requireDept(user, dept, "write");
  const now = nowIso();
  if (input.action === "enabled") {
    if (!access.manage) throw new WorkflowError("FORBIDDEN", "Only the team lead configures discussions.");
    await run("INSERT INTO settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at,updated_by=excluded.updated_by", `dev.board.${dept}`, input.enabled ? "open" : "closed", now, user.id);
    return;
  }
  const existing = input.id ? await get<Row & {kind:string}>("SELECT * FROM dev_collaboration WHERE id = ? AND dept = ? FOR UPDATE", input.id, dept) : undefined;
  if (input.id && !existing) throw new WorkflowError("NOT_FOUND", "Entry not found.");
  if (existing && !(existing.kind === "session" ? access.manage || existing.author_id === user.id : await visible(user, dept, existing, access.manage))) throw new WorkflowError("FORBIDDEN", "This discussion is not shared with you.");
  if (input.action === "delete") {
    if (!access.manage && existing?.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only the author or team lead can remove this card.");
    await run("DELETE FROM dev_collaboration WHERE id = ? AND dept = ?", input.id!, dept); return;
  }
  let kind = "card"; let body: BoardCard | OneOnOne; let projectId: string | null = null;
  if (input.action === "session") {
    const session = input.session ?? {};
    if (!session.topic?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(session.preferredDate ?? "") || !session.timeSlot?.trim()) throw new WorkflowError("VALIDATION", "Provide the topic, date and time.");
    const devId = access.manage ? session.devId || user.id : user.id;
    const person = (await deptPeople(dept)).find(p => p.id === devId);
    if (!person && devId !== user.id) throw new WorkflowError("VALIDATION", "Choose a department member.");
    kind = "session";
    body = { id: uid(), devId, devName: person?.name ?? user.name, topic: session.topic.trim().slice(0,200), preferredDate: session.preferredDate!, timeSlot: session.timeSlot.slice(0,40), notes: (session.notes ?? "").slice(0,5000), status: "requested" };
    await run("INSERT INTO dev_collaboration (id,dept,kind,author_id,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", body.id,dept,kind,devId,JSON.stringify(body),now,now);
    await notify(await deptManagers(dept), { type: "approval", title: "One-to-one requested", body: `${body.devName}: ${body.topic}`, link: dept === "dev" ? "/dev/sprint" : `/d/${dept}/sprint`, dedupeKey: `session:${body.id}` },now,user.id);
    return;
  } else if (input.action === "status") {
    if (!access.manage || existing?.kind !== "session") throw new WorkflowError("FORBIDDEN", "Only the team lead can confirm or complete sessions.");
    const session = parseJson<OneOnOne>(existing.body_json, {} as OneOnOne);
    if (!((session.status === "requested" && input.status === "confirmed") || (session.status === "confirmed" && input.status === "completed"))) throw new WorkflowError("INVALID_STATE", "Confirm a requested session before completing it.");
    kind = "session"; body = {...session,status:input.status!};
  } else {
    const setting = await get<{value:string}>("SELECT value FROM settings WHERE key = ?", `dev.board.${dept}`);
    if (setting?.value === "closed" && !access.manage) throw new WorkflowError("FORBIDDEN", "The team lead has closed this whiteboard.");
    const old = existing ? parseJson<BoardCard>(existing.body_json, {} as BoardCard) : undefined;
    if (input.action === "reply") {
      if (!old || existing?.kind !== "card" || !input.text?.trim()) throw new WorkflowError("VALIDATION", "Enter a reply to an existing discussion.");
      body = {...old,replies:[...(old.replies ?? []),{author:user.name,text:input.text.trim().slice(0,5000),at:now}]};
      projectId = existing.project_id;
    } else {
      if (existing && !access.manage && existing.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only the author or lead can edit a card.");
      const card = {...old,...input.card};
      if (!card.title?.trim() || !card.text?.trim() || !["architecture","techdebt","spikes","discussions"].includes(card.lane ?? "")) throw new WorkflowError("VALIDATION", "Provide a title, details and valid lane.");
      if (!access.manage && input.card?.members) throw new WorkflowError("FORBIDDEN", "Only the lead sets discussion visibility.");
      projectId = card.projectId || null;
      if (projectId && !await get("SELECT id FROM dept_projects WHERE id = ? AND dept = ?",projectId,dept)) throw new WorkflowError("VALIDATION", "Choose a project in this department.");
      const memberIds = (await deptPeople(dept)).map(p=>p.id);
      body = { id: existing?.id ?? uid(), lane:card.lane!,title:card.title.trim().slice(0,200),text:card.text.trim().slice(0,10000),author:old?.author ?? user.name,createdAt:old?.createdAt ?? now,projectId:projectId ?? undefined,feature:(card.feature ?? "").slice(0,100),members:(card.members ?? []).filter(id=>memberIds.includes(id)),replies:old?.replies ?? [] };
    }
  }
  if (existing) await run("UPDATE dev_collaboration SET body_json=?,project_id=?,updated_at=? WHERE id=? AND dept=?",JSON.stringify(body),projectId,now,existing.id,dept);
  else await run("INSERT INTO dev_collaboration (id,dept,kind,author_id,project_id,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",body.id,dept,kind,user.id,projectId,JSON.stringify(body),now,now);
  await audit({actor:user},{action:"dev.collaboration",summary:`${user.name} saved ${kind} in ${dept}`});
}

export async function changeCollaboration(...args: Parameters<typeof changeCollaborationLocked>) {
 return tx(() => changeCollaborationLocked(...args));
}
