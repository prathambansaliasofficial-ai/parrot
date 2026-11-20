import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Copyright and DMCA policy",
  description:
    "How to report material on FreeResources that infringes your copyright, what information to include, and how counter-notices work.",
  alternates: { canonical: "/dmca" },
};

export default function DmcaPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Copyright and DMCA policy"
        description="We respect copyright. If a file should not be here, tell us and we will review it promptly."
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-xs text-muted">Last updated 6 November 2026</p>

        <div className="prose-page">
          <h2>Our position</h2>
          <p>
            FreeResources hosts academic material contributed by students. We do not host textbooks, paid test
            series, software or other commercial content. When a valid copyright complaint is received, the file is
            removed or access is disabled while the claim is reviewed.
          </p>

          <h2>How to file a notice</h2>
          <p>
            Send a written notice to <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with the subject “Copyright
            notice”, or use the{" "}
            <Link href="/support?category=copyright">copyright support category</Link>. A valid notice should include:
          </p>
          <ul>
            <li>Your name, organisation (if any), and contact email.</li>
            <li>The exact URL of the resource on this site, or the file name and subject page.</li>
            <li>A description of the copyrighted work you say is infringed.</li>
            <li>An explanation of why you believe the use is not authorised.</li>
            <li>A statement that the information is accurate and that you are the owner or authorised to act for the owner.</li>
            <li>Your physical or electronic signature.</li>
          </ul>
          <p>
            Incomplete notices may be returned for clarification, which can delay removal. Please do not send
            sensitive identity documents unless specifically requested.
          </p>

          <h2>What happens next</h2>
          <ol>
            <li>We acknowledge the notice and disable access to the identified file while we review it.</li>
            <li>We notify the contributor, where contact details are available, and invite a response.</li>
            <li>If the claim is valid, the resource is removed and the contributor is told why.</li>
            <li>If the claim is not valid, access may be restored with an explanation.</li>
          </ol>
          <p>
            We aim to act on clear notices within a few working days. Repeated infringement by a contributor results
            in that contributor being blocked from uploading.
          </p>

          <h2>Counter-notice</h2>
          <p>
            If your file was removed and you believe you have the right to share it, reply to the removal email with:
          </p>
          <ul>
            <li>The resource URL or file name.</li>
            <li>Your contact details.</li>
            <li>An explanation of your rights to the material, for example that you created the notes yourself or that the paper is publicly distributed by the university.</li>
            <li>A statement that you consent to the claim being reviewed and accept responsibility for the submission.</li>
          </ul>
          <p>
            We may restore the file if the basis for the original complaint does not hold, or ask both parties to
            resolve the matter directly.
          </p>

          <h2>Reporting your own material</h2>
          <p>
            If you are the student who created a set of notes and want it credited differently or removed, you do not
            need a formal copyright notice. Email us with the link and we will action it.
          </p>

          <h2>Repeat infringers</h2>
          <p>
            Accounts that repeatedly upload infringing material are suspended. Uploading the same removed file under a
            new name is treated as repeat infringement.
          </p>

          <h2>Contact</h2>
          <p>
            Copyright enquiries: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. This address also handles general
            legal correspondence about the platform.
          </p>
        </div>
      </div>
    </>
  );
}
