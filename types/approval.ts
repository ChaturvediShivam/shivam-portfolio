/**
 * Approval domain types for the Career CRM (Phase 3 · M9).
 * Mirrors the `ai_approvals` table (see the M9 migration and ADR-006).
 */

import type { BadgeVariant } from "@/components/admin/ui";

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "sending",
  "sent",
  "failed",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Statuses an operator can still act on. */
export const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ["pending", "approved", "failed"];

export function approvalStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Awaiting review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function approvalStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "sent":
      return "success";
    case "failed":
      return "danger";
    case "rejected":
      return "neutral";
    case "approved":
    case "sending":
      return "info";
    default:
      return "progress";
  }
}

/**
 * The frozen instruction set for an email reply.
 *
 * Everything the executor needs, decided at draft time. Nothing here is
 * recomputed at send time — approving has to mean approving exactly what was on
 * screen, which is only true if the payload is the single source of the sent
 * message.
 */
export interface EmailReplyPayload {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  /** Gmail thread to reply within, when replying to a synced message. */
  threadId: string | null;
  /** RFC 5322 Message-ID being replied to, for correct threading. */
  inReplyTo: string | null;
  /** The CRM message this reply answers, for linkage on the sent row. */
  replyToMessageId: string | null;
  opportunityId: string | null;
  contactId: string | null;
  companyId: string | null;
}

export interface Approval {
  id: string;
  agent: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  proposed_payload: EmailReplyPayload | Record<string, unknown>;
  rationale: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_confidence: number | null;
  conversation_id: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  executed_at: string | null;
  result_message_id: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ApprovalListFilters {
  status?: ApprovalStatus;
  /** Only rows the operator can still act on. */
  openOnly?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ApprovalListResult {
  rows: Approval[];
  total: number;
  page: number;
  pageSize: number;
}
