# Public demo — launch runbook

Operational notes for `/demo`. Read before enabling it in production.

The demo is **off by default**. Nothing below happens until `FEATURE_PUBLIC_DEMO=true`
is set on the deployment.

---

## 1. Required production environment variables

| Variable | Class | Notes |
| --- | --- | --- |
| `FEATURE_PUBLIC_DEMO` | flag | `true` to enable. Absent or anything else = off. |
| `FEATURE_AI` | flag | `false` keeps the demo scoring-only and free. |
| `FEATURE_RESUME_AI` | flag | Both AI flags must be `true` for a review. |
| `DEMO_OWNER_ID` | server config | UUID of the dedicated non-admin Supabase user that owns demo budget, audit and throttle rows. **Required** — `ai_usage_counters.owner_id` is a foreign key into `auth.users`. |
| `DEMO_IP_SALT` | **secret** | Salt for hashing visitor addresses. Rotating it resets every visitor's window. |
| `AI_DEMO_DAILY_TOKEN_BUDGET` | server config | Demo-only ceiling. Defaults to 50,000 if unset — never unlimited. |
| `AI_DAILY_TOKEN_BUDGET` | server config | The **operator's** ceiling. Separate from the demo's on purpose. |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | **secret** | Required. Without it every request is refused. |
| `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` | public | Inlined into client JS at **build** time — set it before building, not after. |
| `AI_PROVIDER_API_KEY` | **secret** | Only needed when AI is on. |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Already required by the app. |

## 2. Which are secrets

`DEMO_IP_SALT`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`, `AI_PROVIDER_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Set these in the Vercel dashboard only.

`DEMO_OWNER_ID` is not a credential but is still server-only — it identifies whose
budget is being spent, and there is no reason for a browser to see it.

## 3. Enable the public demo

1. Confirm the demo user exists in Supabase and is **not** in `ADMIN_SIGNUP_ALLOWLIST`.
2. Set every variable in §1 on the deployment.
3. Set `FEATURE_PUBLIC_DEMO=true`.
4. Redeploy **if** you changed `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` — that one
   is baked in at build time. Every other variable is read per request.

## 4. Enable AI intentionally

Set `FEATURE_AI=true` **and** `FEATURE_RESUME_AI=true`, plus `AI_PROVIDER_API_KEY`.
Confirm `AI_DEMO_DAILY_TOKEN_BUDGET` is a number you are willing to spend daily.

## 5. Keep AI disabled

Set `FEATURE_AI=false`. The demo still works: scoring is arithmetic over text and
never calls a provider. Visitors see the score plus
"AI review is temporarily unavailable."

## 6. Budget and capacity

- Ceiling: **50,000 tokens/day** (`AI_DEMO_DAILY_TOKEN_BUDGET`).
- Measured: **~7,000 tokens and ~$0.053 per analysis** (T11, seven live calls).
- So roughly **7 AI analyses per day**, then the demo degrades to scoring-only
  until midnight UTC.
- The ceiling is enforced **atomically** inside `ai_reserve_budget`, so concurrent
  visitors cannot overshoot it.
- Deterministic scoring is unlimited and free.

**If you expect a traffic spike, raise the number before launch, not during.**

## 7. Verify a deployment

```bash
curl -s https://<host>/demo | grep -o "Analyze resume\|not available right now"
```

Then in a browser: the challenge should resolve within a few seconds, the
Analyze button should become enabled, and a click should return a score.

## 8. Disable immediately

Set `FEATURE_PUBLIC_DEMO=false`. It takes effect on the next request — no
redeploy, no rebuild. This is the first-line rollback for abuse or unexpected
spend.

## 9. Telemetry

One JSON line per outcome on stdout, prefixed `[demo:event]`. Filter for that
prefix in Vercel logs.

| Event | Meaning |
| --- | --- |
| `demo_disabled` | Flag is off. Someone is still hitting the route. |
| `demo_unconfigured` | Flag on but `DEMO_OWNER_ID` or `DEMO_IP_SALT` missing. **Operator error — fix it.** |
| `verification_failed` | Turnstile refused. Bursts suggest scripted traffic. |
| `rate_limited` | A visitor used their 3/hour. |
| `invalid_input` | Resume or job description rejected by validation. |
| `analysis_ok` | Success. Carries `score`, `sample`, `ms`. |
| `ai_unavailable` | Scored, no review. `reason`: `budget` \| `flag_off` \| `provider_error` \| `ungradeable`. |
| `provider_failed` | The provider call itself failed. |
| `internal_error` | An unexpected throw, already scrubbed before the visitor saw it. |

Events carry counts and enum reasons only — never resume text, job description,
address, token or key.

## 10. If AI fails

Check `ai_unavailable`'s `reason`:

- `budget` — the daily ceiling is spent. Expected after ~7 analyses. Raise
  `AI_DEMO_DAILY_TOKEN_BUDGET` or wait.
- `flag_off` — `FEATURE_AI` or `FEATURE_RESUME_AI` is not `true`.
- `provider_error` — the provider is down or the key is wrong. Check Sentry.
- `ungradeable` — the model replied with something that failed schema validation.
  Harmless in isolation; a sustained run of them is a prompt problem.

The score keeps working in all four cases. AI failure is never a demo outage.

## 11. Never commit

`.env.local`, any real key or salt, the demo user's password, service-role
credentials. `.env.local` is gitignored; `.env.example` holds placeholders only
and is asserted by tests to contain no real secret.

## 12. Known limitations

- `x-forwarded-for` is forgeable. The per-visitor limit is a speed bump, not
  authentication. The atomic budget is the real spend bound.
- Verified in Chromium only.
- Telemetry is stdout — no dashboard, no alerting.
