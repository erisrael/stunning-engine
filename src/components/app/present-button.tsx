"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PresentationIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens the full-screen presentation with the Overview's current filters.
export function PresentButton() {
  const params = useSearchParams();
  const q = params.toString();
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/overview/present${q ? `?${q}` : ""}`} title="Full-screen view for a wall screen or a meeting that cycles through progress by itself">
        <PresentationIcon /> Present
      </Link>
    </Button>
  );
}
