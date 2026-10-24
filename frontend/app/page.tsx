import Link from "next/link";
import { ArrowRight, BookOpen, FolderKanban, Github, Linkedin, Mail, Twitter, UsersRound, Youtube } from "lucide-react";

const resourceCategories = ["Books", "Assignments", "Notes", "Practicals", "Papers", "Playlists", "Experiments", "Syllabus"];

export default function HomePage() {
  return <main>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Fresources home"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>Fresources</span></Link>
      <nav className="main-nav" aria-label="Main navigation"><Link className="active" href="/">Home</Link><Link href="/resources">Resources</Link><Link href="/hackmate">Hackmate</Link><Link href="/events">Events</Link></nav>
      <div className="account-actions"><Link className="login-link" href="/login">Log in</Link><Link className="account-link" href="/signup">Sign up</Link></div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <h1>Everything you need<br />to <span className="gradient-text">build, learn,</span> and<br />create.</h1>
        <p className="hero-description">Discover learning resources, organize projects, and find teammates for your next hackathon. All in one place.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/resources">Explore resources <ArrowRight aria-hidden="true" /></Link><a className="button button-secondary" href="#parrot">Meet Parrot AI</a></div>
        <ul className="hero-benefits" aria-label="Platform benefits"><li><BookOpen aria-hidden="true" /> Curated resources</li><li><FolderKanban aria-hidden="true" /> Project workspace</li><li><UsersRound aria-hidden="true" /> Find your team</li></ul>
      </div>
      <div className="hero-art" aria-label="Study workspace illustration" role="img">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="laptop-screen"><span /><span /><span /></div>
        <div className="study-card code-card"><strong>&lt;/&gt;</strong><div className="study-lines"><i /><i /><i /></div></div><div className="study-card notes-card"><div className="study-lines"><i /><i /><i /></div></div>
        <div className="study-card cap-card"><span>⌂</span><div className="study-lines"><i /><i /></div></div><div className="study-card team-card"><UsersRound aria-hidden="true" /><div className="study-lines"><i /><i /><i /></div><b>+</b></div>
        <div className="paper-plane" /><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span>
      </div>
    </section>

    <section className="resources-section" id="resources"><div className="section-heading"><div><p className="eyebrow">Find what you need</p><h2>Resources for your course</h2></div><Link href="/resources">Browse all resources <span aria-hidden="true">↗</span></Link></div><div className="category-grid">{resourceCategories.map((category) => <Link className="category-card" href="/resources" key={category}><span className="category-icon" aria-hidden="true">{category.slice(0, 1)}</span><span>{category}</span><span className="category-arrow" aria-hidden="true">↗</span></Link>)}</div></section>

    <section className="parrot-section" id="parrot"><div><p className="eyebrow">Learn by teaching</p><h2>Meet Parrot AI</h2><p>Pick a course resource, practise explaining the idea, and get feedback to help you see what you understand and what to revisit.</p></div><Link className="button button-primary" href="/study">Start a study session</Link></section>

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
  </main>;
}
