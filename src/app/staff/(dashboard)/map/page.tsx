import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { circuitColorAsCss, circuitColorForDayIndex } from '@lib/circuit-colors';
import { itineraryService } from '@modules/itinerary';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { ItineraryCircuitMap } from '@/components/ui/ItineraryCircuitMap';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface Props {
  searchParams: Promise<{ bookingReference?: string }>;
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

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

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

      {lookupFailed && <Alert tone="error">{t('lookupFailed')}</Alert>}

      {overview && overview.days.length === 0 && <p className="text-sm text-mist">{t('noDaysYet')}</p>}

      {overview && circuitDays && circuitDays.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-navy">{t('circuitFor', { reference: overview.bookingReference })}</p>
            <LinkButton href={`/api/v1/itineraries/${overview.itineraryId}/map-pdf`} prefetch={false} variant="secondary">
              {t('downloadPdf')}
            </LinkButton>
          </div>

          <ItineraryCircuitMap days={circuitDays} />

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-mist">
            {circuitDays.map((day) => (
              <li key={day.dayNumber} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: circuitColorAsCss(day.color) }} />
                {t('dayLabel', { number: day.dayNumber })} · {day.date.toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
