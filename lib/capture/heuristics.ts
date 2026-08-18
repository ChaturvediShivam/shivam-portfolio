import "server-only";
import type { CapturedJob, CaptureProvenance } from "@/types/capture";

/**
 * Deterministic fallbacks for pages that publish no structured data.
 *
 * The original capture pipeline had exactly two deterministic sources —
 * schema.org JobPosting and Open Graph — and on a page carrying neither it
 * produced one field (the document title) and left the rest to the model. That
 * made every other field depend on an AI call that can be flagged off, over
 * budget, or unavailable, and when it was, the review form arrived blank even
 * though the extension had just sent several thousand words of the posting.
 *
 * Verified against live pages: modern Greenhouse (job-boards.greenhouse.io)
 * publishes no JobPosting, LinkedIn renders job views client-side with none, and
 * plenty of smaller boards have neither JobPosting nor Open Graph tags. That is
 * the common case, not the edge case.
 *
 * Everything here is a GUESS and is recorded as one. These run last, filling
 * only what the page and the model both left empty, so a regex can never
 * displace something the employer actually published or the model actually read.
 */

/** Words that follow a separator in a page title but are not a company. */
const NOT_A_COMPANY = new Set([
  "remote", "hybrid", "onsite", "on-site", "in-office", "wfh",
  "full time", "full-time", "part time", "part-time", "contract", "internship",
  "freelance", "temporary", "permanent",
  "careers", "career", "jobs", "job", "job board", "apply", "hiring", "vacancies",
  "greenhouse", "lever", "ashby", "workday", "linkedin", "indeed", "wellfound",
  "naukri", "monster", "glassdoor", "ziprecruiter", "smartrecruiters",
]);

/** Boilerplate that wraps a role in a page title. */
const TITLE_PREFIXES = [
  /^job application for\s+/i,
  /^apply (?:for|to)\s+/i,
  /^careers?\s*[:\-–]\s*/i,
  /^jobs?\s*[:\-–]\s*/i,
  /^hiring\s*[:\-–]\s*/i,
];

/** Titles that name a page rather than a role. */
const GENERIC_TITLES = /^(jobs?|careers?|job board|openings?|vacancies|home|search|results)$/i;

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Split "Applied AI Engineer at Bjak" into a role and a company.
 *
 * Page titles overwhelmingly follow `<role><separator><company>`, which makes
 * this the most reliable company signal available on a page with no structured
 * data. The risk is the mirror image — "Senior Engineer - Remote" would hand
 * back "Remote" as the employer — so a tail that reads as a location, a work
 * arrangement or a job board is rejected rather than trusted.
 */
export function parseTitleAndCompany(raw: string | null | undefined): {
  title: string | null;
  company: string | null;
} {
  let text = clean(raw);
  if (!text) return { title: null, company: null };

  for (const prefix of TITLE_PREFIXES) text = text.replace(prefix, "");

  // Trailing board name: "Role at Company | Greenhouse".
  const segments = text.split(/\s+[|·–—]\s+|\s+-\s+/);
  while (segments.length > 1) {
    const last = clean(segments[segments.length - 1])?.toLowerCase();
    if (last && NOT_A_COMPANY.has(last)) segments.pop();
    else break;
  }
  text = segments.join(" - ");

  // " at " is unambiguous where a dash or pipe is not, so it is tried first.
  const atMatch = text.match(/^(.{2,150}?)\s+at\s+(.{1,80})$/i);
  if (atMatch) {
    const company = clean(atMatch[2]);
    if (company && !NOT_A_COMPANY.has(company.toLowerCase())) {
      return { title: clean(atMatch[1]), company };
    }
    return { title: clean(atMatch[1]), company: null };
  }

  const sepMatch = text.match(/^(.{2,150}?)\s+[-|·–—]\s+(.{1,80})$/);
  if (sepMatch) {
    const company = clean(sepMatch[2]);
    if (company && !NOT_A_COMPANY.has(company.toLowerCase())) {
      return { title: clean(sepMatch[1]), company };
    }
    return { title: clean(sepMatch[1]), company: null };
  }

  return { title: clean(text), company: null };
}

/** True when a heading looks like a role rather than a page name. */
export function isPlausibleRole(heading: string | null | undefined): boolean {
  const text = clean(heading);
  if (!text) return false;
  return text.length >= 3 && text.length <= 120 && !GENERIC_TITLES.test(text);
}

