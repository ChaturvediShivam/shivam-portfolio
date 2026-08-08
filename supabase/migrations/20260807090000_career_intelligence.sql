-- ============================================================================
-- Career Intelligence — Phase 1 foundation (extends the Career CRM)
-- ============================================================================
-- ADDITIVE ONLY. This migration does not drop, rename, or retype any existing
-- object. `opportunities`, `companies`, `contacts`, `opportunity_events`,
-- `opportunity_notes`, `messages`, `tasks` and every policy/trigger on them are
-- left exactly as they are.
--
-- The Career CRM foundation (20260726183601) already models applications
-- (`opportunities`), companies, recruiters (`contacts` + `opportunity_contacts`),
-- timeline/status history/activity (`opportunity_events`), notes
-- (`opportunity_notes`), interviews (`calendar_events`) and provider-agnostic
-- sourcing (`integration_provider` + `integration_accounts`). Those remain the
-- single source of truth — nothing here duplicates them.
--
-- This migration adds ONLY the capabilities that were genuinely absent:
--   * resume_versions        — versioned resume lineage (+ history)
--   * cover_letter_versions  — versioned cover letter lineage (+ history)
--   * documents              — opportunity/company/contact-scoped files
--                              (message_attachments is message-scoped only)
--   * tags + taggables       — cross-entity labelling
--   * inbox_items            — provider-agnostic ingestion staging layer
--   * ai_decisions           — append-only AI reasoning log
--   * opportunities: deadline_at, priority, resume_score, ats_score,
--                    offer_at, rejected_at, resume_version_id,
--                    cover_letter_version_id
--   * opportunity_stage  += draft, prepared, assessment, interview_round_1..3,
--                           final_interview, negotiation, accepted, ghosted
--   * integration_provider += naukri, monster, referral, extension,
--                             manual_import
--
-- ----------------------------------------------------------------------------
-- ARCHITECTURE REVIEW REMEDIATIONS
-- ----------------------------------------------------------------------------
-- The following change objects created by the ALREADY-APPLIED foundation
-- migration (20260726183601). They are expressed as ALTERs here rather than by
-- editing that file, because production has already run it — rewriting an
-- applied migration would make the recorded history a lie and would not
-- re-execute.
--
--   * opportunity_events — opportunity_id becomes NULLABLE and its FK becomes
--     ON DELETE SET NULL; gains company_id, contact_id, source,
--     external_event_id, subject_label. This converts a per-opportunity audit
--     log into the foundation for a Universal Career Timeline: events that
--     predate an opportunity (a recruiter email), outlive one (a deleted
--     pursuit), or belong to a company/contact instead now have a home.
--
--   * companies — domain uniqueness is rescoped from GLOBAL to per-owner,
--     matching contacts_owner_email_uniq. A global unique domain makes
--     multi-tenancy impossible (two owners can never both track acme.com).
--
--   * opportunities.salary_currency — gains ISO-4217 validation. NOTE: this is
--     the ONLY statement in this migration that mutates existing data; see the
--     block itself for exactly what it rewrites and why.
-- ============================================================================
--
-- Conventions mirrored from 20260726183601_career_crm_foundation.sql:
--   * lowercase SQL, uuid pks via gen_random_uuid()
--   * timestamptz not null default now() for created_at / updated_at
--   * the shared set_updated_at() trigger keeps updated_at current
--   * external_ids jsonb + metadata jsonb on every ingestable row, so new
--     providers need no DDL
--   * ai_model / ai_prompt_version / ai_confidence / ai_processed_at wherever
--     AI may write, so AI output is recordable without a future migration
--   * RLS on, single "Authenticated admin full access" policy
--   * fully idempotent — safe to re-run
-- ============================================================================

