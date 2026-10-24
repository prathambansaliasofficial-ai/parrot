import Link from "next/link";
import { BookOpen, Github, Linkedin, Mail, Sparkles, Twitter, Youtube } from "lucide-react";

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
    <main className="resource-library-page">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Fresources home"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>Fresources</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/">Home</Link><Link className="active" href="/resources">Resources</Link><Link href="/hackmate">Hackmate</Link><Link href="/events">Events</Link>
        </nav>
        <div className="account-actions"><Link className="login-link" href="/login">Log in</Link><Link className="account-link" href="/signup">Sign up</Link></div>
      </header>

      <section className="resources-section resource-library-section">
        <div className="resource-library-hero">
          <div>
            <p className="eyebrow"><Sparkles aria-hidden="true" /> Your material, in one place</p>
            <h1>Resources for every<br /><span>study session.</span></h1>
            <p>Browse course materials selected to help you learn, revise, and prepare with confidence.</p>
          </div>
          <div className="resource-library-summary" aria-label="Resource library summary"><BookOpen aria-hidden="true" /><div><strong>{rows.length}</strong><span>available resources</span></div></div>
        </div>

        {error && <p className="parrot-error" role="alert">{error}</p>}

        {!error && rows.length === 0 && <p className="resource-empty">No resources published yet.</p>}

        <div className="resource-grid">
          {rows.map((row) => (
            <Link key={row.id} className="category-card resource-card" href={`/resources/${row.id}`}>
              <span className="category-icon" aria-hidden="true">{row.category.slice(0, 1).toUpperCase()}</span>
              <span className="resource-text">
                <span className="resource-category">{row.category}</span>
                <strong>{row.title}</strong>
                <span>{row.description ?? `Category: ${row.category}`}</span>
              </span>
              <span className="category-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <section className="newsletter-panel" aria-labelledby="newsletter-title"><div><p className="newsletter-kicker">✦ &nbsp; Stay updated</p><h2 id="newsletter-title">Get the latest resources<br />straight to <span>your inbox.</span></h2><p>Join our newsletter to receive new resources, event updates, and platform improvements.</p></div><div className="newsletter-placeholder" aria-label="Newsletter updates are coming soon"><Mail aria-hidden="true" /><span>Newsletter updates coming soon</span></div></section>
        <div className="footer-main">
          <div className="footer-about"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>Fresources</span></Link><p>College learning resources, study support, and collaborative growth.</p><div className="social-row" aria-label="Social channels"><span title="GitHub"><Github aria-hidden="true" /></span><span title="Discord">●</span><span title="Twitter"><Twitter aria-hidden="true" /></span><span title="LinkedIn"><Linkedin aria-hidden="true" /></span><span title="YouTube"><Youtube aria-hidden="true" /></span></div></div>
          <div className="footer-column"><h3>Product</h3><Link href="/">Home</Link><Link href="/resources">Resources</Link><Link href="/hackmate">Hackmate</Link><Link href="/dashboard">Dashboard</Link></div>
          <div className="footer-column"><h3>Resources</h3><Link href="/resources">All Resources</Link><Link href="/resources">Study Materials</Link><Link href="/resources">Project Ideas</Link><Link href="/events">Events</Link></div>
          <div className="footer-column"><h3>Company</h3><Link href="/events">About</Link><Link href="/events">Blog</Link><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
          <div className="footer-column"><h3>Support</h3><Link href="/resources">Help Center</Link><Link href="/resources">Guidelines</Link><Link href="/resources">Report an Issue</Link><Link href="/resources">Status</Link></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Fresources. All rights reserved.</span><span><i /> Built for learners, by learners.</span></div>
      </footer>
    </main>
  );
}
