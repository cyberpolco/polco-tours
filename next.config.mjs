import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // DR-182 incident: staff uploading a package image straight from a phone
  // camera (routinely 2-8MB, unlike a pre-resized desktop file) kept
  // crashing before their Server Action (updatePackageAction/
  // createPackageAction) even started running -- Next.js's own default
  // Server Action body-size cap is 1MB, enforced in its own request-parsing
  // layer, so no amount of try/catch inside those actions could ever have
  // caught it (confirmed only after this incident recurred post-DR-174's
  // ZodError fix, which addressed a real but different gap). Raised to 4MB,
  // just under Vercel's own ~4.5MB hard platform ceiling for a serverless
  // function's request body (see the DR-163 tech-stack note on why hero
  // video upload bypasses this entirely via a direct-to-Blob client
  // upload instead) -- that platform ceiling itself can't be configured
  // away here, so a single photo pushing 4-5MB (or 3 photos combined) can
  // still fail; a durable full fix would move package images to the same
  // direct-to-Blob client-upload pattern DR-163 already uses for video.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // DR-071 allowlists Vercel Blob's public-storage host so next/image can
  // render images uploaded through the content module's uploadImage
  // primitive -- staff-uploaded/staff-controlled content (a SUPERADMIN
  // choosing what to upload), not third-party/scraped photography, so it
  // doesn't reopen the "no unlicensed photography" concern DR-068/069 were
  // guarding against. DR-114 reuses this same Blob upload path (and
  // therefore the same host) for TourPackage.imageUrl -- staff pick a file
  // via catalogService.uploadPackageImage instead of pasting a URL, gated
  // by catalog.write rather than content's SUPERADMIN-only gate. No further
  // remotePatterns entry needed since it's the identical Blob host.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
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
  // DR-163: `sharp` (public-image-blob.ts) is server-only, but is
  // structurally reachable from a client bundle -- catalogService/
  // insightsService are each one big exported object literal, so
  // webpack can't tree-shake out the one method (uploadPackageImage)
  // that pulls it in, even though InsightsDashboardClient.tsx (a 'use
  // client' file, via @modules/insights -> @modules/catalog) never
  // actually calls it. `sharp`'s own dependencies (`detect-libc`,
  // `libvips.js`) need Node builtins (`child_process`/`fs`) that have no
  // browser polyfill, so the client webpack build fails outright without
  // this. Aliasing to `false` for the client compiler pass only stubs it
  // out to an empty module -- safe, since nothing in a client bundle ever
  // actually calls sharp-dependent code.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.sharp = false;
    }
    return config;
  },
};
export default withNextIntl(nextConfig);
