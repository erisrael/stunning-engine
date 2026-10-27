import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">Not found, or not in your access scope</h2>
      <p className="text-sm text-muted-foreground">The record may have moved, or it belongs to a grade or subject you cannot open. Ask a manager if you need access.</p>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
