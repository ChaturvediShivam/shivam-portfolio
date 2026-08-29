/**
 * Regenerates public/og-image.png (1200x630).
 *
 * The social card stays a committed static PNG — see the note above OG_IMAGE in
 * app/(marketing)/layout.tsx for why. This script exists so "static" does not
 * also mean "unmaintainable": the card's copy is derived from the same
 * constants the site renders, so regenerating it after a positioning change is
 * one command rather than a design tool round-trip.
 *
 *   node scripts/generate-og-image.mjs
 *
 * Uses the Playwright Chromium already installed for the e2e suite; no new
 * dependency. Run it manually and commit the result — deliberately NOT wired
 * into prebuild, because a build that can fail on a missing browser binary is
 * exactly what the static-PNG decision was avoiding.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/og-image.png", import.meta.url));

// Kept in sync with HERO_CONTENT in constants/index.ts by hand. The constants
// file is TypeScript with import aliases, so reading it from a plain Node
// script would mean pulling in a transpiler for four strings.
const KICKER = "STRATEGIC RESEARCH \u00B7 MARKET & COMPETITIVE INTELLIGENCE";
const HEADLINE =
  "Strategic Research & Intelligence, Powered by AI. Market research, competitive intelligence and AI-assisted analysis.";
// Three, matching HERO_CONTENT.metrics. A fourth once read "30+ COUNTRIES
// COVERED" — a career statistic the CV does not make. See the note there.
const METRICS = [
  ["4+", "YEARS EXPERIENCE"],
  ["40+", "RESEARCH ENGAGEMENTS"],
  ["100+", "INTELLIGENCE REPORTS"],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background: #0B1120;
    /* Matches the site's own overhead radial so the card and the page it
       links to read as one surface. */
    background-image: radial-gradient(ellipse 900px 500px at 50% -10%, rgba(37,99,235,0.16), transparent 70%);
    font-family: Inter, -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: #F9FAFB; display: flex; flex-direction: column; justify-content: center;
    padding: 0 84px;
  }
  .kicker { display: flex; align-items: center; gap: 20px; margin-bottom: 34px; }
  .rule { width: 52px; height: 3px; background: #2563EB; }
  .kicker span { font-size: 21px; font-weight: 600; letter-spacing: 0.2em; color: #E2E8F0; }
  h1 { font-size: 88px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  h1 .accent { color: #3B82F6; }
  p { margin-top: 34px; font-size: 30px; line-height: 1.45; color: #94A3B8; max-width: 900px; font-weight: 400; }
  .metrics { display: flex; gap: 76px; margin-top: 56px; padding-top: 40px; border-top: 1px solid rgba(255,255,255,0.12); }
  .value { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
  .label { font-size: 14px; font-weight: 500; letter-spacing: 0.14em; color: #64748B; margin-top: 6px; }
</style></head><body>
  <div class="kicker"><div class="rule"></div><span>${KICKER}</span></div>
  <h1>Shivam <span class="accent">Chaturvedi</span></h1>
  <p>${HEADLINE}</p>
  <div class="metrics">
    ${METRICS.map(([v, l]) => `<div><div class="value">${v}</div><div class="label">${l}</div></div>`).join("")}
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
writeFileSync(OUT, await page.screenshot({ type: "png" }));
await browser.close();
console.log(`Wrote ${OUT}`);
