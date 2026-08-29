# Research providers

External data sources behind `lib/research`. Every provider is server-side only,
feature-flagged off by default, and normalizes into a shared contract so no
vendor vocabulary reaches the UI, the domain model, the database or a prompt.

## Architecture

```
                    lib/research/registry.ts        ← resolves by CAPABILITY
                              │                        (never by import)
        ┌──────────┬──────────┬──────────┬─────────┐
        ▼          ▼          ▼          ▼         ▼
  JobProvider  CompanyProv  NewsProv  MacroProv  [PeopleProvider]
  ├ aidevboard  └ sec_edgar  ├ noozra  └ fred●     (seam only)
  ├ ai_jobs_co               └ gnews●
  ├ adzuna●
  └ usajobs●                          ● = credential-gated
        │                     │                     │
        ▼                     ▼                     ▼
  NormalizedJob        NormalizedCompany     NormalizedNewsItem
  + Provenance         + FinancialFact       + Provenance
        │
        ▼  lib/research/bridge.ts (the ONLY converter)
  NormalizedApplication  → existing Career Intelligence ingestion
```

`lib/research/http.ts` is the shared transport: timeouts, bounded retries with
exponential backoff and jitter, per-host rate limiting, and one error taxonomy.

**The Phase 1 AI Dev Jobs client (`lib/integrations/aidevboard/`) is not modified.**
It is wrapped by `providers/ai-dev-jobs.ts`. The Job Feed and Job Match still call
it directly and are unaffected.

## Separation of concerns

```
SOURCE FACTS          ≠   MODEL SYNTHESIS        ≠   HUMAN DECISION
lib/research/*            AI Gateway + ai_decisions   opportunities / stages
```

Nothing in `lib/research` is produced by a model, and nothing here overwrites a
source record. AI analysis attaches to source records by provenance — the
pattern already established by Job Match writing to `ai_decisions`.

## Provenance

Every normalized entity carries a `Provenance` block. Not optional, not a
side-table:

| Field | Meaning |
|---|---|
| `provider` | which source |
| `externalId` | stable id at the source; with `provider`, the dedup key |
| `sourceUrl` | canonical human-viewable URL |
| `retrievedAt` | when we fetched it |
| `publishedAt` | when the source says it was published, or `null` |

---

## Integrated providers

### Artificial Intelligence Jobs

| | |
|---|---|
| **Purpose** | AI/ML job listings from ~260 companies' own career pages |
| **Category** | Jobs |
| **Authentication** | **None** — public endpoints are open |
| **Environment variable** | none |
| **Server/client** | Server only |
| **Feature flag** | `FEATURE_RESEARCH_JOBS` |
| **Primary use** | Use cases 1 & 2 — discover and rank relevant roles |
| **Normalized entity** | `NormalizedJob` |
| **Rate limits** | Undocumented; self-limited to 2 req/s |
| **Caching** | 10 minutes (`revalidate: 600`) |
| **Fallback** | Search continues on other job providers; failure is named, not swallowed |
| **MCP/API** | REST API — deterministic, normalized, ingestible |
| **Security notes** | No credentials. No candidate data is ever sent; queries only. |

Selected on measured signal: 18,947 live postings, and
`q=AI engineer&remote=true&region=US` narrows to ~38 real roles at OpenAI,
Anthropic and LangChain.

**Known quirk:** `salary` is display text (`"$251K – $335K • Offers Equity"`),
not numbers. It is carried verbatim in `salaryText`; the numeric fields stay
`null` rather than manufacturing false precision. `remote` is a boolean, so a
non-remote posting normalizes to `unknown`, never `onsite`.

### SEC EDGAR

| | |
|---|---|
| **Purpose** | US company profiles, filings, XBRL financial facts |
| **Category** | Company + Finance |
| **Authentication** | No key, but a contact User-Agent is **required** |
| **Environment variable** | `SEC_EDGAR_USER_AGENT` |
| **Server/client** | Server only |
| **Feature flag** | `FEATURE_RESEARCH_COMPANY` |
| **Primary use** | Use cases 3, 5, 7, 8 — company and industry research |
| **Normalized entity** | `NormalizedCompany`, `FinancialFact`, `CompanyFiling` |
| **Rate limits** | SEC documents 10 req/s; self-limited to 5 |
| **Caching** | 1 hour for filings/facts, 24 hours for the ticker index |
| **Fallback** | None — it is the primary record. Unconfigured ⇒ reports unavailable |
| **MCP/API** | REST API — read-only research data, no trading execution |
| **Security notes** | The User-Agent contains a real contact address, so it is configuration, never hardcoded. The provider **refuses to call** rather than send a fabricated contact. |

