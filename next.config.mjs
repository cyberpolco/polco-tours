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
  // then to 4.5MB (DR-216, same recurrence for the guest passport-upload
  // Server Action, (guest)/booking/[bookingId]/passport/actions.ts -- a
  // mobile scan/camera-to-PDF app routinely produces a 5-15MB file, well
  // past the old 4MB cap) -- this is Vercel's own hard platform ceiling for
  // a serverless function's request body (see the DR-163 tech-stack note on
  // why hero video upload bypasses this entirely via a direct-to-Blob
  // client upload instead), so it can't be configured any higher here.
  // This is a global setting (every Server Action in the app shares it), so
  // raising it also helps package images the same way. Explicitly a partial
  // fix, not a durable one: documents/domain.ts's own
  // MAX_PASSPORT_SIZE_BYTES already allows up to 10MB, and a passport scan
  // above ~4.5MB will still fail here exactly as before -- a durable fix
  // would move passport (and package image) upload to the same
  // direct-to-Blob client-upload pattern DR-163 already uses for video,
  // which bypasses this platform ceiling entirely.
  experimental: {
    serverActions: {
      bodySizeLimit: '4.5mb',
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
    // AVIF first (smaller than WebP at equivalent quality on photos), WebP
    // as the fallback for browsers that can't decode AVIF -- next/image
    // already negotiates via the request's Accept header, this just adds
    // AVIF to the set it's allowed to pick from (was WebP-only, Next's
    // built-in default).
    formats: ['image/avif', 'image/webp'],
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
      // SEO: production answers on 3 live hostnames today (the Vercel
      // default domain, the bare custom domain, and its www variant) --
      // left unconsolidated, that's duplicate content across 3 URLs per
      // page. mufasasafaris.com (no www) is already the de facto canonical
      // host every other absolute-URL consumer in this app hardcodes
      // (hero-opengraph.tsx, notifications/email-template.ts, sitemap.ts/
      // robots.ts), so a host-based 301 collapses the other two onto it.
      // `has: [{ type: 'host', ... }]` only matches a request that actually
      // arrives with that Host header, so a request to the canonical host
      // itself never matches these and there's no redirect loop.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.mufasasafaris.com' }],
        destination: 'https://mufasasafaris.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'polco-tours.vercel.app' }],
        destination: 'https://mufasasafaris.com/:path*',
        permanent: true,
      },
      // c63012f renamed these 2 homepage hero carousel images to .webp --
      // no code references the old .png paths any more, but a browser/CDN/
      // crawler still holding pre-deploy cached HTML keeps requesting them.
      // Without this, that 404 falls through to a full serverless render of
      // the not-found boundary (real production incident, 2026-09-08: this
      // was hit repeatedly enough to help exhaust the Hobby plan's monthly
      // Active CPU allowance) -- a config-level redirect resolves it in the
      // routing layer instead, before any rendering happens.
      { source: '/images/hero/sossusvlei.png', destination: '/images/hero/sossusvlei.webp', permanent: true },
      { source: '/images/hero/victoria-falls.png', destination: '/images/hero/victoria-falls.webp', permanent: true },
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
  //
  // DR-229: same class of problem, same fix -- src/lib/trusted-user-
  // create.ts (Node's `async_hooks`) is server-only, but `authService`
  // (auth/index.ts's barrel export) is one big exported object literal
  // too, so a 'use client' file needing only pure domain exports from the
  // same barrel (role-checkbox-group.tsx/edit-user-form.tsx, which import
  // findIncompatibleRolePair/ASSIGNABLE_ROLES from @modules/auth) still
  // pulls in service.ts's whole transitive import graph at webpack's
  // module-resolution stage, before any dead-code elimination can drop
  // the unused authService export. Real failed build confirmed the
  // `node:async_hooks` URI-scheme form hard-fails resolution outright
  // ("UnhandledSchemeError", no built-in fallback at all) -- the source
  // import was changed to the bare `async_hooks` specifier instead (see
  // trusted-user-create.ts), and this alias-to-false stub is the belt
  // half of belt-and-suspenders, same as `sharp`'s: nothing in a client
  // bundle ever actually calls AsyncLocalStorage-dependent code.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.sharp = false;
      config.resolve.alias.async_hooks = false;
    }
    return config;
  },
};
export default withNextIntl(nextConfig);
