import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationInput } from "@/types/notification";

/**
 * NotificationSource (Phase 3 · M5).
 *
 * A detector that reads EXISTING tables (read-only) and produces NotificationInput
 * DTOs. Sources never call provider APIs or re-sync — they read already-synced
 * rows, so no Gmail/Calendar logic is duplicated. New sources plug in via the
 * registry without touching the scan loop; the same DTO is fed by the event bus
 * in M10.
 */
export interface NotificationSource {
  readonly name: string;
  /** Detect notifiable conditions for one owner (owner-scoped, bounded). */
  detect(client: SupabaseClient, ownerId: string): Promise<NotificationInput[]>;
}
