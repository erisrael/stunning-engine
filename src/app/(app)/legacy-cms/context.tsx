"use client";

// The Legacy CMS page's state, shared with its views.
import * as React from "react";
import type { LegacyCmsState } from "./state";

export const LegacyCmsContext = React.createContext<LegacyCmsState | null>(null);
export function useLegacyCms() {
  const v = React.useContext(LegacyCmsContext);
  if (!v) throw new Error("Legacy CMS views must be inside the page.");
  return v;
}
