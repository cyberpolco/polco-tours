import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { authService, type PublicUser } from '@modules/auth';
import { assignmentService, type AssignmentView } from '@modules/assignment';
import { bookingService, type TravelerDutyGroup } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService, type DriverProfileView, type VehicleView } from '@modules/fleet';
import { itineraryService } from '@modules/itinerary';
import { resolveTripProgress, type TripProgress } from '@modules/tracking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Th, Tr, Td } from '@/components/ui/Table';
import { DEPARTURE_STATUS_TONE, ITINERARY_STATUS_TONE } from '@lib/status-tones';

interface ScheduleRow {
  assignment: AssignmentView;
  detail: Awaited<ReturnType<typeof catalogService.getDepartureDetail>>;
  vehicle: VehicleView | undefined;
  driverProfile: DriverProfileView | undefined;
  guide: PublicUser | null | undefined;
  progress: TripProgress | null;
}

// One grouped table (Upcoming/In Progress/Completed) -- split out so the
// three sections share identical columns/rendering instead of tripling the
// JSX. Renders nothing at all when empty, so an entirely-upcoming schedule
// doesn't show two empty "In progress"/"Completed" headings.
function AssignmentsSection({ title, rows }: { title: string; rows: ScheduleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-navy">{title}</h2>
      <Table>
        <thead>
          <TableHeaderRow>
            <Th>Departure</Th>
            <Th>Vehicle</Th>
            <Th>Driver</Th>
            <Th>Guide</Th>
            <Th>Pickup point</Th>
          </TableHeaderRow>
        </thead>
        <tbody>
          {rows.map(({ assignment, detail, vehicle, driverProfile, guide, progress }) => (
            <Tr key={assignment.id}>
              <Td>
                {detail.departure.startDate.toLocaleDateString()} · {detail.packageCountry}{' '}
                <Badge tone={DEPARTURE_STATUS_TONE[detail.departure.status]}>{detail.departure.status}</Badge>
                {progress?.status === 'IN_PROGRESS' && (
                  <>
                    <span className="ml-2 text-xs text-mist">
                      {progress.totalDays != null ? `Day ${progress.dayNumber} of ${progress.totalDays}` : `Day ${progress.dayNumber}`}
                    </span>
                    {progress.percentComplete != null && (
                      <div className="mt-1 h-1.5 w-32 rounded-full bg-rule">
                        <div
                          className="h-1.5 rounded-full bg-forest"
                          style={{ width: `${progress.percentComplete}%` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </Td>
              <Td>{vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : 'Unknown vehicle'}</Td>
              <Td>{driverProfile ? `License ${driverProfile.licenseNumber}` : 'Unknown driver'}</Td>
              <Td>{guide ? (guide.name ?? guide.email) : '—'}</Td>
              <Td>
                {detail.departure.pickupLatitude != null && detail.departure.pickupLongitude != null
                  ? `${detail.departure.pickupLatitude.toFixed(4)}, ${detail.departure.pickupLongitude.toFixed(4)}`
                  : 'Not set'}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// Self-service read for TOUR_GUIDE/DRIVER/VEHICLE_OWNER -- closes the gap
// DR-018/019/020 each deferred. No actions.ts: strictly read-only, same
// convention as /staff/immigration. Composition (join raw AssignmentView[]
// against departure/vehicle/driver/guide data) happens right here, same
// pattern already used by the manager-side departure-detail page, rather
// than a shared cross-module service method.
export default async function MySchedulePage() {
  const ctx = await requireStaffContext('assignment.read');
  const assignments = await assignmentService.listMyAssignments(ctx);

  const departureIds = [...new Set(assignments.map((a) => a.departureId))];
  const vehicleIds = [...new Set(assignments.map((a) => a.vehicleId))];
  const driverProfileIds = [...new Set(assignments.map((a) => a.driverProfileId))];
  const guideUserIds = [...new Set(assignments.map((a) => a.guideUserId).filter((id): id is string => Boolean(id)))];

  // getDepartureDetail 404s for a non-operator role once a departure is no
  // longer SCHEDULED (catalog/domain.ts's isDepartureVisible) -- routine for
  // a COMPLETED trip in a TOUR_GUIDE/DRIVER/VEHICLE_OWNER's own history, so
  // this must tolerate individual failures (allSettled) rather than let one
  // completed departure 500 the whole page (Promise.all would).
  //
  // Every role reaching this page holds fleet.read today (TOUR_GUIDE gained
  // it in DR-030 for its own GuideProfile self-view, DRIVER/VEHICLE_OWNER
  // have held it since DR-017) -- this check is a defensive guard against a
  // future role reaching this page without it, not a real branch today; it
  // skips the fleet lookups entirely rather than letting fleetService's
  // assertCan throw and crash the page, falling back to "Unknown
  // vehicle/driver" the same way a missing lookup already renders.
  const canReadFleet = can(ctx, 'fleet.read');
  const [departureResults, vehicles, driverProfiles, guides] = await Promise.all([
    Promise.allSettled(departureIds.map((id) => catalogService.getDepartureDetail(ctx, id))),
    canReadFleet ? fleetService.listVehiclesByIds(ctx, vehicleIds) : Promise.resolve<VehicleView[]>([]),
    canReadFleet ? fleetService.listDriverProfilesByIds(ctx, driverProfileIds) : Promise.resolve<DriverProfileView[]>([]),
    Promise.all(guideUserIds.map((id) => authService.getUser(id))),
  ]);
  const departureDetails = departureResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof catalogService.getDepartureDetail>>> => r.status === 'fulfilled')
    .map((r) => r.value);

  const departureById = new Map(departureDetails.map((d) => [d.departure.id, d]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const driverProfileById = new Map(driverProfiles.map((d) => [d.id, d]));
  const guideById = new Map(guides.filter(Boolean).map((g) => [g!.id, g!]));

  const now = new Date();
  const rows = assignments
    .map((a) => {
      const detail = departureById.get(a.departureId);
      return {
        assignment: a,
        detail,
        vehicle: vehicleById.get(a.vehicleId),
        driverProfile: driverProfileById.get(a.driverProfileId),
        guide: a.guideUserId ? guideById.get(a.guideUserId) : null,
        // Tracking (DR-041): departure-level date-range progress, not
        // itinerary-day-level -- see tracking/domain.ts's resolveTripProgress
        // comment for why.
        progress: detail ? resolveTripProgress(detail.departure.startDate, detail.departure.endDate, now) : null,
      };
    })
    .filter((r): r is typeof r & { detail: NonNullable<typeof r.detail> } => r.detail !== undefined)
    .sort((a, b) => a.detail.departure.startDate.getTime() - b.detail.departure.startDate.getTime());

  // Grouped Upcoming/In Progress/Completed instead of one flat interleaved
  // table -- clearer at a glance once someone has more than a handful of
  // assignments, same status-grouping instinct as /staff/bookings' filter
  // pills.
  const upcomingRows = rows.filter((r) => r.progress?.status === 'NOT_STARTED');
  const inProgressRows = rows.filter((r) => r.progress?.status === 'IN_PROGRESS');
  const completedRows = rows.filter((r) => r.progress?.status === 'COMPLETED');

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
        <div className="space-y-8">
          <AssignmentsSection title="In progress" rows={inProgressRows} />
          <AssignmentsSection title="Upcoming" rows={upcomingRows} />
          <AssignmentsSection title="Completed" rows={completedRows} />
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
