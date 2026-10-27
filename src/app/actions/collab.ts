"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { all, get, nowIso, parseJson, run, uid } from "@/server/db";
import { canViewItem, isManager } from "@/server/users";
import { managers, notify } from "@/server/notifications";
import { directGroup, postCard } from "@/server/chat";
import { audit, WorkflowError } from "@/server/workflow";

async function mentionedUserIds(body: string) {
  const handles = [...body.matchAll(/@([a-z0-9.]+)/gi)].map((m) => m[1].toLowerCase().replace(/\.$/, ""));
  if (!handles.length) return [];
  return (await all<{ id: string; handle: string }>(
      `SELECT id, handle FROM users WHERE active = 1 AND handle IN (${handles.map(() => "?").join(",")})`,
      ...handles,
    )).map((u) => u.id);
}

async function itemCode(itemId: string | null | undefined) {
  return itemId ? (await get<{ code: string }>("SELECT code FROM items WHERE id = ?", itemId))?.code ?? "" : "";
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addCommentAction(input: {
  targetType: "item" | "attempt" | "asset" | "field" | "report";
  targetId: string;
  itemId?: string | null;
  stage?: string | null;
  field?: string | null;
  assetId?: string | null;
  timecode?: string | null;
  parentId?: string | null;
  body: string;
  context?: Record<string, unknown> | null;
}) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const body = input.body.trim();
    if (!body) throw new WorkflowError("VALIDATION", "Write a comment first.");
    if (body.length > 5000) throw new WorkflowError("VALIDATION", "Comments are limited to 5,000 characters.");
    if (input.itemId && !await canViewItem(viewer, input.itemId)) throw new WorkflowError("FORBIDDEN", "This item is outside your access scope.");
    if (input.timecode && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(input.timecode)) throw new WorkflowError("VALIDATION", "Use a timecode like 03:42.");
    const now = nowIso();
    const id = uid("cm_");
    await run(
            `INSERT INTO comments (id, target_type, target_id, item_id, stage, field, asset_id, timecode, parent_id, author_id, body, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            input.targetType,
            input.targetId,
            input.itemId ?? null,
            input.stage ?? null,
            input.field ?? null,
            input.assetId ?? null,
            input.timecode ?? null,
            input.parentId ?? null,
            viewer.id,
            body,
            input.context ? JSON.stringify(input.context) : null,
            now,
          );
    const link = input.itemId ? `/items/${input.itemId}?tab=discussion#${id}` : input.targetType === "report" ? "/reports" : "/dashboard";
    const mentioned: string[] = [];
    for (const u of await mentionedUserIds(body))
      if (!input.itemId || (await canViewItem({ ...viewer, id: u, scopes: await loadScopes(u) }, input.itemId))) mentioned.push(u);
    await notify(mentioned, { type: "mention", title: `${viewer.name} mentioned you${input.itemId ? ` on ${await itemCode(input.itemId)}` : ""}`, body: body.slice(0, 160), link, itemId: input.itemId, dedupeKey: `mention:${id}` }, now, viewer.id);
    if (input.parentId) {
      const parent = await get<{ author_id: string }>("SELECT author_id FROM comments WHERE id = ?", input.parentId);
      if (parent && !mentioned.includes(parent.author_id))
        await notify([parent.author_id], { type: "mention", title: `${viewer.name} replied to your comment`, body: body.slice(0, 160), link, itemId: input.itemId, groupKey: `thread:${input.parentId}` }, now, viewer.id);
    }
    return id;
  });
}

async function loadScopes(userId: string) {
  return (await all<{ grade_id: string | null; subject_id: string | null }>("SELECT grade_id, subject_id FROM access_scopes WHERE user_id = ?", userId)).map((s) => ({
    gradeId: s.grade_id,
    subjectId: s.subject_id,
  }));
}

export async function editCommentAction(id: string, body: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const c = await get<{ author_id: string; body: string; edit_history: string; deleted_at: string | null }>("SELECT author_id, body, edit_history, deleted_at FROM comments WHERE id = ?", id);
    if (!c || c.deleted_at) throw new WorkflowError("NOT_FOUND", "Comment not found.");
    if (c.author_id !== viewer.id) throw new WorkflowError("FORBIDDEN", "You can only edit your own comments.");
    if (!body.trim()) throw new WorkflowError("VALIDATION", "A comment cannot be empty.");
    const hist = parseJson<{ body: string; at: string }[]>(c.edit_history, []);
    hist.push({ body: c.body, at: nowIso() });
    await run("UPDATE comments SET body = ?, edited_at = ?, edit_history = ? WHERE id = ?", body.trim(), nowIso(), JSON.stringify(hist), id);
  });
}

export async function deleteCommentAction(id: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const c = await get<{ author_id: string; item_id: string | null }>("SELECT author_id, item_id FROM comments WHERE id = ?", id);
    if (!c) throw new WorkflowError("NOT_FOUND", "Comment not found.");
    if (c.author_id !== viewer.id && !isManager(viewer)) throw new WorkflowError("FORBIDDEN", "You can only delete your own comments.");
    await run("UPDATE comments SET deleted_at = ? WHERE id = ?", nowIso(), id);
    if (c.item_id) await audit({ actor: viewer }, { itemId: c.item_id, action: "comment.deleted", summary: `${viewer.name} deleted a comment` });
  });
}

