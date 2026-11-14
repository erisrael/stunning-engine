import { readArticle } from "@/server/support-channels";
import { ArticleBody } from "@/components/help/article-body";

// A published help article (customer support knowledge base), for links in replies by email or Telegram.
export const dynamic = "force-dynamic";
export const metadata = { title: "Help" };

export default async function HelpArticle({ params }: { params: Promise<{ id: string }> }) {
  const a = await readArticle((await params).id).catch(() => null);
  if (!a) return <p className="p-8 text-center text-muted-foreground">This article is not available.</p>;
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-4 py-10" data-help-article>
      {a.category && <p className="text-sm text-muted-foreground">{a.category}</p>}
      <h1 className="text-3xl font-semibold">{a.title}</h1>
      <ArticleBody a={a} />
      <p className="text-xs text-muted-foreground">Updated {a.updated_at.slice(0, 10)}</p>
    </article>
  );
}
