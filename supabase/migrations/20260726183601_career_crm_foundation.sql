-- ============================================================================
-- Career CRM — database foundation (Phase 1, Step 2)
-- ============================================================================
-- ADDITIVE ONLY. This migration introduces the Career CRM domain and does not
-- touch any existing object: inquiries, inquiry_notes, inquiry_activity,
-- inquiry_attachments, their triggers, policies, or the search_inquiries RPC
-- are all left exactly as they are.
--
-- Design goals (per Phase 1 Step 2 brief):
--   * Optimize for long-term scalability, not the smallest schema.
--   * Model a source-agnostic pipeline that can later ingest from Gmail,
--     LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Workday, Indeed and
--     company career portals, across multiple inboxes, multiple users, and
--     autonomous AI agents — even though Phase 1 only wires up Gmail.
--
-- Final-review hardening applied on top of the approved design:
--   * Source normalization: `provider` lives on integration_accounts, data rows
--     carry `source` (enum) + `integration_account_id` (source_account) +
--     `external_ids jsonb` + typed `external_*_id`, so new providers need no DDL.
--   * Richer opportunity/company/contact attributes for filtering & analytics.
--   * Every AI-touchable entity carries ai_model / ai_prompt_version /
--     ai_confidence / ai_processed_at (+ ai_summary where relevant) so AI output
--     is recordable without a future migration.
--   * message_attachments table + html/plain bodies + thread id already present.
--   * Generated `search_vector` (tsvector) + GIN on the high-value search
--     targets — cheap to add now, expensive to retrofit on a large messages
--     table later.
--
-- Conventions mirrored from supabase/schema.sql:
--   * lowercase SQL, uuid primary keys via gen_random_uuid()
--   * timestamptz not null default now() for created_at / updated_at
--   * the shared set_updated_at() trigger keeps updated_at current
--   * RLS on for every table with a single "Authenticated admin full access"
--     policy (auth.role() = 'authenticated'); the anon key can never touch it
--   * fully idempotent — safe to re-run (guards on every statement)
--
-- owner_id is nullable everywhere for now (single-admin today) but already
-- points at auth.users so per-user RLS can be tightened later without a
-- schema change.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared trigger function. Identical to the one in schema.sql; re-declared with
-- CREATE OR REPLACE so this migration is self-contained and order-independent.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- ENUM TYPES
-- Native enums are used for closed, semantically-stable domains. New values can
-- be added later with `alter type ... add value` (non-breaking). Open-ended,
-- fast-evolving sets (seniority, work_authorization, application_method, role)
-- are intentionally left as text to avoid churn.
-- ============================================================================

-- Where a record originated / which platform an integration talks to.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'integration_provider') then
    create type integration_provider as enum (
      'gmail', 'linkedin', 'wellfound', 'greenhouse', 'lever',
      'ashby', 'workday', 'indeed', 'company_portal', 'manual', 'other'
    );
  end if;
end $$;

-- Lifecycle of a connected integration account (inbox / API connection).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'integration_status') then
    create type integration_status as enum (
      'pending', 'connected', 'syncing', 'error', 'disconnected'
    );
  end if;
end $$;

-- Direction of a message relative to the account owner.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type message_direction as enum ('inbound', 'outbound');
  end if;
end $$;

-- Stage of an opportunity in the job pipeline. Ordered lead -> outcome.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'opportunity_stage') then
    create type opportunity_stage as enum (
      'lead', 'applied', 'screening', 'interview',
      'offer', 'hired', 'rejected', 'withdrawn', 'on_hold'
    );
  end if;
end $$;

-- Employment arrangement of a role (closed, stable set -> enum).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'employment_type') then
    create type employment_type as enum (
      'full_time', 'part_time', 'contract', 'internship',
      'temporary', 'freelance', 'other'
    );
  end if;
end $$;

-- Physical arrangement of a role.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'location_type') then
    create type location_type as enum ('remote', 'hybrid', 'onsite');
  end if;
end $$;

-- Task workflow state.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum (
      'todo', 'in_progress', 'blocked', 'done', 'cancelled'
    );
  end if;
end $$;

-- Task priority.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type task_priority as enum ('low', 'medium', 'high', 'urgent');
  end if;
end $$;

-- Who/what produced an event — supports human users, AI agents, and the system.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'actor_type') then
    create type actor_type as enum ('user', 'agent', 'system');
  end if;
end $$;

