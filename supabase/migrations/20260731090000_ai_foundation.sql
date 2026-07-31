-- ============================================================================
-- Phase 3 · M6 — AI Foundation (P3-06)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Introduces the AI conversation store, cross-cutting
-- audit log, prompt-template mirror, and the daily budget ledger.
-- Touches no existing object.
--
-- Vendor neutrality: `ai_provider` and `ai_model` are opaque provenance strings.
-- Nothing in the application branches on their value, so swapping providers
-- requires no migration.
--
-- ai_usage_counters is an INTENTIONAL ADDITION beyond the four tables named in
-- the frozen Phase-3 design (ai_conversations, ai_messages, ai_audit_log,
-- prompt_templates). Rationale: budget enforcement must be atomic. Deriving the
-- daily total by aggregating ai_audit_log is racy — two concurrent calls both
-- read the pre-spend total and both proceed — and the scan cost grows with every
-- call ever made. A dedicated counter row makes the check a single indexed
-- conditional UPDATE: correct under concurrency, O(1), and safe under PgBouncer
-- transaction pooling (the same constraint that shaped claim_jobs in M1).
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
-- ai_conversations — container for multi-turn runs
-- ----------------------------------------------------------------------------
create table if not exists ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  subject     text,
  entity_type text,                                   -- polymorphic linkage
  entity_id   uuid,
  status      text        not null default 'active',
  metadata    jsonb       not null default '{}'::jsonb,
  owner_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
comment on table ai_conversations is
  'AI conversation containers (Phase 3 · M6). Entity linkage is polymorphic (entity_type + entity_id).';

drop trigger if exists ai_conversations_set_updated_at on ai_conversations;
create trigger ai_conversations_set_updated_at before update on ai_conversations
  for each row execute function set_updated_at();

create index if not exists ai_conversations_owner_idx on ai_conversations (owner_id, created_at desc);
create index if not exists ai_conversations_entity_idx on ai_conversations (entity_type, entity_id);

alter table ai_conversations enable row level security;
drop policy if exists "Authenticated admin full access" on ai_conversations;
create policy "Authenticated admin full access" on ai_conversations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- ai_messages — individual turns
-- ----------------------------------------------------------------------------
create table if not exists ai_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references ai_conversations (id) on delete cascade,
  role              text not null,                    -- system|user|assistant|tool
  content           text not null default '',
  tool_calls        jsonb not null default '[]'::jsonb,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  ai_provider       text,                             -- opaque provenance
  ai_model          text,                             -- opaque provenance
  ai_prompt_version text,
  metadata          jsonb not null default '{}'::jsonb,
  owner_id          uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table ai_messages is
  'AI conversation turns (Phase 3 · M6). ai_provider/ai_model are opaque provenance strings — never branched on.';

drop trigger if exists ai_messages_set_updated_at on ai_messages;
create trigger ai_messages_set_updated_at before update on ai_messages
  for each row execute function set_updated_at();

create index if not exists ai_messages_conversation_idx on ai_messages (conversation_id, created_at);
create index if not exists ai_messages_owner_idx on ai_messages (owner_id);

alter table ai_messages enable row level security;
drop policy if exists "Authenticated admin full access" on ai_messages;
create policy "Authenticated admin full access" on ai_messages for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- ai_audit_log — one row per provider call
-- ----------------------------------------------------------------------------
create table if not exists ai_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  actor               text not null,                  -- user|agent|system
  action              text not null,                  -- e.g. 'complete'
  entity_type         text,
  entity_id           uuid,
  ai_provider         text not null,
  ai_model            text not null,
  ai_prompt_version   text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_micros         integer not null default 0,     -- millionths of a USD
  latency_ms          integer not null default 0,
  outcome             text not null,                  -- success|refused|truncated|error
  error_code          text,
  job_id              uuid,
  conversation_id     uuid references ai_conversations (id) on delete set null,
  owner_id            uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table ai_audit_log is
  'Cross-cutting AI call audit (Phase 3 · M6): model, prompt version, tokens, cost, latency, outcome.';

drop trigger if exists ai_audit_log_set_updated_at on ai_audit_log;
create trigger ai_audit_log_set_updated_at before update on ai_audit_log
  for each row execute function set_updated_at();

create index if not exists ai_audit_log_owner_idx on ai_audit_log (owner_id, created_at desc);
create index if not exists ai_audit_log_created_idx on ai_audit_log (created_at desc);
create index if not exists ai_audit_log_outcome_idx on ai_audit_log (outcome);

