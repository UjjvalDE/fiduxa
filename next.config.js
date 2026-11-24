/** @type {import('next').NextConfig} */
// In development the browser calls /api/v1/* on the Next.js origin and Next
// proxies it to the Express API – no CORS setup needed.
// In production set NEXT_PUBLIC_API_URL to the public API URL instead
// (e.g. https://api.fiduxa.de/api/v1) or keep the proxy via API_PROXY_TARGET.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3100';

// Security headers for every page (a strict CSP needs nonce support for the
// inline scripts in app/layout.tsx – see the audit report).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
