import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // DR-068: package photography (TourPackage.imageUrl) is local-asset-only
  // for now -- no external host is allowlisted, deliberately, since no
  // photo licensing/rights have been sourced yet (see CLAUDE.md Open
  // Items). Local files under /public/images/packages/ need no
  // remotePatterns entry; this is a placeholder for the day a real,
  // rights-cleared external host (e.g. a CDN) is approved.
  images: {
    remotePatterns: [],
  },
  // Security headers applied to every response (Vol. 8 §8.3, A05 Misconfiguration).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
  // DR-046: /quiz (the old package-matching quiz) and /tailor-made (the old
  // bespoke-request form) were merged into one always-bespoke entry point,
  // /plan-my-trip. Permanent redirects so any bookmarked/shared old links
  // still work; /quiz/results (the old scored-matches page) has nothing to
  // redirect to structurally (query params don't map to anything in the
  // merged flow) so it just lands on the new form too.
  // DR-049: /staff/quote-requests was removed (folded into /staff/bookings'
  // own status filter) -- redirect any bookmarked link there too.
  async redirects() {
    return [
      { source: '/quiz', destination: '/plan-my-trip', permanent: true },
      { source: '/quiz/results', destination: '/plan-my-trip', permanent: true },
      { source: '/tailor-made', destination: '/plan-my-trip', permanent: true },
      { source: '/staff/quote-requests', destination: '/staff/bookings', permanent: true },
    ];
  },
};
export default withNextIntl(nextConfig);
