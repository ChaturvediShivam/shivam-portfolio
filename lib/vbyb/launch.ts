import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_CONFIG } from "@/constants";
import { VBYB_LAUNCH_SLUG } from "@/lib/vbyb/config";
import { VbybUserError, throwIfError } from "@/lib/vbyb/errors";
import { recordEvent } from "@/lib/vbyb/events";
import { dateInputToIso, isIsoDate, parseAmountToMinorUnits, textOrNull } from "@/lib/vbyb/format";
import { featureEnabled } from "@/lib/featureFlags";
import { GUMROAD_ENV_VARS } from "@/lib/vbyb/gumroad";
import { TALLY_ENV_VARS } from "@/lib/vbyb/tally";
import type { VbybLaunch, VbybWebhookDelivery } from "@/types/vbyb";

/** Launch settings, experiment notes, integration status and delivery log (server-only). */

export async function getLaunch(db: SupabaseClient): Promise<VbybLaunch | null> {
  const { data, error } = await db.from("vbyb_launches").select("*").eq("slug", VBYB_LAUNCH_SLUG).maybeSingle();
  throwIfError(error, "get launch");
  return (data as VbybLaunch | null) ?? null;
}

const TEXT_FIELDS = [
  "gumroad_product_id",
  "primary_metric",
  "expected",
  "what_happened",
  "objections",
  "what_changed",
  "learnings",
  "customer_feedback",
] as const;

/** Pure: validates the settings form into a launch patch. */
export function buildLaunchPatch(input: Record<string, unknown>): {
  patch: Record<string, unknown>;
  fieldErrors: Record<string, string>;
} {
  const patch: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");

  const name = textOrNull(str("name"));
  if (!name) fieldErrors.name = "Name is required";
  else if (name.length > 200) fieldErrors.name = "Must be 200 characters or fewer";
  else patch.name = name;

  const currency = str("currency").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fieldErrors.currency = "Use a 3-letter currency code";
  else patch.currency = currency;

  const price = /^[A-Z]{3}$/.test(currency) ? parseAmountToMinorUnits(str("price"), currency) : null;
  if (price == null) fieldErrors.price = "Enter a price such as 39.00";
  else patch.price_cents = price;

  const capacity = Number(str("capacity"));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000) fieldErrors.capacity = "Enter a whole number of slots";
  else patch.capacity = capacity;

  for (const key of ["criteria_min_preorders", "criteria_strong_preorders"] as const) {
    const raw = str(key).trim();
    if (raw === "") patch[key] = null;
    else if (!/^\d{1,6}$/.test(raw)) fieldErrors[key] = "Enter a whole number or leave blank";
    else patch[key] = Number(raw);
  }

  for (const key of TEXT_FIELDS) {
    const value = str(key);
    if (value.length > 10_000) fieldErrors[key] = "Must be 10000 characters or fewer";
    else patch[key] = textOrNull(value);
  }

  for (const [key, column] of [
    ["started_on", "started_at"],
    ["ended_on", "ended_at"],
  ] as const) {
    const raw = str(key).trim();
    if (raw === "") patch[column] = null;
    else if (!isIsoDate(raw)) fieldErrors[key] = "Enter a valid date";
    else patch[column] = dateInputToIso(raw);
  }

  return { patch, fieldErrors };
}

export async function updateLaunch(db: SupabaseClient, userId: string, input: Record<string, unknown>): Promise<void> {
  const { patch, fieldErrors } = buildLaunchPatch(input);
  if (Object.keys(fieldErrors).length > 0) throw new VbybUserError("Check the highlighted fields.", fieldErrors);

  const { data, error } = await db.from("vbyb_launches").update(patch).eq("slug", VBYB_LAUNCH_SLUG).select("id");
  throwIfError(error, "update launch");
  if (!(data ?? []).length) throw new VbybUserError("The founding launch row is missing. Apply the migration first.");

  await recordEvent(db, {
    eventType: "LAUNCH_UPDATED",
    actorType: "user",
    actorId: userId,
    metadata: { fields: Object.keys(patch) },
  });
}

/**
 * Webhook deliveries whose processing failed. A later successful retry of the
 * same delivery updates its row to `processed`, so this counts open failures.
 */
export async function countFailedDeliveries(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("vbyb_webhook_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");
  throwIfError(error, "count failed webhook deliveries");
  return count ?? 0;
}

export async function listDeliveries(db: SupabaseClient, limit = 25): Promise<VbybWebhookDelivery[]> {
  const { data, error } = await db
    .from("vbyb_webhook_deliveries")
    .select("id, provider, dedupe_key, event_type, external_id, status, error, attempts, received_at, last_received_at, processed_at")
    .order("last_received_at", { ascending: false })
    .limit(limit);
  throwIfError(error, "list webhook deliveries");
  return (data ?? []) as VbybWebhookDelivery[];
}

export interface IntegrationStatus {
  moduleEnabled: boolean;
  webhooksEnabled: boolean;
  serviceRoleConfigured: boolean;
  gumroad: Record<(typeof GUMROAD_ENV_VARS)[number], boolean>;
  tally: Record<(typeof TALLY_ENV_VARS)[number], boolean>;
  endpoints: { gumroad: string; tally: string };
}

/** Which settings are present — booleans only; values never leave the server. */
export function getIntegrationStatus(env: Record<string, string | undefined> = process.env): IntegrationStatus {
  const present = (name: string) => Boolean(env[name]?.trim());
  return {
    moduleEnabled: featureEnabled("FEATURE_VBYB"),
    webhooksEnabled: featureEnabled("FEATURE_VBYB_WEBHOOKS"),
    serviceRoleConfigured: present("SUPABASE_SERVICE_ROLE_KEY"),
    gumroad: Object.fromEntries(GUMROAD_ENV_VARS.map((n) => [n, present(n)])) as IntegrationStatus["gumroad"],
    tally: Object.fromEntries(TALLY_ENV_VARS.map((n) => [n, present(n)])) as IntegrationStatus["tally"],
    endpoints: {
      gumroad: `${SITE_CONFIG.url}/api/webhooks/gumroad`,
      tally: `${SITE_CONFIG.url}/api/webhooks/tally`,
    },
  };
}
