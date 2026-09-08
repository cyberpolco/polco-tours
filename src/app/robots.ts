import type { MetadataRoute } from 'next';

// Canonical host, same literal every other absolute-URL consumer already
// hardcodes (hero-opengraph.tsx, notifications/email-template.ts, the
// weather opengraph-image routes) -- next.config.mjs's host-based redirects
// consolidate the Vercel default domain and the www variant onto this one,
// so this is the only host worth telling crawlers about.
const SITE_URL = 'https://mufasasafaris.com';

// Guest-facing crawl policy only -- the staff dashboard is behind auth
// already (RBAC + a real session), but disallowing it here too keeps it out
// of any crawler that ignores auth walls entirely. The booking/quotation
// flows (book, book-package, booking, complete-booking) and the two
// lookup-result pages (find-booking/result, rate/result) all render a
// specific guest's own data reached via a reference/booking id in the URL --
// no SEO value and no reason to let a crawler request or cache them, same
// reasoning sitemap.ts already excludes them for.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/staff/', '/api/', '/book/', '/book-package/', '/booking/', '/complete-booking/', '/find-booking/result', '/rate/result'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
