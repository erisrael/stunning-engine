"use client";

import { registerRoleLabels } from "@/lib/domain";

// Admin's role names (Roles and permissions) for roleLabel in the browser, so created roles never show as raw keys.
export function RoleLabels({ labels }: { labels: Record<string, string> }) {
  registerRoleLabels(labels);
  return null;
}
