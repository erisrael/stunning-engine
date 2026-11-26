// Correspondence (stage 1): document IDs, official numbering, issuing, voiding, the registry, the directory and the
// audit chain. The acceptance points from the spec that this stage covers:
//  5  every document gets a permanent unique ID        6  issued letters get unique sequential numbers
//  7  concurrent issuing never duplicates a number      8  a voided number is never reused
//  17 incoming and outgoing letters are tracked          18 every issuing action is audited (and tampering shows)
//  19 issued letters do not change when settings change  20 people without the right cannot issue or modify
process.env.MAIL_FAKE = "1";
import { all, get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { isUuid } from "../../src/server/corr/core";
import * as S from "../../src/server/corr/setup";
import * as Dir from "../../src/server/corr/directory";
import * as Doc from "../../src/server/corr/documents";
import { formatRef, sequenceKey } from "../../src/server/corr/numbering";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@corr.local`, title: "Staff", roles: roles as never, password: "Corr-2026!xx", mustChangePassword: false })).id))!;
  const writer = await mk("corrwriter", ["manager"]);
  const ceo = await mk("corrceo", ["ceo"]);
  const staff = await mk("corrstaff", ["editing"]);

  // --- Setup on first use ---
  const cats = await S.listCategories();
  const gen = cats.find((c) => c.code === "GEN")!;
  const fin = cats.find((c) => c.code === "FIN")!;
  check("the company and the usual categories are created on first use", (await S.listEntities()).length === 1 && cats.length >= 15 && !!gen && !!cats.find((c) => c.code === "IN"));
  const entity = (await S.getEntity(null))!;
  check("a pattern must contain {SEQ}", !!(await throws(() => S.saveCategory(admin, { ...gen, pattern: "{ENTITY}/{CAT}/{YYYY}" }))));
  check("unknown pattern parts are refused", !!(await throws(() => S.saveCategory(admin, { ...gen, pattern: "{ENTITY}/{NOPE}/{SEQ}" }))));
  check("only administrators change numbering", !!(await throws(() => S.saveCategory(writer, { ...gen, pattern: "X/{SEQ}" }))));
  const d = new Date("2026-03-01T10:00:00Z");
  check("references follow the pattern", formatRef(gen, entity, null, null, d, 7) === `${entity.code}/GEN/2026/000007`);
  check("department and fiscal-year sequences are separate", sequenceKey({ ...gen, scope: "department" }, entity, "HR", d) !== sequenceKey({ ...gen, scope: "department" }, entity, "Finance", d) && formatRef({ ...gen, pattern: "{CAT}/{FY}/{SEQ}" }, entity, null, null, new Date("2026-08-01T00:00:00Z"), 1) === "GEN/FY2027/000001");

  // --- Directory ---
  const org = await Dir.saveOrg(writer, { legalName: "Addis Ababa Education Bureau", registrationNo: "AA-EDU-001", city: "Addis Ababa", email: "info@aaeb.example" });
  const contact = await Dir.saveContact(writer, { orgId: org, name: "Ato Bekele", title: "Head of Curriculum", email: "bekele@aaeb.example", primary: true });
  check("search finds an organisation by part of its name", (await Dir.searchOrgs(writer, "education")).some((o) => o.id === org));
  check("search finds it by a contact's name", (await Dir.searchOrgs(writer, "bekele")).some((o) => o.id === org && o.contacts?.some((c) => c.id === contact)));
  check("search finds it by registration number", (await Dir.searchOrgs(writer, "AA-EDU")).some((o) => o.id === org));
  check("a duplicate registration number is refused", !!(await throws(() => Dir.saveOrg(writer, { legalName: "Copy", registrationNo: "AA-EDU-001" }))));
  check("people without the directory right cannot change it", !!(await throws(() => Dir.saveOrg(staff, { legalName: "X" }))));
  const ver = await Dir.saveOrg(admin, { id: org, legalName: "Addis Ababa Education Bureau", registrationNo: "AA-EDU-001", source: "verified" });
  const verified = await Dir.getOrg(admin, ver);
  check("verified is recorded with who and when", verified.source === "verified" && verified.verifiedBy === admin.name && !!verified.verifiedAt);

  // --- Drafts ---
  check("people without Correspondence cannot write letters", !!(await throws(() => Doc.createDraft(staff, { categoryId: gen.id }))));
  const id = await Doc.createDraft(writer, { categoryId: gen.id });
  check("a new letter gets a permanent UUIDv7 and no number yet", isUuid(id) && !(await get<{ ref_number: string | null }>("SELECT ref_number FROM corr_documents WHERE id = ?", id))!.ref_number);
  const to = { kind: "to" as const, orgId: org, contactId: contact, name: "Ato Bekele", title: "Head of Curriculum", organisation: "Addis Ababa Education Bureau", email: "bekele@aaeb.example" };
  await Doc.saveDraft(writer, id, { subject: "Partnership on Grade 9 videos", data: { salutation: "Dear Ato Bekele,", blocks: [{ id: "b1", type: "paragraph", text: "ሰላም. We write to propose…" }] }, recipients: [to, { kind: "bcc", name: "Legal", email: "legal@us.example" }] });
  check("only the writer edits the draft", !!(await throws(() => Doc.saveDraft(ceo, id, { subject: "x", data: {}, recipients: [] }))));
  check("a stale save is refused", !!(await throws(() => Doc.saveDraft(writer, id, { subject: "x", data: {}, recipients: [to], baseVersion: 1 }))));
  check("only issuers issue", !!(await throws(() => Doc.issueDoc(writer, id))));

  // --- Issue ---
  const r1 = await Doc.issueDoc(ceo, id);
  const year = new Date().getUTCFullYear();
  check("issuing gives the official number", r1.ref === `${entity.code}/GEN/${year}/000001`, r1);
  check("issuing twice is refused", !!(await throws(() => Doc.issueDoc(ceo, id))));
  check("an issued letter cannot be edited", !!(await throws(() => Doc.saveDraft(writer, id, { subject: "changed", data: {}, recipients: [to] }))));
  const issued = await Doc.getDoc(ceo, id);
  check("the snapshot keeps the content, recipients and Amharic text", issued.snapshot?.subject === "Partnership on Grade 9 videos" && issued.snapshot.recipients.length === 2 && JSON.stringify(issued.snapshot.data).includes("ሰላም"));
  // Later changes do not touch what was issued.
  await Dir.saveOrg(admin, { id: org, legalName: "Renamed Bureau", registrationNo: "AA-EDU-001" });
  await S.saveCategory(admin, { ...gen, name: "General (renamed)" });
  const after = await Doc.getDoc(ceo, id);
  check("renaming the recipient or category later does not change the issued letter", after.snapshot?.recipients[0]?.organisation === "Addis Ababa Education Bureau" && after.snapshot?.category.name === "General correspondence" && after.contentHash === r1.hash);
  check("the writer does not see bcc only if they are not the writer (writer sees it)", (await Doc.getDoc(writer, id)).recipients.some((r) => r.kind === "bcc"));

  // --- Concurrency: 25 letters issued at the same moment get 25 different, consecutive numbers ---
  const ids: string[] = [];
  for (let i = 0; i < 25; i++) {
    const x = await Doc.createDraft(writer, { categoryId: gen.id });
    await Doc.saveDraft(writer, x, { subject: `Letter ${i}`, data: {}, recipients: [to] });
    ids.push(x);
  }
  const refs = (await Promise.all(ids.map((x) => Doc.issueDoc(ceo, x)))).map((r) => r.ref);
  const seqs = refs.map((r) => Number(r.split("/").pop())).sort((a, b) => a - b);
  check("concurrent issuing never duplicates a number", new Set(refs).size === 25, refs);
  check("…and the numbers run on without gaps", seqs[0] === 2 && seqs[24] === 26, seqs);

  // --- Void ---
  check("voiding needs a reason", !!(await throws(() => Doc.voidDoc(ceo, ids[0]!, ""))));
  check("a writer cannot void an issued letter", !!(await throws(() => Doc.voidDoc(writer, ids[0]!, "mistake"))));
  await Doc.voidDoc(ceo, ids[0]!, "Sent to the wrong school");
  const v = await Doc.getDoc(ceo, ids[0]!);
  check("a voided letter keeps its number and reason", v.status === "void" && !!v.ref && v.voidReason === "Sent to the wrong school");
  check("the number register shows it void", (await get<{ state: string }>("SELECT state FROM corr_numbers WHERE ref_number = ?", v.ref))?.state === "void");
  const next = await Doc.createDraft(writer, { categoryId: gen.id });
  await Doc.saveDraft(writer, next, { subject: "After void", data: {}, recipients: [to] });
  const rn = await Doc.issueDoc(ceo, next);
  check("a voided number is never reused", rn.ref !== v.ref && Number(rn.ref.split("/").pop()) === 27, rn);
  // A pattern change that would hand out an existing number skips it.
  await S.saveCategory(admin, { ...gen, pattern: "{ENTITY}/GEN/{YYYY}/{SEQ}", reset: "never" });
  await run("INSERT INTO corr_sequences (key, next_value, updated_at) VALUES (?, 5, ?) ON CONFLICT (key) DO UPDATE SET next_value = 5", `c:${gen.id}`, new Date().toISOString());
  const skip = await Doc.createDraft(writer, { categoryId: gen.id });
  await Doc.saveDraft(writer, skip, { subject: "Skip test", data: {}, recipients: [to] });
  const rs = await Doc.issueDoc(ceo, skip);
  check("a pattern change never reissues an existing number", Number(rs.ref.split("/").pop()) === 28, rs);
  await S.saveCategory(admin, { ...gen, pattern: S.DEFAULT_PATTERN, reset: "yearly" });

  // --- Delivery steps ---
  await Doc.advanceDoc(ceo, id, "delivered", { method: "hand" });
  const del = await Doc.getDoc(ceo, id);
  check("delivery can skip forwards (dispatched and delivered at once)", del.status === "delivered" && !!del.dispatchedAt && !!del.deliveredAt);
  check("…but never backwards", !!(await throws(() => Doc.advanceDoc(ceo, id, "dispatched"))));
  const faxDoc = ids[1]!;
  check("a letter is not marked faxed by hand", !!(await throws(() => Doc.advanceDoc(ceo, faxDoc, "dispatched", { method: "fax" }))));

  // --- Amend ---
  const amend = await Doc.duplicateDoc(writer, id, "amend");
  await Doc.saveDraft(writer, amend, { subject: "Partnership on Grade 9 videos (corrected)", data: {}, recipients: [to] });
  const ra = await Doc.issueDoc(ceo, amend);
  const orig = await Doc.getDoc(ceo, id);
  check("an amendment is a new letter with a new ID and number that points to the original", amend !== id && ra.ref !== r1.ref && (await Doc.getDoc(ceo, amend)).replacesId === id && orig.replacedBy?.id === amend);
  check("the original stays as it was", orig.contentHash === r1.hash && orig.status === "delivered");

  // --- Visibility ---
  const secret = await Doc.createDraft(writer, { categoryId: gen.id });
  await Doc.saveDraft(writer, secret, { subject: "Restricted matter", data: {}, recipients: [to], classification: "restricted" });
  const issuerOnly = { ...ceo, perms: ceo.perms.filter((p) => p !== "corr.audit" && p !== "corr.admin") };
  check("a restricted letter is hidden from people who only issue", !!(await throws(() => Doc.getDoc(issuerOnly, secret))) && !(await Doc.listDocs(issuerOnly)).rows.some((r) => r.id === secret));
  check("auditors see restricted letters", (await Doc.getDoc(ceo, secret)).id === secret);
  check("…but its writer and administrators see it", (await Doc.getDoc(writer, secret)).id === secret && (await Doc.getDoc(admin, secret)).id === secret);
  check("people without rights see no letters at all", !!(await throws(() => Doc.listDocs(staff))));
  const mine = await Doc.listDocs(writer, { mine: true });
  check("the registry lists and searches letters", mine.total >= 28 && (await Doc.listDocs(ceo, { q: "Grade 9" })).rows.some((r) => r.id === id));
  check("the registry searches by reference number", (await Doc.listDocs(ceo, { q: r1.ref })).rows.some((r) => r.id === id));

  // --- Incoming ---
  const inc = await Doc.registerIncoming(writer, { subject: "Request for content review", sender: "Ministry of Education", externalRef: "MoE/123/26", dueAt: new Date(Date.now() + 7 * 864e5).toISOString() });
  check("an incoming letter gets an internal tracking number", inc.ref.startsWith(`${entity.code}/IN/`));
  check("incoming letters are listed apart", (await Doc.listDocs(ceo, { direction: "incoming" })).rows.some((r) => r.id === inc.id));

  // --- Audit chain ---
  const trail = (await Doc.getDoc(ceo, id)).trail!;
  check("every step is in the audit trail", ["created", "saved", "issued", "delivered", "amendment.started", "replaced"].every((a) => trail.events.some((e) => e.action === a)), trail.events.map((e) => e.action));
  check("the chain is intact", trail.intact);
  check("the audit log refuses changes", !!(await throws(() => run("UPDATE corr_audit SET action = 'x' WHERE document_id = ?", id))) && !!(await throws(() => run("DELETE FROM corr_audit WHERE document_id = ?", id))));
  // Tampering below the table guard (as a database superuser might) is caught by the chain.
  await run("ALTER TABLE corr_audit DISABLE TRIGGER corr_audit_append_only");
  const victim = (await get<{ seq: number }>("SELECT seq FROM corr_audit WHERE document_id = ? AND action = 'issued'", id))!.seq;
  await run("UPDATE corr_audit SET detail = '{\"ref\":\"forged\"}' WHERE seq = ?", victim);
  await run("ALTER TABLE corr_audit ENABLE TRIGGER corr_audit_append_only");
  const broken = (await Doc.getDoc(ceo, id)).trail!;
  check("a changed audit record breaks the chain at that record", !broken.intact && broken.brokenAt === Number(victim));
  check("the number register lists every number", (await Doc.numberRegister(admin)).length >= 30 && !!(await throws(() => Doc.numberRegister(writer))));
  check("no number appears twice anywhere", (await all<{ n: number }>("SELECT COUNT(*) AS n FROM corr_documents WHERE ref_number IS NOT NULL GROUP BY ref_number HAVING COUNT(*) > 1")).length === 0);

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