export async function resolveCommentAction(id: string, resolved: boolean) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const c = await get<{ item_id: string | null }>("SELECT item_id FROM comments WHERE id = ?", id);
    if (!c) throw new WorkflowError("NOT_FOUND", "Comment not found.");
    if (c.item_id && !await canViewItem(viewer, c.item_id)) throw new WorkflowError("FORBIDDEN", "Outside your scope.");
    await run("UPDATE comments SET resolved = ?, resolved_by = ? WHERE id = ?", resolved ? 1 : 0, resolved ? viewer.id : null, id);
  });
}

export async function reactCommentAction(id: string, reaction: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!["agree", "thanks", "seen"].includes(reaction)) throw new WorkflowError("VALIDATION", "Unknown reaction.");
    const exists = await get("SELECT 1 AS x FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?", id, viewer.id, reaction);
    if (exists) await run("DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?", id, viewer.id, reaction);
    else await run("INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)", id, viewer.id, reaction);
  });
}

// ---------------------------------------------------------------------------
// Manager questions
// ---------------------------------------------------------------------------

export async function askQuestionAction(input: { itemId?: string | null; ownerId: string; question: string; dueAt?: string | null; contextType?: string; context?: Record<string, unknown> | null; stage?: string | null }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!input.question.trim()) throw new WorkflowError("VALIDATION", "Write the question.");
    if (input.ownerId === viewer.id) throw new WorkflowError("VALIDATION", "Choose who should answer.");
    if (input.itemId && !(await canViewItem(viewer, input.itemId))) throw new WorkflowError("FORBIDDEN", "This item is outside your access.");
    const id = uid("q_");
    const now = nowIso();
    await run(
            `INSERT INTO manager_questions (id, item_id, stage, context_type, context, asked_by, owner_id, question, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            input.itemId ?? null,
            input.stage ?? null,
            input.contextType ?? (input.itemId ? "item" : "general"),
            input.context ? JSON.stringify(input.context) : null,
            viewer.id,
            input.ownerId,
            input.question.trim(),
            input.dueAt ?? null,
            now,
          );
    if (input.itemId) await audit({ actor: viewer }, { itemId: input.itemId, action: "question.asked", summary: `${viewer.name} asked a question`, reason: input.question });
    // The question also appears as a card in the direct chat between the two people.
    const code = await itemCode(input.itemId);
    await postCard(await directGroup(viewer.id, input.ownerId), viewer.id, {
      kind: "question",
      body: `${code ? `${code}: ` : ""}${input.question.trim()}`,
      itemId: input.itemId ?? null,
      meta: { questionId: id },
    });
    await notify(
            [input.ownerId],
            { type: "question", title: `Question from ${viewer.name}${input.itemId ? ` on ${await itemCode(input.itemId)}` : ""}`, body: input.question.slice(0, 160), link: input.itemId ? `/items/${input.itemId}?tab=discussion` : "/questions", itemId: input.itemId, dedupeKey: `question:${id}` },
            now,
          );
    return id;
  });
}

export async function answerQuestionAction(id: string, answer: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const q = await get<{ owner_id: string; asked_by: string; item_id: string | null; status: string }>("SELECT owner_id, asked_by, item_id, status FROM manager_questions WHERE id = ?", id);
    if (!q) throw new WorkflowError("NOT_FOUND", "Question not found.");
    if (q.owner_id !== viewer.id && !isManager(viewer)) throw new WorkflowError("FORBIDDEN", "Only the person asked can answer.");
    if (!answer.trim()) throw new WorkflowError("VALIDATION", "Write an answer.");
    const now = nowIso();
    await run("UPDATE manager_questions SET answer = ?, answered_at = ?, status = 'answered' WHERE id = ?", answer.trim(), now, id);
    if (q.item_id) await audit({ actor: viewer }, { itemId: q.item_id, action: "question.answered", summary: `${viewer.name} answered a question`, reason: answer });
    await notify([q.asked_by], { type: "question", title: `${viewer.name} answered your question`, body: answer.slice(0, 160), link: q.item_id ? `/items/${q.item_id}?tab=discussion` : "/questions", itemId: q.item_id, dedupeKey: `answered:${id}:${now}` }, now);
  });
}

export async function resolveQuestionAction(id: string, reopen = false) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const q = await get<{ asked_by: string }>("SELECT asked_by FROM manager_questions WHERE id = ?", id);
    if (!q) throw new WorkflowError("NOT_FOUND", "Question not found.");
    if (!isManager(viewer)) throw new WorkflowError("FORBIDDEN", "Only managers can resolve questions.");
    await run("UPDATE manager_questions SET status = ?, resolved_at = ? WHERE id = ?", reopen ? "open" : "resolved", reopen ? null : nowIso(), id);
  });
}

export async function escalateQuestionAction(id: string, note: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!isManager(viewer)) throw new WorkflowError("FORBIDDEN", "Only managers can escalate.");
    const q = await get<{ escalation_level: number; escalation_history: string; owner_id: string; question: string; item_id: string | null }>("SELECT * FROM manager_questions WHERE id = ?", id);
    if (!q) throw new WorkflowError("NOT_FOUND", "Question not found.");
    const hist = parseJson<unknown[]>(q.escalation_history, []);
    hist.push({ at: nowIso(), level: q.escalation_level + 1, by: viewer.name, note });
    await run("UPDATE manager_questions SET escalation_level = ?, escalation_history = ? WHERE id = ?", q.escalation_level + 1, JSON.stringify(hist), id);
    await notify([q.owner_id, ...await managers()], { type: "question", title: "Question escalated", body: `${q.question.slice(0, 100)}${note ? ` (${note})` : ""}`, link: q.item_id ? `/items/${q.item_id}?tab=discussion` : "/questions", itemId: q.item_id, dedupeKey: `escalate:${id}:${hist.length}` }, nowIso(), viewer.id);
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function listNotificationsAction(tab: string) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      const now = nowIso();
      const where = ["user_id = ?", "(snoozed_until IS NULL OR snoozed_until <= ?)"];
      const params: string[] = [viewer.id, now];
      if (tab === "unread") where.push("read_at IS NULL");
      if (tab === "mentions") where.push("type IN ('mention','discussion')");
      if (tab === "assignments") where.push("type IN ('assignment','handoff')");
      if (tab === "approvals") where.push("type IN ('approval','question')");
      if (tab === "alerts") where.push("type IN ('deadline','overdue','blocker','failure','published','job')");
      return await all<{ id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; updated_at: string; count: number; essential: number }>(
              `SELECT id, type, title, body, link, read_at, created_at, updated_at, count, essential FROM notifications WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 60`,
              ...params,
            );
    },
    { revalidate: false },
  );
}

export async function markNotificationsAction(ids: string[] | "all", read = true) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const now = nowIso();
    if (ids === "all") await run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now, viewer.id);
    else for (const id of ids) await run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?", read ? now : null, id, viewer.id);
  });
}

export async function snoozeNotificationAction(id: string, hours: number) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await run("UPDATE notifications SET snoozed_until = ? WHERE id = ? AND user_id = ?", new Date(Date.now() + hours * 3600e3).toISOString(), id, viewer.id);
  });
}

// ---------------------------------------------------------------------------
// Comment listing for threads (item, field, asset or topic)
// ---------------------------------------------------------------------------

export type CommentView = {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  stage: string | null;
  field: string | null;
  asset_id: string | null;
  asset_label: string | null;
  timecode: string | null;
  resolved: number;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  context: string | null;
  reactions: { reaction: string; count: number; mine: boolean }[];
};

export async function listCommentsAction(input: { itemId?: string; reportKey?: string; field?: string | null; assetId?: string | null }) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      if (input.itemId && !await canViewItem(viewer, input.itemId)) throw new WorkflowError("FORBIDDEN", "Outside your scope.");
      const where: string[] = [];
      const params: string[] = [];
      if (input.reportKey) {
        where.push("c.target_type = 'report' AND c.target_id = ?");
        params.push(input.reportKey);
      } else if (input.itemId) {
        where.push("c.item_id = ?");
        params.push(input.itemId);
        if (input.field) {
          where.push("c.field = ?");
          params.push(input.field);
        }
        if (input.assetId) {
          where.push("c.asset_id = ?");
          params.push(input.assetId);
        }
      } else return [];
      const rows = await all<Omit<CommentView, "reactions">>(
              `SELECT c.id, c.parent_id, c.context, c.author_id, u.name AS author_name, c.body, c.stage, c.field, c.asset_id, c.timecode, c.resolved, c.edited_at, c.deleted_at, c.created_at,
           CASE WHEN a.id IS NULL THEN NULL ELSE a.kind || ' v' || a.version_no END AS asset_label
         FROM comments c JOIN users u ON u.id = c.author_id LEFT JOIN assets a ON a.id = c.asset_id
         WHERE ${where.join(" AND ")} ORDER BY c.created_at`,
              ...params,
            );
      const reactions = rows.length
        ? await all<{ comment_id: string; reaction: string; user_id: string }>(
                      `SELECT comment_id, reaction, user_id FROM comment_reactions WHERE comment_id IN (${rows.map(() => "?").join(",")})`,
                      ...rows.map((r) => r.id),
                    )
        : [];
      return rows.map((r) => {
        const mine = reactions.filter((x) => x.comment_id === r.id);
        const kinds = [...new Set(mine.map((x) => x.reaction))];
        return {
          ...r,
          body: r.deleted_at ? "" : r.body,
          reactions: kinds.map((k) => ({ reaction: k, count: mine.filter((x) => x.reaction === k).length, mine: mine.some((x) => x.reaction === k && x.user_id === viewer.id) })),
        } as CommentView;
      });
    },
    { revalidate: false },
  );
}
