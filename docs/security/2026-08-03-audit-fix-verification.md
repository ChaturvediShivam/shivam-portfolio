# Verification Review — `npm audit fix` Pre-Execution Report

**Date:** 2026-08-03
**Reviews:** `docs/security/2026-08-03-dependency-audit.md`
**Repo:** `shivam-portfolio` @ `fcd0aaf`, branch `feat/resume-ai-analysis`
**Purpose:** adversarial re-verification of the prior assessment before any command is run
**Changes made:** **none.** Proven by checksum below.

---

## 0. Correction to the prior report

> [!WARNING]
> **I was wrong about PostCSS.**
>
> The prior report (§2.6) classified `postcss` as **"Ignore until Next.js upgrade"** and stated: *"There is no independent action worth taking."*
>
> **That is incorrect.** `npm audit fix --dry-run` shows `postcss 8.5.15 => 8.5.25`. The advisory ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)) is patched at `8.5.18`. **Plain `npm audit fix` resolves this high-severity advisory today, with no major upgrade.**

**Root cause of the error.** I trusted the `fixAvailable` field from `npm audit --json`:

```json
"postcss": { "fixAvailable": { "name": "next", "version": "16.2.12", "isSemVerMajor": true } }
```

That field is computed against the *declaring* dependency (`next` pins `postcss` at `8.4.31`, lockfile line 5931). It **does not account for the `overrides` block** in `package.json`:

```json
"overrides": { "postcss": "$postcss", "glob": "^10.4.6" }
```

`"postcss": "$postcss"` forces every postcss resolution to the direct devDependency's range `^8.5.15`. `8.5.25` satisfies that range, so npm *can* bump it independently of Next.js — which `fixAvailable` did not model.

**Transferable lesson:** when a project uses `overrides`, `fixAvailable` in `npm audit --json` is not authoritative. `npm audit fix --dry-run` is the ground truth. I should have run the dry-run before writing §2.6.

**Consequential correction:** the prior report's recommendation said `npm audit fix` *"resolves `brace-expansion` and `js-yaml`."* It actually resolves **three** advisories and changes **two production packages**. Blast radius was understated. Corrected in §4 below.

---

## 1. Advisory re-verification against upstream

### 1.1 Advisories read at source (16 of 21)

| Advisory | Prior verdict | Upstream says | Verdict now |
|---|---|---|---|
| [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) `vitest` 9.8 | Not applicable | *"The plain `vitest run` command in CI without UI exposure is **not vulnerable**."* Requires `--api.host` **or** Windows + UI/Browser Mode | ✅ **Confirmed** |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) `vite` 7.5 | Not applicable | Windows/NTFS **and** dev server exposed via `--host` | ✅ **Confirmed** |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) `esbuild` | Not applicable | *"development-server specific… does not affect production builds or CI/CD test runs"* | ✅ **Confirmed** |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) `brace-expansion` 7.5 | Dev-only, unreachable | Requires attacker-controlled input to `expand()` | ✅ **Confirmed** |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) `js-yaml` 7.5 | Dev-only, unreachable | Requires parsing malicious YAML | ✅ **Confirmed** |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) `postcss` 7.5 | *"Ignore until Next upgrade"* | Patched **8.5.18**; mitigation is explicit `map: false` | ❌ **CORRECTED** — fixable now (§0) |
| [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) `next` 8.6 | Not applicable | *"Vercel-hosted deployments are explicitly stated as unaffected"*; requires WebSocket upgrades | ✅ **Confirmed** |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) `next` high | Not applicable | *"Managed hosting pins the host upstream and is not affected; `next start` and standalone output do the same from version 14.2 onward"* | ✅ **Confirmed** (doubly — Vercel *and* 14.2+) |
| [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) `next` 7.5 | Not applicable | Requires Pages Router **AND** i18n. *"App Router applications without i18n are not affected"* | ✅ **Confirmed** |
| [GHSA-h64f-5h5j-jqjh](https://github.com/advisories/GHSA-h64f-5h5j-jqjh) `next` 5.9 | Not applicable *(hedged)* | *"**If you are using Vercel, you are NOT impacted.**"* Self-hosted default loader only | ✅ **Confirmed** — hedge removed |
| [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) `next` | Mitigated by design | *"Always authenticate within the boundary"* — implemented via `withAdminAction` | ✅ **Confirmed** |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) `next` high | **Applicable** | *"No workaround exists besides upgrading."* Patched 15.5.21 / 16.2.11 | ✅ **Confirmed applicable** |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) `next` 7.5 | **Applicable** | Any App Router Server Function endpoint. No 14.x patch | ✅ **Confirmed applicable** |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) `next` 7.5 | Applicable *(assumed same as m99w)* | **Broader than assumed:** *"any App Router Server Function endpoint,"* not exclusively Server Actions. Patched 15.5.15 / 16.2.3. Explicitly *"does not list a patch version for 14.x"* | ⚠️ **Confirmed applicable, scope widened** |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) `brace-expansion` | Dev-only | Same package/chain as GHSA-mh99 | ✅ **Confirmed** |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) `next` 5.9 | Not applicable | Title itself scopes to *"self-hosted applications"*; no `images` config here | ✅ **Confirmed** |

