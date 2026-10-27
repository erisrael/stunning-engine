"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { autoMap, parseUpload, runImport, TEMPLATES, type ImportMode, type ParsedSheet, type TemplateKey } from "@/server/importer";
import { WorkflowError } from "@/server/workflow";
import { can } from "@/server/users";
import { importCurriculumBackup, isCurriculumBackup } from "@/server/workspace-data";

export async function parseImportFileAction(formData: FormData) {
  return wrap(
    async () => {
      await requireViewer();
      const file = formData.get("file");
      const template = String(formData.get("template") ?? "") as TemplateKey;
      if (!(file instanceof File)) throw new WorkflowError("VALIDATION", "Choose a file to upload.");
      if (file.size > 10 * 1024 * 1024) throw new WorkflowError("VALIDATION", "Files are limited to 10 MB.");
      if (!TEMPLATES[template]) throw new WorkflowError("VALIDATION", "Choose a template first.");
      const sheet = await parseUpload(file.name, await file.arrayBuffer());
      if (!sheet.headers.length) throw new WorkflowError("VALIDATION", "The file has no header row.");
      return { sheet, fileName: file.name, mapping: autoMap(TEMPLATES[template], sheet.headers) };
    },
    { revalidate: false },
  );
}

export async function runImportAction(input: {
  template: TemplateKey;
  mode: ImportMode;
  sheet: ParsedSheet;
  mapping: Record<string, string>;
  dryRun: boolean;
  fileName: string;
  validOnly?: boolean;
}) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      return await runImport(viewer, input);
    },
    { revalidate: !input.dryRun },
  );
}

// Curriculum tracker JSON (grade -> subjects -> units -> parts -> videos), as kept by the Recording team.
// Re-importing matches units, parts and videos by their IDs, so nothing is duplicated.
export async function importTrackerAction(formData: FormData) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!can(viewer, "import.tracker"))
      throw new WorkflowError("FORBIDDEN", "Your role does not have permission to import the curriculum tracker.");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new WorkflowError("VALIDATION", "Choose the tracker JSON file.");
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new WorkflowError("VALIDATION", "The file is not valid JSON.");
    }
    if (!isCurriculumBackup(data)) throw new WorkflowError("VALIDATION", "This JSON is not a curriculum tracker backup (grades with subjects, units, parts and videos).");
    return await importCurriculumBackup(data, { actorId: viewer.id, fileName: file.name, createItems: true, markRecorded: true });
  });
}
