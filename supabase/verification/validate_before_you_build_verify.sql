-- ============================================================================
-- VBYB migration verification — READ-ONLY. Safe to run at any time.
-- Run in the Supabase SQL Editor after applying
-- supabase/migrations/20260914090000_validate_before_you_build.sql.
-- ============================================================================

-- 1. Tables: expect 9 rows, rls_enabled = true, policies = 0,
--    anon_* and authenticated_* = false, service_role_select = true.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
  has_table_privilege('anon', c.oid, 'select') as anon_select,
  has_table_privilege('anon', c.oid, 'insert') as anon_insert,
  has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
  has_table_privilege('service_role', c.oid, 'select') as service_role_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'vbyb\_%'
order by c.relname;

-- 2. Functions: expect 6 rows, anon_execute = false, authenticated_execute = false,
--    service_role_execute = true.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'vbyb\_%'
order by p.proname;

-- 3. Enums: expect 14 rows.
select typname from pg_type where typname like 'vbyb\_%' and typtype = 'e' order by typname;

-- 4. Key constraints and indexes are present.
select conname from pg_constraint
where conname in (
  'vbyb_validations_delivery_requirements',
  'vbyb_validations_killer_assumption_fk',
  'vbyb_evidence_assumption_fk',
  'vbyb_orders_refund_consistency',
  'vbyb_submissions_provider_external_key',
  'vbyb_webhook_deliveries_provider_dedupe_key'
)
order by conname;

select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('vbyb_orders_provider_external_uniq', 'vbyb_orders_submission_ref_uniq', 'vbyb_customers_email_uniq')
order by indexname;

-- 5. Seeded launch: expect founding-v1, 3900, USD, 10.
select slug, name, price_cents, currency, capacity from vbyb_launches order by created_at;
