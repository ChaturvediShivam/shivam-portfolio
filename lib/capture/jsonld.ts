import "server-only";
import type { CapturedJob, CaptureProvenance } from "@/types/capture";

/**
 * schema.org JobPosting extraction.
 *
 * Greenhouse, Lever, Ashby, Workday, Indeed and most company career pages emit
 * a JobPosting block in `application/ld+json`, because Google for Jobs requires
 * it. It is authored by the employer, already structured, and free — so it runs
 * before the model and wins over it on every field it can fill.
 *
 * Everything here is defensive. This is third-party markup from an arbitrary
 * page: fields are missing, mistyped, doubly-nested, or wrapped in an `@graph`.
 * A malformed block must yield nothing, never throw — the capture still has the
 * page text to fall back on.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Flatten `@graph` containers and arrays into a single list of candidate nodes. */
function flatten(nodes: unknown[], depth = 0): Json[] {
  if (depth > 4) return [];
  const out: Json[] = [];
  for (const node of nodes) {
    if (Array.isArray(node)) out.push(...flatten(node, depth + 1));
    else if (isObject(node)) {
      out.push(node);
      if (Array.isArray(node["@graph"])) out.push(...flatten(node["@graph"] as unknown[], depth + 1));
    }
  }
  return out;
}

function isJobPosting(node: Json): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type.toLowerCase() === "jobposting";
  if (Array.isArray(type)) return type.some((t) => typeof t === "string" && t.toLowerCase() === "jobposting");
  return false;
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number") return String(value);
  return null;
}

/** `hiringOrganization` is sometimes a string, sometimes an Organization node. */
function orgName(value: unknown): string | null {
  if (isObject(value)) return str(value.name) ?? str(value.legalName);
  return str(value);
}

/**
 * `jobLocation` nests a PostalAddress two levels down and may be an array.
 * Assembled city-first because that is how a person reads a location.
 */
function locationName(value: unknown): string | null {
  const node = Array.isArray(value) ? value.find(isObject) : value;
  if (!isObject(node)) return str(value);

  const address = isObject(node.address) ? node.address : node;
  const parts = [
    str(address.addressLocality),
    str(address.addressRegion),
    str(address.addressCountry) ?? (isObject(address.addressCountry) ? str((address.addressCountry as Json).name) : null),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : str(node.name);
}

/** `baseSalary.value` is a QuantitativeValue: value, or minValue/maxValue. */
function salary(value: unknown): { min: string | null; max: string | null; currency: string | null } {
  if (!isObject(value)) return { min: null, max: null, currency: null };
  const currency = str(value.currency) ?? str(value.salaryCurrency);
  const q = isObject(value.value) ? value.value : value;
  const min = str(q.minValue) ?? str(q.value);
  const max = str(q.maxValue) ?? str(q.value);
  return { min, max, currency: currency ?? str(q.currency) };
}

/** JobPosting descriptions are HTML. Strip tags; keep the paragraphing. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const REMOTE_TYPES: Record<string, "remote" | "hybrid" | "onsite"> = {
  telecommute: "remote",
  remote: "remote",
  hybrid: "hybrid",
};

/**
 * Pull whatever the page already states. Returns only fields actually found, so
 * the caller can record provenance honestly and let the model fill the rest.
 */
export function fromJsonLd(blocks: unknown[]): { job: Partial<CapturedJob>; provenance: CaptureProvenance } {
  const job: Partial<CapturedJob> = {};
  const provenance: CaptureProvenance = {};

  const posting = flatten(blocks).find(isJobPosting);
  if (!posting) return { job, provenance };

  const set = <K extends keyof CapturedJob>(key: K, value: CapturedJob[K] | null) => {
    if (value === null || value === undefined || value === "") return;
    job[key] = value;
    provenance[key] = "page";
  };

  set("title", str(posting.title));
  set("company", orgName(posting.hiringOrganization));
  set("location", locationName(posting.jobLocation));
  set("employment_type", str(Array.isArray(posting.employmentType) ? posting.employmentType[0] : posting.employmentType));
  set("deadline_at", str(posting.validThrough));

  const description = str(posting.description);
  if (description) set("job_description", stripHtml(description));

  const pay = salary(posting.baseSalary);
  set("salary_min", pay.min);
  set("salary_max", pay.max);
  set("salary_currency", pay.currency);

  // `jobLocationType: "TELECOMMUTE"` is schema.org's only remote signal.
  const locType = str(posting.jobLocationType)?.toLowerCase();
  if (locType && REMOTE_TYPES[locType]) set("location_type", REMOTE_TYPES[locType]);

  return { job, provenance };
}
