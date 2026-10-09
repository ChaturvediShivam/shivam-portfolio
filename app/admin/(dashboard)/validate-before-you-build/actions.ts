"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { withVbybAction } from "@/lib/vbyb/db";
import { VbybUserError } from "@/lib/vbyb/errors";
import { readGumroadConfig, syncGumroadSale } from "@/lib/vbyb/gumroad";
import { updateLaunch } from "@/lib/vbyb/launch";
import {
  createManualOrder,
  getOrder,
  recordRefund,
  requestRefund,
  updateCustomer,
  updateOrderNotes,
  type ManualOrderInput,
} from "@/lib/vbyb/orders";
import {
  changeValidationStatus,
  deleteAssumption,
  deleteEvidence,
  linkSubmissionManually,
  saveAssumption,
  saveEvidence,
  setKillerAssumption,
  updateValidationSection,
  type AssumptionInput,
  type EvidenceInput,
} from "@/lib/vbyb/validations";
import type { CapacityStatus, ValidationStatus } from "@/types/vbyb";

/**
 * Validate Before You Build server actions.
 *
 * Every action goes through `withVbybAction` (lib/vbyb/db.ts): the admin
 * allowlist check runs first, and the service-role client is created only after
 * it passes. Input validation lives in the lib/vbyb data layer.
 */

function refreshModule() {
  revalidatePath(VBYB_BASE_PATH, "layout");
}

export async function createManualOrderAction(
  input: ManualOrderInput,
): Promise<ActionResult<{ orderId: string; created: boolean; capacityStatus: CapacityStatus }>> {
  return withVbybAction(async ({ db, userId }) => {
    const result = await createManualOrder(db, userId, input);
    refreshModule();
    return result;
  });
}

export async function updateOrderNotesAction(orderId: string, notes: string): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await updateOrderNotes(db, userId, orderId, notes);
    refreshModule();
    return null;
  });
}

export async function requestRefundAction(
  orderId: string,
  input: { requested_on: string; reason: string },
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await requestRefund(db, userId, orderId, input);
    refreshModule();
    return null;
  });
}

export async function recordRefundAction(
  orderId: string,
  input: { amount: string; refunded_on: string; reason: string },
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await recordRefund(db, userId, orderId, input);
    refreshModule();
    return null;
  });
}

export async function resyncGumroadOrderAction(orderId: string): Promise<ActionResult<{ refundedNow: boolean }>> {
  return withVbybAction(async ({ db, userId }) => {
    const order = await getOrder(db, orderId);
    if (!order) throw new VbybUserError("Order not found.");
    if (order.provider !== "gumroad" || !order.external_order_id) {
      throw new VbybUserError("Only Gumroad orders can be re-synced.");
    }

    const { config, missing } = readGumroadConfig();
    if (!config) throw new VbybUserError(`Gumroad is not configured. Missing: ${missing.join(", ")}.`);

    const outcome = await syncGumroadSale(db, order.external_order_id, {
      config,
      isTest: order.is_test,
      actorType: "user",
      actorId: userId,
    });

    switch (outcome.kind) {
      case "synced":
        refreshModule();
        return { refundedNow: outcome.refundedNow };
      case "not_found":
        throw new VbybUserError("Gumroad could not find this sale with the configured access token.");
      case "ignored":
        throw new VbybUserError("Gumroad reports this sale belongs to a different product.");
      case "error":
        throw new VbybUserError(outcome.message);
    }
  });
}

export async function updateCustomerAction(
  customerId: string,
  input: { name: string; relationship: string; notes: string },
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await updateCustomer(db, userId, customerId, input);
    refreshModule();
    return null;
  });
}

export async function linkSubmissionAction(submissionId: string, orderId: string): Promise<ActionResult<{ result: string }>> {
  return withVbybAction(async ({ db, userId }) => {
    const result = await linkSubmissionManually(db, userId, submissionId, orderId);
    refreshModule();
    return { result };
  });
}

export async function changeValidationStatusAction(
  validationId: string,
  status: string,
): Promise<ActionResult<{ status: ValidationStatus }>> {
  return withVbybAction(async ({ db, userId }) => {
    const next = await changeValidationStatus(db, userId, validationId, status);
    refreshModule();
    return { status: next };
  });
}

export async function updateValidationSectionAction(
  validationId: string,
  section: string,
  values: Record<string, string>,
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await updateValidationSection(db, userId, validationId, section, values);
    refreshModule();
    return null;
  });
}

export async function setKillerAssumptionAction(
  validationId: string,
  assumptionId: string | null,
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await setKillerAssumption(db, userId, validationId, assumptionId);
    refreshModule();
    return null;
  });
}

export async function saveAssumptionAction(
  validationId: string,
  assumptionId: string | null,
  input: AssumptionInput,
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await saveAssumption(db, userId, validationId, assumptionId, input);
    refreshModule();
    return null;
  });
}

export async function deleteAssumptionAction(assumptionId: string): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await deleteAssumption(db, userId, assumptionId);
    refreshModule();
    return null;
  });
}

export async function saveEvidenceAction(
  validationId: string,
  evidenceId: string | null,
  input: EvidenceInput,
): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await saveEvidence(db, userId, validationId, evidenceId, input);
    refreshModule();
    return null;
  });
}

export async function deleteEvidenceAction(evidenceId: string): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await deleteEvidence(db, userId, evidenceId);
    refreshModule();
    return null;
  });
}

export async function updateLaunchAction(input: Record<string, string>): Promise<ActionResult<null>> {
  return withVbybAction(async ({ db, userId }) => {
    await updateLaunch(db, userId, input);
    refreshModule();
    return null;
  });
}
