-- ============================================================================
-- Phase 3 · M10 — Workflow Automation (P3-10)
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Introduces the rule engine's two tables.
-- Touches no existing object.
--
-- The rule DSL (trigger / conditions / actions) is declarative and NON-TURING:
-- no user-authored code, no nesting, no expressions. It is stored as jsonb and
-- validated in application code before persist (lib/automation/schema.ts), for
-- the same reason ai_approvals.status is a CHECK rather than an enum — the
-- vocabulary is still moving, and a CHECK change is not a migration.
--
-- `enabled` defaults to FALSE. A rule that ran the moment it was created would
-- make "write the rule, then read it back before arming it" impossible, and the
-- first thing an operator does with a new automation is check it looks right.
--
-- LOOP SAFETY is the reason automation_runs exists in this shape. An action can
-- re-fire its own trigger (a rule on task.status_changed that changes a task
-- status), so every evaluation — including the ones that matched nothing —
-- writes a row, and the engine counts recent rows per (rule, entity) before
-- executing. Runs are therefore both the audit trail and the governor; the
-- index below serves the governor, which is on the hot path.
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
-- automation_rules — trigger -> conditions -> actions, as data
-- ----------------------------------------------------------------------------
create table if not exists automation_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  description  text,

  -- Exactly one trigger: {type:'event', event:'...'} | {type:'schedule', schedule:'<cron>'}
  trigger      jsonb       not null,
  -- AND-array of field comparisons. `[]` means "always".
  conditions   jsonb       not null default '[]'::jsonb,
  -- Ordered, non-empty array of actions.
  actions      jsonb       not null,

  -- The kill switch. Off by default; ADR-009's rollback for this milestone is
  -- either this column or FEATURE_AUTOMATION.
  enabled      boolean     not null default false,

  -- Schedule bookkeeping: the last minute this rule was evaluated, so a cron
  -- rule fires once per matching minute even when the scan runs more often.
  last_scheduled_at timestamptz,

  metadata     jsonb       not null default '{}'::jsonb,
  owner_id     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);

comment on table automation_rules is
  'Declarative automation rules (Phase 3 · M10): trigger -> conditions -> actions, stored as data. Non-Turing DSL, validated in application code.';
comment on column automation_rules.enabled is
  'Kill switch. False by default so a new rule can be reviewed before it can act.';

drop trigger if exists automation_rules_set_updated_at on automation_rules;
create trigger automation_rules_set_updated_at before update on automation_rules
  for each row execute function set_updated_at();

-- The engine's dispatch query: enabled rules for an owner.
create index if not exists automation_rules_enabled_idx
  on automation_rules (enabled)
  where archived_at is null;

create index if not exists automation_rules_owner_idx
  on automation_rules (owner_id, created_at desc);

alter table automation_rules enable row level security;
drop policy if exists "Authenticated admin full access" on automation_rules;
create policy "Authenticated admin full access" on automation_rules for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- automation_runs — one row per evaluation, matched or not
-- ----------------------------------------------------------------------------
create table if not exists automation_runs (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid        not null references automation_rules (id) on delete cascade,

  trigger_type  text        not null,          -- 'event' | 'schedule'
  event_type    text,                          -- e.g. 'opportunity.stage_changed'
  entity_type   text,
  entity_id     uuid,

  -- 'skipped'    conditions did not match, or the loop guard refused
  -- 'running'    claimed, actions in flight. A row left here means the process
  --              died mid-execution: the actions may or may not have happened,
  --              so it is deliberately never reclaimed automatically.
  -- 'matched'    conditions matched and every action succeeded
  -- 'partial'    conditions matched, some action failed
  -- 'failed'     evaluation itself failed
  status        text        not null
                  check (status in ('skipped', 'running', 'matched', 'partial', 'failed')),
  reason        text,                          -- why it was skipped, in words
  -- [{ action, status, detail? }] — per-action outcome, for debugging a rule.
  action_results jsonb      not null default '[]'::jsonb,
  error         text,

  -- One run per (rule, triggering event). A redelivered job re-reads the
  -- existing row instead of executing its actions a second time.
  idempotency_key text,

  owner_id      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table automation_runs is
  'Automation evaluation log (Phase 3 · M10). Every evaluation writes a row, including non-matches: it is both the audit trail and the loop governor.';
comment on column automation_runs.idempotency_key is
  'Uniquely identifies (rule, triggering event). Uniquely indexed so a redelivered job cannot execute actions twice.';

drop trigger if exists automation_runs_set_updated_at on automation_runs;
create trigger automation_runs_set_updated_at before update on automation_runs
  for each row execute function set_updated_at();

-- Run history for one rule (the UI's detail view).
create index if not exists automation_runs_rule_idx
  on automation_runs (rule_id, created_at desc);

-- Global recent activity (the UI's overview).
create index if not exists automation_runs_created_idx
  on automation_runs (created_at desc);

-- THE LOOP GOVERNOR'S INDEX. Counting recent runs for one (rule, entity) pair
-- happens before every execution, so it must not scan history.
create index if not exists automation_runs_guard_idx
  on automation_runs (rule_id, entity_id, created_at desc);

create index if not exists automation_runs_owner_idx
  on automation_runs (owner_id, created_at desc);

-- Exactly-once execution per triggering event.
create unique index if not exists automation_runs_idempotency_uidx
  on automation_runs (idempotency_key)
  where idempotency_key is not null;

alter table automation_runs enable row level security;
drop policy if exists "Authenticated admin full access" on automation_runs;
create policy "Authenticated admin full access" on automation_runs for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
