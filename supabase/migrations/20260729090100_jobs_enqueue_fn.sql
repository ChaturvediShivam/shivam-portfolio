-- ============================================================================
-- Phase 3 · M1 — Transactional outbox: enqueue_job() (P3-02)
-- ============================================================================
-- ADDITIVE ONLY. Depends on 20260729090000_jobs.sql. Idempotent.
--
-- Why this exists (freeze-review H1): the CRM's data layers talk to Postgres
-- via PostgREST, so a domain write and a follow-up enqueue are separate network
-- round-trips — a crash between them would silently drop the event. This
-- SECURITY DEFINER function lets a future producer (M3+/M10) insert the job row
-- inside the SAME transaction as its domain write (called from a trigger or an
-- RPC), giving genuine at-least-once delivery. No producer is wired in M1; this
-- is the platform primitive they will call.
--
-- Dedupe: when an idempotency_key is supplied and already exists, the insert is
-- a no-op and the existing id is returned (at-least-once producers are safe to
-- retry). search_path is pinned to defend the SECURITY DEFINER context.
-- ============================================================================

create or replace function enqueue_job(
  p_type            text,
  p_payload         jsonb       default '{}'::jsonb,
  p_run_after       timestamptz default now(),
  p_max_attempts    integer     default 5,
  p_idempotency_key text        default null,
  p_priority        smallint    default 0,
  p_owner_id        uuid        default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into jobs (type, payload, run_after, max_attempts, idempotency_key, priority, owner_id)
  values (
    p_type,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_run_after, now()),
    coalesce(p_max_attempts, 5),
    p_idempotency_key,
    coalesce(p_priority, 0::smallint),
    p_owner_id
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_id;

  -- Conflict path: the job already exists — return its id (idempotent enqueue).
  if v_id is null and p_idempotency_key is not null then
    select id into v_id from jobs where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

comment on function enqueue_job(text, jsonb, timestamptz, integer, text, smallint, uuid) is
  'Transactional-outbox enqueue (Phase 3 · M1, H1). Insert a job in the same transaction as a domain write; idempotent on idempotency_key. SECURITY DEFINER with pinned search_path.';

revoke all on function enqueue_job(text, jsonb, timestamptz, integer, text, smallint, uuid) from public;
grant execute on function enqueue_job(text, jsonb, timestamptz, integer, text, smallint, uuid) to service_role, authenticated;
