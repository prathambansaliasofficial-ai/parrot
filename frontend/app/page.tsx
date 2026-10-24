import Link from "next/link";

const resourceCategories = [
  "Books",
  "Assignments",
  "Notes",
  "Practicals",
  "Papers",
  "Playlists",
  "Experiments",
  "Syllabus",
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Fresources home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fresources</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="active" href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/hackmate">Hackmate</Link>
          <Link href="/resources">Resources</Link>
        </nav>
        <Link className="account-link" href="/dashboard">Sign in</Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Your college. Your course. Your study space.</p>
          <h1>
            Welcome to
            <span className="gradient-text">Fresources</span>
          </h1>
          <p className="hero-description">
            One stop for your academic resources. Find books, notes,
            assignments, practicals, question papers, and exam support in one
            place.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/resources">Explore resources</Link>
            <a className="button button-secondary" href="#parrot">Meet Parrot AI</a>
          </div>
        </div>
        <div className="hero-art" aria-label="Study workspace illustration" role="img">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="study-card">
            <span className="study-card-dot" />
            <span className="study-card-dot" />
            <div className="study-lines"><i /><i /><i /></div>
            <div className="book-stack"><b /><b /><b /></div>
          </div>
          <div className="parrot-bubble">Squawk! Ready to study?</div>
          <span className="spark spark-one">✦</span>
          <span className="spark spark-two">✳</span>
        </div>
      </section>

      <section className="resources-section" id="resources">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find what you need</p>
            <h2>Resources for your course</h2>
          </div>
          <Link href="/resources">Browse all resources <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="category-grid">
          {resourceCategories.map((category) => (
            <Link className="category-card" href="/resources" key={category}>
              <span className="category-icon" aria-hidden="true">{category.slice(0, 1)}</span>
              <span>{category}</span>
              <span className="category-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="parrot-section" id="parrot">
        <div>
          <p className="eyebrow">Learn by teaching</p>
          <h2>Meet Parrot AI</h2>
          <p>
            Pick a course resource, practise explaining the idea, and get
            feedback to help you see what you understand and what to revisit.
          </p>
        </div>
        <Link className="button button-primary" href="/study">Start a study session</Link>
      </section>

      <footer className="site-footer">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fresources</span>
        </Link>
        <p>College learning resources, with Parrot AI alongside your studies.</p>
        <div className="footer-links">
          <Link href="/events">Events</Link>
          <Link href="/resources">Resources</Link>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </footer>
    </main>
  );
}
