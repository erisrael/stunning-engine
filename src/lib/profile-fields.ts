export const PROFILE_FIELDS = [
  { key: "avatar", label: "Profile photo" },
  { key: "cover", label: "Cover banner colour" },
  { key: "headline", label: "Headline / job title" },
  { key: "about", label: "About / Bio" },
  { key: "location", label: "Location" },
  { key: "skills", label: "Skills & competencies" },
  { key: "education", label: "Education & degrees" },
  { key: "experience", label: "Work experience" },
  { key: "languages", label: "Languages" },
  { key: "links", label: "Links & websites" },
  { key: "studyStatus", label: "Study status" },
  { key: "contact", label: "Contact information (phone, office, messengers)" },
  { key: "gmail", label: "Attached Gmail (for Google sign-in & password recovery)" },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"];