**Verified:** a request with a blank User-Agent returns `403`. This is the SEC's
fair-access policy, not a rate limit.

**Known quirks:** `filings.recent` is column-oriented (parallel arrays), zipped
with an explicit length guard so a filing cannot inherit another's date. A `404`
on an XBRL concept means "this registrant does not report that tag" — normal, not
an error, so it yields `[]`.

### Noozra

| | |
|---|---|
| **Purpose** | News search across ~200 curated RSS sources |
| **Category** | News |
| **Authentication** | **None** |
| **Environment variable** | none |
| **Server/client** | Server only |
| **Feature flag** | `FEATURE_RESEARCH_NEWS` |
| **Primary use** | Use cases 6 & 8 — company/industry news, CI briefs |
| **Normalized entity** | `NormalizedNewsItem` |
| **Rate limits** | Undocumented; self-limited to 2 req/s |
| **Caching** | 5 minutes |
| **Fallback** | Search returns partial results and names the failure |
| **MCP/API** | REST API |
| **Security notes** | No credentials. Query terms only. |

`source` names the **originating outlet** (e.g. "AI Business"), never the
aggregator — a brief citing "Noozra" instead of the outlet is not evidence.
Articles are deduplicated by canonical URL.

### AI Dev Jobs *(pre-existing, Phase 1)*

Unchanged. Now also reachable through the registry via a wrapper. Gated by its
existing `FEATURE_AIDEVBOARD` flag. Publishes integer salary bounds, so it fills
`salaryMin`/`salaryMax` and leaves `salaryText` null — the deliberate asymmetry
with AI Jobs above.

---

## Rejected, with evidence

| Provider | Reason |
|---|---|
| **Arbeitnow** | 4 of 175 postings remote, dominated by duplicated German tax-advisor listings, no search parameter. Fails the signal-quality bar. |
| **Econdb** | Returns `401 Authentication credentials were not provided` despite the source list stating `Auth: No`. |
| **freehire** | `404`; documentation exposes no usable endpoint. |
| **DataCube AI** | Serves from a `railway.app` development host on date-shaped paths. Too fragile to depend on. |
| **Open Skills** | HTTP-only; the workforce-data-initiative project is unmaintained. |
| **GraphQL Jobs, Juju, Jobs2Careers, Careerjet** | Redundant with selected job sources and lower signal for AI roles. |
| **Trading execution APIs** (Alpaca, Tradier, SmartAPI) | Out of scope by instruction — this product is research, not trading. |

## Credential-gated providers (implemented, disabled until keyed)

Adapters for **Adzuna**, **USAJOBS**, **FRED** and **GNews** are implemented,
unit-tested against mocks, and withheld from the registry until their
credentials exist.

| Provider | Category | Adds what the open providers cannot | Credentials |
|---|---|---|---|
| **Adzuna** | Jobs | NUMERIC salary bounds + `salary_is_predicted` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| **USAJOBS** | Jobs | US federal research/analyst roles | `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` |
| **FRED** | Macro | CPI/GDP/unemployment — the context filings lack | `FRED_API_KEY` |
| **GNews** | News | Mainstream business/financial press | `GNEWS_API_KEY` |

### ⚠️ Verification status — read before trusting the field mapping

Each endpoint was confirmed **live and key-gated** with an unauthenticated
request:

| Provider | Unauthenticated response |
|---|---|
| Adzuna | `400` |
| USAJOBS | `403 Access Denied` |
| FRED | `400 {"error_message":"Variable api_key is not set"}` |
| GNews | `400 {"errors":["You did not provide an API key."]}` |

**The SUCCESS shapes have NOT been observed** — no keys were available. Each
normalizer is written from the published contract and is defensive throughout
(every field read through a narrowing helper, unusable rows dropped, never a
crash), but treat the field mapping as *unconfirmed* until a key exists and the
live shape is checked. In Phase 1 the AI Dev Jobs `jobs: null` bug was caught
only because that API could be curled.

Note these providers answer **400**, not 401, for a missing key — so an
*invalid* key surfaces as a generic API error. A *missing* key never reaches the
network at all: the provider refuses first.

### "Not configured" is never "no results"

The rule the whole gating design exists to enforce. Three answers stay distinct:

| State | `SearchOutcome` |
|---|---|
| Flag off | `unavailable: [{reason: "disabled", remedy: "Set FEATURE_… =true"}]` |
| No credential | `unavailable: [{reason: "unconfigured", remedy: "Set ADZUNA_APP_ID…"}]` |
| Ran, found nothing | `succeeded: ["adzuna"]`, `results: []` |

