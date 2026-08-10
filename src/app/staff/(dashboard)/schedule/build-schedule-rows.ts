import type { AuthContext } from '@modules/auth';
import { authService, type PublicUser } from '@modules/auth';
import { assignmentService, type AssignmentView } from '@modules/assignment';
import { catalogService } from '@modules/catalog';
import { can } from '@lib/rbac';
import { fleetService, type DriverProfileView, type VehicleView } from '@modules/fleet';
import { resolveTripProgress, type TripProgress } from '@modules/tracking';

export interface ScheduleRow {
  assignment: AssignmentView;
  detail: Awaited<ReturnType<typeof catalogService.getDepartureDetail>>;
  vehicle: VehicleView | undefined;
  driverProfile: DriverProfileView | undefined;
  guide: PublicUser | null | undefined;
  progress: TripProgress | null;
}

// Shared by all three Past/In Progress/Future list pages (DR-101) -- kept
// here rather than tripled per page, since it's the same row shape and the
// same fields in every case, not per-domain variation like the fleet/hotel
// pages' own local matchers.
export function matchesScheduleQuery(row: ScheduleRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { detail, vehicle, driverProfile, guide } = row;
  return (
    detail.packageCountry.toLowerCase().includes(q) ||
    (vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.plateNumber}`.toLowerCase().includes(q) : false) ||
    (driverProfile?.licenseNumber.toLowerCase().includes(q) ?? false) ||
    (guide?.name?.toLowerCase().includes(q) ?? false) ||
    (guide?.email.toLowerCase().includes(q) ?? false)
  );
}

// Extracted from schedule/page.tsx (DR-101) so both the card hub (counts
// only) and the three dedicated Past/In Progress/Future list pages can
// build the exact same joined row set without duplicating the
// fetch/join/progress-calc logic three times over. Not a page.tsx/route.ts
// (no Next.js reserved-export restriction applies to a plain module file
// like this one -- see CLAUDE.md's own gotcha on that, learned the hard
// way in DR-098).
export async function buildScheduleRows(ctx: AuthContext): Promise<ScheduleRow[]> {
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
  return assignments
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
}
