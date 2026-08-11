import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { trackingService } from '@modules/tracking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { LOCATION_FRESHNESS_TONE } from '@lib/status-tones';

// Tracking (DR-041) -- a read-only "what's happening right now" view: fleet
// last-known-location (staff-entered, DR-029; no live feed yet, OI-09) plus
// active-trip progress. Progress is computed at the Departure level, not
// itinerary-day level -- a predefined-package departure can serve several
// bookings, each with its own (or no) Itinerary, so there's no single
// canonical itinerary to resolve day-by-day detail from.
export default async function TrackingPage() {
  const ctx = await requireStaffContext('tracking.read');
  const { fleet, activeTrips } = await trackingService.getFleetSnapshot(ctx);
  const t = await getTranslations('StaffTracking');
  const tFreshness = await getTranslations('LocationFreshnessLabel');
  const tCountries = await getTranslations('Countries');

  return (
    <div className="space-y-10">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

      <div>
        <h1 className="text-2xl font-bold text-navy">{t('fleetLocationsTitle')}</h1>
        <p className="mt-1 text-xs text-mist">{t('fleetLocationsNotice')}</p>
        {fleet.length === 0 ? (
          <p className="mt-4 text-mist">{t('noKitsRegistered')}</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>{t('vehicle')}</Th>
                <Th>{t('kitId')}</Th>
                <Th>{t('location')}</Th>
                <Th>{t('lastUpdated')}</Th>
                <Th>{t('freshness')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {fleet.map((f) => (
                <Tr key={f.starlinkKitId ?? f.vehicleId}>
                  <Td>{f.plateNumber}</Td>
                  <Td>{f.kitId}</Td>
                  <Td>{f.latitude != null && f.longitude != null ? `${f.latitude}, ${f.longitude}` : t('notSet')}</Td>
                  <Td>{f.lastLocationAt ? f.lastLocationAt.toLocaleString() : '—'}</Td>
                  <Td>
                    <Badge tone={LOCATION_FRESHNESS_TONE[f.freshness]}>{tFreshness(f.freshness)}</Badge>
                  </Td>
                  <Td>
                    {f.starlinkKitId && (
                      <Link href={`/staff/fleet/starlink-kits/${f.starlinkKitId}`} className="text-forest hover:underline">
                        {t('update')}
                      </Link>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <h1 className="text-2xl font-bold text-navy">{t('activeTripsTitle')}</h1>
        <p className="mt-1 text-xs text-mist">{t('activeTripsNotice')}</p>
        {activeTrips.length === 0 ? (
          <p className="mt-4 text-mist">{t('noTripsInProgress')}</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>{t('trip')}</Th>
                <Th>{t('country')}</Th>
                <Th>{t('vehicle')}</Th>
                <Th>{t('driver')}</Th>
                <Th>{t('guide')}</Th>
                <Th>{t('progress')}</Th>
              </TableHeaderRow>
            </thead>
            <tbody>
              {activeTrips.map((trip, i) => (
                <Tr key={`${trip.departureId}-${i}`}>
                  <Td>{trip.packageTitle ?? t('tailorMade')}</Td>
                  <Td>{tCountries(trip.country)}</Td>
                  <Td>{trip.vehiclePlate ?? '—'}</Td>
                  <Td>{trip.driverName ?? '—'}</Td>
                  <Td>{trip.guideName ?? '—'}</Td>
                  <Td>
                    {trip.progress.totalDays != null
                      ? t('dayOfTotal', {
                          day: trip.progress.dayNumber ?? 0,
                          total: trip.progress.totalDays,
                          pct: trip.progress.percentComplete ?? 0,
                        })
                      : t('dayOnly', { day: trip.progress.dayNumber ?? 0 })}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
