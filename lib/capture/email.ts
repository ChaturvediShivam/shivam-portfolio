import "server-only";
import { normalizeJobUrl } from "@/lib/opportunities";
import type { CapturedJob, CapturedPage, CaptureProvenance } from "@/types/capture";

/**
 * Source-aware extraction for a Gmail application email.
 *
 * A job listing and a sent application email are different documents that
 * happen to both be "the current tab". The generic extractor treats every page
 * as a posting: it reads the <title> as the role, the host as the job URL, and
 * the visible text as the description. On a Gmail message that produces "Application"
 * as the role, the email subject as the company, and mail.google.com as the job
 * URL — none of which is true.
 *
 * So Gmail is handled as its own source. The employer never wrote this page; the
 * APPLICANT did, in their own words ("I am writing to apply for the X position at
 * Y"), and those words are the source of truth. This module reads role, company,
 * a genuine job URL and the body out of that language, and leaves everything the
 * email does not state — location, salary, work type — null rather than guessing
 * it from Gmail's UI.
 *
 * The extension collects the raw email (subject, body, links) because only it has
 * the DOM; every judgement below is here, in TypeScript, under test.
 */

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when this capture is a Gmail message view with readable email content. */
export function isGmailEmail(page: CapturedPage): boolean {
  if (hostOf(page.url) !== "mail.google.com") return false;
  const email = page.email;
  return Boolean(email && ((email.subject && email.subject.trim()) || (email.body && email.body.trim())));
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, "").trim();
  return trimmed || null;
}

/**
 * Hosts that are never a job posting, so a link to one is not a job URL.
 *
 * Gmail's own chrome, Google account/asset domains, and the tracking/unsubscribe
 * links every bulk sender staples on. A real application email links to the
 * posting on a board or a careers page; those never live under these hosts.
 */
const NON_JOB_HOST =
  /(^|\.)(google\.com|googlemail\.com|gstatic\.com|googleusercontent\.com|googleapis\.com|gmail\.com|youtube\.com|schema\.org|w3\.org)$/i;

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')]+/gi;

/** The first genuine external job/application URL in the email, or null. */
function jobUrlFromEmail(email: NonNullable<CapturedPage["email"]>): string | null {
  const candidates: string[] = [...(email.links ?? [])];
  const bodyMatches = email.body ? email.body.match(URL_IN_TEXT) : null;
  if (bodyMatches) candidates.push(...bodyMatches);

  for (const raw of candidates) {
    const url = raw.replace(/[.,;:)\]]+$/, "").trim();
    const host = hostOf(url);
    if (!host || NON_JOB_HOST.test(host)) continue;
    return normalizeJobUrl(url) ?? url;
  }
  return null;
}

/**
 * Application-intent patterns, strongest first.
 *
 * Each captures the role and the employer out of the sentence a cover letter
 * opens with. The employer is whatever follows "at"/"with" — which is why the
 * applicant's own name (it follows "|" in the subject, never "at Y") is never
 * mistaken for the company.
 */
const APPLICATION_PATTERNS: RegExp[] = [
  // "...apply/applying/applied for [the] <role> position|role|... at|with <company>"
  /\bappl(?:y(?:ing)?|ied)\b[^.\n]*?\bfor\b\s+(?:the\s+)?(.+?)\s+(?:position|role|job|opening|vacancy|opportunity|posting)\s+(?:at|with|for)\s+(.+?)(?=[.,;:\n]|$)/i,
  // "application for [the] <role> [position] at|with <company>"
  /\bapplication\b\s+(?:for|to)\s+(?:the\s+)?(.+?)\s+(?:position\s+|role\s+)?(?:at|with)\s+(.+?)(?=[.,;:\n]|$)/i,
  // looser: "<role> position|role at|with <company>" — only reached on Gmail email text
  /(?:^|\bthe\s+)(.+?)\s+(?:position|role)\s+(?:at|with)\s+(.+?)(?=[.,;:\n]|$)/i,
];

function plausibleRole(role: string | null): boolean {
  if (!role) return false;
  return role.length >= 2 && role.length <= 120 && !/^application$/i.test(role);
}

/**
 * Trailing filler that runs on after the company name before the sentence's
 * punctuation: "at Acme Corp today", "at Globex and I believe". A company is a
 * proper noun, so any trailing all-lowercase word is not part of it and is
 * dropped. Capitalised tokens ("Sciatius Research", "Market Research Inc") stay.
 */
