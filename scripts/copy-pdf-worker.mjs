/**
 * Copy the pdf.js worker into `public/` (Resume AI · Phase 2).
 *
 * pdf.js requires a worker file reachable by URL at runtime, and every attempt
 * to let the bundler resolve it fails: `new URL("pdfjs-dist/...", import.meta.url)`
 * makes webpack treat the worker as *source*, and SWC then rejects it with
 * "'import', and 'export' cannot be used outside of module code".
 *
 * Copying it to `public/` sidesteps the bundler completely — the worker is
 * served as a static file at a stable path. The copy happens on every build and
 * dev start, so the worker can never drift from the installed pdfjs-dist
 * version, which is the failure a committed vendored copy would eventually hit.
 *
 * `public/pdf.worker.min.mjs` is therefore generated, not authored, and is
 * gitignored.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const source = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
const destination = join(root, "public", "pdf.worker.min.mjs");

await mkdir(join(root, "public"), { recursive: true });
await copyFile(source, destination);

console.log(`[pdf-worker] copied ${source} -> ${destination}`);
