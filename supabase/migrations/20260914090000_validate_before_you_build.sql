-- ============================================================================
-- Validate Before You Build (VBYB) — founding-version operations backend
-- ============================================================================
-- ADDITIVE ONLY. Creates the vbyb_* domain and touches no existing object.
-- Idempotent: every statement is guarded, so the file is safe to re-run.
--
-- Access model (deliberately stricter than the CRM tables):
--   * RLS is enabled on every vbyb_* table and NO policy is created, so the
--     anon and authenticated roles can never read or write these rows through
--     PostgREST — not even a signed-in Supabase user who is not the admin.
--   * Table and function privileges are revoked from anon/authenticated and
--     granted to service_role only.
--   * The Next.js server reaches these tables with the service-role client,
--     and only after the ADMIN_SIGNUP_ALLOWLIST check (lib/vbyb/db.ts) or a
--     verified webhook secret/signature (app/api/webhooks/*).
--
-- Evidence principle: AI output is not evidence. vbyb_evidence_origin has no
-- AI value, and evidence strength defaults to 'unknown'.
--
-- Money is stored in the currency's minor units (cents for USD). Gumroad's
-- `price` is already in minor units.
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_payment_status') then
    create type vbyb_payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_refund_status') then
    create type vbyb_refund_status as enum ('not_requested', 'requested', 'refunded');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_capacity_status') then
    create type vbyb_capacity_status as enum ('within_capacity', 'over_capacity', 'not_applicable');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_validation_status') then
    create type vbyb_validation_status as enum ('paid', 'submitted', 'in_progress', 'delivered', 'refunded');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_decision') then
    create type vbyb_decision as enum ('build', 'test_more', 'park', 'kill');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_confidence') then
    create type vbyb_confidence as enum ('low', 'medium', 'high');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_evidence_strength') then
    create type vbyb_evidence_strength as enum ('unknown', 'weak', 'moderate', 'strong');
  end if;
end $$;

-- No AI value, on purpose: a model's output can be recorded in notes or as a
-- hypothesis, never as evidence.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_evidence_origin') then
    create type vbyb_evidence_origin as enum ('customer_submission', 'external_research', 'direct_observation');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_risk_level') then
    create type vbyb_risk_level as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_assumption_status') then
    create type vbyb_assumption_status as enum ('untested', 'testing', 'supported', 'refuted');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_test_status') then
    create type vbyb_test_status as enum ('not_started', 'in_progress', 'completed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_customer_relationship') then
    create type vbyb_customer_relationship as enum ('unknown', 'stranger', 'known');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_match_status') then
    create type vbyb_match_status as enum ('matched', 'unmatched');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vbyb_delivery_status') then
    create type vbyb_delivery_status as enum ('received', 'processed', 'ignored', 'failed');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Launches (one row per launch; the founding version is seeded below)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_launches (
  id                         uuid primary key default gen_random_uuid(),
  slug                       text not null,
  name                       text not null,
  price_cents                integer not null check (price_cents >= 0),
  currency                   text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  capacity                   integer not null check (capacity > 0),
  gumroad_product_id         text,
  primary_metric             text,
  criteria_min_preorders     integer check (criteria_min_preorders >= 0),
  criteria_strong_preorders  integer check (criteria_strong_preorders >= 0),
  expected                   text,
  what_happened              text,
  objections                 text,
  what_changed               text,
  learnings                  text,
  customer_feedback          text,
  started_at                 timestamptz,
  ended_at                   timestamptz,
  owner_id                   uuid references auth.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create unique index if not exists vbyb_launches_slug_uniq on vbyb_launches (slug);

comment on column vbyb_launches.criteria_min_preorders is
  'Internal experiment criterion chosen by the operator. Not an industry benchmark.';
comment on column vbyb_launches.criteria_strong_preorders is
  'Internal experiment criterion chosen by the operator. Not an industry benchmark.';

-- ----------------------------------------------------------------------------
-- Customers (one row per normalized email)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_customers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  name          text,
  relationship  vbyb_customer_relationship not null default 'unknown',
  notes         text,
  owner_id      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists vbyb_customers_email_uniq on vbyb_customers (email);

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------
create table if not exists vbyb_orders (
  id                     uuid primary key default gen_random_uuid(),
  launch_id              uuid not null references vbyb_launches (id) on delete restrict,
  customer_id            uuid not null references vbyb_customers (id) on delete restrict,
  provider               text not null check (provider in ('gumroad', 'manual')),
  external_order_id      text,
  external_purchaser_id  text,
  product_id             text,
  product_name           text,
  amount_cents           integer not null check (amount_cents >= 0),
  currency               text not null check (currency ~ '^[A-Z]{3}$'),
  purchased_at           timestamptz not null,
  payment_status         vbyb_payment_status not null default 'pending',
  refund_status          vbyb_refund_status not null default 'not_requested',
  refund_requested_at    timestamptz,
  refunded_at            timestamptz,
  refund_amount_cents    integer check (refund_amount_cents >= 0),
  refund_reason          text,
  capacity_status        vbyb_capacity_status not null default 'not_applicable',
  slot_number            integer check (slot_number > 0),
  is_test                boolean not null default false,
  -- Private per-order reference for the customer's Tally link (?ref=...).
  -- 256 bits of randomness from two v4 UUIDs; never the internal id.
  submission_ref         text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  raw_payload            jsonb,
  notes                  text,
  owner_id               uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint vbyb_orders_refund_consistency check ((payment_status = 'refunded') = (refund_status = 'refunded')),
  constraint vbyb_orders_refunded_at_present check (refund_status <> 'refunded' or refunded_at is not null),
  constraint vbyb_orders_refund_amount_bound check (refund_amount_cents is null or refund_amount_cents <= amount_cents),
  constraint vbyb_orders_gumroad_external_id check (provider <> 'gumroad' or external_order_id is not null)
);
create unique index if not exists vbyb_orders_provider_external_uniq
  on vbyb_orders (provider, external_order_id) where external_order_id is not null;
create unique index if not exists vbyb_orders_submission_ref_uniq on vbyb_orders (submission_ref);
create index if not exists vbyb_orders_launch_capacity_idx on vbyb_orders (launch_id, payment_status, capacity_status);
create index if not exists vbyb_orders_customer_id_idx on vbyb_orders (customer_id);
create index if not exists vbyb_orders_purchased_at_idx on vbyb_orders (purchased_at desc);

-- ----------------------------------------------------------------------------
-- Submissions (raw Tally responses, kept verbatim)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_submissions (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null default 'tally' check (provider = 'tally'),
  external_submission_id  text not null,
  external_response_id    text,
  external_event_id       text,
  form_id                 text,
  respondent_id           text,
  submitted_at            timestamptz not null,
  email                   text check (email is null or email = lower(btrim(email))),
  name                    text,
  ref                     text,
  fields                  jsonb not null default '{}'::jsonb,
  raw_payload             jsonb not null,
  match_status            vbyb_match_status not null default 'unmatched',
  matched_by              text check (matched_by in ('ref', 'email', 'manual')),
  order_id                uuid references vbyb_orders (id) on delete restrict,
  matched_at              timestamptz,
  owner_id                uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint vbyb_submissions_provider_external_key unique (provider, external_submission_id),
  constraint vbyb_submissions_match_consistency check ((match_status = 'matched') = (order_id is not null))
);
create index if not exists vbyb_submissions_match_status_idx on vbyb_submissions (match_status, submitted_at desc);
create index if not exists vbyb_submissions_email_idx on vbyb_submissions (email);
create index if not exists vbyb_submissions_order_id_idx on vbyb_submissions (order_id);

-- ----------------------------------------------------------------------------
-- Validations (one per order — the Validation File workspace)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_validations (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references vbyb_orders (id) on delete restrict,
  customer_id             uuid not null references vbyb_customers (id) on delete restrict,
  submission_id           uuid references vbyb_submissions (id) on delete restrict,
  status                  vbyb_validation_status not null default 'paid',
  status_changed_at       timestamptz not null default now(),
  submitted_at            timestamptz,
  started_at              timestamptz,
  delivered_at            timestamptz,
  -- Working copy of the idea, seeded from the submission. The original stays
  -- untouched in vbyb_submissions.raw_payload / fields.
  idea_what               text,
  idea_who                text,
  idea_problem            text,
  idea_done               text,
  idea_evidence           text,
  idea_evidence_source    text,
  idea_next               text,
  idea_stop               text,
  idea_alternatives       text,
  idea_context            text,
  decision                vbyb_decision,
  decided_at              timestamptz,
  decision_rationale      text,
  decision_confidence     vbyb_confidence,
  key_risk                text,
  killer_assumption_id    uuid,
  falsifier               text,
  evidence_summary        text,
  test_description        text,
  test_hypothesis         text,
  test_success_threshold  text,
  test_kill_threshold     text,
  test_deadline           date,
  test_result             text,
  test_status             vbyb_test_status not null default 'not_started',
  test_notes              text,
  internal_notes          text,
  owner_id                uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint vbyb_validations_delivery_requirements check (
    status <> 'delivered'
    or (
      delivered_at is not null
      and decision is not null
      and decided_at is not null
      and coalesce(btrim(decision_rationale), '') <> ''
    )
  )
);
create unique index if not exists vbyb_validations_order_id_uniq on vbyb_validations (order_id);
create unique index if not exists vbyb_validations_submission_id_uniq on vbyb_validations (submission_id) where submission_id is not null;
create index if not exists vbyb_validations_status_idx on vbyb_validations (status);
create index if not exists vbyb_validations_customer_id_idx on vbyb_validations (customer_id);

-- ----------------------------------------------------------------------------
-- Assumptions
-- ----------------------------------------------------------------------------
create table if not exists vbyb_assumptions (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references vbyb_validations (id) on delete cascade,
  assumption      text not null check (btrim(assumption) <> ''),
  why_it_matters  text,
  confidence      vbyb_confidence,
  risk_level      vbyb_risk_level not null,
  falsifier       text,
  test_required   text,
  status          vbyb_assumption_status not null default 'untested',
  sort_order      integer not null default 0,
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint vbyb_assumptions_id_validation_key unique (id, validation_id)
);
create index if not exists vbyb_assumptions_validation_idx on vbyb_assumptions (validation_id, sort_order);

-- The "assumption most likely to kill this idea" must belong to the same
-- validation; clearing it when the assumption is deleted.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vbyb_validations_killer_assumption_fk') then
    alter table vbyb_validations
      add constraint vbyb_validations_killer_assumption_fk
      foreign key (killer_assumption_id, id)
      references vbyb_assumptions (id, validation_id)
      on delete set null (killer_assumption_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Evidence ledger
-- ----------------------------------------------------------------------------
create table if not exists vbyb_evidence (
  id                    uuid primary key default gen_random_uuid(),
  validation_id         uuid not null references vbyb_validations (id) on delete cascade,
  assumption_id         uuid,
  evidence_text         text not null check (btrim(evidence_text) <> ''),
  source                text not null check (btrim(source) <> ''),
  source_url            text,
  evidence_date         date,
  strength              vbyb_evidence_strength not null default 'unknown',
  origin                vbyb_evidence_origin not null,
  provided_by_customer  boolean not null default false,
  notes                 text,
  owner_id              uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vbyb_evidence_assumption_fk
    foreign key (assumption_id, validation_id)
    references vbyb_assumptions (id, validation_id)
    on delete set null (assumption_id)
);
create index if not exists vbyb_evidence_validation_idx on vbyb_evidence (validation_id, created_at);
create index if not exists vbyb_evidence_assumption_idx on vbyb_evidence (assumption_id);

comment on table vbyb_evidence is
  'Evidence ledger. AI-generated output is not evidence: vbyb_evidence_origin has no AI value and strength defaults to unknown.';

-- ----------------------------------------------------------------------------
-- Activity events (append-only)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null check (event_type in (
    'ORDER_CREATED', 'ORDER_CAPACITY_EXCEEDED', 'ORDER_UPDATED', 'ORDER_REFUND_REQUESTED',
    'ORDER_REFUNDED', 'ORDER_PARTIALLY_REFUNDED', 'ORDER_DISPUTED', 'CUSTOMER_UPDATED',
    'SUBMISSION_RECEIVED', 'SUBMISSION_UNMATCHED', 'SUBMISSION_LINKED',
    'VALIDATION_STARTED', 'VALIDATION_UPDATED', 'VALIDATION_STATUS_CHANGED',
    'VALIDATION_DELIVERED', 'DECISION_RECORDED', 'LAUNCH_UPDATED'
  )),
  customer_id    uuid references vbyb_customers (id) on delete set null,
  order_id       uuid references vbyb_orders (id) on delete set null,
  validation_id  uuid references vbyb_validations (id) on delete set null,
  actor_type     text not null default 'system' check (actor_type in ('user', 'system', 'webhook')),
  actor_id       uuid references auth.users (id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists vbyb_events_created_at_idx on vbyb_events (created_at desc);
create index if not exists vbyb_events_order_idx on vbyb_events (order_id, created_at desc);
create index if not exists vbyb_events_validation_idx on vbyb_events (validation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Webhook deliveries (every authenticated delivery, deduplicated)
-- ----------------------------------------------------------------------------
create table if not exists vbyb_webhook_deliveries (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('gumroad', 'tally')),
  dedupe_key        text not null,
  event_type        text,
  external_id       text,
  status            vbyb_delivery_status not null default 'received',
  error             text,
  attempts          integer not null default 1,
  payload           jsonb,
  received_at       timestamptz not null default now(),
  last_received_at  timestamptz not null default now(),
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint vbyb_webhook_deliveries_provider_dedupe_key unique (provider, dedupe_key)
);
create index if not exists vbyb_webhook_deliveries_received_idx on vbyb_webhook_deliveries (received_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'vbyb_launches', 'vbyb_customers', 'vbyb_orders', 'vbyb_submissions',
    'vbyb_validations', 'vbyb_assumptions', 'vbyb_evidence', 'vbyb_webhook_deliveries'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Deny-all access for client roles; service_role only
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'vbyb_launches', 'vbyb_customers', 'vbyb_orders', 'vbyb_submissions', 'vbyb_validations',
    'vbyb_assumptions', 'vbyb_evidence', 'vbyb_events', 'vbyb_webhook_deliveries'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table %I to service_role', t);
  end loop;
end $$;

-- ============================================================================
-- Functions (security invoker; executable by service_role only)
-- ============================================================================

-- Record a completed purchase. Idempotent on (provider, external_order_id) and
-- serialized per launch with an advisory lock, so duplicate or concurrent
-- webhooks can neither create a second order nor oversubscribe the capacity.
create or replace function vbyb_record_order(
  p_launch_slug        text,
  p_provider           text,
  p_external_order_id  text,
  p_email              text,
  p_name               text,
  p_purchaser_id       text,
  p_product_id         text,
  p_product_name       text,
  p_amount_cents       integer,
  p_currency           text,
  p_purchased_at       timestamptz,
  p_is_test            boolean,
  p_raw_payload        jsonb,
  p_notes              text,
  p_actor_type         text,
  p_actor_id           uuid
)
returns table (order_id uuid, created boolean, capacity_status vbyb_capacity_status, slot_number integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_launch         vbyb_launches%rowtype;
  v_email          text := lower(btrim(coalesce(p_email, '')));
  v_currency       text := upper(btrim(coalesce(p_currency, '')));
  v_customer_id    uuid;
  v_order_id       uuid;
  v_validation_id  uuid;
  v_occupied       integer;
  v_capacity       vbyb_capacity_status := 'not_applicable';
  v_slot           integer;
begin
  if p_provider is null or p_provider not in ('gumroad', 'manual') then
    raise exception 'Invalid order provider.' using errcode = '22023';
  end if;
  if v_email = '' then
    raise exception 'An order needs a customer email.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'An order needs a non-negative amount.' using errcode = '22023';
  end if;

  select * into v_launch from vbyb_launches where slug = p_launch_slug;
  if not found then
    raise exception 'Unknown launch.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vbyb_capacity:' || v_launch.id::text, 0));

  if p_external_order_id is not null then
    select o.id, o.capacity_status, o.slot_number
      into v_order_id, v_capacity, v_slot
      from vbyb_orders o
     where o.provider = p_provider and o.external_order_id = p_external_order_id;
    if found then
      order_id := v_order_id;
      created := false;
      capacity_status := v_capacity;
      slot_number := v_slot;
      return next;
      return;
    end if;
  end if;

  insert into vbyb_customers as c (email, name)
  values (v_email, nullif(btrim(p_name), ''))
  on conflict (email) do update set name = coalesce(c.name, excluded.name)
  returning c.id into v_customer_id;

  if not coalesce(p_is_test, false) then
    select count(*) into v_occupied
      from vbyb_orders o
     where o.launch_id = v_launch.id
       and o.payment_status = 'paid'
       and o.capacity_status = 'within_capacity'
       and not o.is_test;

    if v_occupied < v_launch.capacity then
      v_capacity := 'within_capacity';
      -- Reuse the lowest slot number freed by a refund.
      select min(s.n) into v_slot
        from generate_series(1, v_launch.capacity) as s(n)
       where not exists (
         select 1 from vbyb_orders o
          where o.launch_id = v_launch.id
            and o.payment_status = 'paid'
            and o.capacity_status = 'within_capacity'
            and not o.is_test
            and o.slot_number = s.n
       );
      v_slot := coalesce(v_slot, v_occupied + 1);
    else
      v_capacity := 'over_capacity';
      v_slot := null;
    end if;
  end if;

  insert into vbyb_orders (
    launch_id, customer_id, provider, external_order_id, external_purchaser_id,
    product_id, product_name, amount_cents, currency, purchased_at,
    payment_status, capacity_status, slot_number, is_test, raw_payload, notes
  )
  values (
    v_launch.id, v_customer_id, p_provider, p_external_order_id, p_purchaser_id,
    p_product_id, p_product_name, p_amount_cents, v_currency, coalesce(p_purchased_at, now()),
    'paid', v_capacity, v_slot, coalesce(p_is_test, false), p_raw_payload, nullif(btrim(p_notes), '')
  )
  returning id into v_order_id;

  insert into vbyb_validations (order_id, customer_id)
  values (v_order_id, v_customer_id)
  returning id into v_validation_id;

  insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
  values (
    'ORDER_CREATED', v_customer_id, v_order_id, v_validation_id,
    coalesce(p_actor_type, 'system'), p_actor_id,
    jsonb_build_object(
      'provider', p_provider,
      'amount_cents', p_amount_cents,
      'currency', v_currency,
      'is_test', coalesce(p_is_test, false),
      'capacity_status', v_capacity,
      'slot_number', v_slot
    )
  );

  if v_capacity = 'over_capacity' then
    insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
    values (
      'ORDER_CAPACITY_EXCEEDED', v_customer_id, v_order_id, v_validation_id,
      coalesce(p_actor_type, 'system'), p_actor_id,
      jsonb_build_object('capacity', v_launch.capacity)
    );
  end if;

  order_id := v_order_id;
  created := true;
  capacity_status := v_capacity;
  slot_number := v_slot;
  return next;
end;
$$;

-- Record a refund. Idempotent; frees the founding slot by moving the order out
-- of payment_status 'paid'. Nothing is deleted.
create or replace function vbyb_record_refund(
  p_order_id      uuid,
  p_refunded_at   timestamptz,
  p_amount_cents  integer,
  p_reason        text,
  p_actor_type    text,
  p_actor_id      uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order          vbyb_orders%rowtype;
  v_amount         integer;
  v_validation_id  uuid;
begin
  select * into v_order from vbyb_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vbyb_capacity:' || v_order.launch_id::text, 0));

  select * into v_order from vbyb_orders where id = p_order_id for update;
  if v_order.payment_status = 'refunded' then
    return false;
  end if;

  v_amount := coalesce(p_amount_cents, v_order.amount_cents);
  if v_amount < 0 or v_amount > v_order.amount_cents then
    raise exception 'The refund amount must be between zero and the order amount.' using errcode = '22023';
  end if;

  update vbyb_orders
     set payment_status = 'refunded',
         refund_status = 'refunded',
         refunded_at = coalesce(p_refunded_at, now()),
         refund_amount_cents = v_amount,
         refund_reason = coalesce(nullif(btrim(p_reason), ''), refund_reason)
   where id = p_order_id;

  update vbyb_validations
     set status = 'refunded',
         status_changed_at = now()
   where order_id = p_order_id
     and status <> 'refunded';

  select id into v_validation_id from vbyb_validations where order_id = p_order_id;

  insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
  values (
    'ORDER_REFUNDED', v_order.customer_id, p_order_id, v_validation_id,
    coalesce(p_actor_type, 'system'), p_actor_id,
    jsonb_build_object('refund_amount_cents', v_amount, 'freed_slot_number', v_order.slot_number)
  );

  return true;
end;
$$;

-- Store a Tally submission once. Returns the existing row on a repeat delivery.
create or replace function vbyb_store_submission(
  p_external_submission_id  text,
  p_external_response_id    text,
  p_external_event_id       text,
  p_form_id                 text,
  p_respondent_id           text,
  p_submitted_at            timestamptz,
  p_email                   text,
  p_name                    text,
  p_ref                     text,
  p_fields                  jsonb,
  p_raw_payload             jsonb
)
returns table (submission_id uuid, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  insert into vbyb_submissions (
    external_submission_id, external_response_id, external_event_id, form_id, respondent_id,
    submitted_at, email, name, ref, fields, raw_payload
  )
  values (
    p_external_submission_id, p_external_response_id, p_external_event_id, p_form_id, p_respondent_id,
    coalesce(p_submitted_at, now()),
    nullif(lower(btrim(p_email)), ''),
    nullif(btrim(p_name), ''),
    nullif(btrim(p_ref), ''),
    coalesce(p_fields, '{}'::jsonb),
    p_raw_payload
  )
  on conflict (provider, external_submission_id) do nothing
  returning id into v_id;

  if v_id is null then
    select s.id into v_id
      from vbyb_submissions s
     where s.provider = 'tally' and s.external_submission_id = p_external_submission_id;
    submission_id := v_id;
    created := false;
    return next;
    return;
  end if;

  insert into vbyb_events (event_type, actor_type, metadata)
  values (
    'SUBMISSION_RECEIVED', 'webhook',
    jsonb_build_object('submission_id', v_id, 'has_ref', p_ref is not null, 'has_email', p_email is not null)
  );

  submission_id := v_id;
  created := true;
  return next;
end;
$$;

-- Link a submission to an order. The first submission becomes the validation's
-- primary submission (seeding the idea working copy and moving paid ->
-- submitted); later ones are kept as additional submissions.
create or replace function vbyb_link_submission(
  p_submission_id  uuid,
  p_order_id       uuid,
  p_matched_by     text,
  p_actor_type     text,
  p_actor_id       uuid
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sub      vbyb_submissions%rowtype;
  v_val      vbyb_validations%rowtype;
  v_fields   jsonb;
  v_primary  boolean := false;
begin
  if p_matched_by is null or p_matched_by not in ('ref', 'email', 'manual') then
    raise exception 'Invalid match method.' using errcode = '22023';
  end if;

  select * into v_sub from vbyb_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;

  if v_sub.order_id is not null then
    if v_sub.order_id = p_order_id then
      return 'already_linked';
    end if;
    raise exception 'This submission is already linked to another order.' using errcode = '22023';
  end if;

  select * into v_val from vbyb_validations where order_id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  update vbyb_submissions
     set order_id = p_order_id,
         match_status = 'matched',
         matched_by = p_matched_by,
         matched_at = now()
   where id = p_submission_id;

  if v_val.submission_id is null then
    v_primary := true;
    v_fields := coalesce(v_sub.fields, '{}'::jsonb);
    update vbyb_validations
       set submission_id = p_submission_id,
           submitted_at = coalesce(submitted_at, v_sub.submitted_at),
           idea_what = coalesce(idea_what, nullif(v_fields->>'idea_what', '')),
           idea_who = coalesce(idea_who, nullif(v_fields->>'idea_who', '')),
           idea_problem = coalesce(idea_problem, nullif(v_fields->>'idea_problem', '')),
           idea_done = coalesce(idea_done, nullif(v_fields->>'idea_done', '')),
           idea_evidence = coalesce(idea_evidence, nullif(v_fields->>'idea_evidence', '')),
           idea_evidence_source = coalesce(idea_evidence_source, nullif(v_fields->>'idea_evidence_source', '')),
           idea_next = coalesce(idea_next, nullif(v_fields->>'idea_next', '')),
           idea_stop = coalesce(idea_stop, nullif(v_fields->>'idea_stop', '')),
           idea_alternatives = coalesce(idea_alternatives, nullif(v_fields->>'idea_alternatives', '')),
           idea_context = coalesce(idea_context, nullif(v_fields->>'idea_context', '')),
           status_changed_at = case when status = 'paid' then now() else status_changed_at end,
           status = case when status = 'paid' then 'submitted'::vbyb_validation_status else status end
     where id = v_val.id;
  end if;

  insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
  values (
    'SUBMISSION_LINKED', v_val.customer_id, p_order_id, v_val.id,
    coalesce(p_actor_type, 'system'), p_actor_id,
    jsonb_build_object('submission_id', p_submission_id, 'matched_by', p_matched_by, 'primary', v_primary)
  );

  return case when v_primary then 'linked' else 'linked_additional' end;
end;
$$;

-- Register a webhook delivery; a repeat of the same dedupe key increments
-- `attempts` and returns the stored status so callers can skip finished work.
create or replace function vbyb_register_delivery(
  p_provider     text,
  p_dedupe_key   text,
  p_event_type   text,
  p_external_id  text,
  p_payload      jsonb
)
returns table (delivery_id uuid, status vbyb_delivery_status, attempts integer)
language sql
security invoker
set search_path = public
as $$
  insert into vbyb_webhook_deliveries as d (provider, dedupe_key, event_type, external_id, payload)
  values (p_provider, p_dedupe_key, p_event_type, p_external_id, p_payload)
  on conflict (provider, dedupe_key) do update
    set attempts = d.attempts + 1,
        last_received_at = now()
  returning d.id, d.status, d.attempts;
$$;

-- Every dashboard number, computed from rows. Test orders are excluded.
-- The 48-hour window mirrors DELIVERY_WINDOW_HOURS in lib/vbyb/config.ts.
create or replace function vbyb_launch_metrics(p_launch_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with launch as (
    select * from vbyb_launches where slug = p_launch_slug
  ),
  launch_orders as (
    select o.* from vbyb_orders o join launch l on l.id = o.launch_id
  ),
  real_orders as (
    select * from launch_orders where not is_test
  ),
  order_stats as (
    select
      count(*) filter (where payment_status = 'paid' and capacity_status = 'within_capacity') as occupied_slots,
      count(*) filter (where payment_status = 'paid' and capacity_status = 'over_capacity') as over_capacity_orders,
      count(*) filter (where payment_status = 'paid') as paid_orders,
      count(*) filter (where payment_status in ('paid', 'refunded')) as total_orders,
      count(*) filter (where payment_status = 'refunded') as refunded_orders,
      count(*) filter (where refund_status = 'requested') as refund_requests_open,
      coalesce(sum(amount_cents) filter (where payment_status in ('paid', 'refunded')), 0) as gross_revenue_cents,
      coalesce(sum(coalesce(refund_amount_cents, amount_cents)) filter (where payment_status = 'refunded'), 0) as refunded_cents,
      coalesce(jsonb_agg(distinct currency) filter (where payment_status in ('paid', 'refunded')), '[]'::jsonb) as currencies
    from real_orders
  ),
  launch_validations as (
    select v.* from vbyb_validations v join real_orders o on o.id = v.order_id
  ),
  validation_stats as (
    select
      count(*) filter (where submission_id is not null) as submissions_received,
      count(*) filter (where status = 'paid') as pending_submissions,
      count(*) filter (where status = 'submitted') as submitted_waiting,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where delivered_at is not null) as delivered,
      count(*) filter (where status in ('submitted', 'in_progress') and submitted_at < now() - interval '48 hours') as overdue,
      count(*) filter (where decision = 'build') as decision_build,
      count(*) filter (where decision = 'test_more') as decision_test_more,
      count(*) filter (where decision = 'park') as decision_park,
      count(*) filter (where decision = 'kill') as decision_kill
    from launch_validations
  ),
  delivery_times as (
    select extract(epoch from (delivered_at - submitted_at)) / 3600.0 as hours
    from launch_validations
    where delivered_at is not null and submitted_at is not null and delivered_at >= submitted_at
  ),
  delivery_stats as (
    select
      count(*) as sample,
      avg(hours) as avg_hours,
      percentile_cont(0.5) within group (order by hours) as median_hours
    from delivery_times
  ),
  relationship_stats as (
    select
      count(distinct c.id) filter (where c.relationship = 'stranger') as strangers,
      count(distinct c.id) filter (where c.relationship = 'known') as known,
      count(distinct c.id) filter (where c.relationship = 'unknown') as unknown
    from real_orders o
    join vbyb_customers c on c.id = o.customer_id
    where o.payment_status in ('paid', 'refunded')
  )
  select jsonb_build_object(
    'launch_id', l.id,
    'capacity', l.capacity,
    'price_cents', l.price_cents,
    'currency', l.currency,
    'occupied_slots', os.occupied_slots,
    'remaining_slots', greatest(l.capacity - os.occupied_slots, 0),
    'over_capacity_orders', os.over_capacity_orders,
    'paid_orders', os.paid_orders,
    'total_orders', os.total_orders,
    'refunded_orders', os.refunded_orders,
    'refund_requests_open', os.refund_requests_open,
    'test_orders', (select count(*) from launch_orders where is_test),
    'gross_revenue_cents', os.gross_revenue_cents,
    'refunded_cents', os.refunded_cents,
    'net_revenue_cents', os.gross_revenue_cents - os.refunded_cents,
    'currencies', os.currencies,
    'submissions_received', vs.submissions_received,
    'pending_submissions', vs.pending_submissions,
    'submitted_waiting', vs.submitted_waiting,
    'in_progress', vs.in_progress,
    'delivered', vs.delivered,
    'overdue', vs.overdue,
    'unmatched_submissions', (select count(*) from vbyb_submissions where match_status = 'unmatched'),
    'delivery_sample', ds.sample,
    'avg_delivery_hours', ds.avg_hours,
    'median_delivery_hours', ds.median_hours,
    'decisions', jsonb_build_object(
      'build', vs.decision_build,
      'test_more', vs.decision_test_more,
      'park', vs.decision_park,
      'kill', vs.decision_kill
    ),
    'relationships', jsonb_build_object(
      'stranger', rs.strangers,
      'known', rs.known,
      'unknown', rs.unknown
    )
  )
  from launch l, order_stats os, validation_stats vs, delivery_stats ds, relationship_stats rs;
$$;

revoke all on function vbyb_record_order(text, text, text, text, text, text, text, text, integer, text, timestamptz, boolean, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function vbyb_record_order(text, text, text, text, text, text, text, text, integer, text, timestamptz, boolean, jsonb, text, text, uuid) to service_role;

revoke all on function vbyb_record_refund(uuid, timestamptz, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function vbyb_record_refund(uuid, timestamptz, integer, text, text, uuid) to service_role;

revoke all on function vbyb_store_submission(text, text, text, text, text, timestamptz, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function vbyb_store_submission(text, text, text, text, text, timestamptz, text, text, text, jsonb, jsonb) to service_role;

revoke all on function vbyb_link_submission(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function vbyb_link_submission(uuid, uuid, text, text, uuid) to service_role;

revoke all on function vbyb_register_delivery(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function vbyb_register_delivery(text, text, text, text, jsonb) to service_role;

revoke all on function vbyb_launch_metrics(text) from public, anon, authenticated;
grant execute on function vbyb_launch_metrics(text) to service_role;

-- ----------------------------------------------------------------------------
-- Seed: the founding launch (configuration, not sample data)
-- ----------------------------------------------------------------------------
insert into vbyb_launches (slug, name, price_cents, currency, capacity, primary_metric)
values ('founding-v1', 'Validate Before You Build — Founding Version', 3900, 'USD', 10, 'Paid pre-orders from strangers')
on conflict (slug) do nothing;
