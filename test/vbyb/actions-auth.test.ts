import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isActionError } from "@/lib/action-result";
import { createSupabaseStub } from "@/test/stubs/supabase";

/**
 * VBYB server actions sit behind the existing admin authorization. The property
 * that matters: a caller who is not the allowlisted admin never causes the
 * service-role client — which bypasses RLS — to be created at all.
 *
 * Only transports are replaced (cookies, the SSR client factory, the service
 * client factory, revalidatePath). withAdminAction and the VBYB data layer are
 * the shipped code.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { createServiceClient } from "@/lib/supabase/service";
import {
  changeValidationStatusAction,
  createManualOrderAction,
  saveEvidenceAction,
} from "@/app/admin/(dashboard)/validate-before-you-build/actions";

const ADMIN = "admin@example.com";
const VALIDATION_ID = "11111111-1111-4111-8111-111111111111";

const ENV = {
  ADMIN_SIGNUP_ALLOWLIST: ADMIN,
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  FEATURE_VBYB: "true",
} as const;

let saved: Record<string, string | undefined>;

function signedInAs(email: string | null) {
  getUser.mockResolvedValue({ data: { user: email ? { id: "user-1", email } : null }, error: null });
}

const ORDER_INPUT = {
  email: "buyer@example.com",
  name: "Buyer",
  amount: "39.00",
  currency: "USD",
  purchased_on: "2026-09-14",
  is_test: false,
  notes: "",
};

const EVIDENCE_INPUT = {
  evidence_text: "A model said the market is large.",
  source: "Chat assistant",
  source_url: "",
  evidence_date: "",
  strength: "strong",
  origin: "ai_generated",
  provided_by_customer: false,
  assumption_id: "",
  notes: "",
};

beforeEach(() => {
  saved = {};
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  vi.mocked(createServiceClient).mockReset();
  getUser.mockReset();
});

describe("authorization", () => {
  it("never creates the service-role client for an authenticated non-admin", async () => {
    signedInAs("intruder@example.com");
    const result = await createManualOrderAction(ORDER_INPUT);
    expect(isActionError(result)).toBe(true);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("never creates the service-role client without a session", async () => {
    signedInAs(null);
    const result = await changeValidationStatusAction(VALIDATION_ID, "delivered");
    expect(isActionError(result)).toBe(true);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("refuses every action when the module flag is off, even for the admin", async () => {
    signedInAs(ADMIN);
    process.env.FEATURE_VBYB = "false";
    const result = await createManualOrderAction(ORDER_INPUT);
    expect(isActionError(result)).toBe(true);
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

describe("admin actions", () => {
  it("creates a manual order through the idempotent record_order function", async () => {
    signedInAs(ADMIN);
    const stub = createSupabaseStub({
      rpc: { vbyb_record_order: [{ order_id: "order-1", created: false, capacity_status: "within_capacity", slot_number: 1 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const result = await createManualOrderAction(ORDER_INPUT);

    expect(result).toEqual({ ok: true, data: { orderId: "order-1", created: false, capacityStatus: "within_capacity" } });
    expect(stub.rpcCalls[0]).toMatchObject({
      name: "vbyb_record_order",
      args: { p_provider: "manual", p_amount_cents: 3900, p_currency: "USD", p_actor_type: "user", p_actor_id: "user-1" },
    });
  });

  it("returns field errors for an invalid manual order and writes nothing", async () => {
    signedInAs(ADMIN);
    const stub = createSupabaseStub();
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const result = await createManualOrderAction({ ...ORDER_INPUT, email: "not-an-email", amount: "thirty" });

    expect(isActionError(result)).toBe(true);
    const failure = result as { fieldErrors?: Record<string, string> };
    expect(failure.fieldErrors?.email).toBeDefined();
    expect(failure.fieldErrors?.amount).toBeDefined();
    expect(stub.rpcCalls).toEqual([]);
  });

  it("refuses to record AI output as evidence", async () => {
    signedInAs(ADMIN);
    const stub = createSupabaseStub();
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const result = await saveEvidenceAction(VALIDATION_ID, null, EVIDENCE_INPUT);

    expect(isActionError(result)).toBe(true);
    expect((result as { fieldErrors?: Record<string, string> }).fieldErrors?.origin).toContain("AI output");
    expect(stub.opsFor("vbyb_evidence")).toEqual([]);
  });

  it("refuses DELIVERED without a recorded decision and does not update the row", async () => {
    signedInAs(ADMIN);
    const stub = createSupabaseStub({
      select: {
        vbyb_validations: {
          id: VALIDATION_ID,
          order_id: "order-1",
          customer_id: "customer-1",
          status: "in_progress",
          submitted_at: "2026-09-14T10:00:00.000Z",
          started_at: "2026-09-14T11:00:00.000Z",
          delivered_at: null,
          decision: null,
          decided_at: null,
          decision_rationale: null,
        },
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const result = await changeValidationStatusAction(VALIDATION_ID, "delivered");

    expect(isActionError(result)).toBe(true);
    expect((result as { formError?: string }).formError).toContain("decision");
    expect(stub.opsFor("vbyb_validations").some((op) => op.type === "update")).toBe(false);
  });

  it("does not let the status control mark a validation refunded", async () => {
    signedInAs(ADMIN);
    const stub = createSupabaseStub({
      select: {
        vbyb_validations: {
          id: VALIDATION_ID,
          order_id: "order-1",
          customer_id: "customer-1",
          status: "in_progress",
          submitted_at: null,
          started_at: null,
          delivered_at: null,
          decision: null,
          decided_at: null,
          decision_rationale: null,
        },
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const result = await changeValidationStatusAction(VALIDATION_ID, "refunded");
    expect(isActionError(result)).toBe(true);
    expect(stub.opsFor("vbyb_validations").some((op) => op.type === "update")).toBe(false);
  });
});
