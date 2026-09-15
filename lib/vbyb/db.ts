import "server-only";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/auth/adminEmail";
import { withAdminAction, actionError, actionSuccess, type ActionResult } from "@/lib/actions";
import { featureEnabled } from "@/lib/featureFlags";
import { VbybUserError } from "@/lib/vbyb/errors";

/**
 * The only doors into the VBYB tables.
 *
 * Every vbyb_* table denies the anon and authenticated roles outright (RLS on,
 * no policies, privileges revoked), so the session-bound client can read none of
 * it. Access is the service-role client — and it is only ever constructed here,
 * AFTER the same allowlist check the rest of the admin relies on. Webhook routes
 * are the one other caller, and they verify a provider secret or signature first.
 */

export interface VbybContext {
  db: SupabaseClient;
  userId: string;
}

/**
 * For admin Server Components. Middleware already turns non-admins away from
 * /admin/*; this re-checks on the server so a page never trusts that alone.
 * Responds 404 when the module is disabled or the caller is not the admin.
 */
export async function requireVbybAdminPage(): Promise<VbybContext> {
  if (!featureEnabled("FEATURE_VBYB")) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  return { db: createServiceClient(), userId: user.id };
}

/**
 * For Server Actions. Authorization is `withAdminAction` (lib/actions.ts); the
 * service-role client is created only inside it. `VbybUserError`s become form
 * errors; anything else is logged and returned as a generic failure by
 * `withAdminAction`.
 */
export function withVbybAction<T>(run: (context: VbybContext) => Promise<T>): Promise<ActionResult<T>> {
  return withAdminAction<T>(async ({ userId }) => {
    if (!featureEnabled("FEATURE_VBYB")) {
      return actionError({ formError: "Validate Before You Build is not enabled." });
    }
    try {
      return actionSuccess(await run({ db: createServiceClient(), userId }));
    } catch (err) {
      if (err instanceof VbybUserError) {
        return actionError({ formError: err.message, fieldErrors: err.fieldErrors });
      }
      throw err;
    }
  });
}
