# ADR-011: Server-side HTML sanitization for message rendering

- **Status:** Accepted (implemented, v1.0.0 — M5 Messages)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [API Reference](../API_REFERENCE.md) · [System Architecture](../SYSTEM_ARCHITECTURE.md)

## Context
The Messages viewer renders `messages.body_html` — untrusted third-party email
HTML. Rendering it unsafely is a direct XSS vector. This was the one place a new
dependency was warranted despite the project's minimal-dependency stance.

## Decision
Sanitize `body_html` **server-side** with **`sanitize-html`** (a Node/server-only
library) using a strict tag/attribute allowlist — no `script`/`style`/`iframe`/
event handlers; schemes limited to `http`/`https`/`mailto` (+`data:` for `img`);
links rewritten to `rel="noopener noreferrer nofollow" target="_blank"`. The
client `MessageBody` component receives an **already-safe string** and never
sanitizes; the only `dangerouslySetInnerHTML` consumes server-sanitized HTML, with
a plain-text toggle as the safe default.

## Alternatives Considered
- **Render raw HTML:** unacceptable XSS risk.
- **Plain text only (no HTML view):** safe but poor UX for real email.
- **Client-side DOMPurify:** ships a sanitizer to the client; sanitizing on the
  trusted server is stronger and keeps the client dumb.
- **Hand-rolled sanitizer:** exactly what security guidance warns against.

## Pros
- Robust, well-tested XSS defense; sanitization on the trusted boundary.
- Client never handles unsafe HTML.
- Text/HTML toggle gives a safe fallback.

## Cons
- One added dependency (`sanitize-html` + types).
- Allowlist must be maintained; remote images allowed (tracking-pixel consideration).
- Server CPU for large emails.

## Consequences
- `lib/messages.sanitizeMessageHtml` is the single sanitization point (`server-only`).
- Dependency added deliberately, documented, and justified by the security need.

## Future Impact
- Same sanitizer covers AI-summarized/quoted content and future providers; blocking
  remote images by default is a possible hardening.
