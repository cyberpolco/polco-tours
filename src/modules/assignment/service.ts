// assignment module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { Prisma } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { catalogService, type DepartureView } from '@modules/catalog';
import { fleetService, maintenanceRecencyScore, type DriverProfileView, type GuideProfileView, type VehicleView } from '@modules/fleet';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { haversineDistanceKm } from '@lib/geo';
import { assertCan } from '@lib/rbac';
import {
  capacityFitScore,
  combineVehicleScore,
  departuresOverlap,
  distanceScore,
  type AssignmentView,
  type CreateAssignmentInput,
} from './domain';
import { assignmentRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

/** Shared by createAssignment's hard validation and recommendAssignment's
 * eligibility filter -- neither a vehicle nor a driver may already be on a
 * different, date-overlapping departure. */
async function hasOverlappingAssignment(
  ctx: AuthContext,
  organizationId: string,
  departureId: string,
  departure: DepartureView,
  otherDepartureIds: Iterable<string>,
): Promise<boolean> {
  for (const otherDepartureId of otherDepartureIds) {
    if (otherDepartureId === departureId) continue;
    const other = await catalogService.getDepartureDetail(ctx, otherDepartureId);
    if (departuresOverlap(departure, other.departure)) return true;
  }
  return false;
}

export interface ScoredVehicle {
  vehicle: VehicleView;
  score: number;
}

export interface AssignmentRecommendation {
  vehicles: ScoredVehicle[]; // eligible only, sorted desc by score
  drivers: DriverProfileView[]; // eligible only -- no ranking beyond eligibility (driver rating deferred, no reviews system exists)
  recommendedVehicleId: string | null;
  recommendedDriverId: string | null;
}

export const assignmentService = {
  // 'assignment.write' is only ever granted to TOUR_OPERATOR/SUPERADMIN/
  // PLATFORM_ADMIN (rbac.ts) -- every method gated on it is inherently
  // manager-only, no separate role check needed.
  async createAssignment(
    ctx: AuthContext,
    departureId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentView> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);

    const { departure } = await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible

    const vehicle = await fleetService.getVehicle(ctx, input.vehicleId);
    if (vehicle.status !== 'ACTIVE') throw Errors.conflict('Vehicle is not ACTIVE');

    const driverProfile = await fleetService.getDriverProfile(ctx, input.driverProfileId);
    if (driverProfile.status !== 'ACTIVE') throw Errors.conflict('Driver is not ACTIVE');

    let guideProfile: GuideProfileView | null = null;
    if (input.guideUserId) {
      const guide = await authService.getUser(input.guideUserId);
      // authService.getUser is a raw, org-unscoped lookup (mirrors
      // getUserByEmail's convention) -- check the org explicitly here to
      // avoid assigning a guide from a different tenant.
      if (!guide || !guide.roles.includes('TOUR_GUIDE') || guide.organizationId !== organizationId) {
        throw Errors.validation('guideUserId must reference a TOUR_GUIDE in this organization');
      }
      // GuideProfile is optional (DR-030 introduced it after guides already
      // existed as bare Users) -- only gate on status when one exists, so a
      // guide who's never been given a profile isn't blocked from being
      // assigned. A profile that does exist and is SUSPENDED does block it,
      // closing the asymmetry with vehicle/driver ACTIVE checks above.
      guideProfile = await fleetService.findGuideProfileByUserId(ctx, input.guideUserId);
      if (guideProfile && guideProfile.status !== 'ACTIVE') {
        throw Errors.conflict('Guide is not ACTIVE');
      }
    }

    // Double-booking: neither the vehicle, driver, nor guide may already be
    // assigned to a *different* departure whose dates overlap this one.
    const [vehicleAssignments, driverAssignments, guideAssignments] = await Promise.all([
      assignmentRepository.listForVehicle(organizationId, input.vehicleId),
      assignmentRepository.listForDriverProfile(organizationId, input.driverProfileId),
      input.guideUserId ? assignmentRepository.listForGuide(organizationId, input.guideUserId) : Promise.resolve([]),
    ]);
    const otherDepartureIds = new Set(
      [...vehicleAssignments, ...driverAssignments, ...guideAssignments].map((a) => a.departureId),
    );
    if (await hasOverlappingAssignment(ctx, organizationId, departureId, departure, otherDepartureIds)) {
      throw Errors.conflict('Vehicle, driver, or guide is already assigned to an overlapping departure');
    }

    let assignment: AssignmentView;
    try {
      assignment = await assignmentRepository.create(organizationId, departureId, input);
    } catch (err) {
      // @@unique([departureId, vehicleId]) -- this vehicle is already on this departure.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('This vehicle is already assigned to this departure');
      }
      throw err;
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'assignment.created',
      resourceType: 'Assignment',
      resourceId: assignment.id,
      organizationId,
    });

    return assignment;
  },

  /** DR-029: a simple, transparent rules-based recommendation -- NOT the
   * real "AI assignment engine" this project's roadmap lists as Phase 3.
   * Vehicles are hard-filtered to ACTIVE + capacity-fits + not conflicting,
   * then scored (capacity fit, maintenance recency, distance from pickup
   * when the data exists) and ranked. Drivers are filtered the same way
   * (ACTIVE + not conflicting) but never ranked -- there's no rating data to
   * rank them by (deliberately deferred, no reviews system exists yet).
   * The caller (staff UI) pre-selects the top pick; the admin can still
   * choose any other eligible candidate instead. */
  async recommendAssignment(ctx: AuthContext, departureId: string): Promise<AssignmentRecommendation> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);
    const { departure } = await catalogService.getDepartureDetail(ctx, departureId);

    const [allVehicles, allDrivers] = await Promise.all([
      fleetService.listVehicles(ctx),
      fleetService.listDriverProfiles(ctx),
    ]);

    const vehicleCandidates: Array<{ vehicle: VehicleView; capacityFit: number }> = [];
    for (const vehicle of allVehicles) {
      if (vehicle.status !== 'ACTIVE') continue;
      const capacityFit = capacityFitScore(vehicle.seatCapacity, departure.capacity);
      if (capacityFit === null) continue;
      const otherDepartureIds = (await assignmentRepository.listForVehicle(organizationId, vehicle.id)).map(
        (a) => a.departureId,
      );
      if (await hasOverlappingAssignment(ctx, organizationId, departureId, departure, otherDepartureIds)) continue;
      vehicleCandidates.push({ vehicle, capacityFit });
    }

    const eligibleDrivers: DriverProfileView[] = [];
    for (const driverProfile of allDrivers) {
      if (driverProfile.status !== 'ACTIVE') continue;
      const otherDepartureIds = (
        await assignmentRepository.listForDriverProfile(organizationId, driverProfile.id)
      ).map((a) => a.departureId);
      if (await hasOverlappingAssignment(ctx, organizationId, departureId, departure, otherDepartureIds)) continue;
      eligibleDrivers.push(driverProfile);
    }

    const vehicleIds = vehicleCandidates.map((c) => c.vehicle.id);
    const [maintenanceByVehicle, locationByVehicle] = await Promise.all([
      fleetService.getMaintenanceRecencyByVehicleIds(ctx, vehicleIds),
      fleetService.getStarlinkLocationsByVehicleIds(ctx, vehicleIds),
    ]);

    const now = new Date();
    const scoredVehicles: ScoredVehicle[] = vehicleCandidates.map(({ vehicle, capacityFit }) => {
      const maintenanceRecency = maintenanceRecencyScore(maintenanceByVehicle.get(vehicle.id) ?? null, now);
      let distance: number | null = null;
      const kitLocation = locationByVehicle.get(vehicle.id);
      if (kitLocation && departure.pickupLatitude != null && departure.pickupLongitude != null) {
        const km = haversineDistanceKm(kitLocation, {
          latitude: departure.pickupLatitude,
          longitude: departure.pickupLongitude,
        });
        distance = distanceScore(km);
      }
      return { vehicle, score: combineVehicleScore({ capacityFit, maintenanceRecency, distance }) };
    });
    scoredVehicles.sort((a, b) => b.score - a.score);

    return {
      vehicles: scoredVehicles,
      drivers: eligibleDrivers,
      recommendedVehicleId: scoredVehicles[0]?.vehicle.id ?? null,
      recommendedDriverId: eligibleDrivers[0]?.id ?? null,
    };
  },

  /** Manager-only -- the staff departure-detail page's data source. */
  async listForDeparture(ctx: AuthContext, departureId: string): Promise<AssignmentView[]> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);
    await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible
    return assignmentRepository.listForDeparture(organizationId, departureId);
  },

  async removeAssignment(ctx: AuthContext, assignmentId: string): Promise<void> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);
    const removed = await assignmentRepository.remove(organizationId, assignmentId);
    if (!removed) throw Errors.notFound('Assignment not found');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'assignment.removed',
      resourceType: 'Assignment',
      resourceId: removed.id,
      organizationId,
    });
  },

  /** Self-service read, scoped per held role. No staff UI consumes this yet
   * (DR-018 deliberately defers a guide/driver/vehicle-owner portal) -- it
   * exists so the data is reachable and is covered by its own tests.
   *
   * DR-026: a user can hold several of these roles simultaneously, so this
   * collects the union across every role they hold (not just the first
   * match) and dedupes by assignment id in case the same row surfaces via
   * more than one angle. */
  async listMyAssignments(ctx: AuthContext): Promise<AssignmentView[]> {
    assertCan(ctx.roles, 'assignment.read');
    const organizationId = requireOrg(ctx);

    const lists: AssignmentView[][] = [];
    if (ctx.roles.includes('TOUR_GUIDE')) {
      lists.push(await assignmentRepository.listForGuide(organizationId, ctx.userId));
    }
    if (ctx.roles.includes('DRIVER')) {
      const profile = await fleetService.getMyDriverProfile(ctx);
      if (profile) lists.push(await assignmentRepository.listForDriverProfile(organizationId, profile.id));
    }
    if (ctx.roles.includes('VEHICLE_OWNER')) {
      const vehicles = await fleetService.listVehicles(ctx); // already owner-scoped
      const perVehicle = await Promise.all(vehicles.map((v) => assignmentRepository.listForVehicle(organizationId, v.id)));
      lists.push(perVehicle.flat());
    }
    // Managers use listForDeparture (per-departure) instead of a flat "mine" view.
    const byId = new Map<string, AssignmentView>();
    for (const list of lists) for (const a of list) byId.set(a.id, a);
    return [...byId.values()];
  },
};
