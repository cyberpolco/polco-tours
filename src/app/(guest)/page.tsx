import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { AfricaMapLazy as AfricaMap } from '@/components/AfricaMapLazy';
import { HeroCarousel, type HeroSlide } from '@/components/HeroCarousel';
import { StickyMobileCta } from '@/components/StickyMobileCta';
import { TrustSummary } from '@/components/TrustSummary';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Skeleton } from '@/components/ui/Skeleton';
import { PackageCard } from './package-card';

// Fetches from the DB (listPublicPackages), and unlike packages/page.tsx
// there's no searchParams access to implicitly force dynamic rendering --
// without this, Next tries to prerender "/" at build time and fails wherever
// DATABASE_URL isn't available at build (this sandbox, and possibly CI).
export const dynamic = 'force-dynamic';

// Replaces the Phase-0 placeholder that used to live at src/app/page.tsx --
// this route group (DR-016) is the real product surface it deferred to.
// DR-068: hero rebuilt as a rotating 3-slide HeroCarousel (real destinations,
// not a static banner), a real "trusted by travelers" bar added (TrustSummary
// -- renders nothing until there's at least one real review), scroll-reveal
// motion (Reveal) added section-by-section, and a mobile sticky CTA (the
// hero's own CTAs scroll out of view fast on a small screen).
export default async function HomePage() {
  const t = await getTranslations('HomePage');

  const HERO_SLIDES: HeroSlide[] = [
    {
      eyebrow: t('heroSlide1Eyebrow'),
      headline: t('heroSlide1Headline'),
      lede: t('heroSlide1Lede'),
      gradient: 'linear-gradient(180deg, #3b1f3a 0%, #d65b2e 62%, #f2b441 100%)',
    },
    {
      eyebrow: t('heroSlide2Eyebrow'),
      headline: t('heroSlide2Headline'),
      lede: t('heroSlide2Lede'),
      gradient: 'linear-gradient(180deg, #122b2c 0%, #2f6e4f 60%, #f2b441 100%)',
    },
    {
      eyebrow: t('heroSlide3Eyebrow'),
      headline: t('heroSlide3Headline'),
      lede: t('heroSlide3Lede'),
      gradient: 'linear-gradient(180deg, #12222f 0%, #2a6b78 58%, #e8c46a 100%)',
    },
  ];

  const STEPS = [
    { mark: '01', title: t('step1Title'), body: t('step1Body') },
    { mark: '02', title: t('step2Title'), body: t('step2Body') },
    { mark: '03', title: t('step3Title'), body: t('step3Body') },
  ] as const;

  // "/" is the highest-traffic route on the site and, unlike every other
  // catalog-backed page, has no reason to fail the whole page over this one
  // decorative section -- a DB hiccup here should degrade to "no featured
  // packages", not a 500 for every visitor landing on the homepage.
  let featured: Awaited<ReturnType<typeof catalogService.listPublicPackages>> = [];
  try {
    featured = (await catalogService.listPublicPackages()).slice(0, 3);
  } catch (error) {
    console.error('Failed to load featured packages for homepage', error);
  }

  return (
    <div className="space-y-16 pb-24 sm:pb-8">
      <HeroCarousel
        slides={HERO_SLIDES}
        browseHref="/packages"
        browseLabel={t('browsePackages')}
        planHref="/plan-my-trip"
        planLabel={t('planMyTrip')}
      />

      <Suspense fallback={<Skeleton className="h-[70px] w-full" />}>
        <TrustSummary />
      </Suspense>

      {featured.length > 0 && (
        <Reveal>
          <div className="survey-rule mb-8" />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-mist">{t('featuredEyebrow')}</p>
              <h2 className="mt-1 text-2xl font-bold text-navy">{t('featuredTitle')}</h2>
            </div>
            <Link href="/packages" className="text-sm text-forest hover:underline">
              {t('viewAllPackages')}
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </ul>
        </Reveal>
      )}

      <div>
        {/* AfricaMap is deliberately NOT inside Reveal: nesting it inside
            Reveal's motion.div made @visx/responsive's ParentSize
            (AfricaMap's own width/height measurement) intermittently render
            the whole map blank during manual testing -- not fully isolated
            to a single root cause, but reliably avoided by keeping any
            ParentSize-based component outside a framer-motion viewport-
            tracking wrapper. Animate the surrounding copy only. */}
        <Reveal>
          <div className="survey-rule mb-8" />
          <p className="eyebrow text-mist">{t('mapEyebrow')}</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">{t('mapTitle')}</h2>
          <p className="mt-2 max-w-xl text-mist">{t('mapSubhead')}</p>
        </Reveal>
        <div className="mt-6">
          <AfricaMap />
        </div>
      </div>

      <Reveal>
        <div className="survey-rule mb-8" />
        <p className="eyebrow text-mist">{t('howItWorksEyebrow')}</p>
        <h2 className="mt-1 text-2xl font-bold text-navy">{t('howItWorksTitle')}</h2>
        <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <Card as="li" key={step.mark}>
              <p className="font-serif text-3xl text-amber">{step.mark}</p>
              <h3 className="mt-2 font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-mist">{step.body}</p>
            </Card>
          ))}
        </ul>
      </Reveal>

      <Reveal>
        <div className="rounded-card bg-navy px-6 py-10 text-bone sm:px-8">
          <p className="eyebrow text-amber">{t('ctaEyebrow')}</p>
          <h2 className="mt-2 text-2xl font-bold">{t('ctaTitle')}</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <LinkButton href="/packages">{t('browsePackages')}</LinkButton>
            <LinkButton href="/plan-my-trip" variant="invertOutline">
              {t('planMyTrip')}
            </LinkButton>
          </div>
        </div>
      </Reveal>

      <StickyMobileCta href="/packages" label={t('stickyMobileCta')} />
    </div>
  );
}
