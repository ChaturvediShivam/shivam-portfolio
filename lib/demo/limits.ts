/**
 * Numeric ceilings for the public demo.
 *
 * Split out of `lib/demo/config.ts` because that module is server-only — it
 * reads secrets — and the upload control needs the file ceiling in the browser.
 * Constants only: nothing here touches an environment variable, so it is safe on
 * both sides of the boundary and there is still exactly one definition of each
 * number. `config.ts` re-exports these so existing server imports are unchanged.
 */

/**
 * Payload ceilings, in characters.
 *
 * The authenticated action allows 200k resume / 100k JD — bounds sized to never
 * inconvenience a real operator. A demo visitor has no such claim on the budget,
 * and a larger payload is a larger prompt is a larger bill, so these sit well
 * below. A genuine resume is a few thousand characters; a long job description
 * rarely passes eight.
 */
export const DEMO_MAX_RESUME_CHARS = 50_000;
export const DEMO_MAX_JD_CHARS = 20_000;

/**
 * Upload ceiling, in bytes.
 *
 * Half of the authenticated MAX_FILE_BYTES (10 MB). The binding constraint is
 * not bandwidth — parsing happens in the visitor's browser — but memory on a
 * low-end phone, where pdfjs on a 10 MB scan is a tab crash rather than an
 * error message.
 */
export const DEMO_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Per-visitor throttle. Three analyses is enough to try your own resume, then a
 * friend's, then one more — and far short of anything worth scripting.
 */
export const DEMO_VISITOR_LIMIT = 3;
export const DEMO_VISITOR_WINDOW_MINUTES = 60;
