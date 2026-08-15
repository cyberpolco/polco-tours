import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { weatherService } from '@modules/weather';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { WeatherAnimation } from './weather-animation';
import { classifyCondition, weatherCardTint } from './weather-classify';

const COUNTRY_ORDER = ['NA', 'CD', 'ZM', 'ZW'] as const;

// Fully public, no requireGuestContext -- same shape as about/faq/gallery
// (DR-113). weatherService.listPublicTowns() fetches every town's current
// conditions concurrently (see weather/service.ts) and degrades each one
// independently to `current: null` rather than throwing, so this page
// always renders even if the Weather API is down/misconfigured.
export default async function WeatherPage() {
  const t = await getTranslations('WeatherPage');
  const tCountries = await getTranslations('Countries');
  const towns = await weatherService.listPublicTowns();

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mist">{t('subhead')}</p>

        {COUNTRY_ORDER.map((country) => {
          const countryTowns = towns.filter((town) => town.country === country);
          if (countryTowns.length === 0) return null;

          return (
            <div key={country} className="mt-8">
              <h2 className="eyebrow text-forest">{tCountries(country)}</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {countryTowns.map((town) => {
                  const tint = town.current ? weatherCardTint(classifyCondition(town.current.conditionText)) : '';
                  return (
                    <Card key={town.slug} as="div" interactive className={['p-0 overflow-hidden', tint].filter(Boolean).join(' ')}>
                      <Link href={`/weather/${town.slug}`} className="flex items-center gap-3 p-4">
                        {town.current && (
                          <WeatherAnimation conditionText={town.current.conditionText} size="compact" className="w-14 shrink-0 shadow-card" />
                        )}
                        <div>
                          <p className="font-semibold text-navy">{town.name}</p>
                          {town.current ? (
                            <p className="mt-1 text-sm text-mist">
                              {Math.round(town.current.temperatureCelsius)}°C · {town.current.conditionText}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-mist">{t('summaryUnavailable')}</p>
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
    </Reveal>
  );
}
