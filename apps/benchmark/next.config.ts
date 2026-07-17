import type { NextConfig } from "next";

const scriptSources =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
        source: "/api/:path*",
      },
      {
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' https: data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; ${scriptSources}`,
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/(.*)",
      },
    ];
  },
  typedRoutes: true,
};

export default nextConfig;
