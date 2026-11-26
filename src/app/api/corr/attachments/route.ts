import { getViewer } from "@/server/auth";
import { addAttachment } from "@/server/corr/delivery";
import { WorkflowError } from "@/server/workflow";

// Adds a file to a letter (multipart: doc, file, description). Every rule is checked in addAttachment.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.previewBy) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const doc = String(form.get("doc") ?? "");
    if (!(file instanceof File)) throw new WorkflowError("VALIDATION", "Choose a file.");
    if (file.size > 10 * 1024 * 1024) throw new WorkflowError("VALIDATION", "Files up to 10 MB.");
    const id = await addAttachment(viewer, doc, { name: file.name, data: Buffer.from(await file.arrayBuffer()), description: String(form.get("description") ?? "") });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof WorkflowError ? e.message : "The file could not be added." }, { status: 400 });
  }
}
