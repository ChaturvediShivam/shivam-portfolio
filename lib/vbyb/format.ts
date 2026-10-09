/**
 * Pure formatting and input-parsing helpers for VBYB. No server imports, so the
 * admin client components and the tests can use them directly.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Trimmed string, or null for blank / non-string input. */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** PostgREST returns an embedded to-one relation as an object or a one-item array. */
export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Minor-unit digits for a currency (2 for USD, 0 for JPY). Gumroad stores
 * `price` in minor units, so this is what turns 3900 into $39.00 rather than
 * assuming every currency has cents.
 */
export function currencyMinorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMoney(minorUnits: number | null | undefined, currency = "USD"): string {
  if (minorUnits == null) return "—";
  const digits = currencyMinorDigits(currency);
  const value = minorUnits / 10 ** digits;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

/** Parses "39" / "39.00" into minor units for the currency; null when invalid. */
export function parseAmountToMinorUnits(input: string, currency: string): number | null {
  const digits = currencyMinorDigits(currency);
  const trimmed = (input ?? "").trim();
  const pattern = digits === 0 ? /^\d{1,9}$/ : new RegExp(`^\\d{1,9}(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * A date-only form value stored as a timestamp. Pinned to midday UTC so the
 * calendar day survives display in any time zone.
 */
export function dateInputToIso(value: string): string {
  return `${value}T12:00:00.000Z`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Progress against a launch experiment threshold — an internal target, not a benchmark. */
export function thresholdStatus(threshold: number | null, value: number): string {
  if (threshold == null) return "not set";
  return value >= threshold ? `reached (${value} of ${threshold})` : `not reached (${value} of ${threshold})`;
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 72) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