`didNotRun(outcome)` is true only for the first two. A UI must render
"configure a provider", not an empty state implying the market is empty.

## Still deferred — no adapter

| Category | Deferred | Why |
|---|---|---|
| People | HeroHunt, Village, Tomba | Paid, no free tier, no observable response contract. LinkedIn scraping out of scope. |
| Finance | Financial Modeling Prep, Finnhub, Alpha Vantage, OpenFIGI | Redundant with SEC EDGAR for company research |
| Jobs | JobDataLake, Jooble, The Muse, ZipRecruiter, WhatJobs | Redundant with the four job providers already present |
| News | MarketAux, NewsAPI, NewsData, The Guardian, AP | Redundant with Noozra + GNews |

`PeopleProvider` is declared in `types.ts` and `listPeopleProviders()` returns an
empty array, so the Job → Company → Recruiter seam exists and callers that handle
an empty list today need no change when the first adapter lands.

---

## UI surfaces

`/admin/research` — gated by `FEATURE_RESEARCH`, hidden from the sidebar when off.

| Tab | Capability | Providers |
|---|---|---|
| Jobs | Cross-provider search, deduplicated | AI Dev Jobs, AI Jobs, Adzuna●, USAJOBS● |
| Companies | Name/ticker lookup → profile, filings, XBRL financials | SEC EDGAR |
| News | Topic search with outlet attribution | Noozra, GNews● |
| Macro | Economic series with presets (CPI, GDP, UNRATE…) | FRED● |

A **provider status panel** at the top shows every provider as `ready` / `off` /
`no key`, and names the exact missing variable.

### Why this is separate from the Job Feed

Job Feed is the AI Dev Jobs + AI-matching surface. `JobMatchPanel` sends a job
id, and the action re-fetches that posting from the Phase 1 client so the model
provably sees a posting the operator can see. Pointing that page at a
multi-provider result set would break that guarantee and Phase 2 with it.
Consolidating the two is a deliberate later decision, not a side effect.

### Source facts vs model synthesis, on screen

The Research page runs **no model**. Every row is a source record with its
provider badge and source URL. AI synthesis stays a separate, explicitly
triggered step (Job Match) so facts and model output never blur together.

## MCP recommendations

`.mcp.json.example` ships in the repo as an **opt-in template**. No active
`.mcp.json` is created: activating MCP servers changes the Claude Code
environment on next start and requires credentials. Copying it is the
developer's explicit decision. `.mcp.json` is gitignored.

All three servers are **development-only**. None is wired into the application
runtime.

### Worth adding — Claude Code development environment

| MCP | What it does | Why | Auth | Security |
|---|---|---|---|---|
| **GitHub** | Repo, issue, PR access | Development workflow: PR review, issue triage on this repo | PAT, scoped read | Dev environment only. Never runtime. Scope to this repo. |
| **Supabase** | Schema inspection, SQL | Inspecting migrations/RLS while developing — this phase needed exactly that | Service-role key | Dev only. Service-role bypasses RLS — never expose to runtime or browser. |
| **Fetch / web** | Retrieve and read URLs | Dynamic research during development (reading an API's docs, as done here) | None | Treat fetched content as untrusted data, never instruction. |

### Application runtime — **not yet**

The AI Gateway currently offers a curated read-only tool catalogue
(`lib/ai/tools/`) with authorization at the gateway. Wiring MCP servers into
runtime would introduce a second tool path that bypasses the gateway's budget,
audit and redaction — precisely what section 9 forbids. **If MCP reaches runtime,
it must be exposed as gateway tools, not as a parallel channel.**

Note that AI Dev Jobs advertises an MCP endpoint. We deliberately use its REST
API instead: this is scheduled, normalized, database-ingested data — the REST
case per the decision rule. Using both would duplicate the capability.

### Rejected

| MCP | Reason |
|---|---|
| Browser automation | Section 10 defers browser automation; the Chrome extension already covers job capture |
| n8n | Explicitly deferred to a later phase |
| Trading / brokerage | Research product, not trading |
| Filesystem (runtime) | No runtime need; a large unnecessary surface |

### MCP vs API — how the rule was applied

| Capability | Choice | Why |
|---|---|---|
| Job discovery | **API** | Scheduled, normalized, ingested, deduplicated |
| Company financials | **API** | Deterministic, cached, structured for analysis |
| News search | **API** | Repeatable queries, provenance retained |
| Repo/schema exploration | **MCP** | Interactive, agent-oriented, development-time |
