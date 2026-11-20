import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import SiteChrome from "@/components/site-chrome";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { SITE } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "FreeResources.in — Previous Year Papers, Notes & Syllabus for Indian Universities",
    template: "%s | FreeResources.in",
  },
  description: SITE.description,
  keywords: [
    "previous year papers",
    "PYQ",
    "university notes",
    "syllabus PDF",
    "AKTU",
    "DTU",
    "NSUT",
    "GGSIPU",
    "DU",
    "IGNOU",
    "engineering notes",
    "BCS301",
  ],
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "FreeResources.in — Every resource your semester needs",
    description: SITE.description,
    url: SITE.url,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "FreeResources.in — Every resource your semester needs",
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
  },
  category: "education",
};

const themeScript = `
try {
  var stored = localStorage.getItem('fr-theme');
  if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }
} catch (e) {}
`;

const organisationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE.url}#organization`,
      name: "FreeResources.in",
      url: SITE.url,
      email: SITE.email,
      description: SITE.description,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE.url}#website`,
      url: SITE.url,
      name: "FreeResources.in",
      publisher: { "@id": `${SITE.url}#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE.url}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          Skip to content
        </a>
        <SiteChrome header={<SiteHeader />} footer={<SiteFooter />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
