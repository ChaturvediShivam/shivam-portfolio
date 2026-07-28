# ADR-004: Google OAuth with PKCE and encrypted token storage

- **Status:** Accepted (planned — Phase 3, M2)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md#10-oauth-flow) · [Runbook · OAuth Recovery](../../operations/RUNBOOK.md)

## Context
Phase 3 must connect the user's Gmail (and Calendar) to sync mail and act on their
behalf. This requires obtaining and safely storing third-party OAuth tokens.

## Decision
Use the **OAuth 2.0 Authorization Code flow with PKCE + `state`** (CSRF), request
**least-privilege scopes** per capability, and store **encrypted** access/refresh
tokens in the existing `integration_accounts.*_encrypted` columns (Supabase
Vault/pgsodium preferred; app-layer AES-GCM fallback). Tokens are decrypted only
in a single `server-only` module; adapters refresh on expiry and mark accounts
`status='error'` on refresh failure (prompting reconnect). Disconnect revokes at
Google and soft-deletes the account.

## Alternatives Considered
- **Store tokens plaintext:** unacceptable security risk.
- **Delegate to a third-party integration service:** less control, added dependency/cost.
- **Implicit flow / no PKCE:** deprecated, weaker security.

## Pros
- Standard, secure flow; encryption at rest; least privilege limits blast radius.
- Reuses Phase-1 schema columns — additive only.
- Clean recovery model (refresh → reconnect).

## Cons
- Google OAuth app **verification** for restricted scopes has lead time.
- Encryption-key rotation requires re-encrypting stored tokens (dual-key backfill).
- Refresh-token lifecycle edge cases (revocation, expiry) must be handled.

## Consequences
- New env vars: `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- `oauth_states` (or signed cookie) for CSRF; connect/callback route handlers.
- Key rotation is a documented Runbook procedure with a warning.

## Future Impact
- The same flow generalizes to additional providers (ADR-007); enables Gmail send
  (with approval, ADR-006) and Calendar writes.
