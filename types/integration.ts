/**
 * Integration domain types (Phase 3 · M2+).
 *
 * Mirrors the existing `integration_accounts` table and the `integration_status`
 * / `integration_provider` enums (unchanged by Phase 3).
 */

export type IntegrationProvider =
  | "gmail"
  | "linkedin"
  | "wellfound"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "indeed"
  | "company_portal"
  | "manual"
  | "other";

export type IntegrationStatus =
  | "pending"
  | "connected"
  | "syncing"
  | "error"
  | "disconnected";

/** A connected provider account (row of `integration_accounts`). */
export interface IntegrationAccount {
  id: string;
  provider: IntegrationProvider;
  external_account_id: string | null;
  display_name: string | null;
  email_address: string | null;
  status: IntegrationStatus;
  scopes: string[];
  token_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  owner_id: string | null;
  created_at: string;
}

/** Minimal, non-sensitive summary for the Settings UI (no tokens). */
export interface GoogleAccountSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  status: IntegrationStatus;
}