-- ============================================================================
-- ENUM EXTENSIONS
-- ----------------------------------------------------------------------------
-- `add value if not exists` is idempotent. BEFORE/AFTER placement matters:
-- enum sort order is declaration order, and `opportunity_stage` is documented as
-- "ordered lead -> outcome", so new stages are spliced into their pipeline
-- position rather than appended. Existing rows are untouched (no value is
-- renamed or removed) and every existing stage keeps its meaning.
--
-- NOTE: `alter type ... add value` may not be *used* in the same transaction
-- that adds it (PG 12+). Nothing below references these new values, so this
-- migration is safe to run as a single transaction.
-- ============================================================================

-- opportunity_stage: pre-application -----------------------------------------
alter type opportunity_stage add value if not exists 'draft'    before 'lead';
alter type opportunity_stage add value if not exists 'prepared' before 'lead';

-- opportunity_stage: post-application ----------------------------------------
alter type opportunity_stage add value if not exists 'assessment' after 'applied';

-- opportunity_stage: interview rounds ----------------------------------------
alter type opportunity_stage add value if not exists 'interview_round_1' after 'interview';
alter type opportunity_stage add value if not exists 'interview_round_2' after 'interview_round_1';
alter type opportunity_stage add value if not exists 'interview_round_3' after 'interview_round_2';
alter type opportunity_stage add value if not exists 'final_interview'   after 'interview_round_3';

-- opportunity_stage: outcome -------------------------------------------------
-- 'accepted' is the candidate accepting the offer; the pre-existing 'hired'
-- remains the terminal "started the role" state. Both are kept so no existing
-- row changes meaning.
alter type opportunity_stage add value if not exists 'negotiation' after 'offer';
alter type opportunity_stage add value if not exists 'accepted'    after 'negotiation';
alter type opportunity_stage add value if not exists 'ghosted'     after 'rejected';

-- integration_provider -------------------------------------------------------
-- 'linkedin' and 'indeed' already exist (see 20260726183601) and are not
-- re-added. 'manual' (typed in by hand) is distinct from 'manual_import'
-- (bulk/file import performed by a human rather than a live provider).
alter type integration_provider add value if not exists 'naukri';
alter type integration_provider add value if not exists 'monster';
alter type integration_provider add value if not exists 'referral';
alter type integration_provider add value if not exists 'extension';
alter type integration_provider add value if not exists 'manual_import';

-- Kind of a stored document. Open enough to cover portal exports and offer
-- packets; resumes and cover letters have dedicated versioned tables and are
-- included here only for files uploaded outside those flows.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type document_kind as enum (
      'resume', 'cover_letter', 'job_description', 'offer_letter',
      'assessment', 'portfolio', 'certificate', 'correspondence', 'other'
    );
  end if;
end $$;

-- ============================================================================
-- RESUME_VERSIONS — an immutable-ish lineage of resume revisions.
-- ----------------------------------------------------------------------------
-- Version history is the table itself: every revision is a row sharing a
-- `lineage_id` with its ancestors, numbered by `version`. Exactly one row per
-- lineage may be `is_current` (enforced by a partial unique index), so "the
-- current resume" is a query, not a mutable column someone can desync.
-- ============================================================================
create table if not exists resume_versions (
  id                 uuid primary key default gen_random_uuid(),
  lineage_id         uuid not null default gen_random_uuid(),
  version            integer not null default 1,
  is_current         boolean not null default true,
  label              text not null,           -- e.g. 'Backend-focused'
  summary            text,                    -- short human note on what changed
  content_text       text,                    -- extracted/authored plain text
  file_url           text,
  file_name          text,
  mime_type          text,
  file_size_bytes    bigint,
  source             integration_provider,    -- where this revision came from
  external_ids       jsonb not null default '{}'::jsonb,
  -- AI provenance (set when a revision is AI-generated or AI-enriched)
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
      coalesce(label, '') || ' ' || coalesce(summary, '') || ' ' ||
      coalesce(content_text, ''))
  ) stored,
  constraint resume_versions_version_positive check (version >= 1)
);
comment on table resume_versions is
  'Versioned resume revisions. Rows sharing lineage_id form one resume''s history.';

