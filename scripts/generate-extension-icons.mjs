/**
 * Regenerates extension/icons/*.png.
 *
 * Same approach as scripts/generate-og-image.mjs: render once with the
 * Playwright Chromium already installed for the e2e suite, commit the result.
 * Not part of the build — icons change roughly never, and a build step that can
 * fail on a missing browser binary is not worth it for three small files.
 *
 *   node scripts/generate-extension-icons.mjs
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT_DIR = fileURLToPath(new URL("../extension/icons/", import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

/** The admin surface's ground and accent, so the toolbar button matches the app. */
const markup = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center;
         background: #0b0e14; border-radius: ${size * 0.22}px; overflow: hidden; }
  /* A bookmark: the action the extension performs, legible down to 16px where
     a wordmark or a monogram would just be a smudge. */
  svg { width: ${size * 0.52}px; height: ${size * 0.52}px; display: block; }
</style></head><body>
  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
</body></html>`;

const browser = await chromium.launch();
for (const size of [16, 32, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(markup(size), { waitUntil: "load" });
  writeFileSync(`${OUT_DIR}icon${size}.png`, await page.screenshot({ type: "png", omitBackground: true }));
  await page.close();
}
await browser.close();
console.log(`Wrote icon16/32/128.png to ${OUT_DIR}`);