-- Kinds of opportunity timeline events. Broad on purpose; append new values as
-- automation and agents learn to emit richer events.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'opportunity_event_type') then
    create type opportunity_event_type as enum (
      'created', 'stage_changed', 'archived', 'restored',
      'message_received', 'message_sent',
      'contact_linked', 'contact_unlinked',
      'note_added', 'task_created', 'task_completed',
      'interview_scheduled', 'document_added', 'custom'
    );
  end if;
end $$;

-- ============================================================================
-- COMPANIES — organizations you're pursuing or interacting with.
-- ============================================================================
create table if not exists companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  domain             text,                    -- canonical email/website domain, deduped
  website            text,
  linkedin_url       text,
  careers_url        text,                    -- company career portal (future ingestion)
  industry           text,
  employee_range     text,                    -- free-form band (e.g. '51-200')
  headquarters       text,                    -- HQ city / region
  country            text,
  description        text,
  logo_url           text,
  external_ids       jsonb not null default '{}'::jsonb,  -- {provider: id} for cross-source matching
  -- AI provenance (nullable; set when a row is AI-generated/enriched)
  ai_model           text,
  ai_prompt_version  text,
  ai_confidence      numeric(5,4),            -- 0.0000 .. 1.0000
  ai_processed_at    timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  owner_id           uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  search_vector      tsvector generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' || coalesce(industry, '') || ' ' ||
      coalesce(headquarters, '') || ' ' || coalesce(country, ''))
  ) stored
);
comment on table companies is 'Organizations in the Career CRM (employers, agencies, portals).';

-- ============================================================================
-- CONTACTS — people (recruiters, hiring managers, referrals, interviewers).
-- ============================================================================
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies (id) on delete set null,
  full_name          text not null,
  first_name         text,
  last_name          text,
  email              text,
  phone              text,
  title              text,                    -- job title / role at the company
  department         text,
  linkedin_url       text,
  location           text,
  timezone           text,                    -- IANA tz (e.g. 'America/New_York')
  avatar_url         text,
  source             integration_provider,    -- where this contact was discovered
  external_ids       jsonb not null default '{}'::jsonb,
  ai_model           text,
  ai_prompt_version  text,
  ai_confidence      numeric(5,4),
  ai_processed_at    timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  owner_id           uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  search_vector      tsvector generated always as (
    to_tsvector('english',
      coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(title, '') || ' ' || coalesce(department, ''))
  ) stored
);
comment on table contacts is 'People associated with companies and opportunities.';

-- ============================================================================
-- INTEGRATION_ACCOUNTS — connected inboxes / API connections. Supports many
-- accounts per user and many providers. Phase 1 only connects Gmail.
-- ============================================================================
-- SECURITY NOTE: token columns must hold ENCRYPTED values (e.g. via Supabase
-- Vault / pgsodium or app-layer encryption), never plaintext. RLS already
-- blocks the anon key; these rows are additionally admin-only.
create table if not exists integration_accounts (
  id                     uuid primary key default gen_random_uuid(),
  provider               integration_provider not null,
  external_account_id    text,                -- provider-side account id
  display_name           text,
  email_address          text,                -- inbox address for email providers
  status                 integration_status not null default 'pending',
  scopes                 text[] not null default '{}',
  access_token_encrypted   text,
  refresh_token_encrypted  text,
  token_expires_at       timestamptz,
  sync_cursor            text,                -- provider incremental cursor (e.g. Gmail historyId)
  last_synced_at         timestamptz,
  last_error             text,
  metadata               jsonb not null default '{}'::jsonb,
  owner_id               uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz
);
comment on table integration_accounts is 'Connected provider inboxes/APIs (Gmail, LinkedIn, ATSs...). Tokens must be stored encrypted.';

-- ============================================================================
-- OPPORTUNITIES — the central entity: one job pursuit / application.
-- ============================================================================
create table if not exists opportunities (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid references companies (id) on delete set null,
  primary_contact_id      uuid references contacts (id) on delete set null,
  integration_account_id  uuid references integration_accounts (id) on delete set null, -- source_account
  title                   text not null,      -- role / job title
  stage                   opportunity_stage not null default 'lead',
  source                  integration_provider,
  external_job_id         text,               -- provider job/posting id (dedup)
  external_ids            jsonb not null default '{}'::jsonb, -- other providers' ids for this role
  job_url                 text,
  location                text,               -- where the role is based
  location_type           location_type,      -- remote / hybrid / onsite
  employment_type         employment_type,
  seniority               text,               -- e.g. junior / mid / senior / staff / principal
  work_authorization      text,               -- e.g. 'us_citizen', 'visa_sponsorship'
  application_method      text,               -- e.g. 'email', 'portal', 'referral', 'easy_apply'
  salary_min              numeric(14,2),
  salary_max              numeric(14,2),
  salary_currency         text default 'USD',
  applied_at              timestamptz,
  next_action_at          timestamptz,        -- drives follow-up reminders
  ai_summary              text,
  ai_model                text,
  ai_prompt_version       text,
  ai_confidence           numeric(5,4),
  ai_processed_at         timestamptz,
  metadata                jsonb not null default '{}'::jsonb,
  owner_id                uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  archived_at             timestamptz,
  search_vector           tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(location, '') || ' ' ||
      coalesce(seniority, ''))
  ) stored
);
comment on table opportunities is 'A single job pursuit/application; the pipeline core.';