/**
 * Work arrangement.
 *
 * Two tiers, because the bare word is not evidence.
 *
 * In a TITLE or a LABELLED FIELD, "Remote" on its own means the role is remote —
 * that is what those places are for. In body text it means nothing on its own:
 * the page this was built against carries the byline "Written by Surely Remote",
 * and a search for the bare word reports a remote job on every posting that
 * site publishes. Free text therefore has to say more than "remote" — a phrase
 * that only appears when someone is describing the arrangement.
 *
 * Body text is also only read near the top. A match six thousand characters
 * into an unrelated paragraph says nothing about this role.
 */
const BARE_ARRANGEMENT: [RegExp, "remote" | "hybrid" | "onsite"][] = [
  [/\bhybrid\b/i, "hybrid"],
  [/\bremote\b/i, "remote"],
  [/\b(on-?site|in-?office)\b/i, "onsite"],
];

/** Phrases that only occur when the arrangement is actually being stated. */
const STATED_ARRANGEMENT: [RegExp, "remote" | "hybrid" | "onsite"][] = [
  [/\bhybrid\s+(role|position|job|work|working|model|setup)\b|\b(role|position|job)\s+is\s+hybrid\b/i, "hybrid"],
  [
    /\b(fully|100%|entirely)\s+remote\b|\bremote[- ]first\b|\bwork\s+from\s+home\b|\bremote\s+(role|position|job|work|working|opportunity)\b|\b(role|position|job)\s+is\s+remote\b/i,
    "remote",
  ],
  [/\b(on-?site|in-?office|in person)\s+(role|position|job|work|working)\b|\bbased\s+in\s+our\s+\w+\s+office\b|\bwork\s+(on-?site|in-?office)\b/i, "onsite"],
];

export function guessLocationType(
  titleOrLabel: string | null,
  text: string,
): "remote" | "hybrid" | "onsite" | null {
  // Hybrid is checked before remote throughout: a hybrid posting almost always
  // also says "remote", and calling it fully remote would be wrong.
  if (titleOrLabel) {
    for (const [pattern, value] of BARE_ARRANGEMENT) if (pattern.test(titleOrLabel)) return value;
  }
  const window = text.slice(0, 2500);

  // A line made of nothing but job attributes is a field, however terse:
  // "Remote." and "Full-time. Remote." are both statements about this role.
  // "Written by Surely Remote" is not, because words remain once the attribute
  // tokens are removed. That difference is the whole test.
  for (const line of window.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) continue;

    const arrangement = BARE_ARRANGEMENT.find(([pattern]) => pattern.test(trimmed));
    if (!arrangement) continue;

    const remainder = trimmed
      .replace(/\b(remote|hybrid|on-?site|in-?office|onsite|fully|100%|first|work|from|home)\b/gi, "")
      .replace(/\b(full|part)[- ]?time\b|\b(contract|internship|freelance|temporary|permanent)\b/gi, "")
      .replace(/[^a-z]/gi, "");
    if (remainder.length <= 3) return arrangement[1];
  }

  for (const [pattern, value] of STATED_ARRANGEMENT) if (pattern.test(window)) return value;
  return null;
}

const EMPLOYMENT_PATTERNS: [RegExp, string][] = [
  [/\bfull[- ]?time\b/i, "full_time"],
  [/\bpart[- ]?time\b/i, "part_time"],
  [/\binternship\b|\bintern\b/i, "internship"],
  [/\bfreelance\b/i, "freelance"],
  [/\bcontract(?:or)?\b/i, "contract"],
  [/\btemporary\b|\btemp\b/i, "temporary"],
];

export function guessEmploymentType(title: string | null, text: string): string | null {
  const haystack = `${title ?? ""}\n${text.slice(0, 2000)}`;
  for (const [pattern, value] of EMPLOYMENT_PATTERNS) if (pattern.test(haystack)) return value;
  return null;
}

const SENIORITY_PATTERNS: [RegExp, string][] = [
  [/\bprincipal\b/i, "principal"],
  [/\bstaff\b/i, "staff"],
  [/\b(senior|sr\.?)\b/i, "senior"],
  [/\b(junior|jr\.?|entry[- ]level|graduate|trainee)\b/i, "junior"],
  [/\bintern\b/i, "intern"],
  [/\blead\b/i, "lead"],
  [/\b(head of|director|vp|vice president)\b/i, "director"],
  [/\bmid[- ]level\b/i, "mid"],
];

/**
 * Seniority from the ROLE TITLE only, never the body.
 *
 * Measured on a real posting: scanning the body of an "Applied AI Engineer"
 * page matched "lead" inside ordinary prose and would have filed a mid-level
 * role as a lead position. The title is the only place the word carries the
 * meaning we want.
 */