### 1.2 Advisories still classified from metadata (5 of 21)

Honest disclosure — these were **not** individually fetched. All five are in the Next.js bundle, all are `low`/`moderate`, and **all are remediated by the same upgrade**, so individual verification would not change any decision:

`GHSA-ggv3-7p47-pfv8` (rewrites smuggling) · `GHSA-p9j2-gv94-2wf4` (rewrites SSRF) · `GHSA-3x4c-7xq6-9pq8` (image disk cache) · `GHSA-vfv6-92ff-j949` + `GHSA-wfc6-r584-vfw7` + `GHSA-68g3-v927-f742` + `GHSA-4633-3j49-mh5q` (cache poisoning/confusion) · `GHSA-4c39-4ccg-62r3` (Edge Server Action payload) · `GHSA-gx5p-jg67-6x7h` (beforeInteractive XSS) · `GHSA-3g8h-86w9-wvmq` (middleware redirect cache poison).

Configuration facts that render most of them moot are independently verified: no `rewrites`, no `images` config, no Edge runtime, no `beforeInteractive`.

> [!NOTE]
> **Net effect of re-verification on the Next.js conclusion: none.** Every "not applicable" that I re-checked was confirmed by upstream text, several more strongly than before. The two applicable DoS advisories remain applicable, and `GHSA-q4gf` is slightly broader in scope than I wrote (Server Functions, not just Server Actions) — which strengthens rather than weakens the case for the eventual upgrade.

### 1.3 Next.js 14 EOL — re-confirmed across every advisory checked

| Advisory | Patched versions | 14.x patch? |
|---|---|---|
| GHSA-m99w-x7hq-7vfj | 15.5.21, 16.2.11 | ❌ None |
| GHSA-h25m-26qc-wcjf | 15.0.8 … 15.5.10, 16.0.11, 16.1.5 | ❌ None |
| GHSA-q4gf-8mx6-v5v3 | 15.5.15, 16.2.3 | ❌ None |
| GHSA-89xv-2m56-2m9x | 15.5.21, 16.2.11 | ❌ None |
| GHSA-36qx-fr4f-26g5 | 15.5.16, 16.2.5 | ❌ None |
| GHSA-h64f-5h5j-jqjh | 15.5.16, 16.2.5 | ❌ None |

`npm view next dist-tags` → `next-14: 14.2.35` (the installed version). **Six independent advisories, zero 14.x patches.** The 14 line is closed. Target `15.5.22` remains correct.

---

## 2. Production dependency re-check

**Question:** was any production dependency accidentally classified as dev-only?

**Definitive test** — `npm ls <pkg> --omit=dev` resolves the production tree only. An empty result is proof of dev-only status, stronger than reading the full tree.

| Package | `--omit=dev` result | Prior classification | Verdict |
|---|---|---|---|
| `brace-expansion` | `└── (empty)` | Development only | ✅ Correct |
| `js-yaml` | `└── (empty)` | Development only | ✅ Correct |
| `esbuild` | `└── (empty)` | Development only | ✅ Correct |
| `vite` | `└── (empty)` | Development only | ✅ Correct |
| `vitest` | `└── (empty)` | Development only | ✅ Correct |
| `postcss` | **PRESENT** via `next` **and** `sanitize-html` | *"Build only, in practice"* | ✅ Correctly identified as production |
| `nanoid` | **PRESENT** via `next → postcss` | ⚠️ **Never mentioned** | ❌ **Gap in prior report** |

