import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto";
import {
  getGoogleOAuthConfig,
  needsRefresh,
  refreshAccessToken,
  type GoogleOAuthConfig,
} from "@/lib/integrations/google/oauth";

/**
 * Google access-token orchestration (Phase 3 · M3).
 *
 * Returns a usable access token for a stored account, refreshing (and
 * re-encrypting) when it is missing/near expiry. Kept behind the Google
 * integration layer; tokens are only ever decrypted here and in crypto.ts.
 *
 * Because at most one gmail_sync runs per account at a time (single-active
 * invariant in the sync scheduler), refreshes are naturally serialized per
 * account (freeze-review H2).
 */

export class GoogleReauthRequiredError extends Error {}

export interface GoogleAccountTokens {
  id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

export async function getFreshAccessToken(
  client: SupabaseClient,
  account: GoogleAccountTokens,
  config: GoogleOAuthConfig | null = getGoogleOAuthConfig(),
): Promise<string> {
  if (!config) throw new Error("Google OAuth is not configured.");

  const currentToken = account.access_token_encrypted ? decryptSecret(account.access_token_encrypted) : null;
  if (currentToken && !needsRefresh(account.token_expires_at)) {
    return currentToken;
  }

  if (!account.refresh_token_encrypted) {
    await markAccountError(client, account.id, "No refresh token — reconnect required.");
    throw new GoogleReauthRequiredError("Google account has no refresh token; reconnect required.");
  }

  try {
    const refreshed = await refreshAccessToken({
      config,
      refreshToken: decryptSecret(account.refresh_token_encrypted),
    });
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    const { error } = await client
      .from("integration_accounts")
      .update({
        access_token_encrypted: encryptSecret(refreshed.access_token),
        token_expires_at: expiresAt,
        status: "connected",
        last_error: null,
      })
      .eq("id", account.id);
    if (error) throw error;

    return refreshed.access_token;
  } catch (err) {
    await markAccountError(client, account.id, "Token refresh failed — reconnect may be required.");
    if (err instanceof GoogleReauthRequiredError) throw err;
    throw new GoogleReauthRequiredError("Google token refresh failed; reconnect required.");
  }
}

async function markAccountError(client: SupabaseClient, accountId: string, message: string): Promise<void> {
  await client
    .from("integration_accounts")
    .update({ status: "error", last_error: message })
    .eq("id", accountId);
}
