import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { bookingService, type TravelerDutyGroup } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Th, Tr, Td } from '@/components/ui/Table';
import { ITINERARY_STATUS_TONE } from '@lib/status-tones';
import { buildScheduleRows } from './build-schedule-rows';

// Self-service read for TOUR_GUIDE/DRIVER/VEHICLE_OWNER -- closes the gap
// DR-018/019/020 each deferred. No actions.ts: strictly read-only, same
// convention as /staff/immigration.
//
// DR-101: the three Upcoming/In Progress/Completed sections that used to
// render inline here (one flat table each, unpaginated) are now three
// cards -- Past/In Progress/Future -- linking to their own dedicated list
// pages, each with search/filter/pagination, mirroring the DR-098 Bookings
// hub. The row-building (assignment -> departure/vehicle/driver/guide join
// + tracking progress) moved to build-schedule-rows.ts so the hub (counts
// only) and all three list pages share one implementation instead of four.
// The "Daily itinerary & clients"/"Itineraries" sections below are
// unaffected -- they're not naturally split by time-status the way the
// assignment list itself is, so they stay here exactly as before.
export default async function MySchedulePage() {
  const ctx = await requireStaffContext('assignment.read');
  const rows = await buildScheduleRows(ctx);

  const pastCount = rows.filter((r) => r.progress?.status === 'COMPLETED').length;
  const inProgressCount = rows.filter((r) => r.progress?.status === 'IN_PROGRESS').length;
  const futureCount = rows.filter((r) => r.progress?.status === 'NOT_STARTED').length;

  const sections = [
    { href: '/staff/schedule/past', title: 'Past', count: pastCount },
    { href: '/staff/schedule/in-progress', title: 'In Progress', count: inProgressCount },
    { href: '/staff/schedule/future', title: 'Future', count: futureCount },
  ];

  // Guides Module (DR-030), widened to DRIVER by the "My Schedule" spec
  // section (DR-031): client details for travelers on the caller's own
  // assigned departures only (departureIds come from this caller's own
  // listMyAssignments result above, never an arbitrary id -- see
  // bookingService.listTravelersForDeparture's own "caller already gates"
  // convention comment). VEHICLE_OWNER is deliberately excluded -- the spec
  // only asks for this level of detail for TOUR_GUIDE/DRIVER, and a vehicle
  // owner has no operational reason to see a client manifest.
  const showClientDetails = ctx.roles.includes('TOUR_GUIDE') || ctx.roles.includes('DRIVER');
  const clientGroupsByDeparture = new Map<string, TravelerDutyGroup[]>();
  if (showClientDetails) {
    const uniqueDepartureIds = [...new Set(rows.map((r) => r.detail.departure.id))];
    const groups = await Promise.all(
      uniqueDepartureIds.map((id) => bookingService.listTravelersForDeparture(ctx, id)),
    );
    uniqueDepartureIds.forEach((id, i) => clientGroupsByDeparture.set(id, groups[i] ?? []));
  }

  // Itinerary Management (DR-033): "Drivers and Tour Guides have read-only
  // access to their assigned itineraries." itineraryService.listMine is
  // already scoped to the caller's own assigned departures (same pattern as
  // listMyAssignments); VEHICLE_OWNER deliberately doesn't hold
  // itinerary.read (spec names only the other two roles), so this section
  // never renders for that role.
  const canReadItineraries = can(ctx, 'itinerary.read');
  let myItineraries: Awaited<ReturnType<typeof itineraryService.listMine>> = [];
  let itineraryBookingRefs = new Map<string, string>();
  if (canReadItineraries) {
    myItineraries = await itineraryService.listMine(ctx);
    // DR-058: a soft-deleted Booking isn't hard-deleted until the retention
    // purge, so an Itinerary can still point at one for up to 90 days --
    // bookingService.getById now throws for it, where it never used to
    // before soft-delete existed. This line already treated the result as
    // possibly missing (`bookings[idx]?.bookingReference ?? i.bookingId`
    // below), it just never got the chance -- catch so it does.
    const bookings = await Promise.all(myItineraries.map((i) => bookingService.getById(ctx, i.bookingId).catch(() => null)));
    itineraryBookingRefs = new Map(myItineraries.map((i, idx) => [i.id, bookings[idx]?.bookingReference ?? i.bookingId]));
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader eyebrow="My schedule" title="Assignments" />

      {rows.length === 0 ? (
        <p className="text-mist">No assignments yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sections.map((s) => (
            <Card key={s.href} interactive className="p-0">
              <Link href={s.href} className="block p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-navy">{s.title}</h2>
                  <span className="text-2xl font-bold text-navy">{s.count}</span>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {showClientDetails && rows.length > 0 && (
        <div className="space-y-8">
          <div className="survey-rule" />
          <PageHeader eyebrow="My schedule" title="Daily itinerary & clients" />
          {rows.map(({ assignment, detail }) => {
            const groups = clientGroupsByDeparture.get(detail.departure.id) ?? [];
            return (
              <div key={assignment.id} className="space-y-4">
                <h2 className="text-lg font-semibold text-navy">
                  {detail.departure.startDate.toLocaleDateString()} · {detail.packageCountry}
                  {detail.departure.pickupLatitude != null && detail.departure.pickupLongitude != null && (
                    <span className="ml-2 text-sm font-normal text-mist">
                      Pickup: {detail.departure.pickupLatitude.toFixed(4)}, {detail.departure.pickupLongitude.toFixed(4)}
                    </span>
                  )}
                </h2>
                {groups.length === 0 ? (
                  <p className="text-sm text-mist">No paid bookings on this departure yet.</p>
                ) : (
                  groups.map((group) => (
                    <div key={group.booking.id} className="rounded-survey border border-rule p-4">
                      <p className="text-sm font-medium text-navy">
                        {group.booking.bookingReference}
                        {group.booking.specialRequests && (
                          <span className="ml-2 font-normal text-mist">Tour notes: {group.booking.specialRequests}</span>
                        )}
                      </p>
                      <Table className="mt-3">
                        <thead>
                          <TableHeaderRow>
                            <Th>Name</Th>
                            <Th>Nationality</Th>
                            <Th>Notes</Th>
                            <Th>Emergency contact</Th>
                          </TableHeaderRow>
                        </thead>
                        <tbody>
                          {group.travelers.map((t) => (
                            <Tr key={t.id}>
                              <Td>
                                {t.firstName} {t.lastName} {t.isTourLead && <Badge tone="neutral">Tour lead</Badge>}
                              </Td>
                              <Td>{t.nationality}</Td>
                              <Td>
                                {[t.disabilities, t.allergies, t.drinkPreference].filter(Boolean).join(' · ') || '—'}
                              </Td>
                              <Td>
                                {t.emergencyContactName
                                  ? `${t.emergencyContactName}${t.emergencyContactRelation ? ` (${t.emergencyContactRelation})` : ''}${t.emergencyContactPhone ? ` · ${t.emergencyContactPhone}` : ''}`
                                  : '—'}
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {canReadItineraries && myItineraries.length > 0 && (
        <div className="space-y-4">
          <div className="survey-rule" />
          <PageHeader eyebrow="My schedule" title="Itineraries" />
          <ul className="space-y-2 text-sm">
            {myItineraries.map((itinerary) => (
              <li key={itinerary.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span>{itineraryBookingRefs.get(itinerary.id)}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{itinerary.status}</Badge>
                  <Link href={`/staff/itineraries/${itinerary.id}`} className="text-forest hover:underline">
                    View
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
