import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "../globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import BackToTop from "@/components/ui/BackToTop";
import AuthFragmentRescue from "@/components/auth/AuthFragmentRescue";
import { Analytics } from "@vercel/analytics/next";
import { SITE_CONFIG, KNOWS_ABOUT } from "@/constants";

const inter = Inter({ subsets: ["latin"] });

/**
 * The social share card.
 *
 * A committed static PNG rather than a generated one: every scraper that
 * matters (LinkedIn, Slack, WhatsApp, iMessage, X) simply fetches this URL, so
 * a fixed file at a fixed path is the most reliable thing that can sit behind
 * it — nothing to render, nothing to cache-bust, no build step that can fail
 * and leave the card blank. 1200x630 is the size all of them crop from.
 *
 * The URL is absolute on purpose. WhatsApp and several older scrapers do not
 * resolve relative og:image paths against the page URL, so the tag has to
 * carry a full origin even though `metadataBase` would otherwise supply one.
 */
const OG_IMAGE = {
  url: `${SITE_CONFIG.url}/og-image.png`,
  width: 1200,
  height: 630,
  alt: `${SITE_CONFIG.name} — Strategic Research & Intelligence, Powered by AI`,
  type: "image/png",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: SITE_CONFIG.title,
  description: SITE_CONFIG.description,
  openGraph: {
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
    siteName: SITE_CONFIG.name,
    locale: "en_US",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    images: [OG_IMAGE],
  },
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: SITE_CONFIG.name,
  jobTitle: "Strategic Research & Intelligence Analyst",
  description: SITE_CONFIG.description,
  url: SITE_CONFIG.url,
  sameAs: [SITE_CONFIG.linkedin],
  knowsAbout: KNOWS_ABOUT,
};


export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(personSchema),
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthFragmentRescue />
          <Navbar />
          <main>{children}</main>
          <Footer />
          <BackToTop />
        </ThemeProvider>
        {/* Page views + Web Vitals. Inert until Web Analytics is enabled for
            the project in the Vercel dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
