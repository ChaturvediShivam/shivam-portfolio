import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Settings data layer (server-only, read-only). Surfaces the current user, any
 * connected integration accounts, and system information. No settings store
 * exists yet, so configurable options are rendered as placeholders — nothing
 * here mutates.
 */

export const APP_VERSION = "0.1.0";
/** Captured when the server module first loads (≈ deploy/cold-start time). */
export const BUILD_TIME = new Date().toISOString();

export interface SettingsProfile {
  email: string | null;
  name: string | null;
  initials: string;
  lastSignInAt: string | null;
  createdAt: string | null;
  emailConfirmed: boolean;
}

export interface IntegrationSummary {
  provider: string;
  status: string;
  emailAddress: string | null;
  displayName: string | null;
}

export interface SettingsData {
  profile: SettingsProfile;
  integrations: IntegrationSummary[];
  gmailConnected: boolean;
}

function initialsFrom(name: string | null, email: string | null): string {
  const source = (name && name.trim()) || (email ? email.split("@")[0] : "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || source.slice(0, 2) || "?").toUpperCase();
}

export async function getSettingsData(supabase: SupabaseClient): Promise<SettingsData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = (metadata.full_name as string) || (metadata.name as string) || null;
  const email = user?.email ?? null;

  const profile: SettingsProfile = {
    email,
    name,
    initials: initialsFrom(name, email),
    lastSignInAt: user?.last_sign_in_at ?? null,
    createdAt: user?.created_at ?? null,
    emailConfirmed: !!user?.email_confirmed_at,
  };

  const { data, error } = await supabase
    .from("integration_accounts")
    .select("provider, status, email_address, display_name")
    .is("archived_at", null);
  if (error) throw error;

  const integrations = ((data ?? []) as {
    provider: string;
    status: string;
    email_address: string | null;
    display_name: string | null;
  }[]).map((a) => ({
    provider: a.provider,
    status: a.status,
    emailAddress: a.email_address,
    displayName: a.display_name,
  }));

  return {
    profile,
    integrations,
    gmailConnected: integrations.some((i) => i.provider === "gmail" && i.status === "connected"),
  };
}