> [!IMPORTANT]
> **No production dependency was misclassified as dev-only.** All five dev-only calls are proven correct.
>
> **But there is a gap:** `nanoid` is a production transitive dependency (`next → postcss → nanoid`) that `npm audit fix` will change, and the prior report never mentioned it. It appears in no advisory — it moves only because bumping `postcss` re-resolves its dependency. Documented in §3.

**PostCSS runtime reachability — re-verified, unchanged.** The `sanitize-html` path remains unreachable for two independent reasons, both confirmed in source:
1. `node_modules/sanitize-html/index.js:505` passes `{ map: false }` — the advisory's own stated mitigation.
2. `lib/messages.ts:41-46` omits `style` from `allowedAttributes`, so the `if (a === 'style')` branch is never entered.

---

## 3. What `npm audit fix` will actually do

### 3.1 Will it modify `package.json`? **No.**

Evidence — checksums taken before and after `npm audit fix --dry-run`:

```
BEFORE  e5c8bb95a27e40292d71bd6967f512002f49c2e61672d537f7f6136ec78e576a  package.json
        1341d410e8766fbeabde3f3afbf533097876a61eeda6d29370c7d273cccedff5  package-lock.json

AFTER   e5c8bb95a27e40292d71bd6967f512002f49c2e61672d537f7f6136ec78e576a  package.json
        1341d410e8766fbeabde3f3afbf533097876a61eeda6d29370c7d273cccedff5  package-lock.json
```

**Byte-identical.** `git diff --stat package.json package-lock.json` → empty.

Reasoning as well as evidence: every change is a **transitive** resolution inside existing semver ranges. No direct dependency's declared range needs to move, so npm has no reason to touch the manifest. Specifically:

- `postcss` direct devDependency is `^8.5.15`; the fix installs `8.5.25` — **in range**.
- The `overrides` block does not need to change; `"postcss": "$postcss"` already permits `8.5.25`.
- The `glob: "^10.4.6"` override is unaffected — `brace-expansion` moves *beneath* `glob`, not `glob` itself.

> [!NOTE]
> `npm audit fix` **would** modify `package.json` if a fix required bumping a direct dependency's major. That is what `--force` does. It is not the case here — hence the dry-run shows zero manifest churn.

### 3.2 Exactly which packages change

| # | Package | From → To | Tree | Advisory cleared |
|---|---|---|---|---|
| 1 | `postcss` | `8.5.15` → `8.5.25` | **PRODUCTION** (runtime via `sanitize-html`; build via `next`, `tailwindcss`, `autoprefixer`) | GHSA-r28c-9q8g-f849 (high) |
| 2 | `nanoid` | `3.3.12` → `3.3.16` | **PRODUCTION** (transitive under `postcss`) | *none — collateral re-resolution* |
| 3 | `js-yaml` | `4.2.0` → `4.3.1` | dev (`eslint`) | GHSA-52cp-r559-cp3m (high) |
| 4 | `brace-expansion` | `2.1.1` → `2.1.4` | dev (`@next/eslint-plugin-next → glob → minimatch`) | GHSA-mh99 / GHSA-3jxr (high) |
| 5 | `brace-expansion` | `1.1.15` → `1.1.18` | dev (`eslint → minimatch`) | same |
| 6 | `brace-expansion` | `5.0.6` → `5.0.9` | dev (`@typescript-eslint → minimatch`) | same |

**Six packages. Two are production. All six are patch-level bumps within the same minor.**

### 3.3 Post-fix resolution — computed, not trusted

> [!WARNING]
> `npm audit fix --dry-run` re-prints *"9 vulnerabilities (3 moderate, 5 high, 1 critical)"* **after** listing its changes. That trailing report is the **pre-fix** state — npm does not recompute the audit against the simulated tree. Taking it at face value would wrongly suggest the fix achieves nothing.

Resolution verified by version-range arithmetic instead:

