import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { ItineraryDayMap } from '@/components/ui/ItineraryDayMap';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface Props {
  searchParams: Promise<{ bookingReference?: string }>;
}

// DR-089: staff enter a booking's reference code, see the itinerary's
// day-by-day stops on a map, download each day as a PDF. Plain GET form
// (no Server Action needed) -- the lookup result lives entirely in the URL
// query string, same shape as the bookings list's status filter.
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

      {overview && overview.days.length > 0 && (
        <div className="space-y-6">
          {overview.days.map((day) => (
            <div key={day.dayId} className="rounded-survey border border-rule p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-navy">
                  {t('dayLabel', { number: day.dayNumber })} · {day.date.toLocaleDateString()}
                </p>
                <LinkButton
                  href={`/api/v1/itineraries/${overview.itineraryId}/days/${day.dayId}/map-pdf`}
                  prefetch={false}
                  variant="secondary"
                  size="compact"
                >
                  {t('downloadPdf')}
                </LinkButton>
              </div>
              <div className="mt-3">
                <ItineraryDayMap stops={day.stops} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
