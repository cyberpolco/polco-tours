import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { weatherService } from '@modules/weather';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { WeatherAnimation } from './weather-animation';
import { classifyCondition, weatherCardTint } from './weather-classify';
import {
  GLASS_CARD,
  GLASS_HEADING,
  GLASS_MUTED,
  WEATHER_HERO_IMAGE,
  WEATHER_INNER,
  WEATHER_SCRIM,
  WEATHER_SECTION,
} from './weather-glass';

const COUNTRY_ORDER = OPERATING_COUNTRY_CODES;

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Fully public, no requireGuestContext -- same shape as about/faq/gallery
// (DR-113). weatherService.listPublicTowns() fetches every town's current
// conditions concurrently (see weather/service.ts) and degrades each one
// independently to `current: null` rather than throwing, so this page
// always renders even if the Weather API is down/misconfigured.
export default async function WeatherPage() {
  const t = await getTranslations('WeatherPage');
  const tCountries = await getTranslations('Countries');
  const towns = await weatherService.listPublicTowns();
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('weather', locale);

  return (
    <Reveal>
      <section className={WEATHER_SECTION}>
        {/* Hidden below sm (explicit user request) -- object-cover on a
            fixed-aspect hero photo read as overstretched/zoomed-in on a
            phone viewport rather than a deliberate backdrop. */}
        <Image src={WEATHER_HERO_IMAGE} alt="" fill priority sizes="100vw" className="hidden object-cover sm:block" />
        <div className={WEATHER_SCRIM} />
        <div className={WEATHER_INNER}>
          <p className={`eyebrow ${GLASS_MUTED}`}>{cms?.eyebrow ?? t('eyebrow')}</p>
          <h1 className={`mt-1 text-2xl font-bold ${GLASS_HEADING}`}>{cms?.title ?? t('title')}</h1>
          <p className={`mt-1 max-w-2xl text-sm ${GLASS_MUTED}`}>{cms?.body ?? t('subhead')}</p>

          {COUNTRY_ORDER.map((country) => {
            const countryTowns = towns.filter((town) => town.country === country);
            if (countryTowns.length === 0) return null;

            return (
              <div key={country} className="mt-8">
                {/* Gold at sm+, where the photo's behind it -- a dark green
                    heading disappears there. Back to the page's usual forest
                    below sm, where there's no photo (see weather-glass.ts). */}
                <h2 className="eyebrow text-forest sm:text-gold">{tCountries(country)}</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {countryTowns.map((town) => {
                    const tint = town.current ? weatherCardTint(classifyCondition(town.current.conditionText)) : '';
                    return (
                      <Card
                        key={town.slug}
                        as="div"
                        interactive
                        className={['p-0 overflow-hidden', GLASS_CARD, tint].filter(Boolean).join(' ')}
                      >
                        <Link href={`/weather/${town.slug}`} className="flex items-center gap-3 p-4">
                          {town.current && (
                            <WeatherAnimation conditionText={town.current.conditionText} size="compact" className="w-14 shrink-0 shadow-card" />
                          )}
                          <div>
                            <p className={`font-semibold ${GLASS_HEADING}`}>{town.name}</p>
                            {town.current ? (
                              <p className={`mt-1 text-sm ${GLASS_MUTED}`}>
                                {Math.round(town.current.temperatureCelsius)}°C · {town.current.conditionText}
                              </p>
                            ) : (
                              <p className={`mt-1 text-sm ${GLASS_MUTED}`}>{t('summaryUnavailable')}</p>
                            )}
                          </div>
                        </Link>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}
