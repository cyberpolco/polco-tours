import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { cmsService, type CmsLocale } from '@modules/cms';
import { AFRICA_COUNTRY_NAME_BY_ALPHA2 } from '@lib/africa-country-ids';
import { AfricaMapLazy as AfricaMap } from '@/components/AfricaMapLazy';
import type { OperatingCountryMapEntry } from '@/components/AfricaMap';
import { HeroCarousel, type HeroSlide } from '@/components/HeroCarousel';
import { PartnersMarquee, type Partner } from '@/components/PartnersMarquee';
import { StickyMobileCta } from '@/components/StickyMobileCta';
import { TrustSummary } from '@/components/TrustSummary';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
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
// DR-163: the 3 original slides' hardcoded text/image/gradient, keyed by
// the fixed slotKey each got seeded under (prisma/seed.ts) -- used as the
// per-slot fallback whenever staff hasn't overridden that slide's text
// (CmsTextBlock) yet. There is no fallback for any slide staff adds beyond
// these 3 (there's nothing to fall back to); it simply needs its own text
// before it renders meaningfully.
const HERO_SLOT_FALLBACKS: Record<string, { image: string; gradient: string }> = {
  sossusvlei: {
    image: '/images/hero/sossusvlei.png',
    gradient: 'linear-gradient(100deg, rgba(59,31,58,0.92) 0%, rgba(59,31,58,0.6) 32%, rgba(214,91,46,0.28) 56%, rgba(214,91,46,0) 80%)',
  },
  virunga: {
    image: '/images/hero/virunga.png',
    gradient: 'linear-gradient(100deg, rgba(15,25,20,0.94) 0%, rgba(15,25,20,0.75) 40%, rgba(18,43,44,0.4) 62%, rgba(47,110,79,0) 85%)',
  },
  'victoria-falls': {
    image: '/images/hero/victoria-falls.png',
    gradient: 'linear-gradient(100deg, rgba(18,34,47,0.92) 0%, rgba(18,34,47,0.6) 32%, rgba(42,107,120,0.28) 56%, rgba(42,107,120,0) 80%)',
  },
};

// DR-202: staff-editable via /staff/cms's "Where we operate" tab
// (cmsService.listPublicOperatingCountries) -- these 4 are the fallback
// shown until staff configures at least one real row (or on a DB hiccup),
// same "never a blank/broken decorative section" convention as
// HERO_SLOT_FALLBACKS/PARTNERS above. Figures are recent public estimates
// for orientation only, not live/official data -- same "verify before
// treating as ground truth" spirit as the tax/visa figures elsewhere.
const FALLBACK_OPERATING_COUNTRIES: OperatingCountryMapEntry[] = [
  {
    countryCode: 'NA',
    name: 'Namibia',
    capital: 'Windhoek',
    languages: 'English (official); Afrikaans, German, Oshiwambo widely spoken',
    currency: 'Namibian Dollar (NAD)',
    population: '~2.6 million (est.)',
    areaKm2: '~825,615 km²',
  },
  {
    countryCode: 'CD',
    name: 'Democratic Republic of the Congo',
    capital: 'Kinshasa',
    languages: 'French (official); Lingala, Kikongo, Swahili, Tshiluba',
    currency: 'Congolese Franc (CDF)',
    population: '~102 million (est.)',
    areaKm2: '~2,345,410 km²',
  },
  {
    countryCode: 'ZM',
    name: 'Zambia',
    capital: 'Lusaka',
    languages: 'English (official); Bemba, Nyanja, Tonga, and other Bantu languages',
    currency: 'Zambian Kwacha (ZMW)',
    population: '~20 million (est.)',
    areaKm2: '~752,618 km²',
  },
  {
    countryCode: 'ZW',
    name: 'Zimbabwe',
    capital: 'Harare',
    languages: 'English, Shona, Ndebele (official, among 16 recognized languages)',
    currency: 'US Dollar (widely used); Zimbabwe Gold (ZWG)',
    population: '~16 million (est.)',
    areaKm2: '~390,757 km²',
  },
];

// Same direct-cookie-read convention as (guest)/about/page.tsx and
// (guest)/faq/page.tsx -- content isn't a next-intl namespace.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

