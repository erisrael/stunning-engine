// Legacy CMS: constants shared by the page and its views.
import type { LegacyCmsCategory } from "@/server/legacy-cms";

export const CATEGORY_PATHS: Record<LegacyCmsCategory, string> = {
  students: "/admin/students",
  parents: "/admin/parents",
  "subscription-plans": "/admin/subscription-plans",
  "subscription-histories": "/admin/subscription-histories",
  invoices: "/admin/invoices",
  subscriptions: "/admin/subscriptions",
  feedback: "/admin/feedback",
};
