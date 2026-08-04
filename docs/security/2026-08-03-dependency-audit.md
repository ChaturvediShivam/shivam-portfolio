# Dependency Security Assessment

**Date:** 2026-08-03
**Repo:** `shivam-portfolio` @ `fcd0aaf` (branch `feat/resume-ai-analysis`)
**Scope:** all 9 advisories reported by `npm audit` against `next@14.2.35`
**Method:** structured `npm audit --json` → exact dependency chains via `npm ls` → each advisory read at source → preconditions checked against this repository's actual configuration and code
**Changes made:** **none.** `package.json` and `package-lock.json` are byte-identical to `HEAD`.

---

## Executive summary

`npm audit` reports **9 vulnerabilities (1 critical, 5 high, 3 moderate)**. After reading each advisory and checking its preconditions against this codebase:

| Verdict | Count | Packages |
|---|---|---|
| **Not applicable** — preconditions cannot be met here | 4 | `vitest`, `vite`, `esbuild`, `postcss` |
| **Dev-only, not reachable in production** | 2 | `brace-expansion`, `js-yaml` |
| **Genuinely reachable in production** | **2 advisories** (within `next`) | `next` |

> [!IMPORTANT]
> **Three findings that change the picture from what `npm audit` implies:**
>
> 1. **The one CRITICAL (CVSS 9.8) is not applicable.** `GHSA-5xrq-8626-4rwp` requires the Vitest UI server bound to the network (`--api.host`) or Windows + UI/Browser Mode. This repo runs `vitest run` on macOS, has no `@vitest/ui` dependency, and passes no `--ui` flag.
> 2. **The highest-CVSS Next.js advisory (8.6) is not applicable.** `GHSA-c4j6-fc7j-m34r` states Vercel-hosted deployments are explicitly unaffected, and it requires WebSocket upgrade handling — this app has none.
> 3. **Next.js 14 is end-of-life for security patches.** The `next-14` dist-tag is pinned at `14.2.35` — the version installed. **No 14.x patch exists** for the two applicable advisories. Remediation *requires* a major upgrade; there is no patch-level escape.

**Of ~21 Next.js advisories bundled into one `npm audit` entry, 2 apply to this application.** Both are denial-of-service, both target App Router Server Actions, and both state *"no workaround exists besides upgrading."*

---

## 1. Evidence base

### 1.1 Environment facts

| Fact | Value | How verified |
|---|---|---|
| Platform | `darwin` (macOS) | `node -p "process.platform"` |
| Next.js installed | `14.2.35` | `node -p "require('next/package.json').version"` |
| Router | App Router | `app/` directory, no `pages/` |
| Runtime | Node.js everywhere | no `runtime = "edge"` declaration found |
| Hosting | Vercel | `vercel.json` present; production at `www.shivamchaturvedi.com` |
| Custom server | **None** | no `http.createServer` / `https.createServer` anywhere outside `node_modules` |
| Middleware | `middleware.ts`, matcher `["/admin/:path*"]` | read directly |
| Server Actions | **12 files, 62 exported async actions** | `grep -rln '"use server"'` |
| `next/image` | 1 usage (`components/sections/Hero.tsx`) | grep |
| `images` config | **None** | `Object.keys(next.config.js)` → `['headers']` only |
| `i18n` config | **None** | grep `next.config.js` |
| `rewrites` / `redirects` | **None** | grep `next.config.js` |
| `beforeInteractive` scripts | **None** | grep |
| CSP nonce | **Not used** — CSP is static with `'unsafe-inline'` | `next.config.js` read; the `nonce` grep hits are an unrelated AI self-test nonce |
| WebSocket | **None** | grep |
| Vitest UI | **Not installed, never invoked** | `package.json` → `"test": "vitest run"`; no `@vitest/ui` |
| Production deployment | **`v1.0.0` (`c2b5dc3`)** — Phase 3 undeployed, all flags off | `docs/roadmap/PROJECT_ROADMAP.md:44` |

> [!NOTE]
> An early grep for `createServer` matched `createServerClient` from `@supabase/ssr` and the local `createServerSupabaseClient` helper. Those are Supabase client factories, **not** an HTTP server. Verified separately: no custom server exists. This distinction is load-bearing for `GHSA-89xv-2m56-2m9x`.

### 1.2 Deployment-state caveat

