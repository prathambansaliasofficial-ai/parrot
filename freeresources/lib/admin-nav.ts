export type AdminNavItem =
  | { href: string; label: string }
  | { label: string; items: { href: string; label: string }[] };

/**
 * Client-safe admin navigation. Kept out of lib/admin.ts because that module
 * imports the SQLite driver and must never be bundled into the browser.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview" },
  {
    label: "Acquisition",
    items: [
      { href: "/admin/acquisition", label: "Dashboard" },
      { href: "/admin/acquisition/hunter", label: "AI hunter" },
      { href: "/admin/acquisition/pipeline", label: "Pipeline" },
      { href: "/admin/acquisition/documents", label: "Documents" },
      { href: "/admin/acquisition/institutions", label: "Institutions" },
      { href: "/admin/acquisition/curricula", label: "Syllabus library" },
      { href: "/admin/acquisition/sources", label: "Sources" },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/admin/resources", label: "Resources" },
      { href: "/admin/contributions", label: "Contributions" },
    ],
  },
  {
    label: "Academic structure",
    items: [
      { href: "/admin/entities/universities", label: "Universities" },
      { href: "/admin/entities/colleges", label: "Colleges" },
      { href: "/admin/entities/programmes", label: "Programmes" },
      { href: "/admin/entities/branches", label: "Branches" },
      { href: "/admin/entities/subjects", label: "Subjects" },
      { href: "/admin/entities/categories", label: "Categories" },
      { href: "/admin/entities/academic-years", label: "Academic years" },
    ],
  },
  {
    label: "Students",
    items: [
      { href: "/admin/requests", label: "Resource requests" },
      { href: "/admin/tickets", label: "Support tickets" },
    ],
  },
  {
    label: "Site content",
    items: [
      { href: "/admin/settings", label: "Homepage & settings" },
      { href: "/admin/entities/faqs", label: "FAQs" },
      { href: "/admin/entities/community-links", label: "Community links" },
      { href: "/admin/entities/advertisements", label: "Advertisements" },
      { href: "/admin/entities/announcements", label: "Announcements" },
    ],
  },
  { href: "/admin/analytics", label: "Analytics" },
];
