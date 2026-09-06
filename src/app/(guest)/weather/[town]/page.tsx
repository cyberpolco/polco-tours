import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { weatherService } from '@modules/weather';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { HumidityGauge, WeatherAnimation } from '../weather-animation';
import { classifyCondition, weatherCardTint } from '../weather-classify';
import {
  GLASS_CARD,
  GLASS_HEADING,
  GLASS_MUTED,
  WEATHER_HERO_IMAGE,
  WEATHER_INNER,
  WEATHER_SCRIM,
  WEATHER_SECTION,
} from '../weather-glass';

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
  const tSeasonalNotes = await getTranslations('WeatherSeasonalNotes');

  return (
    <Reveal>
      {/* Same glass-over-photo treatment as the /weather index (sm+ only,
          see weather-glass.ts) -- a town detail left looking plain would
          read as a different site entirely once you clicked through from a
          glass card. */}
      <section className={WEATHER_SECTION}>
        {/* Hidden below sm (explicit user request) -- object-cover on a
            fixed-aspect hero photo read as overstretched/zoomed-in on a
            phone viewport rather than a deliberate backdrop. */}
        <Image src={WEATHER_HERO_IMAGE} alt="" fill priority sizes="100vw" className="hidden object-cover sm:block" />
        <div className={WEATHER_SCRIM} />
        <div className={WEATHER_INNER}>
          {/* 'photo' tone: light (the page's default bone pill) below sm,
              where there's no photo behind it; dark at sm+, where a light
              pill would sit on the photo looking like a stray sticker. */}
          <BackLink href="/weather" tone="photo">
            {t('backToWeather')}
          </BackLink>
          <p className={`mt-4 eyebrow ${GLASS_MUTED}`}>{tCountries(town.country)}</p>
          <h1 className={`mt-1 text-2xl font-bold ${GLASS_HEADING}`}>{town.name}</h1>

          <div className="mt-6">
            <p className="eyebrow text-forest sm:text-gold">{t('currentConditions')}</p>
            {town.current ? (
              <>
                <WeatherAnimation conditionText={town.current.conditionText} size="full" className="mt-2 shadow-lift" />
                <Card
                  className={[
                    'mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4',
                    GLASS_CARD,
                    weatherCardTint(classifyCondition(town.current.conditionText)),
                  ].join(' ')}
                >
                  <div>
                    <p className={`text-xs ${GLASS_MUTED}`}>{t('temperature')}</p>
                    <p className={`text-lg font-semibold ${GLASS_HEADING}`}>{Math.round(town.current.temperatureCelsius)}°C</p>
                  </div>
                  <div>
                    <p className={`text-xs ${GLASS_MUTED}`}>{t('feelsLike')}</p>
                    <p className={`text-sm ${GLASS_HEADING}`}>{Math.round(town.current.feelsLikeCelsius)}°C</p>
                  </div>
                  <div>
                    <p className={`text-xs ${GLASS_MUTED}`}>{t('conditions')}</p>
                    <p className={`text-sm ${GLASS_HEADING}`}>{town.current.conditionText}</p>
                  </div>
                  {town.current.humidityPct != null && (
                    <div className="flex items-center gap-2">
                      <HumidityGauge humidityPct={town.current.humidityPct} />
                      <div>
                        <p className={`text-xs ${GLASS_MUTED}`}>{t('humidity')}</p>
                        <p className={`text-sm ${GLASS_HEADING}`}>{town.current.humidityPct}%</p>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            ) : (
              <p className={`mt-2 text-sm ${GLASS_MUTED}`}>{t('liveDataUnavailable')}</p>
            )}
          </div>

          {town.forecast && town.forecast.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow text-forest sm:text-gold">{t('forecast')}</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {town.forecast.map((day) => (
                  <Card key={day.date} className={`text-center ${GLASS_CARD}`}>
                    <p className={`text-xs font-medium ${GLASS_MUTED}`}>
                      {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                    </p>
                    <p className={`mt-1 text-sm ${GLASS_HEADING}`}>
                      {Math.round(day.maxTemperatureCelsius)}° / {Math.round(day.minTemperatureCelsius)}°
                    </p>
                    <p className={`mt-1 text-xs ${GLASS_MUTED}`}>{day.conditionText}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="eyebrow text-forest sm:text-gold">{t('seasonalNotes')}</p>
            <p className={`mt-2 text-sm ${GLASS_MUTED}`}>{tSeasonalNotes(town.slug)}</p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
