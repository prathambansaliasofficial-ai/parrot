import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import { getFaqs } from "@/lib/queries";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers about downloading papers, contributing notes, copyright, accounts, university coverage and broken files.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const faqs = getFaqs();
  const groups = new Map<string, typeof faqs>();
  for (const faq of faqs) {
    const list = groups.get(faq.category) ?? [];
    list.push(faq);
    groups.set(faq.category, list);
  }

  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }} />
      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        description="How the library works, how contributions are reviewed, and what to do when a file will not open."
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {faqs.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="font-display text-lg">No FAQs published yet</p>
            <p className="mt-1 text-sm text-muted">An administrator can add questions from the admin panel.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {[...groups.entries()].map(([category, items]) => (
              <section key={category}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {category.replace(/-/g, " ")}
                </h2>
                <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                  {items.map((faq) => (
                    <details key={faq.id} className="group px-5 py-4">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium">
                        {faq.question}
                        <span className="mt-0.5 text-muted transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="card mt-9 flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Still stuck?</p>
            <p className="text-xs text-muted">
              Open a ticket and you will get a reference ID. Email {SITE.email} for anything else.
            </p>
          </div>
          <Link href="/support" className="btn btn-primary btn-sm shrink-0">
            Contact support
          </Link>
        </div>
      </div>
    </>
  );
}
