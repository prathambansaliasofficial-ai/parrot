import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description:
    "The rules for using FreeResources.in, contributing academic material and accessing the library.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms and conditions"
        description="Plain rules for a free academic library: use it honestly, contribute only what you have the right to share, and do not abuse the service."
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-xs text-muted">Last updated 6 November 2026</p>

        <div className="prose-page">
          <h2>1. Acceptance</h2>
          <p>
            By accessing FreeResources.in you agree to these terms. If you do not agree, do not use the site. The site
            is operated independently and is not affiliated with any university.
          </p>

          <h2>2. The service</h2>
          <p>
            FreeResources provides a searchable library of student-contributed academic material: previous year
            papers, notes, syllabus, practical files and related resources. Access to published resources is free and
            does not require an account. Accounts are required to contribute, track submissions or administer the
            site.
          </p>
          <p>
            We may add, change, suspend or remove any part of the service, including individual resources, without
            notice.
          </p>

          <h2>3. Accounts</h2>
          <ul>
            <li>Provide accurate information and keep your password confidential.</li>
            <li>You are responsible for activity under your account.</li>
            <li>Do not create accounts to evade a suspension or to scrape the library.</li>
            <li>We may suspend or remove an account that violates these terms.</li>
          </ul>

          <h2>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Upload material you do not have the right to share, including paid textbooks, test series or pirated content.</li>
            <li>Upload malware, executable files, or files disguised as PDFs.</li>
            <li>Impersonate a university, faculty member or another student.</li>
            <li>Attempt to access admin areas, other users' accounts, or data you are not authorised to see.</li>
            <li>Use automated tools to scrape or bulk-download the library in a way that degrades service.</li>
            <li>Post unlawful, harassing or defamatory material through tickets, requests or contributions.</li>
          </ul>

          <h2>5. Your contributions</h2>
          <p>
            You keep ownership of what you upload. By submitting a resource you grant FreeResources a non-exclusive,
            royalty-free, worldwide licence to store, reproduce and display that file and its metadata on the
            platform, and to allow students to view and download it. You confirm you have the right to grant this
            licence.
          </p>
          <p>
            Submissions are reviewed before publishing. We may edit metadata for accuracy, reject a submission, or
            remove a published resource at any time, including after a copyright complaint.
          </p>

          <h2>6. Academic accuracy</h2>
          <p>
            Material is contributed by students and is not endorsed by any university. Syllabus and exam patterns
            change. Always confirm critical information with your institution. See the{" "}
            <Link href="/disclaimer">disclaimer</Link>.
          </p>

          <h2>7. Copyright</h2>
          <p>
            We respond to valid notices under our{" "}
            <Link href="/dmca">copyright and DMCA policy</Link>. If you believe a file infringes your rights, report it
            with the resource URL and proof of ownership.
          </p>

          <h2>8. Third-party links</h2>
          <p>
            Community links, advertisements and university websites are operated by others. We are not responsible for
            their content, availability or privacy practices.
          </p>

          <h2>9. No warranty</h2>
          <p>
            The service is provided “as is” and “as available”, without warranties of any kind, express or implied,
            including fitness for a particular purpose, accuracy or uninterrupted availability.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, FreeResources and its operators are not liable for indirect,
            incidental or consequential loss, loss of data, or loss arising from reliance on contributed material.
            Nothing in these terms limits liability that cannot lawfully be limited.
          </p>

          <h2>11. Changes</h2>
          <p>
            We may update these terms. The date at the top will change. Continued use after a change constitutes
            acceptance. Material changes will be announced on the site.
          </p>

          <h2>12. Governing law</h2>
          <p>
            These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the
            courts of the operator's place of business.
          </p>

          <h2>13. Contact</h2>
          <p>
            Questions about these terms: <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or the{" "}
            <Link href="/support?category=general-enquiry">support form</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
