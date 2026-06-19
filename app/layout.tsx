import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import BackToTop from "@/components/ui/BackToTop";
import { SITE_CONFIG } from "@/constants";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://shivamchaturvedi.com"),
  title: SITE_CONFIG.title,
  description: SITE_CONFIG.description,
  openGraph: {
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    url: "https://shivamchaturvedi.com",
    siteName: SITE_CONFIG.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
  },
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: SITE_CONFIG.name,
  jobTitle: "Strategic Research Analyst",
  description: SITE_CONFIG.description,
  url: "https://shivamchaturvedi.com",
  sameAs: [SITE_CONFIG.linkedin],
};

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: `${SITE_CONFIG.name} — Strategic Research Services`,
  description: SITE_CONFIG.description,
  url: "https://shivamchaturvedi.com",
  provider: {
    "@type": "Person",
    name: SITE_CONFIG.name,
  },
  areaServed: {
    "@type": "Place",
    name: "Global",
  },
  serviceType: [
    "Strategic Intelligence",
    "Competitive Intelligence",
    "Market Intelligence",
    "Due Diligence",
    "Risk Intelligence",
    "AI-Assisted Research",
  ],
};

export default function RootLayout({
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
            __html: JSON.stringify([personSchema, serviceSchema]),
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <BackToTop />
        </ThemeProvider>
      </body>
    </html>
  );
}