-- ============================================================================
-- OPPORTUNITY_CONTACTS — many-to-many between opportunities and contacts, with
-- the role the contact plays on that specific opportunity.
-- ============================================================================
create table if not exists opportunity_contacts (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities (id) on delete cascade,
  contact_id      uuid not null references contacts (id) on delete cascade,
  role            text,                        -- recruiter / hiring_manager / referral / interviewer
  metadata        jsonb not null default '{}'::jsonb,
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table opportunity_contacts is 'Join table: which contacts are involved in which opportunity, and how.';

-- ============================================================================
-- MESSAGES — normalized communications (emails, LinkedIn DMs, ATS messages).
-- Source-agnostic so any provider maps onto the same shape.
-- ============================================================================
create table if not exists messages (
  id                      uuid primary key default gen_random_uuid(),
  integration_account_id  uuid references integration_accounts (id) on delete set null,
  opportunity_id          uuid references opportunities (id) on delete set null,
  contact_id              uuid references contacts (id) on delete set null,
  company_id              uuid references companies (id) on delete set null,
  source                  integration_provider not null default 'gmail',
  direction               message_direction not null,
  external_message_id     text,               -- provider message id (idempotent ingest)
  thread_id               text,               -- provider thread/conversation id
  in_reply_to             text,
  subject                 text,
  snippet                 text,
  body_text               text,
  body_html               text,
  from_name               text,
  from_address            text,
  to_addresses            text[] not null default '{}',
  cc_addresses            text[] not null default '{}',
  is_read                 boolean not null default false,
  sent_at                 timestamptz,
  received_at             timestamptz,
  ai_summary              text,
  ai_model                text,
  ai_prompt_version       text,
  ai_confidence           numeric(5,4),
  ai_processed_at         timestamptz,
  metadata                jsonb not null default '{}'::jsonb, -- headers / labels / thread metadata
  owner_id                uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  archived_at             timestamptz,
  search_vector           tsvector generated always as (
    to_tsvector('english',
      coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' ||
      coalesce(body_text, ''))
  ) stored
);
comment on table messages is 'Normalized inbound/outbound communications across all providers.';

-- ============================================================================
-- MESSAGE_ATTACHMENTS — files carried by a message. Dedicated table (mirrors
-- inquiry_attachments) so attachments scale independently of message rows.
-- ============================================================================
create table if not exists message_attachments (
  id                     uuid primary key default gen_random_uuid(),
  message_id             uuid not null references messages (id) on delete cascade,
  file_name              text not null,
  file_url               text,
  mime_type              text,
  file_size_bytes        bigint,
  is_inline              boolean not null default false,
  external_attachment_id text,                -- provider attachment id (idempotent ingest)
  metadata               jsonb not null default '{}'::jsonb,
  owner_id               uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz
);
comment on table message_attachments is 'Attachments belonging to a message; deleted with the parent message.';

-- ============================================================================
-- OPPORTUNITY_EVENTS — append-only timeline / audit trail per opportunity.
-- Analogue of inquiry_activity, extended with actor tracking for AI agents.
-- ============================================================================
create table if not exists opportunity_events (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities (id) on delete cascade,
  event_type      opportunity_event_type not null,
  actor_type      actor_type not null default 'user',
  actor_id        uuid,                        -- user id or agent id; no FK (polymorphic)
  detail          text,
  metadata        jsonb not null default '{}'::jsonb, -- may carry ai confidence/model for agent events
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table opportunity_events is 'Append-only audit/timeline for an opportunity; actor_type supports users, agents, system.';

-- ============================================================================
-- OPPORTUNITY_NOTES — free-form notes attached to an opportunity.
-- ============================================================================
create table if not exists opportunity_notes (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities (id) on delete cascade,
  body            text not null,
  author_id       uuid references auth.users (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb, -- ai provenance for AI-drafted notes
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);
comment on table opportunity_notes is 'Admin/agent notes attached to an opportunity.';

-- ============================================================================
-- TASKS — follow-ups and to-dos, optionally linked to an opportunity, contact,
-- and/or company.
-- ============================================================================
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  opportunity_id     uuid references opportunities (id) on delete cascade,
  contact_id         uuid references contacts (id) on delete set null,
  company_id         uuid references companies (id) on delete set null,
  title              text not null,
  description        text,
  status             task_status not null default 'todo',
  priority           task_priority not null default 'medium',
  due_at             timestamptz,
  completed_at       timestamptz,
  assignee_id        uuid references auth.users (id) on delete set null,
  ai_model           text,
  ai_prompt_version  text,
  ai_confidence      numeric(5,4),
  ai_processed_at    timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  owner_id           uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);
comment on table tasks is 'Follow-ups / to-dos linked to opportunities, contacts, or companies.';

-- ============================================================================
-- UPDATED_AT TRIGGERS — one per table, reusing set_updated_at().
-- ============================================================================
drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists integration_accounts_set_updated_at on integration_accounts;
create trigger integration_accounts_set_updated_at before update on integration_accounts
  for each row execute function set_updated_at();

drop trigger if exists opportunities_set_updated_at on opportunities;
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

drop trigger if exists opportunity_contacts_set_updated_at on opportunity_contacts;
create trigger opportunity_contacts_set_updated_at before update on opportunity_contacts
  for each row execute function set_updated_at();

drop trigger if exists messages_set_updated_at on messages;
create trigger messages_set_updated_at before update on messages
  for each row execute function set_updated_at();

drop trigger if exists message_attachments_set_updated_at on message_attachments;
create trigger message_attachments_set_updated_at before update on message_attachments
  for each row execute function set_updated_at();

drop trigger if exists opportunity_events_set_updated_at on opportunity_events;
create trigger opportunity_events_set_updated_at before update on opportunity_events
  for each row execute function set_updated_at();

drop trigger if exists opportunity_notes_set_updated_at on opportunity_notes;
create trigger opportunity_notes_set_updated_at before update on opportunity_notes
  for each row execute function set_updated_at();

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ============================================================================
-- INDEXES & UNIQUE CONSTRAINTS
-- Unique constraints are expressed as (partial) unique indexes so they are
-- idempotent and can be conditional (e.g. only when an external id exists).
-- GIN indexes back full-text search (search_vector) and jsonb id matching.
-- ============================================================================

-- companies -----------------------------------------------------------------
create unique index if not exists companies_domain_uniq
  on companies (lower(domain)) where domain is not null;
create index if not exists companies_owner_id_idx     on companies (owner_id);
create index if not exists companies_name_idx         on companies (lower(name));
create index if not exists companies_created_at_idx   on companies (created_at desc);
create index if not exists companies_archived_at_idx  on companies (archived_at);
create index if not exists companies_external_ids_idx on companies using gin (external_ids);
create index if not exists companies_search_idx       on companies using gin (search_vector);

-- contacts ------------------------------------------------------------------
-- Same email may legitimately recur across owners; unique only within an owner.
create unique index if not exists contacts_owner_email_uniq
  on contacts (owner_id, lower(email)) where email is not null;
create index if not exists contacts_company_id_idx    on contacts (company_id);
create index if not exists contacts_owner_id_idx       on contacts (owner_id);
create index if not exists contacts_email_idx          on contacts (lower(email));
create index if not exists contacts_full_name_idx      on contacts (lower(full_name));
create index if not exists contacts_created_at_idx     on contacts (created_at desc);
create index if not exists contacts_external_ids_idx   on contacts using gin (external_ids);
create index if not exists contacts_search_idx         on contacts using gin (search_vector);

-- integration_accounts ------------------------------------------------------
create unique index if not exists integration_accounts_provider_external_uniq
  on integration_accounts (provider, external_account_id) where external_account_id is not null;
create unique index if not exists integration_accounts_owner_provider_email_uniq
  on integration_accounts (owner_id, provider, lower(email_address)) where email_address is not null;
create index if not exists integration_accounts_owner_id_idx  on integration_accounts (owner_id);
create index if not exists integration_accounts_provider_idx  on integration_accounts (provider);
create index if not exists integration_accounts_status_idx    on integration_accounts (status);

-- opportunities -------------------------------------------------------------
create unique index if not exists opportunities_source_external_uniq
  on opportunities (source, external_job_id) where external_job_id is not null;
create index if not exists opportunities_company_id_idx        on opportunities (company_id);
create index if not exists opportunities_primary_contact_idx   on opportunities (primary_contact_id);
create index if not exists opportunities_integration_acct_idx  on opportunities (integration_account_id);
create index if not exists opportunities_owner_id_idx          on opportunities (owner_id);
create index if not exists opportunities_stage_idx             on opportunities (stage);
create index if not exists opportunities_employment_type_idx   on opportunities (employment_type);
create index if not exists opportunities_location_type_idx     on opportunities (location_type);
create index if not exists opportunities_next_action_at_idx    on opportunities (next_action_at);
create index if not exists opportunities_created_at_idx        on opportunities (created_at desc);
create index if not exists opportunities_archived_at_idx       on opportunities (archived_at);
create index if not exists opportunities_external_ids_idx      on opportunities using gin (external_ids);
create index if not exists opportunities_search_idx            on opportunities using gin (search_vector);

-- opportunity_contacts ------------------------------------------------------
create unique index if not exists opportunity_contacts_pair_uniq
  on opportunity_contacts (opportunity_id, contact_id);
create index if not exists opportunity_contacts_contact_id_idx on opportunity_contacts (contact_id);

-- messages ------------------------------------------------------------------
-- Idempotent ingestion: a provider message id is unique within its account.
create unique index if not exists messages_account_external_uniq
  on messages (integration_account_id, external_message_id)
  where external_message_id is not null;
create index if not exists messages_opportunity_id_idx   on messages (opportunity_id);
create index if not exists messages_contact_id_idx        on messages (contact_id);
create index if not exists messages_company_id_idx        on messages (company_id);
create index if not exists messages_integration_acct_idx  on messages (integration_account_id);
create index if not exists messages_thread_id_idx         on messages (thread_id);
create index if not exists messages_source_idx            on messages (source);
create index if not exists messages_direction_idx         on messages (direction);
create index if not exists messages_received_at_idx       on messages (received_at desc);
create index if not exists messages_owner_id_idx          on messages (owner_id);
create index if not exists messages_search_idx            on messages using gin (search_vector);

-- message_attachments -------------------------------------------------------
create unique index if not exists message_attachments_msg_external_uniq
  on message_attachments (message_id, external_attachment_id)
  where external_attachment_id is not null;
create index if not exists message_attachments_message_id_idx on message_attachments (message_id);

-- opportunity_events --------------------------------------------------------
create index if not exists opportunity_events_opportunity_id_idx on opportunity_events (opportunity_id);
create index if not exists opportunity_events_type_idx           on opportunity_events (event_type);
create index if not exists opportunity_events_created_at_idx     on opportunity_events (created_at desc);

-- opportunity_notes ---------------------------------------------------------
create index if not exists opportunity_notes_opportunity_id_idx  on opportunity_notes (opportunity_id);
create index if not exists opportunity_notes_created_at_idx      on opportunity_notes (created_at desc);

-- tasks ---------------------------------------------------------------------
create index if not exists tasks_opportunity_id_idx  on tasks (opportunity_id);
create index if not exists tasks_contact_id_idx       on tasks (contact_id);
create index if not exists tasks_company_id_idx       on tasks (company_id);
create index if not exists tasks_assignee_id_idx      on tasks (assignee_id);
create index if not exists tasks_owner_id_idx         on tasks (owner_id);
create index if not exists tasks_status_idx           on tasks (status);
create index if not exists tasks_due_at_idx           on tasks (due_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Same posture as the inquiry tables: RLS on, anon key fully denied, and a
-- single policy granting any authenticated Supabase Auth session full access.
-- owner_id is in place so this can later be narrowed to per-user rules.
-- ============================================================================
alter table companies             enable row level security;
alter table contacts              enable row level security;
alter table integration_accounts  enable row level security;
alter table opportunities         enable row level security;
alter table opportunity_contacts  enable row level security;
alter table messages              enable row level security;
alter table message_attachments   enable row level security;
alter table opportunity_events    enable row level security;
alter table opportunity_notes     enable row level security;
alter table tasks                 enable row level security;

drop policy if exists "Authenticated admin full access" on companies;
create policy "Authenticated admin full access" on companies for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on contacts;
create policy "Authenticated admin full access" on contacts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on integration_accounts;
create policy "Authenticated admin full access" on integration_accounts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on opportunities;
create policy "Authenticated admin full access" on opportunities for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on opportunity_contacts;
create policy "Authenticated admin full access" on opportunity_contacts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on messages;
create policy "Authenticated admin full access" on messages for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on message_attachments;
create policy "Authenticated admin full access" on message_attachments for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on opportunity_events;
create policy "Authenticated admin full access" on opportunity_events for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on opportunity_notes;
create policy "Authenticated admin full access" on opportunity_notes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on tasks;
create policy "Authenticated admin full access" on tasks for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================================
-- End of Career CRM foundation migration.
-- ============================================================================