-- ============================================================================
-- COVER_LETTER_VERSIONS — same lineage model as resume_versions.
-- ----------------------------------------------------------------------------
-- `opportunity_id` is nullable: a cover letter may be a reusable template
-- (null) or written for one specific application (set).
-- ============================================================================
create table if not exists cover_letter_versions (
  id                 uuid primary key default gen_random_uuid(),
  lineage_id         uuid not null default gen_random_uuid(),
  version            integer not null default 1,
  is_current         boolean not null default true,
  opportunity_id     uuid references opportunities (id) on delete set null,
  label              text not null,
  summary            text,
  content_text       text,
  file_url           text,
  file_name          text,
  mime_type          text,
  file_size_bytes    bigint,
  source             integration_provider,
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
      coalesce(label, '') || ' ' || coalesce(summary, '') || ' ' ||
      coalesce(content_text, ''))
  ) stored,
  constraint cover_letter_versions_version_positive check (version >= 1)
);
comment on table cover_letter_versions is
  'Versioned cover letter revisions; optionally bound to one opportunity.';

-- ============================================================================
-- DOCUMENTS — files attached to a CRM entity.
-- ----------------------------------------------------------------------------
-- Distinct from message_attachments, which is scoped to a message and cascades
-- with it. A document is scoped to an opportunity, company or contact and
-- survives independently. All three parents are nullable so a document can be
-- filed against any combination (or none, while being triaged).
--
-- Every parent is ON DELETE SET NULL, never CASCADE: deleting a pursuit must
-- not destroy its offer letter, signed contract, or assessment. An orphaned
-- document is a filing problem; a deleted one is unrecoverable.
-- ============================================================================
create table if not exists documents (
  id                 uuid primary key default gen_random_uuid(),
  opportunity_id     uuid references opportunities (id) on delete set null,
  company_id         uuid references companies (id) on delete set null,
  contact_id         uuid references contacts (id) on delete set null,
  kind               document_kind not null default 'other',
  title              text not null,
  description        text,
  file_url           text,
  file_name          text,
  mime_type          text,
  file_size_bytes    bigint,
  content_text       text,                    -- extracted text, for search/AI
  source             integration_provider,
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
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(content_text, ''))
  ) stored
);
comment on table documents is
  'Files filed against an opportunity/company/contact; independent of messages.';

-- ============================================================================
-- TAGS — a controlled vocabulary of labels.
-- ============================================================================
create table if not exists tags (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null,                 -- normalized form, unique per owner
  color        text,                           -- design-token name or hex
  description  text,
  metadata     jsonb not null default '{}'::jsonb,
  owner_id     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);
comment on table tags is 'Reusable labels applied to CRM entities via taggables.';

