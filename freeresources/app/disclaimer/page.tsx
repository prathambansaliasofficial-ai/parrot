import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "FreeResources is an independent, student-contributed library. It is not affiliated with or endorsed by any university.",
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Disclaimer"
        description="What this library is, and what it is not."
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-xs text-muted">Last updated 6 November 2026</p>

        <div className="prose-page">
          <h2>Independent platform</h2>
          <p>
            FreeResources.in is an independent student resource library. It is not owned, operated, endorsed or
            sponsored by AKTU, DTU, NSUT, GGSIPU, CCSU, the University of Delhi, IGNOU, Ambedkar University Delhi or
            any other institution named on this site. University names are used only to describe where academic
            material belongs.
          </p>

          <h2>Contributed material</h2>
          <p>
            Files are contributed by students and reviewed by volunteer moderators. Review checks the file type,
            metadata and that the document opens; it does not certify that a paper is the official version from a
            university, that an answer is correct, or that notes cover the current syllabus.
          </p>

          <h2>Sample records</h2>
          <p>
            The library ships with no demonstration or placeholder papers: a resource appears only after a real,
            permission-checked document is reviewed and published. If a legacy record is still marked{" "}
            <strong>SAMPLE</strong>, treat it as an upload-workflow example rather than a real question paper, and do
            not use it for exam preparation. Every university and subject still needs verification against your own
            syllabus before you rely on it.
          </p>

          <h2>Syllabus and exams</h2>
          <p>
            Syllabi, schemes and exam patterns change. A paper from a previous session may not match the current
            pattern. Always confirm the applicable syllabus, subject code and examination scheme with your university
            or department.
          </p>

          <h2>No professional advice</h2>
          <p>
            Nothing on this site constitutes academic, legal, medical or career advice. Study guides are general
            suggestions, not a guarantee of results.
          </p>

          <h2>Downloads</h2>
          <p>
            We accept PDF files only and validate file signatures on upload, but you download at your own risk. Keep
            your device protected and report anything that looks wrong. If a file does not open, use the{" "}
            <Link href="/support?category=broken-download">broken download</Link> form so it can be replaced.
          </p>

          <h2>External links</h2>
          <p>
            Links to community groups, university websites and advertisers are provided for convenience. We do not
            control and are not responsible for third-party content or availability.
          </p>

          <h2>Availability</h2>
          <p>
            The service may be unavailable during maintenance or due to hosting issues. We do not guarantee uptime or
            permanent retention of any file.
          </p>
        </div>
      </div>
    </>
  );
}
