const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next 14 only runs `instrumentation.ts` behind this flag; it becomes the
    // default in 15, at which point this line can be deleted.
    instrumentationHook: true,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; " +
            "img-src 'self' data: https:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self'; " +
            // *.sentry.io is the browser SDK's ingest host. Without it this CSP
            // blocks every client-side error report, and it does so silently —
            // the failure mode is an empty dashboard that reads as "no errors".
            "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://*.sentry.io; " +
            "frame-src https://challenges.cloudflare.com; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';",
        },
        {
          key: "X-Robots-Tag",
          value: "all",
        },
      ],
    },
  ],
};

/**
 * Sentry build-time wrapper.
 *
 * This is what auto-instruments Route Handlers, Server Actions, server
 * components and middleware — the wrapping happens in webpack, which is why no
 * application file imports Sentry directly and why requirement 10 ("do not
 * change unrelated files") is satisfiable at all.
 *
 * Source maps are generated, uploaded, then deleted from the build output so
 * they are never served publicly. Upload needs SENTRY_AUTH_TOKEN plus org and
 * project; without them the plugin skips upload and the build still succeeds,
 * which keeps this integration inert until it is deliberately configured.
 */
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Quiet locally; verbose in CI, where the output is actually read.
  silent: !process.env.CI,

  // Widens which client bundles get source maps, at the cost of a slower build.
  // Worth it: a minified React stack trace is close to useless.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  webpack: {
    treeshake: {
      // Strips Sentry's own debug logging from the production bundle.
      removeDebugLogging: true,
      // `tracesSampleRate` is 0, so the tracing code is dead weight in a bundle
      // this project already keeps small. Revisit together with that setting.
      removeTracing: true,
    },

    // Not opting in: this project's only cron is the M1 job drainer, which
    // already records its own health. These would be monitors nobody reads.
    automaticVercelMonitors: false,
  },

  telemetry: false,
});
