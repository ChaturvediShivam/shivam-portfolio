import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Build the upload fixtures the suite needs.
 *
 * The PDF is rendered by Chromium itself rather than committed. A hand-written
 * PDF is either a stub with no text layer — which the parser would correctly
 * reject, testing nothing — or a large binary in the repository. Printing HTML
 * gives a genuine document with a real text layer, which is what pdfjs has to
 * cope with in production, and it costs one page load.
 *
 * The corrupted and oversized files are written as bytes: their point is to be
 * invalid, so there is nothing to render.
 */

export const FIXTURE_DIR = join(process.cwd(), "e2e", ".artifacts", "fixtures");
export const SAMPLE_PDF = join(FIXTURE_DIR, "resume.pdf");
export const CORRUPT_PDF = join(FIXTURE_DIR, "corrupt.pdf");
export const EMPTY_PDF = join(FIXTURE_DIR, "empty.pdf");
export const OVERSIZED_PDF = join(FIXTURE_DIR, "oversized.pdf");
export const UNSUPPORTED_TXT = join(FIXTURE_DIR, "resume.txt");
/** A structurally valid PDF whose text layer is empty — the scanned-page case. */
export const SCANNED_PDF = join(FIXTURE_DIR, "scanned.pdf");

const RESUME_HTML = `<!doctype html><html><body style="font-family:Helvetica;font-size:11pt;line-height:1.5">
<h1>ALEX MORGAN</h1>
<p>Senior Frontend Engineer<br>alex.morgan@example.com | (555) 0177 | Austin, TX</p>
<h2>SUMMARY</h2>
<p>Senior frontend engineer with 7 years building production React and TypeScript
applications. Led a Next.js App Router migration for a marketplace serving 250k
monthly visitors. Strongest in design systems, rendering performance and
accessibility. Regularly designs relational schemas and the GraphQL APIs over them.</p>
<h2>SKILLS</h2>
<p>Languages: TypeScript, JavaScript, HTML, CSS, SQL<br>
Frameworks: React, Next.js, Node.js, Express, Tailwind CSS<br>
Data and APIs: GraphQL, REST, PostgreSQL, Redis<br>
Tooling: Git, GitHub Actions, Vercel, Jest, Playwright, Storybook<br>
Practices: Automated testing, accessibility, code review, Agile, mentoring</p>
<h2>EXPERIENCE</h2>
<p><b>Senior Frontend Engineer, Harbor Systems</b><br>2021 - Present</p>
<p>Build and ship customer-facing features in React and TypeScript across a
marketplace serving 250k monthly visitors. Design GraphQL APIs and the
PostgreSQL schema behind them for 7 product teams. Own automated testing and
continuous delivery for checkout, taking production escapes from 5 per quarter
to 1. Mentor engineers and take part in design and code review.</p>
<p><b>Frontend Engineer, Copperline</b><br>2019 - 2021</p>
<p>Shipped a TypeScript design system of 50+ React components used by 4 squads.
Improved rendering performance and accessibility across the customer portal,
cutting initial bundle size 31% and closing 40 accessibility violations.</p>
<h2>EDUCATION</h2>
<p>B.S. Computer Science, University of Texas at Austin, 2019</p>
</body></html>`;

async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    await page.setContent(RESUME_HTML);
    writeFileSync(SAMPLE_PDF, await page.pdf({ format: "A4" }));

    // Structurally valid, no extractable text: what a scan parses to.
    await page.setContent("<html><body></body></html>");
    writeFileSync(SCANNED_PDF, await page.pdf({ format: "A4" }));

    await page.close();
  } finally {
    await browser.close();
  }

  // Right magic bytes, garbage after them. pdfjs must fail cleanly.
  writeFileSync(CORRUPT_PDF, Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(512, 0x41)]));
  writeFileSync(EMPTY_PDF, Buffer.alloc(0));
  // Over the demo's 5 MB ceiling. Rejected before anything reads it.
  writeFileSync(OVERSIZED_PDF, Buffer.alloc(6 * 1024 * 1024, 0x20));
  writeFileSync(UNSUPPORTED_TXT, "ALEX MORGAN\nSenior Frontend Engineer\n");

  // Marks the window whose demo_usage rows belong to this run.
  process.env.E2E_STARTED_AT = new Date().toISOString();
  writeFileSync(join(FIXTURE_DIR, "started-at.txt"), process.env.E2E_STARTED_AT);
}

export default main;
