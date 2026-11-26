// Correspondence stages 2 to 6: templates, the organisation and authority, workflows with several signatories,
// signing, stamps, verification, attachments and bulk letters. The scenarios are the spec's acceptance tests (31.1 to
// 31.18) and the template, verification and tamper criteria (22.2, 22.9 to 22.16, 22.19, 22.20).
process.env.MAIL_FAKE = "1";
import { get, run, closeDb } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as S from "../../src/server/corr/setup";
import * as Doc from "../../src/server/corr/documents";
import * as T from "../../src/server/corr/templates";
import * as O from "../../src/server/corr/org";
import * as W from "../../src/server/corr/workflow";
import * as G from "../../src/server/corr/signing";
import * as Dl from "../../src/server/corr/delivery";
import { cleanLayout, defaultLayout, fillFields } from "../../src/lib/corr-template";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[], title: string) => (await loadUser((await upsertAccount({ name: key, email: `${key}@wf.local`, title, roles: roles as never, password: "Wf-2026!xxxx", mustChangePassword: false })).id))!;
  const ceo = await mk("wfceo", ["ceo"], "Chief Executive Officer");
  const dceo = await mk("wfdceo", ["ceo"], "Deputy CEO");
  const cto = await mk("wfcto", ["cto"], "Chief Technology Officer");
  const cfo = await mk("wfcfo", ["cfo"], "Chief Financial Officer");
  const mgr = await mk("wfmgr", ["manager"], "Department Manager");
  const admin2 = await mk("wfadmin2", ["admin"], "Second admin");
  const b1 = await mk("wfboard1", ["owner"], "Board member");
  const b2 = await mk("wfboard2", ["owner"], "Board member");
  const b3 = await mk("wfboard3", ["owner"], "Board member");
  const reload = async (u: AppUser) => (await loadUser(u.id))!;

  // --- Templates (22.1, 22.2, 22.19) ---
  check("layouts are cleaned: unknown keys dropped, numbers bounded, scripts refused", (() => {
    const l = cleanLayout({ page: { size: "A3", orientation: "landscape", margins: { top: 9999 } }, elements: [{ kind: "text", text: "<script>x</script>", x: 1e9 }, { kind: "image", src: "javascript:alert(1)" }], evil: 1 });
    return l.page.size === "A3" && l.page.margins.top === 200 && l.elements.length === 1 && l.elements[0]!.x === 5000 && !("evil" in l);
  })());
  check("fields are filled and unknown ones stay visible", fillFields("{{company_name}} · {{nope}}", { company_name: "Myseed" }) === "Myseed · {{nope}}");
  const tid = await T.createTemplate(admin, { name: "Executive letter", size: "A4" });
  const l2 = defaultLayout("Letter");
  l2.watermark = { text: "OFFICIAL", opacity: 0.06, angle: -30, size: 70 };
  await T.saveTemplateDraft(admin, tid, { layout: l2 });
  check("a draft template is not usable for letters", (await T.publishedLayout(tid)).version === null);
  await T.submitTemplate(admin, tid, "First version");
  check("the designer cannot approve their own template when another admin exists", !!(await throws(() => T.decideTemplate(admin, tid, true, ""))));
  await T.decideTemplate(admin2, tid, true, "Looks right");
  const pub = await T.publishedLayout(tid);
  check("an approved template is published at version 1 with its page size", pub.version === 1 && pub.layout.page.size === "Letter" && pub.layout.watermark?.text === "OFFICIAL");
  const l3 = { ...l2, page: { ...l2.page, size: "A5" } };
  await T.saveTemplateDraft(admin, tid, { layout: l3 });
  check("editing a published template makes a new draft version; letters keep version 1", (await T.getTemplate(admin, tid)).versions[0]!.version === 2 && (await T.publishedLayout(tid)).version === 1);

  // --- Organisation (31.1, 31.2, 31.3) ---
  const h = await O.loadDefaultHierarchy(admin);
  check("the default hierarchy is loaded once", !!h.ceo && !!(await throws(() => O.loadDefaultHierarchy(admin))));
  const chart = await O.orgChart();
  const pos = (t: string) => chart.positions.find((p) => p.title.startsWith(t))!.id;
  const CTO = pos("Chief Technology");
  const CFO = pos("Chief Financial");
  const dept = await O.saveUnit(admin, { name: "Programmes", kind: "department", parentId: null });
  const DM = await O.savePosition(admin, { title: "Programmes Manager", level: "middle", unitId: dept, reportsTo: h.dceo });
  check("a position cannot report to itself through a loop", !!(await throws(() => O.savePosition(admin, { id: h.ceo, title: "Chief Executive Officer (CEO)", level: "executive", reportsTo: DM }))));
  await O.assign(admin, { positionId: h.ceo, userId: ceo.id });
  await O.assign(admin, { positionId: h.dceo, userId: dceo.id });
  await O.assign(admin, { positionId: CTO, userId: cto.id });
  await O.assign(admin, { positionId: CFO, userId: cfo.id });
  await O.assign(admin, { positionId: DM, userId: mgr.id });
  // A person may hold several positions.
  await O.assign(admin, { positionId: pos("Chief Information"), userId: cto.id });
  check("one person can hold several positions", (await O.positionsOf(cto.id)).length === 2);
  check("the supervisor is found through the reporting line", (await O.supervisorOf(mgr.id))?.userId === dceo.id);
  check("an acting appointment needs an end and an authorising document", !!(await throws(() => O.assign(admin, { positionId: h.ceo, userId: dceo.id, kind: "acting" }))));
  for (const [p, a] of [[h.ceo, "sign"], [h.ceo, "approve_executive"], [h.dceo, "approve_executive"], [CTO, "approve_department"], [CFO, "approve_financial"], [CFO, "approve_department"], [DM, "prepare"]] as const)
    await O.grantAuthority(admin, { subjectKind: "position", subjectId: p, action: a, categoryId: null, department: null, maxClassification: "restricted", maxValue: null, note: null });
  check("the CEO holds signing authority; the DCEO does not (yet)", (await O.resolveAuthority(ceo.id, "sign", {})).length === 1 && (await O.resolveAuthority(dceo.id, "sign", {})).length === 0);
  await O.grantAuthority(admin, { subjectKind: "position", subjectId: CFO, action: "sign", categoryId: null, department: null, maxClassification: "restricted", maxValue: 100000, note: "up to 100k" });
  check("a value limit is applied", (await O.resolveAuthority(cfo.id, "sign", { value: 50000 })).length === 1 && (await O.resolveAuthority(cfo.id, "sign", { value: 500000 })).length === 0);

  // --- Signatures and stamps ---
  for (const u of [ceo, dceo, cto, cfo, mgr]) await G.registerSignature(u, { image: PNG, kind: "drawn" });
  check("an SVG cannot be registered as a signature", !!(await throws(() => G.registerSignature(ceo, { image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }))));
  const stampId = await G.saveStamp(admin, { name: "Company seal", kind: "circular", design: { text: "MYSEED PLC", inner: "SEAL", centre: "Addis Ababa", color: "#1d4ed8", border: 2, size: 38, rotation: 0, opacity: 0.9, showDate: true }, allowed: { users: [ceo.id] } });
  check("a listed person with the stamp right uses the stamp", !!(await G.stampAllowed(await reload(ceo), stampId)).image.startsWith("data:image/svg+xml"));
  check("a person not listed cannot use the stamp", !!(await throws(() => G.stampAllowed(cfo, stampId))));

  // --- A workflow with three signatures (31.4 to 31.8) ---
  const cats = await S.listCategories();
  const mgt = cats.find((c) => c.code === "MGT")!;
  const wf = await W.saveWorkflow(admin, {
    name: "Executive correspondence",
    definition: {
      selfApproval: "forbid",
      preparedBlock: true,
      stages: [
        { name: "Technical and financial approval", type: "parallel", action: "approve_department", label: "Approved by", targets: [{ kind: "position", id: CTO, label: "CTO" }, { kind: "position", id: CFO, label: "CFO" }] },
        { name: "Executive signature", type: "alternative", action: "sign", label: "Authorised by", targets: [{ kind: "position", id: h.ceo, label: "CEO" }] },
      ],
    },
  });
  await S.saveCategory(admin, { ...mgt, config: { ...mgt.config, workflowId: wf.id } as never });
  const ld = await Doc.createDraft(mgr, { categoryId: mgt.id });
  await Doc.saveDraft(mgr, ld, { subject: "Partnership approval", data: { blocks: [] }, recipients: [{ kind: "to", organisation: "Ministry of Education" }] });
  check("a letter that needs approval cannot be issued straight away", !!(await throws(() => Doc.issueDoc(ceo, ld))));
  await W.submitDoc(mgr, ld);
  check("submitted, it is routed to the first stage and locked", (await Doc.getDoc(mgr, ld)).status === "pending_approval" && !!(await throws(() => Doc.saveDraft(mgr, ld, { subject: "x", data: {}, recipients: [] }))));
  const steps = async () => (await W.workflowState(ld))!.steps;
  const step = async (name: string, who?: string) => (await steps()).find((s) => s.stageName === name && (!who || s.target?.label === who))!;
  check("the CEO cannot sign before the approvals", !!(await throws(async () => W.actOnStep(ceo, (await step("Executive signature")).id, { decision: "approve" }))));
  check("someone outside the position cannot act", !!(await throws(async () => W.actOnStep(cfo, (await step("Technical and financial approval", "CTO")).id, { decision: "approve" }))));
  check("the CTO and CFO can be asked at the same time (both pending)", (await steps()).filter((s) => s.stageIndex === 0 && s.status === "pending").length === 2);
  await W.actOnStep(cfo, (await step("Technical and financial approval", "CFO")).id, { decision: "approve" });
  check("after one parallel approval the stage still waits", (await step("Executive signature")).status === "waiting");
  await W.actOnStep(cto, (await step("Technical and financial approval", "CTO")).id, { decision: "approve" });
  check("after both, the CEO's signature is asked", (await step("Executive signature")).status === "pending" && (await Doc.getDoc(mgr, ld)).status === "pending_signature");
  check("the CEO sees it in their queue", (await W.myQueue(ceo)).some((q) => q.documentId === ld));
  await W.actOnStep(ceo, (await step("Executive signature")).id, { decision: "approve" });
  const done = await Doc.getDoc(mgr, ld);
  check("all signed: the letter is ready to issue", done.status === "signed" && done.readiness?.ok === true);
  const blocks = await W.signatureBlocks(ld, { name: mgr.name, title: mgr.title });
  check("the signature blocks are the actual signatories (prepared, two approvals, the CEO)", blocks.length === 4 && blocks.filter((b) => b.status === "signed").length === 4 && blocks.at(-1)!.name === ceo.name && blocks.at(-1)!.position.includes("Chief Executive"), blocks.map((b) => [b.label, b.name, b.position, b.status]));
  check("an unsigned block never shows a signature picture", (await W.signatureBlocks(ld, null)).every((b) => b.status === "signed" || !b.image));
  const issued = await Doc.issueDoc(ceo, ld);
  const snap = (await Doc.getDoc(ceo, ld)).snapshot!;
  check("the issued letter keeps the signatures, approvals and a verification code", snap.signatures.length === 4 && snap.approvals.length === 3 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(issued.verifyCode));

  // --- Verification and tampering (22.15, 22.16) ---
  const v = await G.verifyDocument(issued.verifyCode, { ip: "1.2.3.4" });
  check("verification says genuine and lists the signatories", v.result === "genuine" && v.signatories?.some((s) => s.name === ceo.name) === true && v.checks!.every((c) => c.ok));
  check("verification by reference works too", (await G.verifyDocument(issued.ref)).result === "genuine");
  check("an unknown code is not found", (await G.verifyDocument("AAAA-BBBB-CCCC")).result === "not_found");
  const fin = cats.find((c) => c.code === "FIN")!;
  const conf = await Doc.createDraft(mgr, { categoryId: fin.id });
  await Doc.saveDraft(mgr, conf, { subject: "Salary adjustment for staff", data: {}, recipients: [{ kind: "to", organisation: "Bank" }] });
  const confIssued = await Doc.issueDoc(ceo, conf);
  const cv = await G.verifyDocument(confIssued.verifyCode);
  check("verification never shows a confidential letter's subject or recipient", cv.result === "genuine" && cv.subject === null && cv.recipient === null);
  check("every check is logged", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM corr_verifications WHERE document_id = ?", ld))?.n) >= 2);
  const before = (await get<{ issued_snapshot: string }>("SELECT issued_snapshot FROM corr_documents WHERE id = ?", ld))!.issued_snapshot;
  await run("UPDATE corr_documents SET issued_snapshot = ? WHERE id = ?", before.replace("Partnership approval", "Partnership approval and payment"), ld);
  check("a changed letter is detected as tampered", (await G.verifyDocument(issued.verifyCode)).result === "tampered");
  await run("UPDATE corr_documents SET issued_snapshot = ? WHERE id = ?", before, ld);
  check("restored, it is genuine again", (await G.verifyDocument(issued.verifyCode)).result === "genuine");

  // --- Delegation and acting (31.9, 31.10) ---
  check("the DCEO cannot sign for the CEO without a delegation", !!(await throws(async () => {
    const x = await Doc.createDraft(mgr, { categoryId: mgt.id });
    await Doc.saveDraft(mgr, x, { subject: "No delegation", data: {}, recipients: [{ kind: "to", organisation: "X" }] });
    await W.submitDoc(mgr, x);
    const st = (await W.workflowState(x))!.steps;
    for (const s of st.filter((s) => s.stageIndex === 0)) await W.actOnStep(s.target?.label === "CTO" ? cto : cfo, s.id, { decision: "approve" });
    await W.actOnStep(dceo, (await W.workflowState(x))!.steps.find((s) => s.action === "sign")!.id, { decision: "approve" });
  })));
  check("a delegation of signing must say it includes signing", !!(await throws(() => O.createDelegation(admin, { fromUser: ceo.id, fromPosition: h.ceo, toUser: dceo.id, actions: ["sign"], endAt: new Date(Date.now() + 864e5).toISOString() }))));
  const del = await O.createDelegation(admin, { fromUser: ceo.id, fromPosition: h.ceo, toUser: dceo.id, actions: ["sign"], includesSigning: true, endAt: new Date(Date.now() + 7 * 864e5).toISOString(), authorizationRef: "Board resolution 14/2026" });
  const caps = await O.resolveAuthority(dceo.id, "sign", {});
  check("with the delegation the DCEO signs for the CEO, and the capacity says so", caps.some((c) => c.kind === "delegated" && c.label.includes("delegated by") && c.label.includes(ceo.name)));
  const x2 = await Doc.createDraft(mgr, { categoryId: mgt.id });
  await Doc.saveDraft(mgr, x2, { subject: "Signed under delegation", data: {}, recipients: [{ kind: "to", organisation: "Y" }] });
  await W.submitDoc(mgr, x2);
  for (const s of (await W.workflowState(x2))!.steps.filter((s) => s.stageIndex === 0)) await W.actOnStep(s.target?.label === "CTO" ? cto : cfo, s.id, { decision: "approve" });
  await W.actOnStep(dceo, (await W.workflowState(x2))!.steps.find((s) => s.action === "sign")!.id, { decision: "approve" });
  const sb = await W.signatureBlocks(x2, null);
  check("the signature block shows the delegated capacity", sb.some((b) => b.name === dceo.name && (b.capacity ?? "").includes("delegated")), sb);
  await run("UPDATE org_delegations SET end_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), del);
  check("an expired delegation gives no authority", (await O.resolveAuthority(dceo.id, "sign", {})).every((c) => c.kind !== "delegated"));
  const acting = await O.assign(admin, { positionId: h.ceo, userId: dceo.id, kind: "acting", startAt: new Date(Date.now() - 1000).toISOString(), endAt: new Date(Date.now() + 864e5).toISOString(), authorizationRef: "Board memo 2026/09" });
  check("an acting CEO signs as Acting CEO", (await O.resolveAuthority(dceo.id, "sign", {})).some((c) => c.kind === "acting" && c.label.startsWith("Acting Chief Executive")));
  await O.endAssignment(admin, acting);
  check("an ended acting appointment gives no authority", (await O.resolveAuthority(dceo.id, "sign", {})).length === 0);

  // --- Self-approval, rejection and re-approval (31.11, 31.14, 31.15) ---
  const own = await Doc.createDraft(cfo, { categoryId: mgt.id });
  await Doc.saveDraft(cfo, own, { subject: "CFO's own letter", data: {}, recipients: [{ kind: "to", organisation: "Z" }] });
  await W.submitDoc(cfo, own);
  const ownStep = (await W.workflowState(own))!.steps.find((s) => s.target?.label === "CFO")!;
  check("the writer cannot approve their own letter", !!(await throws(() => W.actOnStep(cfo, ownStep.id, { decision: "approve" }))));
  const ctoStep = (await W.workflowState(own))!.steps.find((s) => s.target?.label === "CTO")!;
  check("a rejection needs a reason", !!(await throws(() => W.actOnStep(cto, ctoStep.id, { decision: "reject" }))));
  await W.actOnStep(cto, ctoStep.id, { decision: "reject", comment: "Add the budget table" });
  check("a rejected letter returns to draft, with its history", (await Doc.getDoc(cfo, own)).status === "draft" && (await Doc.getDoc(cfo, own)).trail!.events.some((e) => e.action === "rejected"));
  // Approve, then withdraw and edit: the approvals are invalidated and asked for again.
  const ed = await Doc.createDraft(mgr, { categoryId: mgt.id });
  await Doc.saveDraft(mgr, ed, { subject: "Edited after approval", data: {}, recipients: [{ kind: "to", organisation: "W" }] });
  await W.submitDoc(mgr, ed);
  for (const s of (await W.workflowState(ed))!.steps.filter((s) => s.stageIndex === 0)) await W.actOnStep(s.target?.label === "CTO" ? cto : cfo, s.id, { decision: "approve" });
  await Doc.withdrawDoc(mgr, ed);
  const inval = await get<{ n: number }>("SELECT COUNT(*) AS n FROM corr_steps WHERE document_id = ? AND status = 'invalidated'", ed);
  check("withdrawing invalidates the approvals given", Number(inval?.n) === 2);
  await Doc.saveDraft(mgr, ed, { subject: "Edited after approval (changed)", data: {}, recipients: [{ kind: "to", organisation: "W" }] });
  await W.submitDoc(mgr, ed);
  check("resubmitting asks everyone again on the new content", (await W.workflowState(ed))!.steps.filter((s) => s.status === "pending").length === 2);

  // --- Issue needs the CEO (31.12) ---
  const nx = await Doc.createDraft(mgr, { categoryId: mgt.id });
  await Doc.saveDraft(mgr, nx, { subject: "Needs CEO", data: {}, recipients: [{ kind: "to", organisation: "V" }] });
  await W.submitDoc(mgr, nx);
  for (const s of (await W.workflowState(nx))!.steps.filter((s) => s.stageIndex === 0)) await W.actOnStep(s.target?.label === "CTO" ? cto : cfo, s.id, { decision: "approve" });
  check("without the CEO's signature it cannot be issued", !!(await throws(() => Doc.issueDoc(ceo, nx))));

  // --- Rules: financial threshold adds the CFO (28) ---
  await W.saveRule(admin, { name: "Above 100k needs the CFO's financial approval", priority: 10, condition: { all: [{ field: "financial_value", op: "gt", value: 100000 }] }, effect: { addStages: [{ key: "cfoval", name: "Financial authorisation", type: "alternative", action: "approve_financial", label: "Financially authorised by", targets: [{ kind: "position", id: CFO, label: "CFO" }] }], place: "before_sign" } });
  const gen = cats.find((c) => c.code === "GEN")!;
  const big = await Doc.createDraft(mgr, { categoryId: gen.id });
  await Doc.saveDraft(mgr, big, { subject: "Big purchase", data: {}, recipients: [{ kind: "to", organisation: "Supplier" }], financialValue: 250000 });
  const small = await Doc.createDraft(mgr, { categoryId: gen.id });
  await Doc.saveDraft(mgr, small, { subject: "Small purchase", data: {}, recipients: [{ kind: "to", organisation: "Supplier" }], financialValue: 2000 });
  check("a rule adds the CFO above the threshold only", (await W.planFor(big)).def.stages.some((s) => s.key === "cfoval") && !(await W.planFor(small)).def.stages.length);
  check("the small letter is issued directly", !!(await Doc.issueDoc(ceo, small)).ref);

  // --- Quorum (31.13) ---
  const BOARD = await O.savePosition(admin, { title: "Board Director", level: "board" });
  for (const u of [b1, b2, b3]) await O.assign(admin, { positionId: BOARD, userId: u.id });
  const bwf = await W.saveWorkflow(admin, { name: "Board resolution", definition: { stages: [{ name: "Board approval", type: "quorum", quorum: 2, action: "approve_board", label: "Approved by the Board", targets: [{ kind: "user", id: b1.id, label: "b1" }, { kind: "user", id: b2.id, label: "b2" }, { kind: "user", id: b3.id, label: "b3" }] }] } });
  const boardCat = await S.saveCategory(admin, { code: "BRD", name: "Board correspondence", pattern: "{ENTITY}/BRD/{YYYY}/{SEQ}", config: { workflowId: bwf.id } as never });
  const bd = await Doc.createDraft(mgr, { categoryId: boardCat });
  await Doc.saveDraft(mgr, bd, { subject: "Resolution", data: {}, recipients: [{ kind: "to", organisation: "Shareholders" }] });
  await W.submitDoc(mgr, bd);
  const bs = (await W.workflowState(bd))!.steps;
  await W.actOnStep(b1, bs.find((s) => s.userId === b1.id)!.id, { decision: "approve" });
  check("one of three is not a quorum of two", (await Doc.getDoc(mgr, bd)).status === "pending_approval");
  await W.actOnStep(b3, bs.find((s) => s.userId === b3.id)!.id, { decision: "approve" });
  check("two of three completes the stage", (await Doc.getDoc(mgr, bd)).status === "approved");

  // --- History survives reorganisation (31.16 to 31.18) ---
  await run("UPDATE users SET name = 'Renamed CEO', title = 'Chairman' WHERE id = ?", ceo.id);
  const ceoAssign = (await O.orgChart()).assignments.find((a) => a.userId === ceo.id && a.positionId === h.ceo && a.current)!;
  await O.endAssignment(admin, ceoAssign.id);
  const after = (await Doc.getDoc(admin, ld)).snapshot!;
  check("an issued letter keeps the signatory's name and position after they change", after.signatures.at(-1)!.name === "wfceo" && after.signatures.at(-1)!.position.includes("Chief Executive"));
  check("the audit names every participant and capacity", (await Doc.getDoc(admin, ld)).trail!.events.filter((e) => ["approved", "signed"].includes(e.action)).every((e) => typeof e.detail.capacity === "string"));
  check("the verification still names the original signatory", (await G.verifyDocument(issued.verifyCode)).signatories!.some((s) => s.name === "wfceo"));

  // --- Stamps on a letter ---
  const sw = await W.saveWorkflow(admin, { name: "Stamped", definition: { stages: [{ name: "Seal", type: "alternative", action: "stamp", label: "Sealed", targets: [{ kind: "user", id: ceo.id }] }] } });
  const scat = await S.saveCategory(admin, { code: "STP", name: "Sealed letters", pattern: "{ENTITY}/STP/{YYYY}/{SEQ}", config: { workflowId: sw.id } as never });
  const sd = await Doc.createDraft(mgr, { categoryId: scat });
  await Doc.saveDraft(mgr, sd, { subject: "Sealed", data: {}, recipients: [{ kind: "to", organisation: "Court" }] });
  await W.submitDoc(mgr, sd);
  const stp = (await W.workflowState(sd))!.steps[0]!;
  const ceoNow = await reload(ceo);
  await W.actOnStep(ceoNow, stp.id, { decision: "approve", stampId });
  check("an allowed person applies the stamp, which is kept with the step", !!(await W.workflowState(sd))!.steps[0]!.stampImage);

  // --- Attachments ---
  const at = await Doc.createDraft(mgr, { categoryId: gen.id });
  check("a file whose content is not an allowed type is refused, whatever its name", !!(await throws(() => Dl.addAttachment(mgr, at, { name: "evil.pdf", data: Buffer.from("MZ this is an exe") }))));
  const att = await Dl.addAttachment(mgr, at, { name: "budget.pdf", data: Buffer.from("%PDF-1.4\n%fake but starts right\n"), description: "Budget" });
  const list = await Dl.listAttachments(at);
  check("an attachment is kept with its fingerprint and numbered", list.length === 1 && list[0]!.n === 1 && list[0]!.sha256.length === 64 && list[0]!.scan === "not_scanned" && !!att);
  check("someone else cannot add files to a draft", !!(await throws(() => Dl.addAttachment(cfo, at, { name: "x.pdf", data: Buffer.from("%PDF-1.4") }))));

  // --- Bulk ---
  await Doc.saveDraft(mgr, at, { subject: "Invitation to {{event}}", data: { blocks: [{ id: "a", type: "paragraph", text: "Dear {{recipient_name}}, join us at {{event}}." }], fields: { event: "Launch" } }, recipients: [{ kind: "to", name: "Model" }] });
  const bulk = await Dl.bulkFromRows(mgr, at, [{ name: "Abebe", organisation: "School A", fields: { event: "Launch" } }, { name: "Sara", organisation: "School B" }, { organisation: "" }]);
  check("bulk makes one draft per row with its recipient (and skips empty rows)", bulk.ids.length === 2 && (await Doc.getDoc(mgr, bulk.ids[1]!)).recipients[0]?.name === "Sara");

  // --- Dispatch ---
  check("a letter that is not issued is not sent", !!(await throws(() => Dl.dispatchDoc(ceo, at, { channel: "link" }, "https://ops.example"))));
  const sent = await Dl.dispatchDoc(ceo, small, { channel: "link" }, "https://ops.example");
  const token = sent.link!.split("/letter/")[1]!;
  const opened = await Dl.openLink(token, {});
  check("a secure link opens the issued letter once and marks it delivered", !!opened && (await Doc.getDoc(ceo, small)).status === "delivered");
  check("a wrong link opens nothing", (await Dl.openLink("x".repeat(32), {})) === null);
  check("fax is refused without a connected provider", !!(await throws(() => Dl.dispatchDoc(ceo, small, { channel: "fax", address: "+251111234567" }, "https://ops.example"))));

  // --- Dashboard ---
  const dash = await Dl.dashboard(admin);
  check("the dashboard counts letters and approvals", dash.totals.issued >= 2 && dash.approval.completed >= 3 && dash.templates.length >= 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
