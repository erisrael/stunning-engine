import { appOrigin } from "@/server/password-reset";
import { OPERATIONS } from "@/server/tools-api";
import { json, preflight } from "@/server/oauth-http";

// The OpenAPI schema for a Custom GPT's actions (ChatGPT, Configure, Actions, Import from URL). OAuth is set in the
// GPT with the client id and secret from Admin, Tools hub; each person approves the GPT on their own account.
export async function GET() {
  const origin = await appOrigin();
  const sec = [{ myseed: ["tools"] }];
  const obj = (k: keyof typeof OPERATIONS) => OPERATIONS[k].input as unknown as Record<string, unknown>;
  const query = (k: keyof typeof OPERATIONS) =>
    Object.entries((obj(k).properties ?? {}) as Record<string, Record<string, unknown>>).map(([name, schema]) => ({ name, in: "query", required: false, description: schema.description as string | undefined, schema: { ...schema, description: undefined } }));
  const ok = { "200": { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "401": { description: "Not connected" }, "403": { description: "Not allowed" } };
  return json(
    {
      openapi: "3.1.0",
      info: { title: "Myseed Tools hub", version: "1.0.0", description: "The signed-in person's own notes, checklists, tasks and reminders; their documents, presentations, sheets and letters; and a lookup of production lesson parts they may see." },
      servers: [{ url: origin }],
      components: {
        securitySchemes: {
          myseed: { type: "oauth2", flows: { authorizationCode: { authorizationUrl: `${origin}/oauth/authorize`, tokenUrl: `${origin}/api/oauth/token`, refreshUrl: `${origin}/api/oauth/token`, scopes: { tools: "Your Tools hub" } } } },
        },
        schemas: {},
      },
      security: sec,
      paths: {
        "/api/v1/gpt/notes": {
          get: { operationId: "listUserNotes", summary: OPERATIONS.list_user_notes.description, parameters: query("list_user_notes"), responses: ok, security: sec },
          post: { operationId: "createNote", summary: OPERATIONS.create_note.description, requestBody: { required: true, content: { "application/json": { schema: obj("create_note") } } }, responses: ok, security: sec },
        },
        "/api/v1/gpt/reminders": { get: { operationId: "listReminders", summary: OPERATIONS.list_reminders.description, parameters: query("list_reminders"), responses: ok, security: sec } },
        "/api/v1/gpt/checklist-items": { post: { operationId: "addChecklistItem", summary: OPERATIONS.add_checklist_item.description, requestBody: { required: true, content: { "application/json": { schema: obj("add_checklist_item") } } }, responses: ok, security: sec } },
        "/api/v1/gpt/crosscheck": { get: { operationId: "crosscheckCodeOrTeacher", summary: OPERATIONS.crosscheck_code_or_teacher.description, parameters: query("crosscheck_code_or_teacher"), responses: ok, security: sec } },
        "/api/v1/gpt/files": { get: { operationId: "listFiles", summary: OPERATIONS.list_files.description, parameters: query("list_files"), responses: ok, security: sec } },
        ...Object.fromEntries(
          ([
            ["documents", "createDocument", "create_document"],
            ["documents-read", "readDocument", "read_document"],
            ["documents-update", "updateDocument", "update_document"],
            ["presentations", "createPresentation", "create_presentation"],
            ["presentations-read", "readPresentation", "read_presentation"],
            ["sheets", "createSheet", "create_sheet"],
            ["sheets-read", "readSheet", "read_sheet"],
            ["letters", "createLetter", "create_letter"],
          ] as const).map(([path, id, op]) => [`/api/v1/gpt/${path}`, { post: { operationId: id, summary: OPERATIONS[op].description.slice(0, 300), description: OPERATIONS[op].description, requestBody: { required: true, content: { "application/json": { schema: obj(op) } } }, responses: ok, security: sec } }]),
        ),
      },
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}
export const OPTIONS = preflight;