export function guessSeniority(title: string | null): string | null {
  const text = clean(title);
  if (!text) return null;
  for (const [pattern, value] of SENIORITY_PATTERNS) if (pattern.test(text)) return value;
  return null;
}

const CURRENCY_CODES: Record<string, string> = {
  "$": "USD", "us$": "USD", "usd": "USD",
  "₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR",
  "€": "EUR", "eur": "EUR",
  "£": "GBP", "gbp": "GBP",
};

/** Expand "120k" to 120000; leave plain numbers alone. */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kK])?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2] ? Math.round(value * 1000) : Math.round(value);
}

/**
 * A stated pay range.
 *
 * Requires a currency marker and, for a range, two amounts — because a bare
 * number next to a dash is far more often a date, a headcount or a version than
 * a salary. Absurd values are dropped rather than stored: a "salary" of 3 is a
 * parse failure wearing a number.
 */
export function guessSalary(text: string): { min: string; max: string | null; currency: string } | null {
  const pattern =
    /(us\$|rs\.?|[$₹€£]|\b(?:usd|inr|eur|gbp)\b)\s*([\d,]+(?:\.\d+)?\s*[kK]?)(?:\s*(?:-|–|—|to)\s*(?:us\$|rs\.?|[$₹€£]|\b(?:usd|inr|eur|gbp)\b)?\s*([\d,]+(?:\.\d+)?\s*[kK]?))?/i;

  const match = text.match(pattern);
  if (!match) return null;

  const currency = CURRENCY_CODES[match[1].toLowerCase().trim()];
  if (!currency) return null;

  const min = toAmount(match[2]);
  const max = match[3] ? toAmount(match[3]) : null;
  // Below this, the match is punctuation or a list number rather than pay.
  if (min === null || min < 1000) return null;
  if (max !== null && max < min) return null;

  return { min: String(min), max: max === null ? null : String(max), currency };
}

/**
 * A location stated on its own labelled line.
 *
 * Line-anchored deliberately. An unanchored search for "location" matched the
 * sentence "...location. This often indicates the company's home base..." on a
 * real posting and would have stored that as the job's location. A label at the
 * start of a line is a field; the same word mid-sentence is prose.
 */
export function guessLocation(text: string): string | null {
  const match = text.match(/^[ \t]*(?:job\s+)?location[ \t]*[:\-–][ \t]*(.{2,80})$/im);
  const value = clean(match?.[1]);
  if (!value) return null;
  if (/^(remote|hybrid|on-?site)$/i.test(value)) return null; // that is work type, not a place
  return value;
}

/**
 * Labelled summary fields, e.g.
 *
 *   Company
 *   Bjak
 *   Employment
 *   Full-time
 *
 * A great many job boards end the page with a summary block like this, either
 * as `Label: Value` on one line or — when it is rendered as a table or a
 * definition list — as a label line followed by its value line. Reading it is
 * far more reliable than scanning prose, so it takes precedence.
 *
 * It also avoids a real false positive: the page that prompted this work
 * contains the phrase "Written by Surely Remote" in its body, which a free-text
 * search for "remote" happily reports as a remote role. A label says what a
 * value MEANS; a word in a paragraph does not.
 */
const FIELD_LABELS: [RegExp, "company" | "location" | "employment_type" | "seniority" | "salary" | "location_type"][] = [
  [/^(company|employer|organisation|organization|hiring company)$/i, "company"],
  [/^(location|job location|based in|office location)$/i, "location"],
  [/^(employment|employment type|job type|contract type)$/i, "employment_type"],
  [/^(experience|experience level|seniority|level|career level)$/i, "seniority"],
  [/^(salary|compensation|pay|pay range|salary range)$/i, "salary"],
  [/^(work type|workplace|work arrangement|remote|work model|location type)$/i, "location_type"],
];

const SENIORITY_VALUES: [RegExp, string][] = [
  [/\bprincipal\b/i, "principal"],
  [/\bstaff\b/i, "staff"],
  [/\bsenior\b/i, "senior"],
  [/\b(mid|intermediate)\b/i, "mid"],
  [/\b(junior|entry|graduate|fresher)\b/i, "junior"],
  [/\bintern\b/i, "intern"],
  [/\blead\b/i, "lead"],
  [/\b(director|head|vp|executive)\b/i, "director"],
];

/** A value that is really a placeholder. Boards render these constantly. */
const EMPTY_VALUES = /^(n\/?a|none|not specified|unspecified|-|—|not disclosed|undisclosed)$/i;

export interface LabelledFields {
  company?: string;
  location?: string;
  employment_type?: string;
  seniority?: string;
  location_type?: "remote" | "hybrid" | "onsite";
  salary?: { min: string; max: string | null; currency: string };
}

