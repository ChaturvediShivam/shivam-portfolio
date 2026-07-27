/**
 * Message domain types for the Career CRM (Phase 2, M5 — read-only viewer).
 * Mirrors the `messages` and `message_attachments` tables (see DATABASE_GUIDE.md).
 */

import type { BadgeVariant } from "@/components/admin/ui";

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export function directionLabel(d: string): string {
  return d === "inbound" ? "Inbound" : d === "outbound" ? "Outbound" : d;
}
export function directionBadgeVariant(d: string): BadgeVariant {
  return d === "outbound" ? "info" : "neutral";
}

export interface MessageAttachment {
  id: string;
  file_name: string;
  file_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_inline: boolean;
}

export interface Message {
  id: string;
  integration_account_id: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  source: string | null;
  direction: MessageDirection;
  external_message_id: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  from_name: string | null;
  from_address: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  is_read: boolean;
  sent_at: string | null;
  received_at: string | null;
  ai_summary: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  opportunity?: { id: string; title: string } | null;
  contact?: { id: string; full_name: string } | null;
  company?: { id: string; name: string } | null;
  integration_account?: { id: string; provider: string; email_address: string | null } | null;
}

/** Lightweight row for the thread panel. */
export interface ThreadMessage {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  direction: MessageDirection;
  is_read: boolean;
  received_at: string | null;
  sent_at: string | null;
}

export interface MessageLinkInput {
  opportunity_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
}

export const MESSAGE_SORT_FIELDS = ["received_at", "sent_at", "created_at"] as const;
export type MessageSortField = (typeof MESSAGE_SORT_FIELDS)[number];

export interface MessageListFilters {
  search?: string;
  direction?: string;
  source?: string;
  unreadOnly?: boolean;
  unlinkedOnly?: boolean;
  includeArchived?: boolean;
  sort?: MessageSortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MessageListResult {
  rows: Message[];
  total: number;
  page: number;
  pageSize: number;
}
