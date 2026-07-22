-- Inquiry management system schema.
-- Run this once in the Supabase SQL editor for your project.
-- Safe to re-run: every statement is idempotent (guarded with IF NOT EXISTS /
-- OR REPLACE / DROP ... IF EXISTS) so re-running after a partial run won't error.

-- ============================================================================
-- Core table: one row per inquiry submitted through the public contact form
-- or created manually by an admin.
-- ============================================================================
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  organization text,
  message text not null,
  status text not null default 'New'
    check (status in ('New', 'In Progress', 'Follow Up', 'Converted', 'Closed', 'Spam')),
  lead_source text not null default 'Website'
    check (lead_source in ('Website', 'LinkedIn', 'Referral', 'Email', 'Manual', 'Other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table inquiries is 'Contact form submissions and manually-added leads.';

-- Keep updated_at current on every UPDATE, without relying on application code
-- to remember to set it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inquiries_set_updated_at on inquiries;
create trigger inquiries_set_updated_at
  before update on inquiries
  for each row
  execute function set_updated_at();

-- ============================================================================
-- Internal notes — one inquiry can accumulate many, each independently
-- timestamped. Never edited or deleted in place; always appended.
-- ============================================================================
create table if not exists inquiry_notes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table inquiry_notes is 'Admin-only internal notes attached to an inquiry.';

-- ============================================================================
-- Activity timeline — append-only audit trail. One row per meaningful event:
-- created, status_changed, lead_source_changed, note_added.
-- ============================================================================
create table if not exists inquiry_activity (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'status_changed', 'lead_source_changed', 'note_added')),
  detail text,
  created_at timestamptz not null default now()
);

comment on table inquiry_activity is 'Append-only audit trail for an inquiry.';

-- ============================================================================
-- Attachments — schema prepared now for future use. Not wired into any API
-- or UI yet; intentionally unused until attachment uploads are implemented.
-- ============================================================================
create table if not exists inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size_bytes integer,
  uploaded_at timestamptz not null default now()
);

comment on table inquiry_attachments is
  'Prepared for future attachment support. Not yet used by any API or UI.';

-- ============================================================================
-- Indexes — sized for thousands of rows, sortable/filterable columns covered.
-- ============================================================================
create index if not exists inquiries_created_at_idx on inquiries (created_at desc);
create index if not exists inquiries_status_idx on inquiries (status);
create index if not exists inquiries_email_idx on inquiries (email);
create index if not exists inquiry_notes_inquiry_id_idx on inquiry_notes (inquiry_id);
create index if not exists inquiry_activity_inquiry_id_idx on inquiry_activity (inquiry_id);

-- ============================================================================
-- Row Level Security — locked down entirely. The anon/public key can never
-- read or write any of these tables under any circumstance. The public
-- contact form inserts via the service role key (server-only, bypasses RLS).
-- The admin dashboard reads/writes via an authenticated Supabase Auth
-- session, permitted by the policies below.
-- ============================================================================
alter table inquiries enable row level security;
alter table inquiry_notes enable row level security;
alter table inquiry_activity enable row level security;
alter table inquiry_attachments enable row level security;

drop policy if exists "Authenticated admin full access" on inquiries;
create policy "Authenticated admin full access"
  on inquiries for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on inquiry_notes;
create policy "Authenticated admin full access"
  on inquiry_notes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on inquiry_activity;
create policy "Authenticated admin full access"
  on inquiry_activity for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on inquiry_attachments;
create policy "Authenticated admin full access"
  on inquiry_attachments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================================
-- search_inquiries — single source of truth for the admin dashboard's list
-- query: full-text-ish search across inquiries + notes, plus an optional
-- date range. Called via supabase.rpc('search_inquiries', {...}) so the
-- filtering logic lives in exactly one place rather than being duplicated
-- between the dashboard query and the CSV export query.
-- ============================================================================
create or replace function search_inquiries(
  search_term text default null,
  from_date timestamptz default null,
  to_date timestamptz default null
)
returns setof inquiries
language sql
stable
as $$
  select distinct i.*
  from inquiries i
  left join inquiry_notes n on n.inquiry_id = i.id
  where (
      search_term is null or search_term = '' or
      i.name ilike '%' || search_term || '%' or
      i.email ilike '%' || search_term || '%' or
      i.organization ilike '%' || search_term || '%' or
      i.message ilike '%' || search_term || '%' or
      n.body ilike '%' || search_term || '%'
    )
    and (from_date is null or i.created_at >= from_date)
    and (to_date is null or i.created_at <= to_date)
  order by i.created_at desc;
$$;