Production currently runs `v1.0.0` — the Phase 2 CRM. Phase 3 (M1–M10, Resume AI) is built but **not deployed**, with every feature flag `false`.

This means:
- **Live exposure today** = the Phase 2 Server Actions (companies, contacts, opportunities, tasks, settings) plus the public marketing site and contact form.
- **The Resume AI Server Actions are not on the internet.** They are not part of the current production attack surface.
- The applicable Next.js advisories still apply to production, because the Phase 2 CRM already uses App Router Server Actions.

---

## 2. Per-vulnerability assessment

### 2.1 `vitest` — CVSS 9.8 CRITICAL — **NOT APPLICABLE**

**Advisory:** [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (CVE-2026-47429) — arbitrary file read and execution when the Vitest UI server is listening.

**Dependency chain**
```
shivam-portfolio@0.1.0
└── vitest@2.1.9          (direct devDependency)
```

**Classification:** Development only.

**Preconditions, quoted from the advisory:**
> Requires **at least one** of: (1) the Vitest UI server explicitly exposed to the network via `--api.host` or the `api.host` config option; (2) running on Windows with UI or Browser Mode enabled.
> "The plain `vitest run` command in CI without UI exposure is **not vulnerable**."

**Reachability: NO.** Every precondition fails:

| Precondition | This repo |
|---|---|
| Vitest UI server running | `@vitest/ui` is not a dependency; no `--ui` flag anywhere |
| `--api.host` / `api.host` set | No vitest config exposing the API; script is `vitest run` |
| Windows | `process.platform` = `darwin` |

The advisory notes the path-traversal mechanism "fails on Linux due to filesystem differences" — the same applies to macOS.

**Additionally:** `vitest` is a `devDependency`. It is never installed by `npm ci --omit=dev` and never present in a Vercel production build.

**Category: 🟢 Fix after Phase 3** — purely to clear audit noise. Fix requires `vitest@4.1.10` (major).

---

### 2.2 `vite` — CVSS 7.5 high — **NOT APPLICABLE**

**Advisory:** [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (CVE-2026-53571) — `server.fs.deny` bypass via Windows alternate path syntax (`/.env::$DATA?raw`).

Also bundled: `GHSA-4w7w-66w2-5vf9` (path traversal in optimized-deps `.map` handling), `GHSA-v6wh-96g9-6wx3` (`launch-editor` NTLMv2 hash disclosure — Windows).

**Dependency chain**
```
shivam-portfolio@0.1.0
└─┬ vitest@2.1.9
  ├─┬ @vitest/mocker@2.1.9
  │ └── vite@5.4.21 (deduped)
  ├─┬ vite-node@2.1.9
  │ └── vite@5.4.21 (deduped)
  └── vite@5.4.21
```

**Classification:** Development only.

**Preconditions:** Windows (or an NTFS volume) **and** the Vite dev server explicitly exposed to the network via `--host` / `server.host`.

**Reachability: NO.** macOS; no Vite dev server is ever started (vitest uses Vite's transform pipeline, not its HTTP dev server); no `--host`. The `launch-editor` sub-advisory is explicitly Windows-only.

**Category: 🟢 Fix after Phase 3** — rides along with the `vitest@4` upgrade.

---

### 2.3 `esbuild` — CVSS 5.3 moderate — **NOT APPLICABLE**

**Advisory:** [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — `Access-Control-Allow-Origin: *` on the esbuild dev server lets any website read dev-server responses.

**Dependency chain**
```
shivam-portfolio@0.1.0
└─┬ vitest@2.1.9
  └─┬ vite@5.4.21
    └── esbuild@0.21.5
```

**Classification:** Development only. Confirmed at source:
> "This vulnerability is **development-server specific**… It does not affect production builds or CI/CD test runs, which don't use esbuild's development server."

**Reachability: NO.** The vulnerability is in esbuild's `serve` feature. Vitest uses esbuild as a transformer only; esbuild's HTTP serve mode is never started. Next.js builds with SWC/webpack, not esbuild.

**Category: 🟢 Fix after Phase 3.**

---

### 2.4 `brace-expansion` — CVSS 7.5 high — **DEV ONLY, NOT REACHABLE**

**Advisories:** [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) (CVE-2026-14257, OOM crash), [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) (exponential-time expansion).

**Dependency chains — all three are ESLint tooling**
```
shivam-portfolio@0.1.0
├─┬ eslint-config-next@14.2.35        (devDependency)
│ ├─┬ @next/eslint-plugin-next@14.2.35
│ │ └─┬ glob@10.5.0 → minimatch@9.0.9 → brace-expansion@2.1.1
│ └─┬ @typescript-eslint/parser@8.61.1
│   └─┬ @typescript-eslint/typescript-estree@8.61.1
│     └─┬ minimatch@10.2.5 → brace-expansion@5.0.6
└─┬ eslint@8.57.1                     (devDependency)
  └─┬ minimatch@3.1.5 → brace-expansion@1.1.15
```

**Classification:** Development only (lint toolchain).

**Preconditions:** attacker-controlled input reaching `expand()`, directly or via `minimatch`/`glob` patterns. PoC: `'{a,b}'.repeat(1500)`.

**Reachability: NO.** The only consumer is ESLint's file-matching against glob patterns authored in this repository's own config. There is no path by which a remote party supplies a glob pattern. Not present in a production install.

**Category: 🟡 Fix immediately** — not because it is reachable, but because `fixAvailable: true` means a **non-breaking, transitive-only** resolution. Cost is near zero; leaving it obscures future real findings.

---

### 2.5 `js-yaml` — CVSS 7.5 high — **DEV ONLY, NOT REACHABLE**

**Advisory:** [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) (CVE-2026-59869) — quadratic CPU via YAML merge-key (`<<`) chains.

**Dependency chain**
```
shivam-portfolio@0.1.0
└─┬ eslint@8.57.1                     (devDependency)
  ├─┬ @eslint/eslintrc@2.1.4 → js-yaml@4.2.0 (deduped)
  └── js-yaml@4.2.0
```

**Classification:** Development only.

**Preconditions:** parsing maliciously crafted YAML.

**Reachability: NO.** Used solely by ESLint to load `.eslintrc`-family config from this repository. The application parses no YAML at runtime — `grep` finds no YAML parsing in `app/`, `lib/`, or `components/`. Not present in a production install.

**Category: 🟡 Fix immediately** — same reasoning as 2.4; `fixAvailable: true`, non-breaking.

---

### 2.6 `postcss` — CVSS 7.5 high — **BUILD ONLY; RUNTIME PATH EXISTS BUT IS NOT REACHABLE**

**Advisory:** [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) — path traversal via `sourceMappingURL` auto-loading discloses arbitrary `.map` files.

**Dependency chains**
```
shivam-portfolio@0.1.0
├── postcss@8.5.15                    (direct devDependency)
├─┬ autoprefixer@10.5.0    → postcss (deduped)   ── BUILD
├─┬ tailwindcss@3.4.19     → postcss (deduped)   ── BUILD
├─┬ next@14.2.35           → postcss (deduped)   ── BUILD
├─┬ sanitize-html@2.17.6   → postcss (deduped)   ── ⚠️ RUNTIME dependency
└─┬ vitest@2.1.9 → vite@5.4.21 → postcss          ── DEV
```

> [!WARNING]
> **`sanitize-html` is a production `dependency`, and it requires `postcss` at runtime.** This is the one chain that could have made a "build-only" package reachable from attacker-controlled input — Gmail message bodies ingested by M3 sync are attacker-authorable and are passed through `sanitizeMessageHtml()` in `lib/messages.ts:30`.
>
> I traced it. **It is not reachable**, for two independent reasons.

**Reason 1 — `sanitize-html` already applies the advisory's own mitigation.**

The advisory states the vulnerability "affects any application processing CSS it does not fully trust **without explicitly passing `map: false`**."

`node_modules/sanitize-html/index.js:505`:
```js
const abstractSyntaxTree = postcssParse(name + ' {' + value + '}', { map: false });
```

`map: false` is passed explicitly. Source-map auto-loading — the entire vulnerable code path — is disabled.

**Reason 2 — the call site is unreachable with this configuration.**

That `postcssParse` call sits inside `if (a === 'style') { if (options.parseStyleAttributes) {…} }`. In `lib/messages.ts:41-46`, `allowedAttributes` is:
```js
a:   ["href", "name", "title"],
img: ["src", "alt", "title", "width", "height"],
td:  ["colspan", "rowspan"],
th:  ["colspan", "rowspan"],
```
`style` is not permitted on any tag, so the branch is never entered.

**Classification:** Build only, in practice. The runtime chain exists in the graph but the vulnerable code is doubly unreachable.

**Build-time reachability:** Tailwind and autoprefixer process this repository's own CSS. No untrusted CSS is compiled.

**Category: 🔵 Ignore until Next.js upgrade.** `fixAvailable` resolves via `next@16.2.12` because Next pins postcss; it will be picked up by the Next upgrade in §3. There is no independent action worth taking.

---

### 2.7 `next@14.2.35` — the material finding

`npm audit` collapses ~21 distinct advisories into one entry. Assessed individually below.

#### 2.7.1 NOT APPLICABLE — preconditions fail (10 advisories)

| Advisory | CVSS | Precondition | Why it fails here |
|---|---|---|---|
| [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) | **8.6** | Self-hosted Node server **+** WebSocket upgrades | Vercel-hosted (advisory: *"Vercel-hosted deployments are explicitly stated as unaffected"*); no WebSocket usage |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | high | **Custom server** | No `http.createServer` anywhere |
| [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) | 7.5 | **Pages Router + i18n** | App Router; no `i18n` config |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | 5.9 | Self-hosted + `images.remotePatterns` | Vercel-hosted; **no `images` config at all** |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) | moderate | Self-hosted `next/image` disk cache | Vercel manages the image cache |
| [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) | moderate | `rewrites` configured | None configured |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | high | `rewrites` with attacker-controlled destination host | None configured |
| [GHSA-gx5p-jg67-6x7h](https://github.com/advisories/GHSA-gx5p-jg67-6x7h) | 6.1 | `beforeInteractive` script with untrusted input | Not used |
| [GHSA-ffhc-5mcf-pf4q](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q) | 4.7 | App Router **using CSP nonces** | CSP in `next.config.js` is static with `'unsafe-inline'`; no nonce |
| [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | moderate | **Edge runtime** Server Actions | No `runtime = "edge"` declared anywhere |

#### 2.7.2 MITIGATED BY EXISTING DESIGN (1 advisory)

**[GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp)** (CVE-2026-64643) — *Unauthenticated disclosure of internal Server Function endpoints.* Server Action IDs leak via public client chunks.

**Applies structurally** (App Router + `use server`), but the advisory's stated mitigation is already implemented:

> "Never assume any authentication claims at the `use cache` or `use server` boundary. **Always authenticate within the boundary.**"

Every Server Action file wraps its handlers in `withAdminAction` (`lib/actions.ts:62`), which performs auth inside the action rather than relying on page-level protection. Occurrence counts per file: approvals 6, automations 6, calendar 4, companies 5, contacts 5, messages 8, notifications 6, opportunities 10, resume-ai 3, settings 5, tasks 6.

The Resume AI actions go further, re-checking `featureEnabled("FEATURE_RESUME_AI")` *inside* the action — with a comment noting Server Actions are POST endpoints addressable by id and that a stale tab during rollback is the realistic case.

The advisory describes the issue as *"typically a recon/enumeration primitive"* rather than direct execution. **Residual risk: low.** Action IDs may be enumerated; they cannot be invoked without an authenticated admin session.

> [!NOTE]
> This is the security posture from the M9/M10 work paying off. The discipline of authenticating inside the boundary — adopted for rollback-safety reasons — happens to be the exact mitigation this advisory prescribes.

#### 2.7.3 APPLICABLE AND REACHABLE (2 advisories)

**[GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)** (CVE-2026-64641) — *Denial of Service in App Router using Server Actions*

- **Precondition:** *"Crafted requests targeting Next.js applications using App Router with at least one Server Action."*
- **This app:** 12 files, **62 exported Server Actions**, App Router. ✅ Precondition met.
- **Impact:** *"Excessive CPU usage blocking processing of further requests in the same process."*
- **Attack complexity:** low — no privileges, no user interaction.
- **Reachable in production:** **YES.** The Phase 2 CRM actions are live.
- **Workaround:** *"No workaround exists besides upgrading."*
- **Patched:** `15.5.21`, `16.2.11`. **No 14.x patch.**

**[GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf)** — *HTTP request deserialization DoS via React Server Components*

- **Precondition:** *"A specially crafted HTTP request can be sent to any App Router Server Function endpoint that, when deserialized, may trigger excessive CPU usage, out-of-memory exceptions, or server crashes."*
- **This app:** App Router with Server Functions. ✅ Precondition met.
- **Reachable in production:** **YES.**
- **Patched:** `15.0.8`, `15.1.12`, `15.2.9`, `15.3.9`, `15.4.11`, `15.5.10`, `16.0.11`, `16.1.5`. **No 14.x patch.**

Two further Server Component DoS advisories ([GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3), [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj), both CVSS 7.5) share the same precondition and remediation, and are resolved by the same upgrade.

#### 2.7.4 Cache-poisoning cluster — low, partially platform-mitigated

[GHSA-3g8h-86w9-wvmq](https://github.com/advisories/GHSA-3g8h-86w9-wvmq) (3.7), [GHSA-vfv6-92ff-j949](https://github.com/advisories/GHSA-vfv6-92ff-j949) (3.7), [GHSA-wfc6-r584-vfw7](https://github.com/advisories/GHSA-wfc6-r584-vfw7) (5.4), [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742), [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q).

Middleware exists (`matcher: ["/admin/:path*"]`), so the middleware-redirect variant is structurally in scope. Practical exposure is limited: `/admin/*` is authenticated and served dynamically (`ƒ` in the build output), so there is little cacheable surface to poison. Resolved by the same upgrade.

---

## 3. The Next.js upgrade

### 3.1 Next 14 is EOL for security

```
$ npm view next dist-tags
next-14:   14.2.35     ← the version installed; the last 14.x
backport:  15.5.22
latest:    16.2.12
```

The `next-14` maintenance tag points at the installed version. Neither applicable advisory lists a 14.x patched release. **There is no patch-level or minor-level remediation.** The only options are upgrade or accept.

### 3.2 Recommended target: `15.5.22`, not `16.2.12`

`npm audit fix --force` proposes `next@16.2.12` — **two majors**. That is more than required.

| Target | Majors | Clears both applicable advisories? | React |
|---|---|---|---|
| `15.5.22` | **1** (14→15) | ✅ Yes — patched at 15.5.21 and 15.5.10 respectively | React 19 |
| `16.2.12` | 2 (14→15→16) | ✅ Yes | React 19 |

**`15.5.22` is the correct target.** It is the `backport` tag — the actively-maintained 15 line — it clears every applicable advisory, and it halves the migration surface. Move to 16 later as routine maintenance, not as security remediation.

### 3.3 Breaking changes: 14 → 15

**1. Async request APIs — the main work.**
`cookies()`, `headers()`, `draftMode()`, and route `params` / `searchParams` became asynchronous.

Confirmed affected in this repo:
- `lib/supabase/server.ts` — `createServerSupabaseClient()` uses `cookies()`
- `lib/supabase/middleware.ts`
- Dynamic routes: `app/admin/(dashboard)/{companies,contacts,opportunities,tasks,messages}/[id]/`, `[id]/edit/`, `app/blog/[slug]/`, `app/api/admin/inquiries/[id]/…`
- List pages consuming `searchParams`

A codemod covers most of this: `npx @next/codemod@canary upgrade latest`.

**2. `fetch` no longer cached by default.** `cache: "no-store"` was the implicit default in 14 for `fetch`; 15 flips it. Low impact — data access here is Supabase client calls, not `fetch`.

**3. GET Route Handlers no longer cached by default.** Affects `app/api/*`. These are already dynamic (auth, jobs, OAuth callbacks), so this is a no-op in practice.

**4. React 19 required.** The largest *risk*, distinct from the largest *work*. Current: `react@^18.2.0`, `react-dom@^18.2.0`.

Dependencies needing React 19 compatibility verification:
| Package | Version | Risk |
|---|---|---|
| `framer-motion` | `^11.0.8` | 🔴 Highest — deep reconciler interaction; v11 predates React 19 |
| `next-themes` | `^0.3.0` | 🟡 Older major; check for a React 19 release |
| `@marsidev/react-turnstile` | `^1.5.3` | 🟡 Gates the public contact form — a break is user-visible |
| `lucide-react` | `^0.363.0` | 🟢 Low — icon components |
| `@supabase/ssr` | `^0.12.3` | 🟢 Low — not a React renderer |

**5. `next lint` / ESLint 9.** `eslint@^8` and `eslint-config-next@14.2.35` will need bumping in step.

### 3.4 Effort estimate

| Task | Estimate |
|---|---|
| Run codemod, review its diff | 1 h |
| Fix async request APIs the codemod misses | 1–2 h |
| React 19 upgrade + dependency compatibility triage | 1–3 h |
| ESLint 9 / `eslint-config-next` bump | 0.5–1 h |
| Full regression: `tsc`, `lint`, 621 tests, `build` | 0.5 h |
| Manual browser pass over admin + marketing + contact form | 1–2 h |
| Preview deploy verification | 0.5 h |
| **Total** | **6–10 hours**, realistically **one focused day** |

Add 2–4 hours if `framer-motion` requires a major bump with its own API changes.

> [!WARNING]
> **The 621 tests will not catch most upgrade breakage.** They are overwhelmingly pure-function unit tests over `lib/` — parsers, scoring, grounding, automation rules. They exercise almost none of the App Router surface: no `cookies()`, no `params`, no rendering, no Server Action invocation, no middleware. A green suite after this upgrade is **weak evidence**. The browser pass and preview deploy are the real gates.

### 3.5 Risk to the Resume AI project

| Risk | Assessment |
|---|---|
| **Merge conflict surface** | 🔴 **The main risk.** `feat/resume-ai-analysis` is 2 commits / ~6,100 lines ahead of `main` and unpushed. A Next upgrade on `main` touching every dynamic route and `lib/supabase/server.ts` would collide with an unmerged branch. |
| Resume AI core logic | 🟢 Low. The parser, ATS engine and grounding are framework-agnostic — pure TS over strings and objects. Next 15 does not touch them. |
| Resume AI Server Action | 🟡 Medium. `app/admin/(dashboard)/resume-ai/actions.ts` uses `withAdminAction` → `cookies()`. Migrates with everything else; no special handling. |
| `pdfjs-dist` worker | 🟡 Medium. The `public/` worker copy exists because webpack + SWC rejected bundler resolution. **Next 15 defaults to Turbopack for `next dev`.** The worker path must be re-verified — it should be *more* robust (it deliberately bypasses the bundler), but it is untested there. |
| Client-side parsing | 🟡 Medium. Dynamic `import("pdfjs-dist")` and `DecompressionStream` behaviour under a different bundler needs a real browser check. |
| Live AI verification | 🟢 None. Orthogonal — and it should happen **first** regardless (see §4). |

> [!IMPORTANT]
> **Do not upgrade Next.js while `feat/resume-ai-analysis` is unmerged.**
> Sequence: push the branch → verify the AI layer live → merge to `main` → *then* upgrade on a clean `main`. Upgrading first converts a routine migration into a migration plus a large conflicted merge, on a branch that currently exists on one disk with no remote.

---

## 4. Categorisation and recommendations

### 4.1 Category assignments

| # | Package | Severity | Type | Reachable in prod | **Category** |
|---|---|---|---|---|---|
| 1 | `next` — GHSA-m99w-x7hq-7vfj | high | Server / runtime | ✅ **Yes** | **Fix after Phase 3** |
| 2 | `next` — GHSA-h25m-26qc-wcjf | high | Server / runtime | ✅ **Yes** | **Fix after Phase 3** |
| 3 | `next` — GHSA-955p-x3mx-jcvp | moderate | Server / client artifacts | ⚠️ Mitigated by design | **Fix after Phase 3** |
| 4 | `next` — cache-poisoning cluster | low–moderate | Server / CDN | ⚠️ Minimal surface | **Fix after Phase 3** |
| 5 | `next` — other 10 advisories | up to 8.6 | Various | ❌ **No** | **Ignore** — preconditions unmet |
| 6 | `postcss` | high | Build (runtime path unreachable) | ❌ No | **Ignore until Next.js upgrade** |
| 7 | `brace-expansion` | high | Development | ❌ No | **Fix immediately** *(zero-cost)* |
| 8 | `js-yaml` | high | Development | ❌ No | **Fix immediately** *(zero-cost)* |
| 9 | `vitest` | **critical** | Development | ❌ **No** | **Fix after Phase 3** |
| 10 | `vite` | high | Development | ❌ No | **Fix after Phase 3** |
| 11 | `esbuild` | moderate | Development | ❌ No | **Fix after Phase 3** |

> [!NOTE]
> **Why the two reachable advisories are "Fix after Phase 3" rather than "Fix immediately."**
>
> Both are denial-of-service on an application whose sensitive surface (`/admin/*`) is authenticated, single-operator, and behind Vercel's platform DDoS mitigation. Neither permits data disclosure, privilege escalation, or code execution. The public surface is a marketing site, a blog, and a Turnstile-protected contact form.
>
> Set against that: the fix is a major-version migration that, done now, collides with an unmerged 6,100-line branch. **Rushing a framework major to mitigate an authenticated-surface DoS would trade a low-likelihood availability risk for a high-likelihood correctness risk.**
>
> This is a schedule recommendation, not a dismissal. If the exposure profile changes — public sign-up, multi-tenant users, or a real availability SLA — this reclassifies to **Fix immediately**.

### 4.2 Recommended sequence

**Now — zero-risk, non-breaking**
1. `npm audit fix` *(only when you choose to; not run)* — resolves `brace-expansion` and `js-yaml` transitively. `fixAvailable: true` for both, no major bumps. Verify the lockfile diff touches only those trees, then run `npm test` and `npm run build`.

**Before any upgrade — unrelated but higher priority**
2. `git push -u origin feat/resume-ai-analysis` — 2 unpushed commits.
3. One live AI provider run to unblock cost/latency measurement.
4. Merge to `main`.

**After Phase 3 lands — the real remediation**
5. Upgrade Next.js **14.2.35 → 15.5.22** on a clean `main`, in a dedicated branch, alone.
   - `npx @next/codemod@canary upgrade latest`
   - React 18 → 19 with dependency triage (`framer-motion` first)
   - Full regression + **browser pass** + preview deploy
   - Re-verify the pdf.js worker under Turbopack
   - This single step clears advisories 1–4 and 6.
6. `vitest@2.1.9 → 4.x` separately — clears 9, 10, 11. Dev-only, so it can be deferred indefinitely without production risk.

**Do not**
- ❌ `npm audit fix --force` — it proposes `next@16.2.12` (two majors) and `vitest@4` simultaneously, in one unreviewable diff, on a branch with uncommitted work.
- ❌ Upgrade Next.js before the Resume AI branch is merged.
- ❌ Treat "1 critical" as urgent — it is dev-only `vitest`, and not exploitable on macOS without `--api.host`.

### 4.3 Residual risk if nothing is done today

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Server Action DoS against production | Low | Medium — availability only | Requires a targeted attacker; Vercel absorbs volumetric traffic; single-operator app |
| RSC deserialization DoS | Low | Medium — availability only | Same |
| Server Action ID enumeration | Low | Low | IDs leak; invocation still requires an authenticated admin session |
| Dev-toolchain advisories | Negligible | — | Preconditions unmeetable on macOS with this config |

**Overall production risk posture: LOW**, contingent on the app remaining a single-operator authenticated admin tool with no public sign-up. That assumption is exactly what the Career Copilot productisation would break — see `docs/journal/2026-08-02-EOD.md` and the Second Brain product notes. **Revisit this assessment before any public multi-tenant launch.**

---

## Appendix A — Reproduction

```bash
npm audit --json                     # structured advisory data
npm ls brace-expansion --all         # dependency chains
npm view next dist-tags --json       # confirm 14.x is EOL
node -p "require('next/package.json').version"
grep -rln '"use server"' --include="*.ts" app lib
grep -n "postcssParse(" node_modules/sanitize-html/index.js
```

## Appendix B — Advisories read in full

GHSA-5xrq-8626-4rwp · GHSA-955p-x3mx-jcvp · GHSA-c4j6-fc7j-m34r · GHSA-m99w-x7hq-7vfj ·
GHSA-h25m-26qc-wcjf · GHSA-r28c-9q8g-f849 · GHSA-67mh-4wv8-2f99 · GHSA-mh99-v99m-4gvg ·
GHSA-52cp-r559-cp3m · GHSA-fx2h-pf6j-xcff

Remaining Next.js advisories were classified from `npm audit --json` metadata (title, CVSS, stated precondition) checked against the §1.1 configuration facts.

---

*Assessment only. No dependency, lockfile, or source file was modified.*
