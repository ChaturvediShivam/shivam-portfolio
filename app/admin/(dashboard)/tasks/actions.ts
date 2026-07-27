"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import { validate, required, optional, maxLength, oneOf, type Schema } from "@/lib/validation";
import {
  createTask,
  updateTask,
  changeStatus,
  setTaskArchived,
  searchActiveCompanies,
  searchActiveContacts,
  searchActiveOpportunities,
} from "@/lib/tasks";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskInput, type TaskStatus } from "@/types/task";

const taskSchema: Schema<TaskInput> = {
  title: [required("Title is required"), maxLength(200)],
  description: [optional(maxLength(5000))],
  priority: [optional(oneOf(TASK_PRIORITIES, "Invalid priority"))],
  status: [optional(oneOf(TASK_STATUSES, "Invalid status"))],
};

export async function createTaskAction(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, taskSchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });
    const assigneeId = input.assign_to_me ? userId : null;
    const created = await createTask(supabase, userId, input, assigneeId);
    revalidatePath("/admin/tasks");
    return actionSuccess({ id: created.id });
  });
}

export async function updateTaskAction(id: string, input: TaskInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const result = validate(input, taskSchema);
    if (!result.ok) return actionError({ fieldErrors: result.fieldErrors as Record<string, string> });
    const assigneeId = input.assign_to_me ? userId : null;
    await updateTask(supabase, id, input, assigneeId);
    revalidatePath("/admin/tasks");
    revalidatePath(`/admin/tasks/${id}`);
    return actionSuccess({ id });
  });
}

export async function changeStatusAction(id: string, status: string): Promise<ActionResult<{ id: string; status: TaskStatus }>> {
  return withAdminAction(async ({ supabase }) => {
    if (!TASK_STATUSES.includes(status as never)) return actionError({ formError: "Invalid status." });
    await changeStatus(supabase, id, status as TaskStatus);
    revalidatePath("/admin/tasks");
    revalidatePath(`/admin/tasks/${id}`);
    return actionSuccess({ id, status: status as TaskStatus });
  });
}

export async function archiveTaskAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setTaskArchived(supabase, id, true);
    revalidatePath("/admin/tasks");
    revalidatePath(`/admin/tasks/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreTaskAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setTaskArchived(supabase, id, false);
    revalidatePath("/admin/tasks");
    revalidatePath(`/admin/tasks/${id}`);
    return actionSuccess({ id });
  });
}

export async function searchCompaniesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveCompanies(context.supabase, query);
}
export async function searchContactsAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveContacts(context.supabase, query);
}
export async function searchOpportunitiesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveOpportunities(context.supabase, query);
}
