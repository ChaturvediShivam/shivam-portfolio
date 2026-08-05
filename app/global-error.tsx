"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort error boundary (Phase 6 · Sprint 1).
 *
 * The route-level `error.tsx` boundaries catch failures inside a page. Nothing
 * catches a failure in a *layout* — and this app has no single root layout, so
 * each route group's `<html>` is itself unprotected. When one of those throws,
 * React unmounts the whole tree and Next renders this instead, which is why it
 * has to supply its own `<html>`/`<body>`.
 *
 * Deliberately dependency-light: no design-system imports, no fonts, no data
 * fetching. This renders exactly when the application is already broken, and a
 * boundary that can itself fail to render is not a boundary. Inline styles
 * rather than Tailwind classes for the same reason — it must survive a CSS
 * bundle that never loaded.
 *
 * `captureException` is explicit here because this is the one path the build
 * -time instrumentation does not cover: React swallows the error into the
 * boundary, so without this call it reaches neither the console nor Sentry.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0B0E14", color: "#E6E8EB", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: "32rem", margin: "0 auto", padding: "6rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.75rem" }}>Something went wrong</h1>
          <p style={{ color: "#9BA1A6", lineHeight: 1.6, marginBottom: "2rem" }}>
            An unexpected error interrupted the page. It has been reported. Reloading usually resolves it.
          </p>

          {/*
            The digest is Next's server-side hash of the real error. It is the
            only handle an operator has to correlate this screen with the Sentry
            event, so it is shown even though it means nothing to a visitor.
          */}
          {error.digest ? (
            <p style={{ color: "#6B7280", fontSize: "0.75rem", fontFamily: "ui-monospace, monospace", marginBottom: "2rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}

          {/*
            A full reload, not the `reset()` React gives us. `reset` re-renders
            the same broken tree; when the failure is in a layout that is the
            path straight back to this screen.
          */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: "#E6E8EB", color: "#0B0E14", border: 0, borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </main>
      </body>
    </html>
  );
}
