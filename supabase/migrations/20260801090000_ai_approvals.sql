-- ============================================================================
-- Phase 3 · M9 — AI Approvals (P3-09)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Introduces the human-in-the-loop approval queue
-- that ADR-006 requires before any external AI action executes.
-- Touches no existing object.
--
-- Deferred from M6 to M9 by decision D4: M6 registers no write/external tools,
-- so the queue would have had no producers. The policy that refuses unapproved
-- execution shipped in M6 (lib/ai/tools/registry.ts); this is the queue that
-- finally satisfies it.
--
-- The status column is `text` with a CHECK rather than a native enum, matching
-- the ai_* family (ai_conversations.status, ai_audit_log.outcome). Phase 1 used
-- native enums for CRM domains; the AI tables deliberately did not, because
-- their vocabularies still move between milestones and an enum change is a
-- migration while a CHECK change is not.
--
-- IDEMPOTENT SEND is the point of this table, not a feature of it. An email is
-- irreversible, so two DIFFERENT guarantees are layered — they are often
-- conflated, and conflating them here would break one of them:
--
--   1. One send per approval. The executor claims work with a conditional
--      status transition (approved -> sending), so only one caller can ever
--      proceed. This is ADR-006's "keyed on approval_id", and it is the same
--      claim pattern M7 uses in summarizeMessage and M1 uses in claim_jobs.
--
--   2. One OPEN proposal per logical action. `idempotency_key` is uniquely
--      indexed, but only across states that can still produce a send. Two open
--      proposals to reply to the same email would be two approvable rows racing
--      to send two replies.
--
-- The partial predicate is what keeps (2) from becoming a permanent ban: once a
-- proposal is rejected or sent it stops blocking, so the operator can draft a
-- follow-up, or a fresh reply after rejecting a bad one. `failed` deliberately
-- still blocks — that row is re-approvable, so allowing a second alongside it
-- would reintroduce exactly the race (2) exists to prevent.
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
-- ai_approvals — proposed external actions awaiting a human decision
-- ----------------------------------------------------------------------------
create table if not exists ai_approvals (
  id                  uuid primary key default gen_random_uuid(),

  -- Who proposed it and what they want to do.
  agent               text        not null,              -- e.g. 'email_drafter'
  action_type         text        not null,              -- e.g. 'email_reply'
  entity_type         text,                              -- polymorphic linkage
  entity_id           uuid,

  -- The action itself, plus the model's justification for it. `proposed_payload`
  -- is the complete instruction set for the executor: nothing about what gets
  -- sent may be recomputed at send time, or approving would not mean approving
  -- what the operator actually read.
  proposed_payload    jsonb       not null default '{}'::jsonb,
  rationale           text,

  -- Provenance, consistent with every other AI-written row in the schema.
  ai_provider         text,
  ai_model            text,
  ai_prompt_version   text,
  ai_confidence       numeric(5,4),
  conversation_id     uuid references ai_conversations (id) on delete set null,

  -- Lifecycle. pending -> approved -> sending -> sent
  --            pending -> rejected
  --            sending -> failed (operator may approve again to retry)
  status              text        not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'sending', 'sent', 'failed')),
  decided_by          uuid references auth.users (id) on delete set null,
  decided_at          timestamptz,
  executed_at         timestamptz,

  -- Result of execution. The message row this produced, for the audit trail.
  result_message_id   uuid references messages (id) on delete set null,
  last_error          text,

  -- Uniquely identifies the external effect. See the header note.
  idempotency_key     text,

  metadata            jsonb       not null default '{}'::jsonb,
  owner_id            uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz
);

comment on table ai_approvals is
  'Human-in-the-loop gate for external AI actions (Phase 3 · M9, ADR-006). Nothing outbound executes without an explicit approval row in status=approved.';
comment on column ai_approvals.proposed_payload is
  'The complete, frozen instruction set for the executor. Approving means approving exactly this.';
comment on column ai_approvals.idempotency_key is
  'Uniquely identifies the external effect. Uniquely indexed so one proposal can never send twice.';

drop trigger if exists ai_approvals_set_updated_at on ai_approvals;
create trigger ai_approvals_set_updated_at before update on ai_approvals
  for each row execute function set_updated_at();

-- Queue view: the operator's pending list, newest first.
create index if not exists ai_approvals_status_idx
  on ai_approvals (status, created_at desc);

-- "What has been proposed about this record?" — the spec's second index.
create index if not exists ai_approvals_entity_idx
  on ai_approvals (entity_type, entity_id);

create index if not exists ai_approvals_owner_idx
  on ai_approvals (owner_id, created_at desc);

-- One open proposal per logical action. Scoped to the states that can still
-- produce a send, so a rejected or already-sent proposal stops blocking and the
-- operator can draft again. See the header note on why `failed` still blocks.
create unique index if not exists ai_approvals_open_idempotency_uidx
  on ai_approvals (idempotency_key)
  where idempotency_key is not null
    and status in ('pending', 'approved', 'sending', 'failed');

alter table ai_approvals enable row level security;
drop policy if exists "Authenticated admin full access" on ai_approvals;
create policy "Authenticated admin full access" on ai_approvals for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