```
brace-expansion  1.1.15 -> 1.1.18   vuln:<=1.1.16     patched>=1.1.17   RESOLVED
brace-expansion  2.1.1  -> 2.1.4    vuln:2.0.0-2.1.2  patched>=2.1.3    RESOLVED
brace-expansion  5.0.6  -> 5.0.9    vuln:3.0.0-5.0.7  patched>=5.0.8    RESOLVED
js-yaml          4.2.0  -> 4.3.1    vuln:4.0.0-4.2.1  patched>=4.3.0    RESOLVED
postcss          8.5.15 -> 8.5.25   vuln:<=8.5.17     patched>=8.5.18   RESOLVED
```

**Expected state after the fix:**

| | Before | After |
|---|---|---|
| Total advisories | 9 | **6** |
| Critical | 1 | 1 *(`vitest`, dev-only, not applicable)* |
| High | 5 | **2** *(`vite` dev-only; `next`)* |
| Moderate | 3 | 3 *(all dev-only vitest chain)* |
| **High-severity advisories cleared** | — | **3** |

Cross-check: 9 entries − 3 resolved (`brace-expansion`, `js-yaml`, `postcss`) = 6 remaining (`esbuild`, `vite`, `@vitest/mocker`, `vite-node`, `vitest`, `next`). Consistent.

### 3.4 Estimated git diff size

Lockfile entries touched (`grep -c '"node_modules/…": {'`):

| Package | Entries | Lockfile lines |
|---|---|---|
| `postcss` | 1 | 6384 |
| `nanoid` | 1 | 5879 |
| `js-yaml` | 1 | 5551 |
| `brace-expansion` | 3 | 2118, 3069, 4781 |
| **Total** | **6 entries** | |

Each lockfile v3 entry changes exactly three lines — `version`, `resolved`, `integrity`:

```
-      "version": "4.2.0",
-      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.2.0.tgz",
-      "integrity": "sha512-ePWsvanv0DWuDRsW8dnt+…",
+      "version": "4.3.1",
+      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.1.tgz",
+      "integrity": "sha512-…",
```

**Estimate:**

```
 package.json      |  0 lines            (unchanged — proven, §3.1)
 package-lock.json | ~36-48 lines changed (~18-24 +, ~18-24 -)
 1 file changed
```

Base case is 6 entries × 3 lines = **18 changed lines → ~36 diff lines**. Upper bound ~48 if any bumped package altered its own `dependencies` or `engines` block (possible for `brace-expansion` 5.x, which restructured its `balanced-match` dependency across majors).

**A diff materially larger than ~50 lines, or any change to `package.json`, means something unexpected happened — stop and inspect rather than commit.**

---

## 4. Test flakiness analysis

**Question:** could any of the 621 tests become flaky after the fix?

### 4.1 Is the test runner itself changed? **No.**

`vitest`, `vite`, `@vitest/mocker`, `vite-node` and `esbuild` are **not in the change set** — their fixes require `--force`. The execution engine, transform pipeline and module resolution are **bit-identical** after the fix. This alone eliminates the main source of test-suite flakiness.

### 4.2 Are the changed packages in any test's import graph? **No.**

| Check | Result |
|---|---|
| Tests importing `postcss` / `nanoid` / `js-yaml` / `brace-expansion` | **None** |
| Tests exercising `sanitizeMessageHtml` (the only runtime postcss path) | **None** |
| `test/ai/retrieval.test.ts` — the one file referencing `@/lib/messages` | **Mocks it entirely**: `vi.mock("@/lib/messages", () => ({ listMessages: vi.fn() }))` — the real module, and therefore `sanitize-html` and `postcss`, is never loaded |
| Snapshot tests (`.snap` / `__snapshots__`) | **None** — no serialized output to drift |
| `vitest.config.ts` | Minimal: `environment: "node"`, `include`, and two path aliases (`@`, `server-only` stub). Nothing version-sensitive |
| Tests depending on ESLint | **None** — lint is a separate script |

### 4.3 Flakiness verdict

| Source of flake | Risk |
|---|---|
| Test runner behaviour change | 🟢 **None** — vitest/vite/esbuild unchanged |
| Changed package in test import graph | 🟢 **None** — verified absent |
| Snapshot drift | 🟢 **None** — no snapshots |
| Timing/async sensitivity | 🟢 **None** — suite is pure functions, 431 ms of actual test time |
| Semver risk in changed packages | 🟢 **Very low** — all six are patch-level within the same minor |

