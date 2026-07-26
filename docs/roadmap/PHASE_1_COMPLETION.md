# Phase 1 — Completion Report

**Project:** shivam-portfolio → Career CRM foundation
**Status:** ✅ Complete
**Date:** 2026-07-27
**Production:** https://www.shivamchaturvedi.com

---

## Objectives completed

| # | Objective | Status |
|---|-----------|--------|
| 1 | Replace hardcoded admin sidebar with a config-driven navigation system | ✅ |
| 2 | Scaffold placeholder routes for all future admin modules | ✅ |
| 3 | Design & apply the Career CRM database foundation (additive, scalable) | ✅ |
| 4 | Preserve all existing auth, middleware, and inquiry functionality | ✅ |
| 5 | Ship to production with no regressions | ✅ |

Phase 1 delivered **structure only** — no CRUD, no UI beyond placeholders, no
automation, and no changes to existing inquiry/auth/middleware behaviour.

---

## Architecture delivered

- **Configuration-driven navigation** — a single source of truth
  (`lib/admin/navigation.ts`) renders the entire admin sidebar. Adding,
  reordering, or enabling a module is a data edit, not a component change.
- **Source-agnostic CRM data model** — the schema separates `provider`
  (on the connected account) from `source` (on data rows) and carries
  `external_ids jsonb` everywhere, so new integrations become data, not DDL.
- **AI-ready by construction** — every AI-touchable entity records
  `ai_model / ai_prompt_version / ai_confidence / ai_processed_at`
  (+ `ai_summary` where relevant); the event log carries `actor_type`
  (`user | agent | system`).
- **Multi-user-ready** — nullable `owner_id → auth.users` on every table so
  RLS can be narrowed per-user later with zero schema change.
- **Conventions preserved** — lowercase SQL, `gen_random_uuid()` PKs, the shared
  `set_updated_at()` trigger, and the existing `"Authenticated admin full access"`
  RLS posture were all mirrored from the current schema.

---

## Database schema summary

Additive migration: `supabase/migrations/20260726183601_career_crm_foundation.sql`
(applied to production, verified live; existing tables untouched).

**10 tables**

| Table | Role |
|-------|------|
| `companies` | Employers / agencies / portals |
| `contacts` | Recruiters, hiring managers, referrals |
| `integration_accounts` | Connected inboxes/APIs (Gmail now; multi-inbox, multi-provider) |
| `opportunities` | **Core** — one job pursuit/application |
| `opportunity_contacts` | M:N opportunity ↔ contact, with per-deal role |
| `messages` | Normalized comms (email/LinkedIn/ATS), idempotent ingest |
| `message_attachments` | Files carried by a message |
| `opportunity_events` | Append-only timeline; agent/user/system actor |
| `opportunity_notes` | Free-form notes on an opportunity |
| `tasks` | Follow-ups / to-dos |

**Supporting objects**

- **10 enums** — `integration_provider`, `integration_status`, `message_direction`,
  `opportunity_stage`, `employment_type`, `location_type`, `task_status`,
  `task_priority`, `actor_type`, `opportunity_event_type`
- **60 indexes** — 8 unique/partial (dedup & idempotent ingest), 7 GIN
  (`search_vector` FTS + `external_ids`), 45 B-tree on FK/filter/sort columns
- **10 `updated_at` triggers** (shared `set_updated_at()`)
- **10 RLS policies** — RLS enabled on every table; anon key fully denied
- **Full-text search** — generated `tsvector` columns on
  companies/contacts/opportunities/messages
- **Analytics-ready** — response rate (message `direction` + timestamps),
  interview/offer rates (`stage` + `opportunity_events`), source attribution
  (`source` + `integration_account_id` + `external_ids`) all derivable without redesign

**Designed for future integrations without schema changes:** Gmail, LinkedIn,
Wellfound, Greenhouse, Lever, Ashby, Workday, Indeed, and company career portals.

---

## Admin navigation improvements

