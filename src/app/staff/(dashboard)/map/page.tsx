import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { circuitColorAsCss, circuitColorForDayIndex } from '@lib/circuit-colors';
import { itineraryService, type MapStopView } from '@modules/itinerary';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { ItineraryCircuitMap } from '@/components/ui/ItineraryCircuitMap';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface Props {
  searchParams: Promise<{ bookingReference?: string }>;
}

/** DR-179 (explicit user request): a plain "Open in Google Maps" deep link
 * -- the documented https://developers.google.com/maps/documentation/urls
 * `api=1` directions URL, no API key/billing, works on any device. Gives
 * the driver/guide real turn-by-turn navigation (live traffic, rerouting,
 * voice guidance) that this page's own drawn route (a straight line
 * between stops, DR-089/150 -- deliberately not road-snapped, see those
 * DRs) never could. Google's own web/app UI silently caps how many
 * waypoints it will actually route through on a very long circuit -- fine
 * for this use case (get the driver moving toward the stops), not a
 * promise every stop appears on the whole-tour link. */
function buildGoogleMapsDirectionsUrl(stops: Pick<MapStopView, 'latitude' | 'longitude'>[]): string | null {
  const points = stops.filter((s): s is { latitude: number; longitude: number } => s.latitude != null && s.longitude != null);
  if (points.length < 2) return null;
  const origin = points[0]!;
  const destination = points[points.length - 1]!;
  const waypoints = points.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: 'driving',
  });
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map((p) => `${p.latitude},${p.longitude}`).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// DR-089/DR-150: staff enter a booking's reference code and see the whole
// tour's circuit -- every day's stops on one map, each day its own color --
// and download the whole thing as a single PDF, replacing the old
// one-day-at-a-time map + per-day PDF. Plain GET form (no Server Action
// needed) -- the lookup result lives entirely in the URL query string, same
// shape as the bookings list's status filter.
export default async function MapPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('itinerary.read');
  const { bookingReference } = await searchParams;
  const t = await getTranslations('StaffMap');

  let overview = null;
  let lookupFailed = false;
  if (bookingReference) {
    try {
      overview = await itineraryService.resolveMapOverview(ctx, bookingReference);
    } catch {
      lookupFailed = true;
    }
  }

  const circuitDays = overview?.days.map((day, i) => ({
    dayNumber: day.dayNumber,
    date: day.date,
    color: circuitColorForDayIndex(i),
    stops: day.stops,
  }));
  const wholeTourDirectionsUrl = circuitDays ? buildGoogleMapsDirectionsUrl(circuitDays.flatMap((d) => d.stops)) : null;

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

      <Reveal>
        <form method="get" className="flex items-end gap-3">
          <div className="flex-1">
            <FormField label={t('bookingReference')} htmlFor="bookingReference">
              <input
                name="bookingReference"
                defaultValue={bookingReference ?? ''}
                placeholder={t('bookingReferencePlaceholder')}
                required
                className="w-full rounded-survey border border-rule px-3 py-2 uppercase"
              />
            </FormField>
          </div>
          <SubmitButton pendingLabel={t('lookingUp')}>{t('lookUp')}</SubmitButton>
        </form>

        {lookupFailed && (
          <div className="mt-4">
            <Alert tone="error">{t('lookupFailed')}</Alert>
          </div>
        )}

        {overview && overview.days.length === 0 && <p className="mt-4 text-sm text-mist">{t('noDaysYet')}</p>}
      </Reveal>

      {overview && circuitDays && circuitDays.length > 0 && (
        <Reveal delay={0.1} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy">{t('circuitFor', { reference: overview.bookingReference })}</p>
            <div className="flex flex-wrap gap-3">
              {wholeTourDirectionsUrl && (
                <a
                  href={wholeTourDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-pill border border-rule px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-bone"
                >
                  {t('openWholeTourInGoogleMaps')}
                </a>
              )}
              <LinkButton href={`/api/v1/itineraries/${overview.itineraryId}/map-pdf`} prefetch={false} variant="secondary">
                {t('downloadPdf')}
              </LinkButton>
            </div>
          </div>

          <ItineraryCircuitMap days={circuitDays} />

          <RevealGroup as="ul" itemAs="li" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-mist" itemClassName="flex items-center gap-2">
            {circuitDays.map((day) => {
              const dayDirectionsUrl = buildGoogleMapsDirectionsUrl(day.stops);
              return (
                <span key={day.dayNumber} className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: circuitColorAsCss(day.color) }} />
                  {t('dayLabel', { number: day.dayNumber })} · {day.date.toLocaleDateString()}
                  {dayDirectionsUrl && (
                    <a href={dayDirectionsUrl} target="_blank" rel="noopener noreferrer" className="text-forest hover:underline">
                      {t('openInGoogleMaps')}
                    </a>
                  )}
                </span>
              );
            })}
          </RevealGroup>
        </Reveal>
      )}
    </div>
  );
}
