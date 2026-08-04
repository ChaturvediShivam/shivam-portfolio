/**
 * Cover letter options (Resume AI · Feature 3).
 *
 * Its own file so `CoverLetterPrompt` stays server-only while the client needs
 * these vocabularies to render the controls — importing the service into a
 * component would drag `server-only` into the browser bundle and fail the build.
 */

export const COVER_LETTER_TONES = [
  "professional",
  "conversational",
  "direct",
  "formal",
] as const;
export type CoverLetterTone = (typeof COVER_LETTER_TONES)[number];

export const COVER_LETTER_LENGTHS = ["short", "standard", "detailed"] as const;
export type CoverLetterLength = (typeof COVER_LETTER_LENGTHS)[number];

export const TONE_LABELS: Record<CoverLetterTone, string> = {
  professional: "Professional",
  conversational: "Conversational",
  direct: "Direct",
  formal: "Formal",
};

export const TONE_HINTS: Record<CoverLetterTone, string> = {
  professional: "Neutral business register. The safe default.",
  conversational: "Warmer, contractions fine. Still no gushing.",
  direct: "Blunt, short sentences, no hedging.",
  formal: "Conservative and precise. Law, finance, government.",
};

export const LENGTH_LABELS: Record<CoverLetterLength, string> = {
  short: "Short",
  standard: "Standard",
  detailed: "Detailed",
};

export const LENGTH_HINTS: Record<CoverLetterLength, string> = {
  short: "2–3 paragraphs, ~120–180 words.",
  standard: "3–4 paragraphs, ~200–280 words.",
  detailed: "4–5 paragraphs, ~300–400 words.",
};

/**
 * Operator-supplied overrides.
 *
 * `company` overrides what the parser found in the posting, which is often
 * wrong or absent. `hiringManager` is optional and never guessed — an invented
 * name on a letter the candidate sends under their own signature is worse than
 * a generic salutation.
 */
export interface CoverLetterOptions {
  tone: CoverLetterTone;
  length: CoverLetterLength;
  company: string | null;
  hiringManager: string | null;
}

export const DEFAULT_COVER_LETTER_OPTIONS: CoverLetterOptions = {
  tone: "professional",
  length: "standard",
  company: null,
  hiringManager: null,
};

/** Bounds on the free-text overrides. These cross a trust boundary. */
export const MAX_COMPANY_CHARS = 120;
export const MAX_HIRING_MANAGER_CHARS = 80;
