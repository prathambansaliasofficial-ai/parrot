import Link from "next/link";

import SettingsForm from "@/components/admin/settings-form";
import { getSiteSetting } from "@/lib/queries";

export default function AdminSettingsPage() {
  const fields = [
    {
      key: "home_headline",
      label: "Homepage headline",
      help: "The large heading at the top of the homepage.",
      value: getSiteSetting("home_headline", "Your College. Your Resources. All in One Place."),
      max: 120,
    },
    {
      key: "home_subhead",
      label: "Homepage subheading",
      help: "One or two sentences under the headline.",
      value: getSiteSetting(
        "home_subhead",
        "Find previous year papers, notes, syllabus and practical files for your university, course and semester.",
      ),
      rows: 3,
      max: 320,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Site content</p>
        <h1 className="mt-1 text-2xl">Homepage & settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Copy shown on the public homepage. Community links, FAQs, ads and announcements have their own managers.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <SettingsForm fields={fields} />
        <aside className="card h-fit p-5">
          <h2 className="text-sm font-semibold">Related content</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {[
              ["FAQs", "/admin/entities/faqs"],
              ["Community links", "/admin/entities/community-links"],
              ["Advertisements", "/admin/entities/advertisements"],
              ["Announcements", "/admin/entities/announcements"],
            ].map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-primary hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[0.7rem] leading-relaxed text-muted">
            These settings are stored in the database and read on the server. No redeploy is needed.
          </p>
        </aside>
      </div>
    </div>
  );
}
