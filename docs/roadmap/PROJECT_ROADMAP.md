# Career CRM Roadmap

> Master roadmap for the Career CRM — built on top of the `shivam-portfolio`
> Next.js application. This is the single source of truth for scope, sequencing,
> and status across all phases.

---

## Overview

The Career CRM turns the portfolio's admin area into a source-agnostic system
for tracking a job search end-to-end: companies, contacts, opportunities
(applications), communications, tasks, and — later — automated ingestion and an
AI assistance layer. It is additive to the existing portfolio + inquiry-management
product, reusing its authentication, middleware, and Supabase conventions.

**Guiding principles**

- **Additive, never destructive** — new capability must not modify existing
  inquiry/auth/middleware behaviour.
- **Scalability over minimalism** — model for future integrations and multi-user
  now, even when Phase 1 uses only one.
- **Configuration over hardcoding** — navigation and (later) pipelines are data.
- **AI-ready by construction** — provenance columns exist before AI is wired up.

**Related documentation**

- [README](../../README.md) — repository landing page
- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) — frontend/backend/DB/deploy
- [Database Guide](../database/DATABASE_GUIDE.md) — ER diagram, tables, conventions
- [Design System](../design/DESIGN_SYSTEM.md) — tokens, states, accessibility, motion
- [Component Library](../design/COMPONENT_LIBRARY.md) — reusable components + reuse matrix
- [AI Architecture](../ai/AI_ARCHITECTURE.md) — AI layer design (Phase 3 · M6–M10)
- [Phase 1 Completion](./PHASE_1_COMPLETION.md) — Phase 1 report, decisions, debt

---

## Current status

| Item | State |
|------|-------|
| Live product | Portfolio + inquiry admin, in production |
| Career CRM schema | Applied to production Supabase, verified |
| Active phase | **Phase 3 in progress** — M1–M7 implemented, plus M8a (streaming copilot). **Not yet deployed** (all flags off). Production still runs `v1.0.0` (`c2b5dc3`) |
| Production URL | https://www.shivamchaturvedi.com |
| Latest phase report | [`PHASE_1_COMPLETION.md`](./PHASE_1_COMPLETION.md) |

**Phase progress**

| Phase | Name | Status |
|-------|------|--------|
| 0 | Portfolio Website | ✅ Complete |
| 1 | Career CRM Foundation | ✅ Complete |
| 2 | CRM Application | ✅ Complete (`v1.0.0`) |
| 3 | Integrations, AI & Automation | 🟡 In progress — M1–M7 + M8a built; M8b (vector retrieval), M9–M10 pending |
| 4 | Reporting | ⬜ Not started |
| 5 | Production Hardening | ⬜ Not started |

---

## Project phases

### Phase 0 — Portfolio Website
**Status: ✅ Complete**

**Objectives**
- Ship a public marketing/portfolio site with a blog and a contact funnel.
- Provide a private admin area to manage inbound inquiries.

**Deliverables**
- Public marketing site (`app/(marketing)`) + blog.
- Contact form → Supabase (`inquiries`), with spam protection (Turnstile) and
  transactional email (Resend).
- Inquiry admin: list, filter, search, status/lead-source workflow, notes,
  activity timeline, CSV export.
- Supabase Auth with allowlist-gated admin signup and recovery/verification flows.

**Completion criteria**
- Site live on Vercel with a custom domain; inquiry admin fully functional
  behind auth.

**Current status** — Live in production.

---

### Phase 1 — Career CRM Foundation
**Status: ✅ Complete**

**Objectives**
- Replace the hardcoded admin sidebar with a configuration-driven system.
- Design and apply the additive database foundation for the CRM.
- Change nothing about existing inquiry/auth/middleware behaviour.

**Deliverables (everything completed)**
- ✅ **Admin authentication** — reused unchanged (Supabase Auth + middleware gate).
- ✅ **Config-driven sidebar** — single source `lib/admin/navigation.ts`;
  `Sidebar.tsx` renders it; placeholder routes for all future modules.
- ✅ **CRM schema** — 10 additive tables (companies, contacts,
  integration_accounts, opportunities, opportunity_contacts, messages,
  message_attachments, opportunity_events, opportunity_notes, tasks).
- ✅ **Database** — applied to production Supabase; existing tables untouched.
- ✅ **RLS** — enabled on all 10 tables with the project's
  `"Authenticated admin full access"` policy.
- ✅ **Enums** — 10 native enums for closed domains.
- ✅ **Indexes** — 60 (8 unique/partial dedup, 7 GIN for FTS + `external_ids`,
  45 B-tree).
- ✅ **Deployment** — shipped to production on Vercel with no regressions.
- ✅ **Documentation** — phase completion report + this roadmap + architecture &
  database guides.

**Completion criteria**
- Migration applied and verified live; lint/typecheck/build green; production
  deploy Ready; no regressions to inquiry/auth flows. — **All met.**

**Current status** — Complete. See [`PHASE_1_COMPLETION.md`](./PHASE_1_COMPLETION.md).

---

### Phase 2 — CRM Application
**Status: ✅ Complete** (tagged `v1.0.0` · `c2b5dc3`)

Build the application layer (CRUD + UI) on the Phase 1 schema, replacing the
"Coming Soon" placeholders one module at a time.

**Objectives**
- Deliver usable, authenticated CRUD experiences for every core entity.
- Establish shared UI patterns (tables, detail panes, forms, filters) reused
  across modules.

