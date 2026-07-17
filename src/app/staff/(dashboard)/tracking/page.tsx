import Link from 'next/link';
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

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Tracking" title="Fleet & Trip Tracking" />

      <div>
        <h1 className="text-2xl font-bold text-navy">Fleet Locations</h1>
        <p className="mt-1 text-xs text-mist">
          Staff-entered last known position -- there is no live GPS feed yet (real Starlink API access is still
          pending).
        </p>
        {fleet.length === 0 ? (
          <p className="mt-4 text-mist">No Starlink kits registered yet.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Vehicle</Th>
                <Th>Kit ID</Th>
                <Th>Location</Th>
                <Th>Last updated</Th>
                <Th>Freshness</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {fleet.map((f) => (
                <Tr key={f.kitId ?? f.vehicleId}>
                  <Td>{f.plateNumber}</Td>
                  <Td>{f.kitId}</Td>
                  <Td>{f.latitude != null && f.longitude != null ? `${f.latitude}, ${f.longitude}` : 'Not set'}</Td>
                  <Td>{f.lastLocationAt ? f.lastLocationAt.toLocaleString() : '—'}</Td>
                  <Td>
                    <Badge tone={LOCATION_FRESHNESS_TONE[f.freshness]}>{f.freshness}</Badge>
                  </Td>
                  <Td>
                    {f.kitId && (
                      <Link href={`/staff/fleet/starlink-kits/${f.kitId}`} className="text-forest hover:underline">
                        Update
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
        <h1 className="text-2xl font-bold text-navy">Active Trips</h1>
        <p className="mt-1 text-xs text-mist">Departures currently under way -- progress is date-range based.</p>
        {activeTrips.length === 0 ? (
          <p className="mt-4 text-mist">No trips currently in progress.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Trip</Th>
                <Th>Country</Th>
                <Th>Vehicle</Th>
                <Th>Driver</Th>
                <Th>Guide</Th>
                <Th>Progress</Th>
              </TableHeaderRow>
            </thead>
            <tbody>
              {activeTrips.map((t, i) => (
                <Tr key={`${t.departureId}-${i}`}>
                  <Td>{t.packageTitle ?? 'Tailor-made'}</Td>
                  <Td>{t.country}</Td>
                  <Td>{t.vehiclePlate ?? '—'}</Td>
                  <Td>{t.driverName ?? '—'}</Td>
                  <Td>{t.guideName ?? '—'}</Td>
                  <Td>
                    {t.progress.totalDays != null
                      ? `Day ${t.progress.dayNumber} of ${t.progress.totalDays} (${t.progress.percentComplete}%)`
                      : `Day ${t.progress.dayNumber}`}
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
