import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { TopographicPattern } from '@/components/TopographicPattern';
import { AfricaMap } from '@/components/AfricaMap';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PackageCard } from './package-card';

// Fetches from the DB (listPublicPackages), and unlike packages/page.tsx
// there's no searchParams access to implicitly force dynamic rendering --
// without this, Next tries to prerender "/" at build time and fails wherever
// DATABASE_URL isn't available at build (this sandbox, and possibly CI).
export const dynamic = 'force-dynamic';

// Replaces the Phase-0 placeholder that used to live at src/app/page.tsx --
// this route group (DR-016) is the real product surface it deferred to.
export default async function HomePage() {
  const t = await getTranslations('HomePage');

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
    <div className="space-y-16 pb-8">
      <div className="relative overflow-hidden pt-8">
        <TopographicPattern className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-navy/[0.06]" />
        <p className="eyebrow mb-4 text-amber">{t('heroEyebrow')}</p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-navy sm:text-5xl">{t('heroTitle')}</h1>
        <p className="mt-6 max-w-xl text-mist">{t('heroSubhead')}</p>
        <div className="mt-8 flex gap-4">
          <LinkButton href="/packages">{t('browsePackages')}</LinkButton>
          <LinkButton href="/plan-my-trip" variant="secondary">
            {t('planMyTrip')}
          </LinkButton>
        </div>
      </div>

      {featured.length > 0 && (
        <div>
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
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {featured.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="survey-rule mb-8" />
        <p className="eyebrow text-mist">{t('mapEyebrow')}</p>
        <h2 className="mt-1 text-2xl font-bold text-navy">{t('mapTitle')}</h2>
        <p className="mt-2 max-w-xl text-mist">{t('mapSubhead')}</p>
        <div className="mt-6">
          <AfricaMap />
        </div>
      </div>

      <div>
        <div className="survey-rule mb-8" />
        <p className="eyebrow text-mist">{t('howItWorksEyebrow')}</p>
        <h2 className="mt-1 text-2xl font-bold text-navy">{t('howItWorksTitle')}</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card as="li" key={step.mark}>
              <p className="font-serif text-3xl text-amber">{step.mark}</p>
              <h3 className="mt-2 font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-mist">{step.body}</p>
            </Card>
          ))}
        </ul>
      </div>

      <div className="rounded-survey bg-navy px-8 py-10 text-bone">
        <p className="eyebrow text-amber">{t('ctaEyebrow')}</p>
        <h2 className="mt-2 text-2xl font-bold">{t('ctaTitle')}</h2>
        <div className="mt-6 flex flex-wrap gap-4">
          <LinkButton href="/packages">{t('browsePackages')}</LinkButton>
          <Link
            href="/plan-my-trip"
            className="inline-flex items-center justify-center rounded-survey border border-bone px-5 py-3 text-sm font-semibold text-bone"
          >
            {t('planMyTrip')}
          </Link>
        </div>
      </div>
    </div>
  );
}
