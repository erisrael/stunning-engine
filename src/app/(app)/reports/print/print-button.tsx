"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button className="no-print" onClick={() => window.print()}>
      <PrinterIcon /> Print or save as PDF
    </Button>
  );
}