export default async function HomePage() {
  const t = await getTranslations('HomePage');
  const locale = await resolveLocale();

  // Homepage-hero is a decorative section like `featured` below -- a CMS
  // hiccup degrades to the 3 hardcoded defaults, never a 500 for every
  // homepage visitor.
  let heroItems: Awaited<ReturnType<typeof cmsService.listPublicMediaItems>> = [];
  try {
    heroItems = await cmsService.listPublicMediaItems('home-hero');
  } catch (error) {
    console.error('Failed to load hero media for homepage', error);
  }

  const heroSlots =
    heroItems.length > 0
      ? heroItems
      : (['sossusvlei', 'virunga', 'victoria-falls'] as const).map((slotKey, i) => ({
          id: slotKey,
          page: 'home-hero',
          slotKey,
          mediaType: 'image' as const,
          url: HERO_SLOT_FALLBACKS[slotKey]!.image,
          caption: null,
          overlayGradient: null,
          sortOrder: i,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          updatedByUserId: null,
        }));

  const HARDCODED_TEXT: Record<string, { eyebrow: string; headline: string; lede: string }> = {
    sossusvlei: { eyebrow: t('heroSlide1Eyebrow'), headline: t('heroSlide1Headline'), lede: t('heroSlide1Lede') },
    virunga: { eyebrow: t('heroSlide2Eyebrow'), headline: t('heroSlide2Headline'), lede: t('heroSlide2Lede') },
    'victoria-falls': { eyebrow: t('heroSlide3Eyebrow'), headline: t('heroSlide3Headline'), lede: t('heroSlide3Lede') },
  };

  const HERO_SLIDES: HeroSlide[] = await Promise.all(
    heroSlots.map(async (item) => {
      const fallback = HERO_SLOT_FALLBACKS[item.slotKey];
      const hardcodedText = HARDCODED_TEXT[item.slotKey];
      let text = null;
      try {
        text = await cmsService.getPublicTextBlock(`home-hero.${item.slotKey}`, locale);
      } catch (error) {
        console.error('Failed to load hero text for homepage', error);
      }
      return {
        eyebrow: text?.eyebrow ?? hardcodedText?.eyebrow ?? '',
        headline: text?.title ?? hardcodedText?.headline ?? '',
        lede: text?.body ?? hardcodedText?.lede ?? '',
        image: (item.mediaType === 'image' ? item.url : fallback?.image) ?? undefined,
        video: (item.mediaType === 'video' ? item.url : undefined) ?? undefined,
        gradient: item.overlayGradient ?? fallback?.gradient ?? 'linear-gradient(100deg, rgba(33,26,29,0.85) 0%, rgba(33,26,29,0) 80%)',
      };
    }),
  );

  const STEPS = [
    { mark: '01', title: t('step1Title'), body: t('step1Body') },
    { mark: '02', title: t('step2Title'), body: t('step2Body') },
    { mark: '03', title: t('step3Title'), body: t('step3Body') },
  ] as const;

  // DR-185: staff-managed via /staff/cms (name + optional logo per entry,
  // reusing CmsMediaItem the same way Home hero/Gallery already do). Degrades
  // to the placeholder row below -- our own mark standing in six times,
  // never a fabricated logo for a real organization (OI-12 convention) --
  // until staff adds at least one real partner.
  let PARTNERS: Partner[] = [
    { name: 'Mufasa Safaris & Tours' },
    { name: 'Mufasa Safaris & Tours' },
    { name: 'Mufasa Safaris & Tours' },
    { name: 'Mufasa Safaris & Tours' },
    { name: 'Mufasa Safaris & Tours' },
    { name: 'Mufasa Safaris & Tours' },
  ];
  try {
    const partnerItems = await cmsService.listPublicMediaItems('partners');
    const named = partnerItems.filter((item) => item.name);
    if (named.length > 0) {
      PARTNERS = named.map((item) => ({ name: item.name!, logoUrl: item.url ?? undefined }));
    }
  } catch (error) {
    console.error('Failed to load partners for homepage', error);
  }

  // DR-202: staff-managed via /staff/cms's "Where we operate" tab -- the
  // section's own eyebrow/title/subhead plus which countries get
  // highlighted/interactive on the map. Degrades to the pre-existing
  // next-intl copy + the 4-country fallback above on any DB hiccup or until
  // staff has configured a row.
  let mapText: Awaited<ReturnType<typeof cmsService.getPublicTextBlock>> = null;
  let operatingCountries: OperatingCountryMapEntry[] = FALLBACK_OPERATING_COUNTRIES;
  try {
    mapText = await cmsService.getPublicTextBlock('home-map', locale);
    const rows = await cmsService.listPublicOperatingCountries();
    if (rows.length > 0) {
      operatingCountries = rows.map((row) => ({
        countryCode: row.countryCode,
        name: AFRICA_COUNTRY_NAME_BY_ALPHA2[row.countryCode] ?? row.countryCode,
        capital: row.capital,
        languages: row.languages,
        currency: row.currency,
        population: row.population,
        areaKm2: row.areaKm2,
      }));
    }
  } catch (error) {
    console.error('Failed to load "Where we operate" map data for homepage', error);
  }

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
        </Reveal>
      )}
      {featured.length > 0 && (
        <RevealGroup
          as="ul"
          itemAs="li"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {featured.map((p) => (
            <PackageCard key={p.id} pkg={p} as="div" titleSize="large" />
          ))}
        </RevealGroup>
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
          <p className="eyebrow text-mist">{mapText?.eyebrow ?? t('mapEyebrow')}</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">{mapText?.title ?? t('mapTitle')}</h2>
          <p className="mt-2 max-w-xl text-mist">{mapText?.body ?? t('mapSubhead')}</p>
        </Reveal>
        <div className="mt-6">
          <AfricaMap operatingCountries={operatingCountries} />
        </div>
      </div>

      <Reveal>
        <div className="survey-rule mb-8" />
        <p className="eyebrow text-mist">{t('howItWorksEyebrow')}</p>
        <h2 className="mt-1 text-2xl font-bold text-navy">{t('howItWorksTitle')}</h2>
        <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <Card as="li" key={step.mark}>
              <p className="font-display text-3xl text-amber">{step.mark}</p>
              <h3 className="mt-2 text-xl font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-mist">{step.body}</p>
            </Card>
          ))}
        </ul>
      </Reveal>

      <Reveal>
        <PartnersMarquee partners={PARTNERS} eyebrow={t('partnersEyebrow')} title={t('partnersTitle')} />
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
