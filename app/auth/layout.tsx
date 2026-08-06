import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Verify — Admin",
  robots: { index: false, follow: false },
};

export default function AuthRootLayout({
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
