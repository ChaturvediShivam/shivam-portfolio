-- ============================================================================
-- Phase 3 · M2 — OAuth CSRF state store (P3-03)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Touches no existing object; OAuth tokens continue
-- to land in the existing integration_accounts.*_encrypted columns (no change
-- to that table).
--
-- oauth_states holds the short-lived CSRF `state` + PKCE `code_verifier` between
-- the connect redirect and the callback. Rows are single-use (deleted on
-- consume) and expire; owner_id cascades so a deleted user leaves no orphans.
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

create table if not exists oauth_states (
  id             uuid primary key default gen_random_uuid(),
  provider       integration_provider not null default 'gmail',
  state          text        not null,
  code_verifier  text        not null,
  redirect_to    text,
  expires_at     timestamptz not null,
  owner_id       uuid references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table oauth_states is
  'Short-lived OAuth CSRF state + PKCE verifier (Phase 3 · M2). Single-use, TTL-expired.';

drop trigger if exists oauth_states_set_updated_at on oauth_states;
create trigger oauth_states_set_updated_at before update on oauth_states
  for each row execute function set_updated_at();

create unique index if not exists uq_oauth_states_state on oauth_states (state);
create index if not exists idx_oauth_states_expires_at on oauth_states (expires_at);

alter table oauth_states enable row level security;

drop policy if exists "Authenticated admin full access" on oauth_states;
create policy "Authenticated admin full access" on oauth_states for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
