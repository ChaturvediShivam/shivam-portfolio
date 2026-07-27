/**
 * Task domain types for the Career CRM (Phase 2, M4).
 * Mirrors the `tasks` table (see DATABASE_GUIDE.md).
 */

import type { BadgeVariant } from "@/components/admin/ui";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}
export const statusLabel = humanize;
export const priorityLabel = humanize;

export function statusBadgeVariant(status: TaskStatus): BadgeVariant {
  switch (status) {
    case "in_progress":
      return "progress";
    case "blocked":
      return "danger";
    case "done":
      return "success";
    default:
      return "neutral"; // todo, cancelled
  }
}

export function priorityBadgeVariant(priority: TaskPriority): BadgeVariant {
  switch (priority) {
    case "urgent":
      return "danger";
    case "high":
      return "progress";
    case "medium":
      return "info";
    default:
      return "neutral"; // low
  }
}

export interface LinkedRef {
  id: string;
  label: string;
}

export interface Task {
  id: string;
  opportunity_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  opportunity?: { id: string; title: string } | null;
  contact?: { id: string; full_name: string } | null;
  company?: { id: string; name: string } | null;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  due_at?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  assign_to_me?: boolean;
}

export const TASK_SORT_FIELDS = ["title", "status", "due_at", "created_at", "updated_at"] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export interface TaskListFilters {
  search?: string;
  status?: string;
  priority?: string;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  sort?: TaskSortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface TaskListResult {
  rows: Task[];
  total: number;
  page: number;
  pageSize: number;
}

/** Overdue = past due, not completed/cancelled, not archived. */
export function isOverdue(task: Pick<Task, "due_at" | "status" | "archived_at">): boolean {
  if (!task.due_at || task.archived_at) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_at).getTime() < Date.now();
}
