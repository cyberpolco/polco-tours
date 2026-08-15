import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { weatherService } from '@modules/weather';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { classifyCondition, HumidityGauge, WeatherAnimation, weatherCardTint } from '../weather-animation';

interface Props {
  params: Promise<{ town: string }>;
}

// Fully public, no requireGuestContext (DR-113) -- notFound() for an
// unrecognized slug, same convention as a bad booking/package id elsewhere
// in this app. `current`/`forecast` can independently be null if the
// Weather API is down/misconfigured/uncached at request time -- the page
// still renders the town + seasonal notes either way (charter rule 8).
export default async function WeatherTownPage({ params }: Props) {
  const { town: slug } = await params;
  const town = await weatherService.getPublicTownWeather(slug);
  if (!town) notFound();

  const t = await getTranslations('WeatherTownPage');
  const tCountries = await getTranslations('Countries');

  return (
    <Reveal>
      <div className="max-w-3xl">
        <BackLink href="/weather">{t('backToWeather')}</BackLink>
        <p className="mt-4 eyebrow text-mist">{tCountries(town.country)}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{town.name}</h1>

        <div className="mt-6">
          <p className="eyebrow text-forest">{t('currentConditions')}</p>
          {town.current ? (
            <>
              <WeatherAnimation conditionText={town.current.conditionText} size="full" className="mt-2 shadow-lift" />
              <Card
                className={[
                  'mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4',
                  weatherCardTint(classifyCondition(town.current.conditionText)),
                ].join(' ')}
              >
                <div>
                  <p className="text-xs text-mist">{t('temperature')}</p>
                  <p className="text-lg font-semibold text-navy">{Math.round(town.current.temperatureCelsius)}°C</p>
                </div>
                <div>
                  <p className="text-xs text-mist">{t('feelsLike')}</p>
                  <p className="text-sm">{Math.round(town.current.feelsLikeCelsius)}°C</p>
                </div>
                <div>
                  <p className="text-xs text-mist">{t('conditions')}</p>
                  <p className="text-sm">{town.current.conditionText}</p>
                </div>
                {town.current.humidityPct != null && (
                  <div className="flex items-center gap-2">
                    <HumidityGauge humidityPct={town.current.humidityPct} />
                    <div>
                      <p className="text-xs text-mist">{t('humidity')}</p>
                      <p className="text-sm">{town.current.humidityPct}%</p>
                    </div>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <p className="mt-2 text-sm text-mist">{t('liveDataUnavailable')}</p>
          )}
        </div>

        {town.forecast && town.forecast.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow text-forest">{t('forecast')}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {town.forecast.map((day) => (
                <Card key={day.date} className="text-center">
                  <p className="text-xs font-medium text-mist">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}</p>
                  <p className="mt-1 text-sm text-navy">
                    {Math.round(day.maxTemperatureCelsius)}° / {Math.round(day.minTemperatureCelsius)}°
                  </p>
                  <p className="mt-1 text-xs text-mist">{day.conditionText}</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="eyebrow text-forest">{t('seasonalNotes')}</p>
          <p className="mt-2 text-sm text-mist">{town.seasonalNotes}</p>
        </div>
      </div>
    </Reveal>
  );
}