-- ============================================================================
-- TAGGABLES — polymorphic join between a tag and any CRM entity.
-- ----------------------------------------------------------------------------
-- ponytail: polymorphic parent (entity_type + entity_id) has no FK, so a
-- deleted entity leaves an orphan row. Chosen over five typed join tables
-- because tag targets will keep growing; the CHECK constraint bounds the type
-- set, and reads always join through it. Upgrade path if orphans ever matter:
-- typed join tables per entity, or a periodic sweep keyed on entity_type.
-- ============================================================================
create table if not exists taggables (
  id           uuid primary key default gen_random_uuid(),
  tag_id       uuid not null references tags (id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  metadata     jsonb not null default '{}'::jsonb,
  owner_id     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint taggables_entity_type_check check (
    entity_type in ('opportunity', 'company', 'contact', 'document',
                    'resume_version', 'cover_letter_version', 'message')
  )
);
comment on table taggables is
  'Polymorphic tag assignment. entity_type is bounded by CHECK; see table comment in migration.';

-- ============================================================================
-- INBOX_ITEMS — the permanent, provider-agnostic ingestion layer.
-- ----------------------------------------------------------------------------
-- Every inbound record from every source lands here FIRST and becomes an
-- opportunity only on promotion. Deliberately named `inbox_items`, not
-- `browser_inbox_items`: the Chrome extension is one producer among many
-- (Gmail, LinkedIn, Naukri, Indeed, Wellfound, Greenhouse, Lever, Ashby,
-- Workday, manual import). "Browser Inbox" is a filtered view of this table,
-- not a table of its own.
--
-- Why a staging layer rather than writing opportunities directly:
--   * `raw_payload` is kept verbatim, so a mapping bug can be replayed without
--     re-fetching from a provider that may no longer have the record.
--   * `unique (provider, external_id)` makes re-delivery idempotent at the
--     database level rather than in each provider's code.
--   * promotion is a human or rule decision, so ingestion can never silently
--     create a duplicate pursuit.
--
-- `external_id` is nullable (a manual import has no provider-side id). Postgres
-- treats NULLs as distinct in a unique index, so unlimited manual rows coexist
-- while provider records stay deduplicated — which is the behaviour we want.
--
-- `dedup_key` is a content fingerprint (e.g. company domain + normalized title)
-- and is deliberately NOT unique: the same role legitimately appears on two
-- boards, and that is a duplicate to *surface*, not to reject.
-- ============================================================================
create table if not exists inbox_items (
  id                     uuid primary key default gen_random_uuid(),
  provider               integration_provider not null,
  external_id            text,
  -- pending   — awaiting review
  -- promoted  — became `opportunity_id`
  -- duplicate — matched an existing pursuit; kept for provenance
  -- rejected  — dismissed by an operator
  -- failed    — normalization failed; raw_payload retained for replay
  status                 text not null default 'pending'
                           constraint inbox_items_status_check
                           check (status in ('pending', 'promoted', 'duplicate', 'rejected', 'failed')),
  raw_payload            jsonb not null default '{}'::jsonb,
  normalized_payload     jsonb not null default '{}'::jsonb,
  dedup_key              text,
  -- Which connected account delivered this. Not in the requested column list,
  -- but every other ingestable table carries it and multi-inbox support is
  -- impossible to retrofit without it.
  integration_account_id uuid references integration_accounts (id) on delete set null,
  opportunity_id         uuid references opportunities (id) on delete set null,
  company_id             uuid references companies (id) on delete set null,
  contact_id             uuid references contacts (id) on delete set null,
  error                  text,
  promoted_at            timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  owner_id               uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz
);
comment on table inbox_items is
  'Provider-agnostic ingestion staging. Every inbound record lands here before becoming an opportunity.';

-- ============================================================================
-- AI_DECISIONS — append-only reasoning log.
-- ----------------------------------------------------------------------------
-- Distinct from ai_audit_log, which is a COST ledger (tokens, latency, spend)
-- and stays mutable. This table answers a different question: "why did the
-- system do that?", and its value depends entirely on being untamperable.
--
-- Immutability is enforced twice, because each layer alone has a hole:
--   * RLS grants INSERT and SELECT only. With no UPDATE or DELETE policy, RLS
--     denies both by default — but RLS is bypassed by the table owner and by
--     the service_role key, which server code uses.
--   * A BEFORE UPDATE OR DELETE trigger raises unconditionally. Triggers are
--     NOT bypassed by service_role, so this is the layer that actually holds.
--
-- There is deliberately no `updated_at` column and no set_updated_at trigger:
-- a row that can never be updated has nothing to timestamp.
--
-- `input_hash` / `output_hash` store digests rather than raw payloads so the
-- log is verifiable without becoming an uncontrolled copy of every prompt and
-- every piece of personal data the model ever saw.
-- ============================================================================
create table if not exists ai_decisions (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,
  entity_id       uuid,
  prompt_version  text,
  model           text not null,
  confidence      numeric(5,4),
  decision        text not null,
  reasoning       text,
  evidence        jsonb not null default '[]'::jsonb,
  input_hash      text,
  output_hash     text,
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table ai_decisions is
  'Append-only AI reasoning log. UPDATE and DELETE are rejected by trigger; ai_audit_log remains the mutable cost ledger.';

create or replace function reject_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists ai_decisions_no_update on ai_decisions;
create trigger ai_decisions_no_update before update on ai_decisions
  for each statement execute function reject_append_only_mutation();

drop trigger if exists ai_decisions_no_delete on ai_decisions;
create trigger ai_decisions_no_delete before delete on ai_decisions
  for each statement execute function reject_append_only_mutation();

-- ============================================================================
-- OPPORTUNITY_EVENTS — Universal Career Timeline foundation.
-- ----------------------------------------------------------------------------
-- Created by the applied foundation migration as a per-opportunity audit log:
-- `opportunity_id` was NOT NULL with ON DELETE CASCADE. Both properties block
-- a unified timeline and are corrected here.
--
--   * NOT NULL dropped — an event may precede any opportunity (a recruiter
--     email before you have applied) or belong to a company/contact instead.
--   * CASCADE -> SET NULL — an audit trail that is destroyed by deleting its
--     subject is not an audit trail. `subject_label` denormalizes the title at
--     write time so a detached event still reads meaningfully.
--   * source + external_event_id — the same idempotent-ingest pattern used by
--     messages, so a redelivered provider event does not double-post.
-- ============================================================================
alter table opportunity_events
  alter column opportunity_id drop not null;

-- Replace the inherited CASCADE foreign key. The constraint is looked up rather
-- than assumed by name, so this works regardless of what Postgres auto-named it.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'opportunity_events'
      and con.contype = 'f'
      and con.confrelid = 'opportunities'::regclass
  loop
    execute format('alter table opportunity_events drop constraint %I', fk.conname);
  end loop;
end $$;

alter table opportunity_events
  add constraint opportunity_events_opportunity_id_fkey
  foreign key (opportunity_id) references opportunities (id) on delete set null;

alter table opportunity_events
  add column if not exists company_id        uuid references companies (id) on delete set null,
  add column if not exists contact_id        uuid references contacts (id) on delete set null,
  add column if not exists source            integration_provider,
  add column if not exists external_event_id text,
  add column if not exists subject_label     text;

comment on column opportunity_events.opportunity_id is
  'Nullable: an event may precede, outlive, or exist independently of any opportunity.';
comment on column opportunity_events.subject_label is
  'Denormalized subject title, captured at write time so a detached event stays readable.';

-- ============================================================================
-- OPPORTUNITIES — new columns.
-- ----------------------------------------------------------------------------
-- `priority` reuses the existing `task_priority` enum rather than declaring an
-- identical `opportunity_priority`: the domain (low/medium/high/urgent) is the
-- same, and one enum means one place to add a level later.
--
-- Scores are 0-100 with two decimals and are CHECK-bounded. They live on the
-- opportunity rather than on resume_versions because both scores are computed
-- for a (resume, job description) pair — they describe the fit of a resume to
-- *this* role, not the resume in isolation.
-- ============================================================================
alter table opportunities
  add column if not exists deadline_at              timestamptz,
  add column if not exists priority                 task_priority,
  add column if not exists resume_score             numeric(5,2),
  add column if not exists ats_score                numeric(5,2),
  add column if not exists offer_at                 timestamptz,
  add column if not exists rejected_at              timestamptz,
  add column if not exists resume_version_id        uuid references resume_versions (id) on delete restrict,
  add column if not exists cover_letter_version_id  uuid references cover_letter_versions (id) on delete restrict;

comment on column opportunities.deadline_at is 'Application deadline for this posting.';
comment on column opportunities.priority is 'Pursuit priority; reuses the task_priority enum.';
comment on column opportunities.resume_score is 'Resume-to-role fit score, 0-100.';
comment on column opportunities.ats_score is 'ATS-parseability score for the submitted resume, 0-100.';
comment on column opportunities.offer_at is 'When an offer was received.';
comment on column opportunities.rejected_at is 'When a rejection was received.';
comment on column opportunities.resume_version_id is
  'Resume revision submitted for this role. ON DELETE RESTRICT: the record of what you actually sent must not be erasable by tidying up resume versions.';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_resume_score_range'
  ) then
    alter table opportunities add constraint opportunities_resume_score_range
      check (resume_score is null or (resume_score >= 0 and resume_score <= 100));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_ats_score_range'
  ) then
    alter table opportunities add constraint opportunities_ats_score_range
      check (ats_score is null or (ats_score >= 0 and ats_score <= 100));
  end if;
