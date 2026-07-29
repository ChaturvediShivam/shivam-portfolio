-- ============================================================================
-- Phase 3 · M1 — Durable background job queue (P3-01)
-- ============================================================================
-- ADDITIVE ONLY. Introduces the `jobs` queue and its atomic claim function.
-- Touches no existing object (inquiries, CRM tables, policies, triggers, RPCs
-- are all left exactly as they are). Fully idempotent — safe to re-run.
--
-- Design (per Phase 3 Architecture §15 / ADR-005):
--   * A single Postgres-backed queue drained by Vercel Cron.
--   * Claims are leased with `for update skip locked` inside ONE atomic
--     statement (claim_jobs) so it is safe under Supabase's transaction-mode
--     connection pooler — no held transaction across the HTTP round-trip.
--   * `type` is text (open set; new types arrive per milestone with no DDL).
--   * `status` is a native enum (closed set).
--   * owner_id is nullable (system jobs) and points at auth.users so per-user
--     scoping can be tightened later without a schema change.
--
-- Conventions mirrored from the Phase 1 migration: lowercase SQL, uuid PK via
-- gen_random_uuid(), timestamptz not null default now(), the shared
-- set_updated_at() trigger, RLS on with the "Authenticated admin full access"
-- policy (the anon key can never touch it).
-- ============================================================================

-- Shared trigger function (re-declared idempotently so this file is
-- order-independent; identical to the one in the Phase 1 migration).
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
-- Status enum (closed domain).
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('pending', 'running', 'done', 'failed');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Queue table.
-- ----------------------------------------------------------------------------
create table if not exists jobs (
  id               uuid primary key default gen_random_uuid(),
  type             text        not null,
  payload          jsonb       not null default '{}'::jsonb,
  status           job_status  not null default 'pending',
  attempts         integer     not null default 0,
  max_attempts     integer     not null default 5,
  priority         smallint    not null default 0,
  run_after        timestamptz not null default now(),
  locked_at        timestamptz,
  last_error       text,
  idempotency_key  text,
  owner_id         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table jobs is
  'Durable async work queue drained by Vercel Cron (Phase 3 · M1). Handlers are idempotent; retries use exponential backoff; exhausted jobs become status=failed (dead-letter).';

-- updated_at trigger.
drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Indexes.
--   * (status, priority desc, run_after) — the hot claim path.
--   * (type) — dead-letter / observability filtering.
--   * unique (idempotency_key) partial — dedupe enqueues that carry a key.
-- ----------------------------------------------------------------------------
create index if not exists idx_jobs_claim
  on jobs (status, priority desc, run_after);
create index if not exists idx_jobs_type
  on jobs (type);
create unique index if not exists uq_jobs_idempotency_key
  on jobs (idempotency_key) where idempotency_key is not null;
-- Supports the stale-lease reclaim branch of claim_jobs (running jobs whose
-- worker died before completing).
create index if not exists idx_jobs_running_lease
  on jobs (locked_at) where status = 'running';

-- ----------------------------------------------------------------------------
-- RLS: authenticated admin can read/manage; the anon key is denied. The cron
-- drainer runs as the service role (bypasses RLS); this policy governs the
-- read-only health panel in Settings, which uses the session-bound client.
-- ----------------------------------------------------------------------------
alter table jobs enable row level security;

drop policy if exists "Authenticated admin full access" on jobs;
create policy "Authenticated admin full access" on jobs for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- claim_jobs(batch_size, lease_seconds) — atomically lease a bounded batch.
--
-- One statement: select the next runnable rows with FOR UPDATE SKIP LOCKED,
-- flip them to 'running', stamp locked_at, and increment attempts. Returns the
-- leased rows. Safe under the transaction-mode pooler and against concurrent
-- drainers (no two workers claim the same row). updated_at is maintained by the
-- BEFORE UPDATE trigger, so it is not set here.
--
-- Runnable = pending-and-due OR a stale lease: a job left 'running' longer than
-- lease_seconds (its worker crashed / the serverless function timed out) is
-- reclaimed so it never orphans. Handlers are idempotent, so re-running is safe;
-- a job that keeps timing out still counts attempts and eventually dead-letters.
-- The default lease (300s) matches Vercel's max function duration.
-- ----------------------------------------------------------------------------
-- Drop the superseded single-arg signature if an earlier revision of this
-- migration created it, so re-running never leaves an ambiguous overload.
drop function if exists claim_jobs(integer);

create or replace function claim_jobs(batch_size integer default 10, lease_seconds integer default 300)
returns setof jobs
language sql
as $$
  update jobs j
     set status    = 'running',
         locked_at = now(),
         attempts  = j.attempts + 1
   where j.id in (
     select id
       from jobs
      where (status = 'pending' and run_after <= now())
         or (status = 'running'
             and locked_at is not null
             and locked_at < now() - make_interval(secs => greatest(1, lease_seconds)))
      order by priority desc, run_after asc
      for update skip locked
      limit greatest(1, batch_size)
   )
  returning j.*;
$$;

comment on function claim_jobs(integer, integer) is
  'Atomically lease up to batch_size runnable jobs (FOR UPDATE SKIP LOCKED): pending-and-due plus stale leases older than lease_seconds. Increments attempts, sets status=running. Pooler-safe single statement.';

revoke all on function claim_jobs(integer, integer) from public;
grant execute on function claim_jobs(integer, integer) to service_role, authenticated;
