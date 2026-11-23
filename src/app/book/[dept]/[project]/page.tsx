import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { projectBook } from "@/server/project-pack";
import { BOOK_CSS } from "@/lib/book-css";
import { BookView } from "./book-view";
import { deptViewPath } from "@/lib/work";

export const dynamic = "force-dynamic";

// The project book: everything about a project in one document set as a book (cover, document control, contents,
// the chapters to the IEEE standards, the roadmap, traceability). Print it or save it as PDF.
export async function generateMetadata({ params }: { params: Promise<{ dept: string; project: string }> }) {
  const v = await getViewer();
  if (!v) return { title: "Project book" };
  const { dept, project } = await params;
  const b = await projectBook(v, dept, project).catch(() => null);
  return { title: b?.title ?? "Project book" };
}

export default async function BookPage({ params }: { params: Promise<{ dept: string; project: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { dept, project } = await params;
  const book = await projectBook(viewer, dept, project).catch((e: Error) => ({ error: e.message }) as const);
  if ("error" in book)
    return (
      <main className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-xl font-semibold">This book is not available</h1>
        <p className="mt-2 text-muted-foreground">{book.error}</p>
      </main>
    );
  return (
    <>
      <style href="myseed-book" precedence="medium">
        {BOOK_CSS}
      </style>
      <BookView html={book.html} back={deptViewPath(dept, "roadmap")} title={book.title} />
    </>
  );
}
