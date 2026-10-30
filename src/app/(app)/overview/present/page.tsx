import { requireCapability } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { structureRows } from "@/server/structure";
import { listUsers } from "@/server/users";
import { Visualizer } from "@/components/app/visualizer";

export const metadata = { title: "Overview presentation" };

// Full-screen Overview for a wall screen or a meeting. Follows the Overview's grade, subject and mode filters.
export default async function PresentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.overview");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const list = (k: string) => one(k).split(",").filter((x) => x && x !== "all");
  const gradeIds = list("grade");
  const subjectIds = list("subject");
  const mode = one("mode") === "subject" ? "subject" : "grade";
  const [rows, tax, users] = await Promise.all([structureRows(viewer, { gradeIds, subjectIds }), taxonomy(), listUsers()]);
  const names = (ids: string[], from: { id: string; name: string }[]) => from.filter((x) => ids.includes(x.id)).map((x) => x.name);
  const picked = [...names(gradeIds, tax.grades), ...names(subjectIds, tax.subjects)];
  const back = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  return (
    <Visualizer
      rows={rows}
      mode={mode}
      users={Object.fromEntries(users.map((u) => [u.id, u.name]))}
      filterLabel={picked.length ? picked.join(", ") : "All grades and subjects"}
      backHref={`/overview${back.size ? `?${back}` : ""}`}
    />
  );
}
