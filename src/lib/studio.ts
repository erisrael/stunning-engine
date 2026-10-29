// Studio vocabulary (shared by the server and the browser).

export const RESOURCE_TYPES = ["note", "exam", "flashcards"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const RESOURCE_TYPE_LABELS: Record<ResourceType, { one: string; many: string }> = {
  note: { one: "note", many: "Notes" },
  exam: { one: "exam", many: "Exams" },
  flashcards: { one: "flash card deck", many: "Flash cards" },
};

export const RESOURCE_STATUSES = ["draft", "review", "approved", "published", "archived"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = { draft: "Draft", review: "In review", approved: "Approved", published: "Published", archived: "Archived" };
export const RESOURCE_STATUS_TONE: Record<ResourceStatus, string> = { draft: "neutral", review: "paused", approved: "active", published: "done", archived: "neutral" };

export const QUESTION_TYPES = ["mcq", "multi", "true_false", "short", "essay"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: "Single answer", multi: "Several answers", true_false: "True or false", short: "Short answer", essay: "Essay" };
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type QuestionOption = { id: string; text: string; correct: boolean };
