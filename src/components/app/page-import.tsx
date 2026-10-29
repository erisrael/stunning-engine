import { templateInfo, templateList, type TemplateKey } from "@/server/importer";
import type { AppUser } from "@/server/users";
import { ImportDialog } from "./import-dialog";

// Templates offered on each page, in this order. Each person only sees the ones their role allows.
export const PAGE_IMPORTS = {
  work: ["recording_progress", "editing_progress", "uploading_progress", "publication_progress", "progress", "items"],
  calendar: ["recording_sessions", "recording_progress", "publication_progress"],
  curriculum: ["structure", "grades", "subjects", "units", "parts", "curriculum"],
  people: ["users"],
  admin: ["users", "structure", "items", "historical"],
} satisfies Record<string, TemplateKey[]>;

const COPY: Record<keyof typeof PAGE_IMPORTS, { title: string; description: string }> = {
  work: { title: "Import work done", description: "Record progress done outside the app, or add items. Download a template or a pre-filled file, fill it in, then review every row before saving." },
  calendar: { title: "Import schedule and progress", description: "Add recording sessions in bulk, or record parts already recorded or published." },
  curriculum: {
    title: "Import curriculum",
    description: "Grades, subjects, units and parts, one kind at a time or all together in one file. Download Current curriculum to edit what is there and import it back.",
  },
  people: { title: "Import people", description: "Add or update accounts, roles and grade or subject access." },
  admin: { title: "Import workspace data", description: "People, the curriculum structure, items and historical records." },
};

export function PageImport({ viewer, page, label = "Import", only }: { viewer: AppUser; page: keyof typeof PAGE_IMPORTS; label?: string; only?: TemplateKey[] }) {
  const keys: TemplateKey[] = only ?? PAGE_IMPORTS[page];
  const allowed = templateList(viewer);
  const templates = keys.flatMap((k) => allowed.filter((t) => t.key === k)).map(templateInfo);
  if (!templates.length) return null;
  return <ImportDialog templates={templates} label={label} {...COPY[page]} />;
}
