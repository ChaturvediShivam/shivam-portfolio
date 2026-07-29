import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/integrations/crypto";
import { revokeToken } from "@/lib/integrations/google/oauth";
import type { GoogleAccountSummary, IntegrationAccount } from "@/types/integration";

/**
 * Integrations data layer (Phase 3 · M2). Server-only; accepts the caller's
 * session-bound Supabase client so every read/write is RLS-enforced. The OAuth
 * callback runs in the admin's browser session, so it uses this same path — no
 * service-role access is needed anywhere in the connect/disconnect flow.
 */

/** How long an OAuth handshake may stay open before the state expires. */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// OAuth CSRF state (single-use)
// ---------------------------------------------------------------------------

export async function createOAuthState(
  supabase: SupabaseClient,
  params: { ownerId: string; state: string; codeVerifier: string; redirectTo?: string | null },
): Promise<void> {
  // Best-effort prune of this owner's expired/abandoned states, so the table
  // stays self-cleaning without a dedicated reaper job (uses idx on expires_at).
  await supabase
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .eq("owner_id", params.ownerId);

  const { error } = await supabase.from("oauth_states").insert({
    provider: "gmail",
    state: params.state,
    code_verifier: params.codeVerifier,
    redirect_to: params.redirectTo ?? null,
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
    owner_id: params.ownerId,
  });
  if (error) throw error;
}

/**
 * Validate and consume a state in one step: delete the matching, unexpired,
 * owner-scoped row and return its verifier. Delete-and-return makes the state
 * strictly single-use (a replayed callback finds nothing).
 */
export async function consumeOAuthState(
  supabase: SupabaseClient,
  state: string,
  ownerId: string,
): Promise<{ codeVerifier: string; redirectTo: string | null } | null> {
  const { data, error } = await supabase
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .eq("owner_id", ownerId)
    .gte("expires_at", new Date().toISOString())
    .select("code_verifier, redirect_to")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { codeVerifier: data.code_verifier as string, redirectTo: (data.redirect_to as string) ?? null };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface UpsertGoogleAccountParams {
  ownerId: string;
  externalAccountId: string;
  email: string | null;
  displayName: string | null;
  scopes: string[];
  accessToken: string;
  /** Absent on re-consent when Google omits it — the existing one is retained. */
  refreshToken: string | null;
  expiresAt: Date;
}

/**
 * Insert or update the Google `integration_accounts` row for this owner,
 * encrypting the tokens at rest. Keyed on (owner_id, provider, external_account_id).
 */
export async function upsertGoogleAccount(
  supabase: SupabaseClient,
  params: UpsertGoogleAccountParams,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("integration_accounts")
    .select("id, refresh_token_encrypted")
    .eq("provider", "gmail")
    .eq("external_account_id", params.externalAccountId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();
  if (findError) throw findError;

  const refreshEncrypted = params.refreshToken
    ? encryptSecret(params.refreshToken)
    : (existing?.refresh_token_encrypted as string | undefined) ?? null;

  const record = {
    provider: "gmail" as const,
    external_account_id: params.externalAccountId,
    email_address: params.email,
    display_name: params.displayName,
    status: "connected" as const,
    scopes: params.scopes,
    access_token_encrypted: encryptSecret(params.accessToken),
    refresh_token_encrypted: refreshEncrypted,
    token_expires_at: params.expiresAt.toISOString(),
    last_error: null,
    archived_at: null,
    owner_id: params.ownerId,
  };

  if (existing) {
    const { error } = await supabase.from("integration_accounts").update(record).eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("integration_accounts")
    .insert(record)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** The active Gmail account for the current session (or null). */
export async function getGmailAccount(supabase: SupabaseClient): Promise<GoogleAccountSummary | null> {
  const { data, error } = await supabase
    .from("integration_accounts")
    .select("id, email_address, display_name, status")
    .eq("provider", "gmail")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    email: (data.email_address as string) ?? null,
    displayName: (data.display_name as string) ?? null,
    status: data.status as GoogleAccountSummary["status"],
  };
}

/** All active integration accounts for the current session. */
export async function listIntegrationAccounts(supabase: SupabaseClient): Promise<IntegrationAccount[]> {
  const { data, error } = await supabase
    .from("integration_accounts")
    .select(
      "id, provider, external_account_id, display_name, email_address, status, scopes, token_expires_at, last_synced_at, last_error, owner_id, created_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IntegrationAccount[];
}

/**
 * Disconnect an account: revoke the grant at Google (best-effort, using the
 * refresh token) then soft-delete the row (`status='disconnected'`,
 * `archived_at`). Synced data (messages/calendar) is intentionally retained.
 */
export async function disconnectAccount(supabase: SupabaseClient, accountId: string): Promise<void> {
  const { data: account, error: findError } = await supabase
    .from("integration_accounts")
    .select("id, refresh_token_encrypted, access_token_encrypted")
    .eq("id", accountId)
    .maybeSingle();
  if (findError) throw findError;
  if (!account) return; // already gone / not visible under RLS

  const encrypted =
    (account.refresh_token_encrypted as string | null) ??
    (account.access_token_encrypted as string | null);
  if (encrypted) {
    try {
      await revokeToken(decryptSecret(encrypted));
    } catch (err) {
      // Revocation is best-effort — never block disconnect on a provider error.
      console.error("[integrations] token revoke failed:", err);
    }
  }

  const { error } = await supabase
    .from("integration_accounts")
    .update({ status: "disconnected", archived_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) throw error;
}
