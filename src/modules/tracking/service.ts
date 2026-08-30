// tracking module — service. Business logic; composes other modules' public
// interfaces only -- this module owns no Prisma table of its own (no
// repository.ts, same shape as `insights`/`notifications`). Every downstream
// call keeps its own existing permission check; `tracking.read` is an
// additional top-level gate on this method, not a bypass of any of them.
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { locationFreshness, resolveTripProgress } from './domain';
import type { ActiveTripView, FleetLocationView, FleetSnapshot } from './domain';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

export const trackingService = {
  // Sequential throughout, not Promise.all -- this sandbox's Neon connection
  // pool has measurably choked ("Unable to start a transaction in the given
  // time") on bursts of concurrent withOrg transactions, even against an
  // empty org (see insightsService.getDashboardSummary, DR-038). A handful
  // of small reads run one at a time instead of all at once; this is a
  // low-traffic admin dashboard, not a hot path.
  async getFleetSnapshot(ctx: AuthContext): Promise<FleetSnapshot> {
    assertCan(ctx, 'tracking.read');
    const organizationId = requireOrg(ctx);
    const now = new Date();

    // ---- Fleet locations: the whole org's kits, independent of trip
    // activity -- ops wants to see every kit's last known position, not
    // just ones currently on an active trip. ----
    const kits = await fleetService.listStarlinkKits(ctx);
    const kitVehicleIds = kits.map((k) => k.vehicleId).filter((id): id is string => id != null);
    const kitVehicles = await fleetService.listVehiclesByIds(ctx, kitVehicleIds);
    const vehiclesById = new Map(kitVehicles.map((v) => [v.id, v]));
    const fleet: FleetLocationView[] = kits.map((kit) => {
      const vehicle = kit.vehicleId ? vehiclesById.get(kit.vehicleId) : undefined;
      return {
        vehicleId: kit.vehicleId ?? '',
        plateNumber: vehicle?.plateNumber ?? 'Unassigned',
        kitId: kit.kitId,
        starlinkKitId: kit.id,
        latitude: kit.lastLatitude,
        longitude: kit.lastLongitude,
        lastLocationAt: kit.lastLocationAt,
        freshness: locationFreshness(kit.lastLocationAt, now),
      };
    });

    // ---- Active trips ----
    const assignments = await assignmentService.listAllAssignments(ctx);
    const departureIds = [...new Set(assignments.map((a) => a.departureId))];
    const vehicleIds = [...new Set(assignments.map((a) => a.vehicleId))];
    const driverProfileIds = [...new Set(assignments.map((a) => a.driverProfileId))];
    const guideUserIds = [...new Set(assignments.map((a) => a.guideUserId).filter((id): id is string => id != null))];

    const assignedVehicles = await fleetService.listVehiclesByIds(ctx, vehicleIds);
    const assignedVehiclesById = new Map(assignedVehicles.map((v) => [v.id, v]));
    const driverProfiles = await fleetService.listDriverProfilesByIds(ctx, driverProfileIds);
    const driverProfilesById = new Map(driverProfiles.map((d) => [d.id, d]));

    const driverNameByProfileId = new Map<string, string>();
    for (const profile of driverProfiles) {
      const user = await authService.getUser(profile.userId);
      driverNameByProfileId.set(profile.id, user?.name ?? user?.email ?? 'Driver');
    }
    const guideNameByUserId = new Map<string, string>();
    for (const guideUserId of guideUserIds) {
      const user = await authService.getUser(guideUserId);
      guideNameByUserId.set(guideUserId, user?.name ?? user?.email ?? 'Guide');
    }

    const activeTrips: ActiveTripView[] = [];
    for (const departureId of departureIds) {
      // A deleted (or cancelled/refunded) booking leaves its Assignment/
      // Departure rows behind -- neither has a live link back to Booking,
      // and Departure's own dates don't change when its last booking goes
      // away. Without this check a departure whose only booking was just
      // deleted keeps reading as an in-progress "ghost" trip, with a
      // vehicle/driver/guide still shown against it, until its endDate
      // finally passes. Same hasActiveBookingForDeparture check
      // syncFleetAvailabilityForDeparture already uses to resync fleet
      // resources on the same event (src/lib/fleet-availability.ts) --
      // this page is never cached (see file header), so the fix is simply
      // to stop counting the trip as active on the very next read.
      if (!(await bookingService.hasActiveBookingForDeparture(organizationId, departureId))) continue;

      let detail;
      try {
        detail = await catalogService.getDepartureDetail(ctx, departureId);
      } catch {
        continue; // not found/visible -- excluded, same tolerance Promise.allSettled would give
      }
      const { departure } = detail;
      const progress = resolveTripProgress(departure.startDate, departure.endDate, now);
      if (progress.status !== 'IN_PROGRESS') continue;

      const packageTitle = departure.tourPackageId
        ? (await catalogService.getPackage(ctx, departure.tourPackageId)).title
        : null;

      for (const a of assignments.filter((row) => row.departureId === departureId)) {
        const vehicle = assignedVehiclesById.get(a.vehicleId);
        const driverProfile = driverProfilesById.get(a.driverProfileId);
        activeTrips.push({
          departureId,
          packageTitle,
          country: detail.packageCountry,
          startDate: departure.startDate,
          endDate: departure.endDate,
          vehiclePlate: vehicle?.plateNumber ?? null,
          driverName: driverProfile ? (driverNameByProfileId.get(driverProfile.id) ?? null) : null,
          guideName: a.guideUserId ? (guideNameByUserId.get(a.guideUserId) ?? null) : null,
          progress,
        });
      }
    }

    return { fleet, activeTrips };
  },
};