end $$;

-- ============================================================================
-- COMPANIES — rescope domain uniqueness from global to per-owner.
-- ----------------------------------------------------------------------------
-- The foundation migration made `lower(domain)` unique across the whole table.
-- That silently forbids two owners from ever tracking the same employer, which
-- makes multi-tenancy impossible. Rescoped to (owner_id, lower(domain)) to
-- match the existing contacts_owner_email_uniq.
--
-- Caveat, unchanged from contacts: owner_id is still nullable, and Postgres
-- treats NULLs as distinct, so rows with a NULL owner are not deduplicated by
-- this index. That is the pre-existing single-admin posture; it resolves when
-- owner_id becomes NOT NULL as part of the multi-user work.
-- ============================================================================
drop index if exists companies_domain_uniq;
create unique index if not exists companies_owner_domain_uniq
  on companies (owner_id, lower(domain)) where domain is not null;

-- ============================================================================
-- OPPORTUNITIES.SALARY_CURRENCY — ISO-4217 validation.
-- ----------------------------------------------------------------------------
-- *** THIS IS THE ONLY STATEMENT IN THIS MIGRATION THAT MUTATES EXISTING DATA. ***
--
-- The column was unconstrained text defaulting to 'USD', so 'usd', ' USD ' and
-- '$' are all currently storable. A CHECK constraint validates existing rows on
-- creation and would abort the migration if any row failed, so the data is
-- normalized first:
--
--   1. trim + uppercase       — 'usd' and ' USD ' become 'USD' (lossless)
--   2. non-conforming -> NULL — anything still not a valid ISO-4217 alphabetic
--                              code becomes NULL rather than being guessed at.
--                              NULL means "unknown currency", which is honest;
--                              coercing '$' to 'USD' would be an assumption.
--
-- Step 2 is destructive in the sense that the original string is not recoverable
-- from this table. Inspect before applying:
--   select id, salary_currency from opportunities
--   where salary_currency is not null
--     and upper(trim(salary_currency)) not in ( ...list below... );
-- ============================================================================
update opportunities
   set salary_currency = upper(trim(salary_currency))
 where salary_currency is not null
   and salary_currency <> upper(trim(salary_currency));

