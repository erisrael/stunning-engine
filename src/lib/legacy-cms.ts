export type LegacyCmsCategory =
  | "students"
  | "parents"
  | "subscription-plans"
  | "subscription-histories"
  | "invoices"
  | "subscriptions"
  | "feedback";

export const LEGACY_CMS_CATEGORIES: { key: LegacyCmsCategory; label: string; path: string; description: string }[] = [
  { key: "students", label: "Students", path: "/admin/students", description: "Enrolled student profiles, grades, and parent links." },
  { key: "parents", label: "Parents", path: "/admin/parents", description: "Parent and guardian contact records and verification status." },
  { key: "subscription-plans", label: "Subscription Plans", path: "/admin/subscription-plans", description: "Curriculum tiers, billing intervals, and pricing." },
  { key: "subscription-histories", label: "Subscription Histories", path: "/admin/subscription-histories", description: "Log of plan changes, activations, and cancellations." },
  { key: "invoices", label: "Invoices", path: "/admin/invoices", description: "Billing statements, pending payments, and payment slips." },
  { key: "subscriptions", label: "Subscriptions", path: "/admin/subscriptions", description: "Active student subscription enrollments." },
  { key: "feedback", label: "Feedbacks & Complaints", path: "/admin/feedback", description: "User bug reports, feedback, feature requests, and complaints." },
];

export type UserCmsOverride = {
  userId: string;
  userName?: string;
  username?: string;
  allowedTabs: LegacyCmsCategory[];
  updatedAt: string;
};

