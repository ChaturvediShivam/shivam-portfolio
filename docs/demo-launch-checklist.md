# Public demo — launch checklist

Tick these in order. Detail and troubleshooting live in
[`demo-launch-runbook.md`](./demo-launch-runbook.md).

The demo is **off by default**. Nothing here happens until you set
`FEATURE_PUBLIC_DEMO=true` on the deployment.

---

## Pre-deploy

- [ ] Production Turnstile **site** key configured (`NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`)
- [ ] Production Turnstile **secret** configured (`CLOUDFLARE_TURNSTILE_SECRET_KEY`)
- [ ] `FEATURE_PUBLIC_DEMO` deliberately chosen
- [ ] `FEATURE_AI` deliberately chosen (and `FEATURE_RESUME_AI` — the review needs both)
- [ ] AI provider configured if AI is enabled (`AI_PROVIDER_API_KEY`, `AI_PROVIDER`, `AI_MODEL_REASONING`)
- [ ] AI budget reviewed — default **50,000 tokens/day ≈ 7 analyses**
- [ ] `DEMO_OWNER_ID` configured (dedicated non-admin Supabase user, **not** in `ADMIN_SIGNUP_ALLOWLIST`)
- [ ] `DEMO_IP_SALT` configured
- [ ] Secrets stored only in the deployment environment, never in the repo
- [ ] `git status` clean; no secret committed

> **The site key is inlined at build time.** Set it *before* building. Every
> other variable is read per request.

## Deploy

- [ ] `npm run build` succeeds
- [ ] Deployment succeeds
- [ ] `/demo` loads
- [ ] Feature flag behaves: `false` → "not available right now"; `true` → the workspace
- [ ] Turnstile widget resolves and the Analyze button becomes enabled
- [ ] Deterministic analysis returns a score
- [ ] AI path verified **only if** AI was intentionally enabled

## Post-deploy

- [ ] No browser console errors (`/_vercel/insights` 404s are local-only)
- [ ] No secret leakage — check the HTML and JS responses
- [ ] Telemetry visible: filter logs for `[demo:event]`
- [ ] Demo budget behaving: `ai_unavailable` with `reason: "budget"` after roughly 7 analyses is expected, not a fault
- [ ] Provider spend checked against `ai_usage_counters` for `DEMO_OWNER_ID`
- [ ] Rollback procedure known (below)

## Emergency — disable the demo

- [ ] Set `FEATURE_PUBLIC_DEMO=false`
- [ ] Redeploy (or update the env var — it is read per request, so no rebuild is needed)
- [ ] Confirm `/demo` shows "not available right now"

This is the first-line rollback for abuse or unexpected spend. It takes effect
on the next request and needs no code change.

---

## Quick verification

```bash
# Flag state, from outside
curl -s https://<host>/demo | grep -o "Analyze resume\|not available right now"

# Demo spend today
# -> ai_usage_counters where owner_id = DEMO_OWNER_ID
```

## What NOT to do at launch

- Do not enable `E2E_REAL_AI` in CI — it spends real provider budget per run.
- Do not raise the budget mid-incident. Disable the demo first, then decide.
- Do not put real credentials in `.env.example` or in any document.