**Deliverables — milestones**

| Milestone | Scope |
|-----------|-------|
| **Companies** | List/detail/create/edit/archive; dedupe by domain; link contacts & opportunities |
| **Contacts** | CRUD; company association; roles; dedupe by owner+email |
| **Opportunities** | Pipeline board by `stage`; detail view; contacts, notes, tasks, timeline |
| **Messages** | Threaded reader; link to opportunity/contact; attachments list (read) |
| **Tasks** | List/board by status & priority; due dates; linkage to opp/contact/company |
| **Dashboard** | Real overview (pipeline snapshot, next actions) — split from Inquiries |
| **Analytics** | First cut of pipeline metrics (counts by stage/source) |
| **Settings** | Profile, integration accounts management shell, preferences |
| **Calendar** | Task/interview scheduling views over `due_at` / `next_action_at` |

**Completion criteria**
- Every sidebar item is enabled and backed by a working page; no placeholder
  routes remain; RLS enforced on all reads/writes.

**Current status** — Complete; shipped to production and tagged `v1.0.0`.

---

### Phase 3 — Integrations, AI & Automation
**Status: ⬜ Not started**

The current build phase. Turns the CRM from a system of *record* into a system
of *action*: real data sources (Gmail, Google Calendar), a durable background-job
platform, an AI assistant that reads and (with approval) acts on CRM data, a
rule-based automation engine, and notifications. Delivered as **ten additive,
feature-flagged milestones (M1–M10)**, each independently deployable and reversible
to the `v1.0.0` baseline. Full design and plan:
[Phase 3 Architecture](../architecture/PHASE_3_ARCHITECTURE.md) ·
[Phase 3 Implementation Guide](../architecture/PHASE_3_IMPLEMENTATION_GUIDE.md) ·
[AI Architecture](../ai/AI_ARCHITECTURE.md).

**Objectives**
- Connect Gmail and Google Calendar; continuously sync mail/events into the schema.
- Provide a durable background-job platform (queue + cron workers + retries).
- Add an AI assistant (summaries, drafting, RAG copilot) that is human-in-the-loop.
- Introduce a workflow automation engine (event → condition → action).
- Add in-app + email notifications for operationally important events.

**Deliverables — milestones (M1–M10)**
- **M1 Jobs & Secrets** — durable Postgres `jobs` queue drained on a schedule;
  token encryption (Vault / pgsodium).
- **M2 Google OAuth** — connect/disconnect with **encrypted** tokens in
  `integration_accounts` (never plaintext).
- **M3 Gmail Sync** — incremental sync via `historyId` (`sync_cursor`); idempotent
  upsert on `(integration_account_id, external_message_id)`; attachment metadata.
- **M4 Calendar** — sync Google Calendar events; create interview events.
- **M5 Notifications** — in-app bell + email (Resend).
- **M6 AI Foundation** — provider gateway, conversations, token accounting.
- **M7 AI Summaries** — per-message/opportunity summaries (`ai_summary` + `ai_*`).
- **M8 AI Assistant** — streaming RAG copilot (`pgvector` + tools). Split in
  delivery: **M8a** ships the streaming copilot with keyword retrieval over the
  existing FTS indexes; **M8b** adds `pgvector` + `ai_embeddings` for semantic
  recall, and is blocked until an embedding provider is configured (the current
  provider exposes no embeddings endpoint, so `AiProvider` has nothing to
  implement `embed()` with). See `lib/ai/retrieval.ts` for the seam.
- **M9 Email Drafting** — AI drafts, **approval-gated**, sent via Gmail.
- **M10 Workflow Automation** — rule engine (trigger → condition → action).

**Completion criteria**
- Gmail/Calendar reliably sync and link to opportunities/contacts; jobs drain with
  retries/idempotency; AI outputs are provenance-stamped (`ai_model` /
  `ai_prompt_version` / `ai_confidence` / `ai_processed_at`) and every external
  action is approval-gated and auditable; each milestone ships flag-off then enabled,
  with `v1.0.0` intact as the rollback point.

**Current status** — Pending. Schema already supports it; new tables land additively
per milestone (no migration needed to start M1/M3).

---

### Phase 4 — Reporting
**Status: ⬜ Not started**

**Objectives**
- Turn CRM activity into decision-useful metrics.

**Deliverables — milestones**
- **Analytics** — response rate (message `direction` + timestamps).
- **Pipeline** — stage distribution, velocity, aging.
- **Hiring Funnel** — applied → screening → interview → offer → hired conversion.
- **KPIs** — interview rate, offer rate, source attribution dashboards.

**Completion criteria**
- Core rates and funnel views render from live data without schema redesign.

**Current status** — Pending. Derivable from existing schema.

---

### Phase 5 — Production Hardening
**Status: ⬜ Not started**

**Objectives**
- Make the CRM operable, observable, and secure at scale.

**Deliverables — milestones**
- **Audit Logs** — durable, tamper-evident action logging.
- **Monitoring** — error tracking, uptime, sync-health alerting.
- **Testing** — unit/integration/e2e coverage; CI gates.
- **Performance** — query/index tuning, pagination, caching.
- **Security** — per-user RLS, secret rotation, token encryption review, pen-test pass.

**Completion criteria**
- Defined SLOs met; CI enforces tests/lint/typecheck; security review signed off.

**Current status** — Pending.

---

*Roadmap owner: repository maintainer. Update this file whenever phase scope or
status changes.*
