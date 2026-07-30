-- ============================================================================
-- Phase 3 · M5 — Notifications (P3-05)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Introduces notifications + notification_preferences.
-- Touches no existing object.
--
-- Refinements: `type` is free text (extensible taxonomy — no enum, no future
-- migration for new types); `priority` is a smallint (0=low..3=critical, default
-- 1=normal) for index-backed sorting; `payload` is flexible jsonb context and
-- `metadata` holds delivery state.
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
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text        not null,               -- extensible taxonomy (no enum)
  priority    smallint    not null default 1,      -- 0=low 1=normal 2=high 3=critical
  title       text        not null,
  body        text,
  dedupe_key  text,                                -- idempotent creation (per owner)
  payload     jsonb       not null default '{}'::jsonb,  -- flexible context
  metadata    jsonb       not null default '{}'::jsonb,  -- delivery state
  read_at     timestamptz,
  owner_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table notifications is
  'In-app + email notifications (Phase 3 · M5). type is an extensible string taxonomy; priority is 0..3; payload/metadata are jsonb.';

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at before update on notifications
  for each row execute function set_updated_at();

-- Bell/list access paths + idempotent dedupe (per owner).
create index if not exists notifications_owner_read_idx on notifications (owner_id, read_at);
create index if not exists notifications_owner_priority_idx on notifications (owner_id, priority desc, created_at desc);
create index if not exists notifications_created_at_idx on notifications (created_at desc);
create unique index if not exists notifications_owner_dedupe_uniq
  on notifications (owner_id, dedupe_key) where dedupe_key is not null;

alter table notifications enable row level security;

drop policy if exists "Authenticated admin full access" on notifications;
create policy "Authenticated admin full access" on notifications for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- notification_preferences (one row per owner)
-- ----------------------------------------------------------------------------
create table if not exists notification_preferences (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  type_prefs    jsonb   not null default '{}'::jsonb,  -- per-type email opt-out
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table notification_preferences is
  'Per-owner notification channel/type preferences (Phase 3 · M5).';

create unique index if not exists notification_preferences_owner_uniq
  on notification_preferences (owner_id);

drop trigger if exists notification_preferences_set_updated_at on notification_preferences;
create trigger notification_preferences_set_updated_at before update on notification_preferences
  for each row execute function set_updated_at();

alter table notification_preferences enable row level security;

drop policy if exists "Authenticated admin full access" on notification_preferences;
create policy "Authenticated admin full access" on notification_preferences for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
