import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { cmsService, type CmsLocale } from '@modules/cms';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { PackageCard } from '../package-card';

interface Props {
  searchParams: Promise<{ country?: string; q?: string }>;
}

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

export default async function PackagesPage({ searchParams }: Props) {
  const { country, q } = await searchParams;
  const packages = await catalogService.listPublicPackages({ country, search: q });
  const t = await getTranslations('PackagesPage');
  const tCountries = await getTranslations('Countries');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('packages', locale);

  function pillHref(nextCountry?: string): string {
    const params = new URLSearchParams();
    if (nextCountry) params.set('country', nextCountry);
    if (q) params.set('q', q);
    const query = params.toString();
    return query ? `/packages?${query}` : '/packages';
  }

  return (
    <div>
      <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
      {cms?.body && <p className="mt-1 text-sm text-mist">{cms.body}</p>}

      <Reveal>
        <form method="get" action="/packages" className="mt-6 flex flex-wrap items-center gap-3">
          {country && <input type="hidden" name="country" value={country} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('searchPlaceholder')}
            className="w-full max-w-xs rounded-pill border border-rule px-4 py-1.5 text-sm transition-colors focus:border-amber focus:outline-none sm:w-auto"
          />
          <button
            type="submit"
            className="rounded-pill border border-navy px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-bone"
          >
            {t('search')}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={pillHref(undefined)}
            className={`rounded-pill border px-3 py-1 transition-colors ${
              !country ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'
            }`}
          >
            {t('all')}
          </Link>
          {OPERATING_COUNTRY_CODES.map((code) => (
            <Link
              key={code}
              href={pillHref(code)}
              className={`rounded-pill border px-3 py-1 transition-colors ${
                country === code ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'
              }`}
            >
              {tCountries(code)}
            </Link>
          ))}
        </div>
      </Reveal>

      {packages.length === 0 ? (
        <p className="mt-6 text-mist">{t('empty')}</p>
      ) : (
        <RevealGroup as="ul" itemAs="li" className="mt-6 grid gap-4 sm:grid-cols-2">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} as="div" titleSize="large" />
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