**Conclusion: flake risk is effectively nil.** The suite is 39 files of pure-function unit tests over `lib/`, running on an unchanged runner, importing none of the six changed packages.

> [!NOTE]
> **What the tests will *not* prove.** A green suite after this fix confirms nothing about `postcss@8.5.25` in production, because no test loads it. The meaningful verification for the two production changes is `npm run build` (exercises postcss via Tailwind/autoprefixer/Next) — not `npm test`. Run both; weight the build.

---

## 5. Residual concerns

Stated plainly rather than buried:

1. **`postcss` and `nanoid` are production packages.** This is not a dev-only change, as the prior report implied. Both are patch-level bumps in actively maintained packages, and postcss is exercised at build time on every deploy — so a regression would surface immediately in `npm run build`, not silently in production. Risk is low but not zero.
2. **The working tree is dirty.** Five modified `lib/ai-analysis/prompts/*.ts` files are uncommitted. A lockfile change lands beside them. Prefer committing or stashing the prompt changes first so the lockfile diff is reviewable in isolation.
3. **The branch is still unpushed.** 2 commits, ~6,100 lines, no remote. Unrelated to this fix, and still the highest-priority item in the repo.
4. **Five Next.js advisories were classified from metadata, not read at source** (§1.2). All are low/moderate and all resolve via the same upgrade, so this does not affect any decision — but it is not the same standard of evidence as the other sixteen.
5. **This clears 3 of 9 advisories, not all of them.** The audit will still report 6 afterwards, including a "critical" that is `vitest` and does not apply here. Do not read the remaining count as a failure of the fix.

---

## 6. Verification checklist

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Every advisory re-verified upstream? | 16 of 21 read at source; 5 low/moderate Next.js entries from metadata (disclosed) | §1.1, §1.2 |
| 2 | Any production dep misclassified as dev-only? | **No.** All 5 dev-only calls proven via `--omit=dev` empty trees. Gap found: `nanoid` unmentioned | §2 |
| 3 | Will `npm audit fix` modify `package.json`? | **No.** Checksum identical before/after dry-run; all changes in-range transitive | §3.1 |
| 4 | Exactly which packages change? | 6: `postcss`, `nanoid` (production); `js-yaml`, `brace-expansion` ×3 (dev) | §3.2 |
| 5 | Estimated diff size? | `package.json` 0 lines; `package-lock.json` ~36–48 diff lines across 6 entries | §3.4 |
| 6 | Could tests become flaky? | **No.** Runner unchanged; no changed package in any test's import graph; no snapshots | §4 |
| 7 | Prior conclusions upheld? | **One material correction** — postcss is fixable now (§0). All others confirmed, several strengthened | §0, §1 |

---

## 7. Recommendation

All three high-severity advisories cleared by this operation are in packages that are either dev-only or unreachable in production, so this is **hygiene, not incident response**. But it is free hygiene: no manifest change, six patch-level bumps, a ~40-line lockfile diff, no test-runner change, and it removes three advisories that would otherwise mask a genuinely new finding in future audits.

**I recommend running `npm audit fix`.**

Suggested procedure:

```bash
git stash push -m "wip: prompt token ceilings" lib/ai-analysis/prompts/   # isolate the diff
npm audit fix
git diff --stat                    # expect: package-lock.json only, ~36-48 lines
git diff package.json              # expect: empty
npm run typecheck && npm test      # expect: clean, 621/621
npm run build                      # THE meaningful gate — exercises postcss
npm audit                          # expect: 6 remaining, all dev-only except next
git stash pop
```

Commit the lockfile on its own, separate from the prompt changes.

**Still do not run:** `npm audit fix --force` — it pulls `next@16.2.12` (two majors) and `vitest@4` in one unreviewable diff. The Next.js upgrade remains a separate, post-merge exercise targeting **15.5.22**, per §3 of the prior report.

---

*Verification only. No file was modified; no fix was executed. `package.json` and `package-lock.json` checksums are unchanged from the start of this review.*