update opportunities
   set salary_currency = null
 where salary_currency is not null
   and salary_currency not in (
     'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD',
     'BDT','BGN','BHD','BIF','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP',
     'BYN','BZD','CAD','CDF','CHE','CHF','CHW','CLF','CLP','CNY','COP','COU',
     'CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR',
     'FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL',
     'HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES',
     'KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD',
     'LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR',
     'MWK','MXN','MXV','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR',
     'PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF',
     'SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN',
     'SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS',
     'UAH','UGX','USD','USN','UYI','UYU','UYW','UZS','VED','VES','VND','VUV',
     'WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','XUA','YER','ZAR','ZMW','ZWG'
   );

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_salary_currency_iso4217'
  ) then
    alter table opportunities add constraint opportunities_salary_currency_iso4217
      check (salary_currency is null or salary_currency in (
        'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD',
        'BDT','BGN','BHD','BIF','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP',
        'BYN','BZD','CAD','CDF','CHE','CHF','CHW','CLF','CLP','CNY','COP','COU',
        'CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR',
        'FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL',
        'HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES',
        'KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD',
        'LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR',
        'MWK','MXN','MXV','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR',
        'PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF',
        'SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN',
        'SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS',
        'UAH','UGX','USD','USN','UYI','UYU','UYW','UZS','VED','VES','VND','VUV',
        'WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','XUA','YER','ZAR','ZMW','ZWG'
      ));
  end if;
end $$;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
drop trigger if exists resume_versions_set_updated_at on resume_versions;
create trigger resume_versions_set_updated_at before update on resume_versions
  for each row execute function set_updated_at();

