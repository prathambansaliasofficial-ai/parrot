import Link from "next/link";
import { notFound } from "next/navigation";
import OpenParrotButton from "@/components/parrot/OpenParrotButton";

const API_BASE = process.env.BACKEND_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

interface ResourceDetail {
  id: string;
  course_id: string;
  title: string;
  category: string;
  description: string | null;
  metadata?: {
    subject?: string | null;
    branch?: string | null;
    semester?: string | null;
    college?: string | null;
    course?: string | null;
    topics?: string[];
  } | null;
  passages?: { id: string; page: number; content: string }[];
  source?: "supabase" | "demo";
}

async function getResource(id: string): Promise<ResourceDetail | null> {
  try {
    const response = await fetch(
      new URL(`/api/v1/resources/${encodeURIComponent(id)}`, API_BASE),
      {
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as ResourceDetail;
  } catch {
    return null;
  }
}

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await getResource(id);
  if (!resource) notFound();

  const subject = resource.metadata?.subject ?? resource.metadata?.course ?? resource.category;

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fresources</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link className="active" href="/resources">Resources</Link>
        </nav>
        <a className="account-link" href="/dashboard">Sign in</a>
      </header>

      <section className="resource-detail">
        <div className="resource-detail-head">
          <p className="eyebrow">
            {resource.source === "demo" ? "Demo resource" : "Resource"} · {subject}
          </p>
          <h1>{resource.title}</h1>
          {resource.description && <p className="resource-description">{resource.description}</p>}
          <div className="resource-meta-row">
            {resource.metadata?.college && <span>{resource.metadata.college}</span>}
            {resource.metadata?.branch && <span>{resource.metadata.branch}</span>}
            {resource.metadata?.semester && <span>{resource.metadata.semester}</span>}
            <span className="resource-category-pill">{resource.category}</span>
          </div>
          <OpenParrotButton
            resource={{
              resourceId: resource.id,
              title: resource.title,
              subject: subject ?? undefined,
              category: resource.category,
              focusTopic: resource.metadata?.topics?.[0],
            }}
          />
        </div>

        {resource.passages && resource.passages.length > 0 && (
          <div className="passage-list">
            <h2>Material</h2>
            {resource.passages.map((passage) => (
              <article key={passage.id} className="passage-card">
                <span className="passage-page">Page {passage.page}</span>
                <p>{passage.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fresources</span>
        </Link>
        <p>College learning resources, with Parrot AI alongside your studies.</p>
        <div className="footer-links">
          <Link href="/">Home</Link>
          <Link href="/resources">Resources</Link>
        </div>
      </footer>
    </main>
  );
}