const TRAILING_FILLER = /\s+(?:today|now|soon|and|as|because|which|that|so|since|for|to|in|on|where|when|after|before|via)\b.*$/i;

function trimCompany(company: string | null): string | null {
  if (!company) return null;
  let text = company;
  // Repeatedly peel a trailing lowercase filler word (and anything past it).
  for (let i = 0; i < 5; i += 1) {
    const tokens = text.split(/\s+/);
    const last = tokens[tokens.length - 1];
    if (tokens.length > 1 && /^[a-z]/.test(last) && TRAILING_FILLER.test(" " + last)) {
      tokens.pop();
      text = tokens.join(" ");
    } else {
      break;
    }
  }
  return clean(text);
}

function plausibleCompany(company: string | null, applicant: string | null): boolean {
  if (!company) return false;
  if (company.length < 1 || company.length > 80) return false;
  // The applicant is not the employer. Their name sits after "|" in the subject.
  if (applicant && company.toLowerCase() === applicant.toLowerCase()) return false;
  return true;
}

function roleCompanyFromBody(body: string, applicant: string | null): { role: string | null; company: string | null } {
  for (const pattern of APPLICATION_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const role = clean(match[1]);
    const company = trimCompany(clean(match[2]));
    if (plausibleRole(role) && plausibleCompany(company, applicant)) return { role, company };
  }
  return { role: null, company: null };
}

/** Whatever the applicant put after "|" in the subject — their name, not the company. */
function applicantFromSubject(subject: string | null): string | null {
  if (!subject) return null;
  const parts = subject.split("|");
  return parts.length > 1 ? clean(parts[parts.length - 1]) : null;
}

/** The role from the subject line, once mail prefixes and the applicant's name are stripped. */
function roleFromSubject(subject: string | null): string | null {
  let text = subject ?? "";
  // The role sits before the applicant's name: "Application – <role> | <name>".
  text = text.split("|")[0];
  text = text.replace(/^\s*(re|fwd|fw)\s*:\s*/i, "");
  text = text.replace(/^\s*(job\s+)?application\b\s*[-–—:|]?\s*/i, "");
  text = text.replace(/^\s*(for|regarding|re)\b\s*[-–—:|]?\s*/i, "");
  const role = clean(text);
  return plausibleRole(role) ? role : null;
}

/**
 * Gmail UI captions that leak into a body scrape, each alone on a line. The
 * message body itself never contains them; a defensive strip so a degraded
 * capture can never file "Reply" as part of the description.
 */
const UI_LINE = /^(reply|reply all|forward|archive|delete|report spam|mark as unread|move to|labels?|inbox|sent|show trimmed content|\.\.\.)$/i;

function bodyAsDescription(body: string): string | null {
  const kept = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !UI_LINE.test(line));
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

export interface EmailApplication {
  title: string | null;
  company: string | null;
  job_description: string | null;
  job_url: string | null;
}

/**
 * Extract application fields from a Gmail email. Never invents a value: any field
 * the email does not state comes back null.
 */
export function extractEmailApplication(page: CapturedPage): EmailApplication {
  const email = page.email;
  if (!email) return { title: null, company: null, job_description: null, job_url: null };

  const subject = clean(email.subject);
  const applicant = applicantFromSubject(email.subject ?? null);

  // The body's application sentence is the strongest signal; the subject is the
  // fallback for the role, and only ever contributes the company via the body.
  const fromBody = email.body ? roleCompanyFromBody(email.body, applicant) : { role: null, company: null };

  const title = fromBody.role ?? roleFromSubject(subject);
  const company = fromBody.company;
  const job_url = jobUrlFromEmail(email);
  const job_description = email.body ? bodyAsDescription(email.body) : null;

  return { title, company, job_description, job_url };
}

/** Apply the email extraction onto a job object, marking provenance. Mutates in place. */
export function fillFromEmail(job: CapturedJob, provenance: CaptureProvenance, page: CapturedPage): void {
  const app = extractEmailApplication(page);

  // Never mail.google.com. A real job URL if the email carried one, else empty.
  job.job_url = app.job_url ?? "";
  if (app.job_url) provenance.job_url = "page";

  // Role and company are parsed from the applicant's prose — inferred, so heuristic.
  if (app.title) {
    job.title = app.title;
    provenance.title = "heuristic";
  }
  if (app.company) {
    job.company = app.company;
    provenance.company = "heuristic";
  }
  // The body is the applicant's own words, taken verbatim — page evidence.
  if (app.job_description) {
    job.job_description = app.job_description;
    provenance.job_description = "page";
  }
}