drop trigger if exists cover_letter_versions_set_updated_at on cover_letter_versions;
create trigger cover_letter_versions_set_updated_at before update on cover_letter_versions
  for each row execute function set_updated_at();

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at before update on documents
  for each row execute function set_updated_at();

drop trigger if exists tags_set_updated_at on tags;
create trigger tags_set_updated_at before update on tags
  for each row execute function set_updated_at();

drop trigger if exists taggables_set_updated_at on taggables;
create trigger taggables_set_updated_at before update on taggables
  for each row execute function set_updated_at();

drop trigger if exists inbox_items_set_updated_at on inbox_items;
create trigger inbox_items_set_updated_at before update on inbox_items
  for each row execute function set_updated_at();

-- ai_decisions intentionally has no updated_at trigger: the table rejects
-- UPDATE outright, so there is nothing to keep current.

-- ============================================================================
-- INDEXES & UNIQUE CONSTRAINTS
-- ============================================================================

-- resume_versions ------------------------------------------------------------
create unique index if not exists resume_versions_lineage_version_uniq
  on resume_versions (lineage_id, version);
-- At most one current revision per lineage.
create unique index if not exists resume_versions_lineage_current_uniq
  on resume_versions (lineage_id) where is_current;
create index if not exists resume_versions_owner_id_idx     on resume_versions (owner_id);
create index if not exists resume_versions_lineage_idx      on resume_versions (lineage_id);
create index if not exists resume_versions_created_at_idx   on resume_versions (created_at desc);
create index if not exists resume_versions_archived_at_idx  on resume_versions (archived_at);
create index if not exists resume_versions_external_ids_idx on resume_versions using gin (external_ids);
create index if not exists resume_versions_search_idx       on resume_versions using gin (search_vector);

-- cover_letter_versions ------------------------------------------------------
create unique index if not exists cover_letter_versions_lineage_version_uniq
  on cover_letter_versions (lineage_id, version);
create unique index if not exists cover_letter_versions_lineage_current_uniq
  on cover_letter_versions (lineage_id) where is_current;
create index if not exists cover_letter_versions_owner_id_idx      on cover_letter_versions (owner_id);
create index if not exists cover_letter_versions_lineage_idx       on cover_letter_versions (lineage_id);
create index if not exists cover_letter_versions_opportunity_idx   on cover_letter_versions (opportunity_id);
create index if not exists cover_letter_versions_created_at_idx    on cover_letter_versions (created_at desc);
create index if not exists cover_letter_versions_archived_at_idx   on cover_letter_versions (archived_at);
create index if not exists cover_letter_versions_external_ids_idx  on cover_letter_versions using gin (external_ids);
create index if not exists cover_letter_versions_search_idx        on cover_letter_versions using gin (search_vector);

-- documents ------------------------------------------------------------------
create index if not exists documents_opportunity_id_idx  on documents (opportunity_id);
create index if not exists documents_company_id_idx      on documents (company_id);
create index if not exists documents_contact_id_idx      on documents (contact_id);
create index if not exists documents_owner_id_idx        on documents (owner_id);
create index if not exists documents_kind_idx            on documents (kind);
create index if not exists documents_created_at_idx      on documents (created_at desc);
create index if not exists documents_archived_at_idx     on documents (archived_at);
create index if not exists documents_external_ids_idx    on documents using gin (external_ids);
create index if not exists documents_search_idx          on documents using gin (search_vector);

-- tags -----------------------------------------------------------------------
-- Same label may recur across owners; unique only within an owner.
create unique index if not exists tags_owner_slug_uniq on tags (owner_id, slug);
create index if not exists tags_owner_id_idx    on tags (owner_id);
create index if not exists tags_archived_at_idx on tags (archived_at);

-- taggables ------------------------------------------------------------------
create unique index if not exists taggables_tag_entity_uniq
  on taggables (tag_id, entity_type, entity_id);
create index if not exists taggables_entity_idx   on taggables (entity_type, entity_id);
create index if not exists taggables_tag_id_idx   on taggables (tag_id);
create index if not exists taggables_owner_id_idx on taggables (owner_id);

