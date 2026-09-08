import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { CookieConsentBanner } from './CookieConsentBanner';
import { GuestFooter } from './footer';
import { MaintenanceBanner } from './maintenance-banner';
import { GuestNav } from './nav';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

// Scoped to this route group only -- the root layout.tsx metadata ("POLCO
// TOURS") still covers the staff dashboard, which keeps the POLCO TOURS
// name (DR-168: guest-facing brand text only was renamed to Mufasa Safaris
// & Tours, staff dashboard/emails intentionally excluded).
//
// SEO pass: metadataBase lets every relative OG/canonical URL Next.js
// generates elsewhere in this tree (including each route's own
// opengraph-image.tsx) resolve against a real absolute origin, and is the
// one already-established canonical host every other absolute-URL consumer
// in this app hardcodes (see robots.ts/sitemap.ts's own comment) --
// next.config.mjs's host-based redirects collapse the Vercel default domain
// and the www variant onto it. keywords has had no real ranking effect in
// Google since ~2009, kept only because it's harmless and some smaller
// engines/site tools still read it. openGraph/twitter give every guest page
// that doesn't already override them (most "thin" pages) a real link-preview
// fallback instead of none.
const SITE_URL = 'https://mufasasafaris.com';
const DEFAULT_DESCRIPTION = 'Tourism OS Powered by Cyber PolCo.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Mufasa Safaris & Tours',
    template: '%s | Mufasa Safaris & Tours',
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'Namibia safari',
    'Namibia tours',
    'Democratic Republic of Congo tours',
    'DRC safari',
    'Zambia safari',
    'Zimbabwe safari',
    'Victoria Falls tours',
    'Botswana safari',
    'Okavango Delta safari',
    'Southern Africa tour packages',
    'African safari tour operator',
    'guided tours Africa',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Mufasa Safaris & Tours',
    title: 'Mufasa Safaris & Tours',
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mufasa Safaris & Tours',
    description: DEFAULT_DESCRIPTION,
  },
};

// Organization structured data (schema.org/JSON-LD) -- site-wide on every
// guest page via this shared layout, so Google has a real Organization
// entity to attach a knowledge-panel/sitelinks-search-box to. Static/
// hardcoded rather than pulling the staff-editable social-links CmsMediaItem
// list (DR-200) in here -- this layout isn't async today and adding a DB
// read on every guest page load for a `sameAs` array is a bigger change than
// this pass calls for.
const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'TravelAgency',
  name: 'Mufasa Safaris & Tours',
  url: SITE_URL,
  logo: `${SITE_URL}/images/brand/mufasa-logo.png`,
  description: DEFAULT_DESCRIPTION,
  areaServed: ['Namibia', 'Democratic Republic of the Congo', 'Zambia', 'Zimbabwe', 'Botswana'],
};

// Public chrome for the tourist self-serve site (DR-016) -- a route group so
// this nav doesn't leak into /staff (which has its own dashboard layout) or
// affect the bare root layout.tsx. No auth gate here; /booking/[bookingId]
// pages gate themselves via requireGuestContext.
//
// NextIntlClientProvider now lives at the true root layout.tsx (full EN/FR
// coverage extended to the staff dashboard) -- this layout no longer needs
// its own instance, just the guest-only chrome (nav/footer/switcher).
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      {/* A plain server-rendered <script> tag, not next/script -- next/script
          defers execution until after hydration, which would drop this
          JSON-LD from the very first (crawler-visible) HTML response. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }} />
      <MaintenanceBanner />
      <header className="relative border-b border-rule bg-navy text-bone">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="eyebrow flex items-center gap-2 text-amber">
            <Logo className="h-10 w-10 sm:h-20 sm:w-20" />
            Mufasa Safaris & Tours
          </Link>
          <div className="flex items-center gap-6">
            <GuestNav />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">{children}</main>
      <GuestFooter />
      <CookieConsentBanner />
    </div>
  );
}
