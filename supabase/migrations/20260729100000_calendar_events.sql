-- ============================================================================
-- Phase 3 · M4 — Calendar events (P3-04)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Introduces calendar_events and adds two nullable
-- columns to integration_accounts for the Calendar sync cursor (Gmail keeps
-- sync_cursor for its historyId). No existing column is altered.
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
-- calendar_events
-- ----------------------------------------------------------------------------
create table if not exists calendar_events (
  id                     uuid primary key default gen_random_uuid(),
  integration_account_id uuid references integration_accounts (id) on delete set null,
  opportunity_id         uuid references opportunities (id) on delete set null,
  external_event_id      text,               -- provider event id (idempotent ingest)
  calendar_id            text,
  title                  text,
  description            text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  all_day                boolean not null default false,
  location               text,
  attendees              jsonb not null default '[]'::jsonb,
  external_ids           jsonb not null default '{}'::jsonb,
  metadata               jsonb not null default '{}'::jsonb,
  owner_id               uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz
);
comment on table calendar_events is
  'Synced Google Calendar events + interview events created from opportunities (Phase 3 · M4).';

drop trigger if exists calendar_events_set_updated_at on calendar_events;
create trigger calendar_events_set_updated_at before update on calendar_events
  for each row execute function set_updated_at();

-- Idempotent ingest + agenda/opportunity access paths.
create unique index if not exists calendar_events_account_external_uniq
  on calendar_events (integration_account_id, external_event_id)
  where external_event_id is not null;
create index if not exists calendar_events_starts_at_idx on calendar_events (starts_at);
create index if not exists calendar_events_opportunity_id_idx on calendar_events (opportunity_id);
create index if not exists calendar_events_owner_id_idx on calendar_events (owner_id);

alter table calendar_events enable row level security;

drop policy if exists "Authenticated admin full access" on calendar_events;
create policy "Authenticated admin full access" on calendar_events for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- integration_accounts: additive Calendar sync cursor (never alters existing
-- columns; Gmail continues to use sync_cursor for its historyId).
-- ----------------------------------------------------------------------------
alter table integration_accounts add column if not exists calendar_sync_token text;
alter table integration_accounts add column if not exists calendar_synced_at   timestamptz;