-- inbox_items ----------------------------------------------------------------
-- Idempotent ingest across every provider. NULL external_id (manual import)
-- stays exempt because Postgres treats NULLs as distinct in a unique index.
create unique index if not exists inbox_items_provider_external_uniq
  on inbox_items (provider, external_id);
create index if not exists inbox_items_status_idx        on inbox_items (status);
create index if not exists inbox_items_provider_idx      on inbox_items (provider);
create index if not exists inbox_items_dedup_key_idx     on inbox_items (dedup_key);
create index if not exists inbox_items_opportunity_idx   on inbox_items (opportunity_id);
create index if not exists inbox_items_company_id_idx    on inbox_items (company_id);
create index if not exists inbox_items_contact_id_idx    on inbox_items (contact_id);
create index if not exists inbox_items_account_idx       on inbox_items (integration_account_id);
create index if not exists inbox_items_owner_id_idx      on inbox_items (owner_id);
create index if not exists inbox_items_created_at_idx    on inbox_items (created_at desc);
-- The review queue is the hot read: pending items, newest first.
create index if not exists inbox_items_pending_idx
  on inbox_items (created_at desc) where status = 'pending';

-- ai_decisions ---------------------------------------------------------------
create index if not exists ai_decisions_entity_idx     on ai_decisions (entity_type, entity_id);
create index if not exists ai_decisions_created_at_idx on ai_decisions (created_at desc);
create index if not exists ai_decisions_owner_id_idx   on ai_decisions (owner_id);
create index if not exists ai_decisions_model_idx      on ai_decisions (model);

-- opportunity_events (Universal Timeline columns) ----------------------------
create unique index if not exists opportunity_events_source_external_uniq
  on opportunity_events (source, external_event_id) where external_event_id is not null;
create index if not exists opportunity_events_company_id_idx on opportunity_events (company_id);
create index if not exists opportunity_events_contact_id_idx on opportunity_events (contact_id);
create index if not exists opportunity_events_source_idx     on opportunity_events (source);
-- Backs the unified timeline read: everything for one owner, newest first.
create index if not exists opportunity_events_owner_created_idx
  on opportunity_events (owner_id, created_at desc);

-- opportunities (new columns) ------------------------------------------------
create index if not exists opportunities_deadline_at_idx  on opportunities (deadline_at);
create index if not exists opportunities_priority_idx     on opportunities (priority);
create index if not exists opportunities_resume_version_idx
  on opportunities (resume_version_id);
create index if not exists opportunities_cover_letter_version_idx
  on opportunities (cover_letter_version_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Identical posture to every other Career CRM table: RLS on, anon key denied,
-- one policy granting any authenticated Supabase Auth session full access.
-- owner_id is present so this can be narrowed per-user without a schema change.
-- ============================================================================
alter table resume_versions        enable row level security;
alter table cover_letter_versions  enable row level security;
alter table documents              enable row level security;
alter table tags                   enable row level security;
alter table taggables              enable row level security;
alter table inbox_items            enable row level security;
alter table ai_decisions           enable row level security;

drop policy if exists "Authenticated admin full access" on resume_versions;
create policy "Authenticated admin full access" on resume_versions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on cover_letter_versions;
create policy "Authenticated admin full access" on cover_letter_versions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on documents;
create policy "Authenticated admin full access" on documents for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on tags;
create policy "Authenticated admin full access" on tags for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on taggables;
create policy "Authenticated admin full access" on taggables for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin full access" on inbox_items;
create policy "Authenticated admin full access" on inbox_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ai_decisions is append-only, so it gets INSERT and SELECT policies and
-- deliberately NO update/delete policy — RLS denies what it has no policy for.
-- The triggers above are what stops service_role, which bypasses RLS entirely.
drop policy if exists "Authenticated admin full access" on ai_decisions;
drop policy if exists "Authenticated admin insert" on ai_decisions;
create policy "Authenticated admin insert" on ai_decisions for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admin read" on ai_decisions;
create policy "Authenticated admin read" on ai_decisions for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- End of Career Intelligence Phase 1 migration.
-- ============================================================================
