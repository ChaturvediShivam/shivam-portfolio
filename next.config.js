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
          key: "Content-Security-Policy",
          value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        },
      ],
    },
  ],
};

module.exports = nextConfig;
