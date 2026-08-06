import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

// Never indexed — this is an internal tool, not a page of the public site.
export const metadata: Metadata = {
  title: "Admin — Inquiries",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0B0E14]`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
