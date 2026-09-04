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