alter table ai_audit_log enable row level security;
drop policy if exists "Authenticated admin full access" on ai_audit_log;
create policy "Authenticated admin full access" on ai_audit_log for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- prompt_templates — runtime mirror / A-B surface (M6 resolves from the repo)
-- ----------------------------------------------------------------------------
create table if not exists prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  template_id text not null,
  version     text not null,
  body        text not null,
  task_class  text not null default 'fast',
  is_active   boolean not null default false,
  metadata    jsonb not null default '{}'::jsonb,
  owner_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table prompt_templates is
  'Optional runtime mirror of in-repo prompt templates (Phase 3 · M6). Not read by M6 — templates resolve from the repo.';

drop trigger if exists prompt_templates_set_updated_at on prompt_templates;
create trigger prompt_templates_set_updated_at before update on prompt_templates
  for each row execute function set_updated_at();

create unique index if not exists prompt_templates_id_version_uniq
  on prompt_templates (template_id, version);
create index if not exists prompt_templates_active_idx on prompt_templates (is_active);

alter table prompt_templates enable row level security;
drop policy if exists "Authenticated admin full access" on prompt_templates;
create policy "Authenticated admin full access" on prompt_templates for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- ai_usage_counters — atomic per-owner daily budget ledger
-- ----------------------------------------------------------------------------
create table if not exists ai_usage_counters (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  usage_date      date not null default current_date,
  tokens_reserved integer not null default 0,
  tokens_used     integer not null default 0,
  cost_micros     bigint  not null default 0,
  request_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table ai_usage_counters is
  'Per-owner daily AI token ledger (Phase 3 · M6). Exists so budget enforcement is a single atomic statement rather than a racy aggregate over ai_audit_log.';

drop trigger if exists ai_usage_counters_set_updated_at on ai_usage_counters;
create trigger ai_usage_counters_set_updated_at before update on ai_usage_counters
  for each row execute function set_updated_at();

create unique index if not exists ai_usage_counters_owner_date_uniq
  on ai_usage_counters (owner_id, usage_date);

alter table ai_usage_counters enable row level security;
drop policy if exists "Authenticated admin full access" on ai_usage_counters;
create policy "Authenticated admin full access" on ai_usage_counters for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- ai_reserve_budget — atomic reserve-or-refuse
-- ----------------------------------------------------------------------------
-- ONE statement. Both branches are guarded: the INSERT (first call of the day)
-- refuses when the single request alone exceeds the limit, and the UPDATE
-- refuses when it would push the running total past it. No rows returned means
-- refused — the caller treats NULL as denial.
--
-- p_limit IS NULL means unlimited.
-- ----------------------------------------------------------------------------
drop function if exists ai_reserve_budget(uuid, integer, integer);
create or replace function ai_reserve_budget(
  p_owner_id uuid,
  p_tokens   integer,
  p_limit    integer
) returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into ai_usage_counters (owner_id, usage_date, tokens_reserved, request_count)
  select p_owner_id, current_date, p_tokens, 1
  where p_limit is null or p_tokens <= p_limit
  on conflict (owner_id, usage_date) do update
    set tokens_reserved = ai_usage_counters.tokens_reserved + p_tokens,
        request_count   = ai_usage_counters.request_count + 1,
        updated_at      = now()
    where p_limit is null
       or ai_usage_counters.tokens_reserved + p_tokens <= p_limit
  returning true;
$$;

comment on function ai_reserve_budget(uuid, integer, integer) is
  'Atomically reserve tokens against the owner''s daily budget. Returns true when granted, NULL when refused.';

-- SECURITY DEFINER functions are granted to PUBLIC by default, which would let
-- the anon role call this over PostgREST and inflate any owner's counters — a
-- pre-auth budget denial-of-service. Restrict execution to real callers.
revoke all on function ai_reserve_budget(uuid, integer, integer) from public;
grant execute on function ai_reserve_budget(uuid, integer, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ai_commit_budget — reconcile a reservation to actual usage
-- ----------------------------------------------------------------------------
-- Replaces the estimate with the measured cost. If this never runs (crash, or a
-- failed write after a successful provider call) the reservation stands, which
-- over-counts rather than under-counts — the budget fails in the safe direction.
-- ----------------------------------------------------------------------------
drop function if exists ai_commit_budget(uuid, integer, integer, bigint);
create or replace function ai_commit_budget(
  p_owner_id    uuid,
  p_estimate    integer,
  p_actual      integer,
  p_cost_micros bigint
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update ai_usage_counters
     set tokens_reserved = greatest(0, tokens_reserved - p_estimate + p_actual),
         tokens_used     = tokens_used + p_actual,
         cost_micros     = cost_micros + p_cost_micros,
         updated_at      = now()
   where owner_id = p_owner_id
     and usage_date = current_date;
$$;

comment on function ai_commit_budget(uuid, integer, integer, bigint) is
  'Reconcile a prior ai_reserve_budget estimate to actual usage and cost.';

revoke all on function ai_commit_budget(uuid, integer, integer, bigint) from public;
grant execute on function ai_commit_budget(uuid, integer, integer, bigint) to authenticated, service_role;
