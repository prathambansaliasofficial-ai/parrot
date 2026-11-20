export const SITE = {
  name: "FreeResources",
  domain: "FreeResources.in",
  tagline: "Your College. Your Resources. All in One Place.",
  description:
    "A free, organised academic resource library for Indian universities — previous year papers, notes, syllabus and practical files, all in one place.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  email: "hello@freeresources.in",
};

export const NAV = [
  { href: "/universities", label: "Universities" },
  { href: "/resources", label: "Explore Resources" },
  { href: "/pyqs", label: "PYQs" },
  { href: "/notes", label: "Notes" },
  { href: "/syllabus", label: "Syllabus" },
  { href: "/contribute", label: "Contribute" },
  { href: "/community", label: "Community" },
];

export const CATEGORY_GROUPS = [
  { slug: "pyq", label: "Previous Year Papers", short: "PYQs" },
  { slug: "notes", label: "Notes", short: "Notes" },
  { slug: "syllabus", label: "Syllabus", short: "Syllabus" },
  { slug: "practical", label: "Practical Files", short: "Practicals" },
  { slug: "other", label: "Other Resources", short: "Other" },
] as const;

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]["slug"];

export const RESOURCE_GROUPS_FOR_TABS: { slug: string; label: string }[] = [
  { slug: "all", label: "All resources" },
  ...CATEGORY_GROUPS.map((g) => ({ slug: g.slug, label: g.label })),
];

export const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "downloads", label: "Most downloaded" },
  { value: "title", label: "Title A–Z" },
] as const;

export const SESSION_OPTIONS = [
  "2025-26",
  "2024-25",
  "2023-24",
  "2022-23",
  "2021-22",
] as const;

export const UNIVERSITY_TYPES = ["Central", "State", "Deemed", "Private", "Autonomous"] as const;

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
