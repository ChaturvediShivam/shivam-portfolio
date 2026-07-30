import "server-only";
import type { NotificationView } from "@/types/notification";

/**
 * NotificationChannel (Phase 3 · M5). A delivery mechanism behind a stable
 * interface — mirrors the provider pattern so future channels (push/SMS) plug in
 * without touching the dispatcher. In-app delivery is the persisted row itself;
 * EmailChannel is the only external channel in M5.
 */

export interface DeliveryResult {
  delivered: boolean;
  /** Reason when not delivered (permanent skip vs transient handled by caller). */
  reason?: string;
}

export interface NotificationChannel {
  readonly name: string;
  deliver(notification: NotificationView, recipient: { email: string | null }): Promise<DeliveryResult>;
}

/** HTML-escape untrusted text before it enters an email body. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
