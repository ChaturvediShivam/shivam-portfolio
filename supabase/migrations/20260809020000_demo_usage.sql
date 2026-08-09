-- ============================================================================
-- Public demo · T4 — per-visitor throttle store
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. Touches no existing object.
--
-- The demo has no session, so the existing throttles cannot key it: lib/rateLimit
-- keys on an email the visitor never gives, and lib/ai/rateLimit keys on an
-- owner_id that is a foreign key into auth.users. The demo's owner_id is a
-- single dedicated user shared by every visitor, which makes that limiter a
-- GLOBAL ceiling — correct as a cost backstop, useless for isolating one abuser
-- from everyone else. This table is the per-visitor tier underneath it.
--
-- WHY THIS TABLE STORES NO IP ADDRESS
--
-- The limiter needs to answer "have I seen this visitor recently", which is an
-- equality test, not a lookup. A salted hash answers it exactly as well as the
-- address does, and the column is typed and named so that storing a raw address
-- would be a visible mistake rather than an easy default. The salt lives in
-- DEMO_IP_SALT and never enters the database, so a copy of this table is not a
-- list of who visited.
--
-- RETENTION
--
-- Rows are only interesting inside the throttle window. Cleanup is opportunistic
-- in the limiter (T5) rather than a scheduled job: this is one small table, and
-- a cron for it would be a moving part that has to be monitored, deployed and
-- reasoned about in exchange for deleting a few hundred rows a day.
-- ============================================================================

create table if not exists demo_usage (
  id            uuid primary key default gen_random_uuid(),
  -- Salted SHA-256 of the visitor's address. Never the address itself.
  visitor_hash  text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table demo_usage is
  'Per-visitor throttle ledger for the public /demo route. One row per analysis.';
comment on column demo_usage.visitor_hash is
  'Salted SHA-256 of the visitor IP (salt: DEMO_IP_SALT, never stored). The raw address is never persisted.';

drop trigger if exists demo_usage_set_updated_at on demo_usage;
create trigger demo_usage_set_updated_at before update on demo_usage
  for each row execute function set_updated_at();

-- The limiter's only query: count rows for one visitor since a window start.
-- Descending created_at matches ai_audit_log_owner_idx, which serves the same
-- shape of question for the global tier.
create index if not exists demo_usage_visitor_idx on demo_usage (visitor_hash, created_at desc);
-- Supports the opportunistic sweep of rows older than the window.
create index if not exists demo_usage_created_idx on demo_usage (created_at);

alter table demo_usage enable row level security;

-- Deliberately NO anon policy. RLS is on with no policy granting the anon role
-- anything, so an anonymous client reads and writes nothing here even though the
-- feature it powers is anonymous — the demo's server action holds the service
-- role, which bypasses RLS. A visitor must never be able to read the ledger
-- (it would expose other visitors' hashes) or write to it (they could pad it to
-- lock others out, or clear it to lift their own limit).
drop policy if exists "Authenticated admin full access" on demo_usage;
create policy "Authenticated admin full access" on demo_usage for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
