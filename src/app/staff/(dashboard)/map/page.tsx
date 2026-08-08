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
      <PageHeader eyebrow="Map" title="Itinerary map" />

      <form method="get" className="flex items-end gap-3">
        <div className="flex-1">
          <FormField label="Booking reference" htmlFor="bookingReference">
            <input
              name="bookingReference"
              defaultValue={bookingReference ?? ''}
              placeholder="e.g. AB1234"
              required
              className="w-full rounded-survey border border-rule px-3 py-2 uppercase"
            />
          </FormField>
        </div>
        <SubmitButton pendingLabel="Looking up…">Look up</SubmitButton>
      </form>

      {lookupFailed && (
        <Alert tone="error">No itinerary found for that booking reference, or you don&apos;t have access to it.</Alert>
      )}

      {overview && overview.days.length === 0 && <p className="text-sm text-mist">This itinerary has no days yet.</p>}

      {overview && overview.days.length > 0 && (
        <div className="space-y-6">
          {overview.days.map((day) => (
            <div key={day.dayId} className="rounded-survey border border-rule p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-navy">
                  Day {day.dayNumber} · {day.date.toLocaleDateString()}
                </p>
                <LinkButton
                  href={`/api/v1/itineraries/${overview.itineraryId}/days/${day.dayId}/map-pdf`}
                  prefetch={false}
                  variant="secondary"
                  size="compact"
                >
                  Download PDF
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
