import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What FreeResources stores, why it stores it, how long it is kept, and how to ask for it to be removed.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        description="We collect as little as possible: what is needed to run an account, review a contribution and keep the library working."
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-xs text-muted">Last updated 6 November 2026</p>

        <div className="prose-page">
          <h2>Who we are</h2>
          <p>
            FreeResources.in is an independent student resource library. For privacy questions, contact{" "}
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>

          <h2>What we collect</h2>
          <p>When you create an account:</p>
          <ul>
            <li>Your name and email address.</li>
            <li>A password, stored only as a salted scrypt hash. We never store the plain password.</li>
            <li>The date the account was created.</li>
          </ul>
          <p>When you contribute a resource:</p>
          <ul>
            <li>The file you upload and the metadata you enter (subject, session, category, description).</li>
            <li>Your contributor name and email, so we can credit you and reply about the submission.</li>
            <li>Review notes written by an administrator.</li>
          </ul>
          <p>When you use the library:</p>
          <ul>
            <li>A download counter per resource and a row per download (file, resource, timestamp).</li>
            <li>The text of searches and the number of results returned. Searches are not linked to your account.</li>
            <li>Support tickets, requests and the email address you provide with them.</li>
          </ul>
          <p>
            We do not store IP addresses in the database. The server applies an in-memory rate limit to uploads and
            form submissions; that counter is not persisted.
          </p>

          <h2>Cookies and local storage</h2>
          <ul>
            <li>
              <code>fr_session</code> — a signed session token, httpOnly, used to keep you signed in. Strictly
              necessary.
            </li>
            <li>
              <code>fr-theme</code> — your light/dark preference, stored in local storage. Not sent to the server.
            </li>
          </ul>
          <p>
            There are no advertising cookies, analytics scripts or third-party trackers on this site. Advertisements, if
            enabled, are served as plain links or images from our own database.
          </p>

          <h2>How we use data</h2>
          <ul>
            <li>To operate accounts, sessions and administrator permissions.</li>
            <li>To review, publish and credit contributions.</li>
            <li>To answer support tickets and resource requests.</li>
            <li>To understand which subjects and universities need more material, in aggregate.</li>
          </ul>
          <p>We do not sell personal data, and we do not share it with advertisers.</p>

          <h2>Storage and retention</h2>
          <p>
            Account records, submissions and ticket data are kept while the account or record is active. Uploaded
            files remain while their resource is published or awaiting review. Rejected contributions may be removed
            after review. Search logs are kept in aggregate for a limited period and are not tied to a person.
          </p>
          <p>
            On this deployment, files and the database are stored on the application server. If you deploy with
            Supabase or another hosted provider, that provider processes storage and database data on your behalf
            under its own terms.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>You can ask for a copy of the account data we hold about you.</li>
            <li>You can ask for your account and personal details to be deleted.</li>
            <li>
              You can ask for a contribution to be credited differently or removed. Published academic material may
              remain available where there is a legitimate reason to keep it, but your personal details will be
              removed.
            </li>
          </ul>
          <p>
            Use the{" "}
            <Link href="/support?category=general-enquiry">support form</Link> or email {SITE.email} with the subject
            “Privacy request”. We may ask you to verify control of the email address before acting.
          </p>

          <h2>Children</h2>
          <p>
            The library is intended for students at higher-education institutions. If you are under 13, please do not
            create an account.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes materially, the date at the top will change and signed-in users will see a notice
            on the site. Continued use after a change means you accept the updated policy.
          </p>
        </div>
      </div>
    </>
  );
}
