import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

interface ResourceRow {
  id: string;
  course_id: string;
  title: string;
  category: string;
  description: string | null;
}

async function getResources(): Promise<{ rows: ResourceRow[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/resources`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { rows: [], error: `The study-resources API responded ${response.status}.` };
    return { rows: (await response.json()) as ResourceRow[] };
  } catch {
    return { rows: [], error: "Could not reach the study-resources API. Is the backend running?" };
  }
}

export default async function ResourcesPage() {
  const { rows, error } = await getResources();

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fresources</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="active" href="/">Home</Link>
          <Link href="/resources">Resources</Link>
        </nav>
        <a className="account-link" href="/dashboard">Sign in</a>
      </header>

      <section className="resources-section" style={{ paddingTop: "3rem" }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your material, in one place</p>
            <h2>Study resources</h2>
          </div>
        </div>

        {error && <p className="parrot-error" role="alert">{error}</p>}

        {!error && rows.length === 0 && <p>No resources published yet.</p>}

        <div className="resource-grid">
          {rows.map((row) => (
            <Link key={row.id} className="category-card resource-card" href={`/resources/${row.id}`}>
              <span className="category-icon" aria-hidden="true">{row.category.slice(0, 1).toUpperCase()}</span>
              <span className="resource-text">
                <strong>{row.title}</strong>
                <span>{row.description ?? `Category: ${row.category}`}</span>
              </span>
              <span className="category-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
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
