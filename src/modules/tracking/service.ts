// tracking module — service. Business logic; composes other modules' public
// interfaces only -- this module owns no Prisma table of its own (no
// repository.ts, same shape as `insights`/`notifications`). Every downstream
// call keeps its own existing permission check; `tracking.read` is an
// additional top-level gate on this method, not a bypass of any of them.
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { assertCan } from '@lib/rbac';
import { locationFreshness, resolveTripProgress } from './domain';
import type { ActiveTripView, FleetLocationView, FleetSnapshot } from './domain';

export const trackingService = {
  // Sequential throughout, not Promise.all -- this sandbox's Neon connection
  // pool has measurably choked ("Unable to start a transaction in the given
  // time") on bursts of concurrent withOrg transactions, even against an
  // empty org (see insightsService.getDashboardSummary, DR-038). A handful
  // of small reads run one at a time instead of all at once; this is a
  // low-traffic admin dashboard, not a hot path.
  async getFleetSnapshot(ctx: AuthContext): Promise<FleetSnapshot> {
    assertCan(ctx, 'tracking.read');
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