export function parseLabelledFields(text: string): LabelledFields {
  const found: LabelledFields = {};
  if (!text) return found;

  const lines = text.split("\n").map((line) => line.trim());

  const record = (kind: LabelledFields extends never ? never : string, raw: string | null) => {
    const value = clean(raw);
    if (!value || EMPTY_VALUES.test(value) || value.length > 120) return;

    switch (kind) {
      case "company":
        found.company ??= value;
        break;
      case "location":
        // "Remote" under a Location label is a work arrangement, not a place.
        if (/^(remote|hybrid|on-?site)$/i.test(value)) {
          found.location_type ??= guessLocationType(null, value) ?? undefined;
        } else {
          found.location ??= value;
        }
        break;
      case "employment_type": {
        const mapped = guessEmploymentType(value, "");
        if (mapped) found.employment_type ??= mapped;
        break;
      }
      case "seniority":
        for (const [pattern, mapped] of SENIORITY_VALUES) {
          if (pattern.test(value)) {
            found.seniority ??= mapped;
            break;
          }
        }
        break;
      case "location_type": {
        const mapped = guessLocationType(value, "");
        if (mapped) found.location_type ??= mapped;
        break;
      }
      case "salary": {
        const parsed = guessSalary(value);
        if (parsed) found.salary ??= parsed;
        break;
      }
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.length > 60) continue;

    // "Label: Value" on one line.
    const inline = line.match(/^([A-Za-z][A-Za-z /]{2,30})\s*[:\-–]\s*(.+)$/);
    if (inline) {
      for (const [pattern, kind] of FIELD_LABELS) {
        if (pattern.test(inline[1].trim())) {
          record(kind, inline[2]);
          break;
        }
      }
      continue;
    }

    // A bare label whose value is the next non-empty line — how a table or a
    // definition list flattens into innerText.
    for (const [pattern, kind] of FIELD_LABELS) {
      if (!pattern.test(line)) continue;
      let next = "";
      for (let j = i + 1; j < lines.length && j <= i + 3; j += 1) {
        if (lines[j]) {
          next = lines[j];
          break;
        }
      }
      // Guard against two labels in a row, which would file "Experience" as the
      // company name.
      const nextIsLabel = FIELD_LABELS.some(([p]) => p.test(next));
      if (next && !nextIsLabel) record(kind, next);
      break;
    }
  }

  return found;
}

/**
 * Fill every field the page and the model both left empty.
 *
 * Mutates in place and marks each value `heuristic`, so the popup can show that
 * it was inferred rather than read. Runs last precisely so it cannot outrank a
 * real source.
 */
export function applyHeuristics(
  job: CapturedJob,
  provenance: CaptureProvenance,
  page: { title?: string; h1?: string | null; text?: string },
): void {
  const text = page.text ?? "";

  const set = <K extends keyof CapturedJob>(key: K, value: CapturedJob[K] | null) => {
    if (value === null || value === undefined || value === "") return;
    if (job[key] !== null && job[key] !== undefined) return;
    job[key] = value;
    provenance[key] = "heuristic";
  };

  // Role: a plausible <h1> beats the document title, which usually carries the
  // company and the board name as well.
  const fromH1 = isPlausibleRole(page.h1) ? parseTitleAndCompany(page.h1) : { title: null, company: null };
  const fromTitle = parseTitleAndCompany(page.title);

  set("title", fromH1.title ?? fromTitle.title);
  set("company", fromH1.company ?? fromTitle.company);

  // A labelled summary block states what a value MEANS, so it is read before
  // any free-text pattern and wins wherever the two disagree.
  const labelled = parseLabelledFields(text);

  set("company", labelled.company ?? null);
  set("location", labelled.location ?? guessLocation(text));
  set("location_type", labelled.location_type ?? guessLocationType(job.title, text));
  set("employment_type", labelled.employment_type ?? guessEmploymentType(job.title, text));
  set("seniority", labelled.seniority ?? guessSeniority(job.title));

  const salary = labelled.salary ?? guessSalary(text);
  if (salary) {
    set("salary_min", salary.min);
    set("salary_max", salary.max);
    set("salary_currency", salary.currency);
  }

  // The posting body, last resort.
  //
  // The extension has already sent the page's readable text. Discarding it
  // because a model was unavailable — and presenting an empty description next
  // to a field the person watched get captured — is the worst possible outcome:
  // it loses information we are holding. Unfiltered, so it is marked inferred.
  if (!job.job_description && text.trim().length >= 200) {
    set("job_description", text.trim());
  }
}
