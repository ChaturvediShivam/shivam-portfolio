/** @type {import('next').NextConfig} */
const nextConfig = {
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
            "connect-src 'self' https://challenges.cloudflare.com; " +
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

module.exports = nextConfig;