- Sidebar now renders 100% from `lib/admin/navigation.ts` (`Sidebar.tsx` client
  component) — no hardcoded nav items remain.
- **Enabled:** Dashboard, Inquiries. **Disabled ("Soon"):** Applications,
  Companies, Contacts, Messages, Tasks, Calendar, Analytics, Settings —
  visible but non-navigable.
- **Placeholder routes** created for all future modules under
  `app/admin/(dashboard)/*`, each rendering a minimal `ComingSoon` view; they
  inherit the existing auth gate via the unchanged `/admin/:path*` middleware.
- UI preserved pixel-for-pixel (spacing/colors/typography); the only additive
  visual change is consistent nav icons.

---

## Deployment status

- **Vercel:** ● Ready (Production), aliased to `https://www.shivamchaturvedi.com`
- **Gates:** lint ✔ · typecheck (`tsc --noEmit`) ✔ · production build ✔
- **Smoke test:** `/` → 200, `/admin` → 307 → `/admin/login`, `/admin/login` → 200
- **Regressions:** none — inquiry tables and auth/middleware behaviour unchanged
- **DB verification:** all 10 tables + new columns confirmed live via read-only
  REST; existing inquiry tables intact

---

## Git commit hashes

| Commit | Description |
|--------|-------------|
| `e42f072` | `feat(admin): config-driven sidebar navigation` (Phase 1 · Step 1) |
| `25f4dd7` | `feat(crm): add career CRM foundation schema` (Phase 1 · Step 2) |

---

## Remaining Phase 2 work

- **CRUD & UI** for each entity (companies, contacts, opportunities, messages,
  tasks) — replace the "Coming Soon" placeholders.
- **Split Dashboard vs Inquiries** — currently both resolve to `/admin`; give
  each its own page.
- **Gmail integration** — OAuth connect flow, message sync, and **encrypted
  token storage** (Supabase Vault / pgsodium) before any real tokens land in
  `integration_accounts`.
- **Ingestion pipeline** — normalize provider messages into `messages`
  (idempotent via `(integration_account_id, external_message_id)`), link to
  opportunities/contacts, and populate `opportunity_events`.
- **Per-user RLS** — backfill `owner_id` and tighten policies once multi-user
  lands (activates the owner-scoped unique constraints).
- **Analytics views** — response/interview/offer rates and source attribution.
- **AI agents** — populate the `ai_*` provenance fields and `actor_type='agent'`
  events.
- **Baseline migration** — capture the existing `inquiries` schema as a
  migration if adopting `supabase db push`.

---

*Phase 1 complete. Phase 2 not started.*

---

## Lessons Learned

- **Model the future once, cheaply.** Adding nullable columns (`owner_id`,
  `ai_*`), `external_ids jsonb`, and generated `tsvector` on empty tables cost
  almost nothing now but would be painful to retrofit onto large tables later.
- **Idempotent migrations are worth the extra guards.** `if not exists` /
  `do $$ ... $$` / `drop ... if exists` let the same file be pasted into the
  Supabase SQL Editor safely, and re-run without fear.
- **Environment constraints surface late.** There was no local Postgres, Docker,
  or Supabase CLI available, so the migration could not be applied or verified
  locally — only committed. Applying was done out of band against the hosted DB.
  Future work should confirm the DB toolchain before promising a local apply.
- **REST verification has limits.** Table/column/enum existence is checkable via
  the REST API; indexes, triggers, and RLS require SQL introspection. Plan both.
- **"Preserve the UI exactly" needs a defined exception.** Adding consistent nav
  icons technically changed the sidebar; calling that out explicitly (allowed
  "for consistency") avoided ambiguity.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enum representation | Native Postgres enums for closed sets; `text` for volatile ones | Type safety where stable; `ALTER TYPE ADD VALUE` is non-breaking; avoids churn on fast-moving sets |
