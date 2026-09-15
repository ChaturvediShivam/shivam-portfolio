# Validate Before You Build — operations backend

Admin module for the founding version: $39, 10 founding slots, Gumroad checkout,
Tally idea submission, a manually prepared Validation File within 48 hours, 7-day
refund, and a BUILD / TEST MORE / PARK / KILL decision.

- Admin: `/admin/validate-before-you-build` (Overview, Orders, Customers,
  Validations, Analytics, Settings)
- Webhooks: `POST /api/webhooks/gumroad`, `POST /api/webhooks/tally`
- Migration: `supabase/migrations/20260914090000_validate_before_you_build.sql`
- Verification: `supabase/verification/validate_before_you_build_verify.sql`
  (read-only) and `…_selftest.sql` (rolled back)

## Access model

Every `vbyb_*` table has RLS enabled with **no policies**, and privileges are
revoked from `anon` and `authenticated`. A signed-in Supabase user who is not the
admin cannot read these rows through PostgREST.

The server reaches the tables with the service-role client, created only in
`lib/vbyb/db.ts` after the `ADMIN_SIGNUP_ALLOWLIST` check (`requireVbybAdminPage`
for pages, `withVbybAction` for server actions), or in the webhook routes after
the provider secret/signature is verified.

## Data model

| Table | Purpose |
|---|---|
| `vbyb_launches` | Launch config and experiment notes (`founding-v1` seeded) |
| `vbyb_customers` | One row per normalized email |
| `vbyb_orders` | Purchases; unique `(provider, external_order_id)`; private `submission_ref` |
| `vbyb_submissions` | Tally submissions stored verbatim (`raw_payload`) plus mapped `fields` |
| `vbyb_validations` | One per order: workflow, idea working copy, decision, falsifier and cheapest test |
| `vbyb_assumptions` | Assumptions with risk; the validation's `killer_assumption_id` must belong to it |
| `vbyb_evidence` | Evidence ledger; origin has no AI value, strength defaults to `unknown` |
| `vbyb_events` | Append-only activity log |
| `vbyb_webhook_deliveries` | Authenticated webhook deliveries, deduplicated |

Guarantees enforced in Postgres:

- `vbyb_record_order` is idempotent on the Gumroad sale id and serialized per
  launch with an advisory lock, so duplicate or concurrent webhooks cannot create a
  second order or oversubscribe capacity.
- A slot is occupied by a paid, non-test, within-capacity order. A refund
  (`vbyb_record_refund`) frees it; the next order reuses the lowest free slot.
- `status = 'delivered'` requires `delivered_at`, `decision`, `decided_at` and a
  non-blank `decision_rationale` (check constraint).
- Metrics come from `vbyb_launch_metrics`; test orders are excluded.

The backend cannot stop Gumroad from taking an 11th payment — the webhook arrives
after payment. An 11th order is recorded as `over_capacity` and flagged for
refund. Set the product's own sales limit in Gumroad as the hard stop.

## Gumroad

Verified against Gumroad's open-source code (github.com/antiwork/gumroad):

- Pings are form-encoded by default, time out after 5 seconds, and are retried
  only on 499/500/502/503/504 and network errors.
- **Gumroad does not sign pings.** URL userinfo is forwarded as HTTP Basic auth.
- `GET https://api.gumroad.com/v2/sales/:id` with `Authorization: Bearer <token>`
  (scope `view_sales`) returns the sale. The ping's `sale_id` is the same id.

The route checks the shared secret, takes only `sale_id` from the body, re-fetches
the sale from the API, and records what the API returns — email, amount, product
and refund state. The same sync powers the admin "Re-sync from Gumroad" button, so
sale and refund pings arriving twice or out of order converge on the API's answer.
Partial refunds and disputes are logged as events and do not change the order.

## Tally

Per https://tally.so/help/webhooks: JSON `FORM_RESPONSE` events, a
`Tally-Signature` header (base64 HMAC-SHA256 with the signing secret), retries on
non-2xx, and hidden fields arriving as `HIDDEN_FIELDS`.

Matching precedence: hidden `ref` (the order's private `submission_ref`) → email,
only when exactly one paid order for that email is waiting → otherwise the
Unmatched queue. Unmatched submissions are retried by email when an order arrives,
and can be linked by hand on the Validations tab.

Fields are mapped by question label. A renamed question lands under
`fields.unmapped`; the raw payload is always kept.

## Environment variables

| Variable | Purpose |
|---|---|
| `FEATURE_VBYB` | Shows the admin module (`"true"` to enable) |
| `FEATURE_VBYB_WEBHOOKS` | Enables both webhook routes |
| `GUMROAD_WEBHOOK_SECRET` | Shared secret in the Ping URL |
| `GUMROAD_ACCESS_TOKEN` | Gumroad API token with `view_sales` |
| `GUMROAD_PRODUCT_ID` | Product id of the founding version |
| `TALLY_SIGNING_SECRET` | Tally webhook signing secret |
| `TALLY_FORM_ID` | The form id Tally sends as `data.formId` |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing; required |
| `ADMIN_SIGNUP_ALLOWLIST` | Existing; the admin boundary |

## Setup

### Supabase
1. SQL Editor → run the migration file.
2. Run `validate_before_you_build_verify.sql`; check the expected values in its comments.
3. Run `validate_before_you_build_selftest.sql`; expect `NOTICE: VBYB self-test passed`.

### Vercel
1. Add the variables above to Production with both flags set to `false`.
2. Merge the branch to `main` (the production branch) and let it deploy.
3. Set `FEATURE_VBYB=true`, redeploy, and open the admin module.
4. After Gumroad and Tally are configured, set `FEATURE_VBYB_WEBHOOKS=true` and redeploy.

### Gumroad
1. Create an application / access token with the `view_sales` scope → `GUMROAD_ACCESS_TOKEN`.
2. Find the product id (for example from a test ping's `product_id`) → `GUMROAD_PRODUCT_ID`.
3. Generate a long random secret → `GUMROAD_WEBHOOK_SECRET`.
4. Settings → Advanced → Ping endpoint:
   `https://gumroad:<GUMROAD_WEBHOOK_SECRET>@www.shivamchaturvedi.com/api/webhooks/gumroad`.
   If the dashboard rejects credentials in the URL, use
   `https://www.shivamchaturvedi.com/api/webhooks/gumroad?token=<GUMROAD_WEBHOOK_SECRET>`.
5. To receive refund notifications, also subscribe the same URL to the `refund`
   resource through the API's resource subscriptions.
6. Limit the product to 10 sales in Gumroad's product settings.
7. Send a test ping; confirm it under Settings → Recent webhook deliveries.

### Tally
1. Add a hidden field named `ref` to the submission form.
2. Integrations → Webhooks → `https://www.shivamchaturvedi.com/api/webhooks/tally`, enable the signing secret → `TALLY_SIGNING_SECRET`.
3. Set `TALLY_FORM_ID` to the form's id (the `data.formId` of a delivery; the share URL slug is typically the same — confirm from the first delivery).
4. Keep question labels unchanged, or update the label map in `lib/vbyb/tally.ts`.
5. Send each customer their personal link from the order page (`…?ref=<submission_ref>`).