| Source modeling | `provider` on account, `source` on rows, `external_ids jsonb` | New integrations become data, not DDL |
| AI provenance | First-class `ai_*` columns on entities; `jsonb` on logs/notes | Queryable for analytics without a future migration |
| Ownership | Nullable `owner_id → auth.users` everywhere | Multi-user-ready; per-user RLS later with no schema change |
| Attachments | Dedicated `message_attachments` table | Scales independently of message rows; mirrors `inquiry_attachments` |
| Search | Generated `tsvector` + GIN now | Cheap on empty tables; costly to retrofit on a large `messages` table |
| Navigation | Config array + client `Sidebar` | Enabling a module is a one-line data change |
| RLS posture | Reuse `"Authenticated admin full access"` | Consistency with the existing inquiry tables |

## Known Limitations

- **Owner-scoped uniqueness is dormant.** While `owner_id` is null (single-admin),
  `contacts (owner_id, lower(email))` and the integration-account email uniques do
  not actually enforce dedup (NULLs compare as distinct).
- **`messages` dedup needs a non-null `integration_account_id`.** Messages
  ingested without an account are not deduped by the unique index.
- **RLS is coarse.** Any authenticated user has full access; there is no per-user
  isolation yet.
- **Dashboard and Inquiries share `/admin`.** They are the same page in Phase 1.
- **No automated tests** cover the schema or admin flows yet.

## Technical Debt

- **Token encryption not enforced.** `access_token_encrypted` /
  `refresh_token_encrypted` are plain `text`; they must receive encrypted values
  (Vault/pgsodium/app-layer) before Gmail OAuth ships (Phase 3).
- **No baseline migration.** The inquiry schema lives in `supabase/schema.sql`,
  not in `migrations/`; adopting `supabase db push` will need a captured baseline.
- **DB verification is partial** without a SQL-capable toolchain in the dev
  environment.
- **Placeholder pages** duplicate a trivial `ComingSoon` render — fine now,
  replaced in Phase 2.

## Why certain decisions were made

- **Additive-only** protects the live inquiry product: nothing existing is
  altered, so there is no regression surface.
- **Scalability over minimalism** was an explicit brief; the schema optimizes for
  future Gmail/LinkedIn/ATS ingestion, multi-user, and AI — even though Phase 1
  only needs a fraction of it.
- **Native enums over lookup tables** were chosen for the closed domains because
  they are simpler and type-safe, and forward-extension is a one-liner; volatile
  domains stayed `text` precisely to avoid enum churn.

## Migration strategy

- Additive, idempotent SQL files under `supabase/migrations/`, named
  `<UTC timestamp>_<slug>.sql`.
- Applied **out of band** to Supabase (SQL Editor or CLI); Vercel never runs
  migrations. Additive + idempotent means apply order relative to a deploy is
  safe.
- Verify after apply: table/column existence (REST or SQL) and object counts via
  `pg_tables` / `pg_type` / `pg_indexes` / `pg_trigger` / `pg_policies`.

## Rollback strategy

- **Application:** revert the commit and redeploy (or promote the previous Ready
  Vercel deployment) — the app carries no runtime dependency on the new tables in
  Phase 1, so rollback is low-risk.
- **Database:** because the migration is purely additive, a "rollback" is a
  separate, explicit teardown migration
  (`drop table if exists ... cascade; drop type if exists ...`). Prefer
  **roll-forward** (a corrective additive migration) over destructive rollback
  once any real data exists. Never hand-edit applied objects in place.

## Future migration conventions

- One logical change per migration; never mix additive foundation work with
  destructive changes.
- Continue guarding every statement for idempotency.
- Evolve enums with `ALTER TYPE ... ADD VALUE`; never remove/renumber in place.
- When multi-user lands, ship a dedicated migration to (a) backfill `owner_id`
  and (b) tighten RLS to `owner_id = auth.uid()`.
- Encrypt integration tokens before any provider OAuth flow writes real
  credentials.
- See [`../database/DATABASE_GUIDE.md`](../database/DATABASE_GUIDE.md#migration-conventions)
  for the canonical checklist.
