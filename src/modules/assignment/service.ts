// assignment module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { Prisma } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { catalogService, hasDepartureEnded, type DepartureView } from '@modules/catalog';
import { fleetService, maintenanceRecencyScore, type DriverProfileView, type GuideProfileView, type VehicleView } from '@modules/fleet';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { ApiError, Errors } from '@lib/errors';
import { haversineDistanceKm } from '@lib/geo';
import { assertCan } from '@lib/rbac';
import {
  capacityFitScore,
  combineVehicleScore,
  compareByRating,
  compareGuidesByMatch,
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
 * different, date-overlapping departure.
 *
 * A candidate's past assignment can point at a departure whose TourPackage
 * has since been soft-deleted -- soft-deleting a package doesn't cascade to
 * its Departure/Assignment rows, so getDepartureDetail 404s on it forever
 * after (real incident: this crashed the entire departure-detail page and
 * assignment creation for ANY vehicle/driver/guide that had ever been
 * assigned to such an orphaned departure, not just that departure itself).
 * A departure that can no longer be resolved can't meaningfully overlap
 * anything -- treat it as no conflict instead of letting the 404 escape. */
async function hasOverlappingAssignment(
  ctx: AuthContext,
  organizationId: string,
  departureId: string,
  departure: DepartureView,
  otherDepartureIds: Iterable<string>,
): Promise<boolean> {
  for (const otherDepartureId of otherDepartureIds) {
    if (otherDepartureId === departureId) continue;
    let other;
    try {
      other = await catalogService.getDepartureDetail(ctx, otherDepartureId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) continue;
      throw err;
    }
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
  // eligible, sorted desc by averageRating (DR-037; unrated sorts last, never
  // excluded) -- EXCEPT DR-252 moves the top guide's own DriverProfile (if
  // they have an eligible one) to the front, ahead of rating order.
  drivers: DriverProfileView[];
  guides: GuideProfileView[]; // eligible, sorted by compareGuidesByMatch (DR-247)
  recommendedVehicleId: string | null;
  recommendedDriverId: string | null;
  recommendedGuideId: string | null; // a GuideProfile's userId (Assignment.guideUserId references User directly)
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
    assertCan(ctx, 'assignment.write');
    const organizationId = requireOrg(ctx);

    const { departure, packageCountry } = await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible
    if (hasDepartureEnded(departure.endDate, new Date())) {
      throw Errors.conflict('This departure has already ended -- assignments can no longer be changed');
    }

    const vehicle = await fleetService.getVehicle(ctx, input.vehicleId);
    if (vehicle.status !== 'ACTIVE') throw Errors.conflict('Vehicle is not ACTIVE');

    const driverProfile = await fleetService.getDriverProfile(ctx, input.driverProfileId);
    if (driverProfile.status !== 'ACTIVE') throw Errors.conflict('Driver is not ACTIVE');

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
    const guideProfile = await fleetService.findGuideProfileByUserId(ctx, input.guideUserId);
    if (guideProfile && guideProfile.status !== 'ACTIVE') {
      throw Errors.conflict('Guide is not ACTIVE');
    }

    // Double-booking: neither the vehicle, driver, nor guide may already be
    // assigned to a *different* departure whose dates overlap this one.
    const [vehicleAssignments, driverAssignments, guideAssignments] = await Promise.all([
      assignmentRepository.listForVehicle(organizationId, input.vehicleId),
      assignmentRepository.listForDriverProfile(organizationId, input.driverProfileId),
      assignmentRepository.listForGuide(organizationId, input.guideUserId),
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

    // DR-205: let the driver/guide/vehicle-owner staff themselves know
    // they've been scheduled -- best-effort/never-throws, same as every
    // other notify() call, so a notification failure can't roll back an
    // assignment that already succeeded.
    const driverUser = await authService.getUser(driverProfile.userId);
    const vehicleLabel = `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`;
    await notificationsService.notify('ASSIGNMENT_NOTICE_DRIVER', driverProfile.userId, organizationId, {
      startDate: departure.startDate,
      country: packageCountry,
      vehicleLabel,
      guideName: guide.name ?? guide.email,
    });
    await notificationsService.notify('ASSIGNMENT_NOTICE_GUIDE', guide.id, organizationId, {
      startDate: departure.startDate,
      country: packageCountry,
      vehicleLabel,
      driverName: driverUser?.name ?? driverUser?.email,
    });
    if (vehicle.ownerId) {
      await notificationsService.notify('ASSIGNMENT_NOTICE_VEHICLE_OWNER', vehicle.ownerId, organizationId, {
        startDate: departure.startDate,
        country: packageCountry,
        vehicleLabel,
        driverName: driverUser?.name ?? driverUser?.email,
      });
    }

    return assignment;
  },

  /** DR-029: a simple, transparent rules-based recommendation -- NOT the
   * real "AI assignment engine" this project's roadmap lists as Phase 3.
   * Vehicles are hard-filtered to ACTIVE + capacity-fits + not conflicting,
   * then scored (capacity fit, maintenance recency, distance from pickup
   * when the data exists) and ranked. Drivers and guides are filtered the
   * same way (ACTIVE + not conflicting). Drivers are then sorted by
   * averageRating alone (DR-037 -- unrated candidates sort last but are
   * never excluded, per the spec's "may be deprioritized," not "excluded").
   * Guides are sorted by compareGuidesByMatch (DR-247): specialty-tag
   * overlap with the departure's own package tags first (DR-245's
   * PackageTag-enum specialties), averageRating only as the tiebreaker --
   * degrades to the old rating-only ordering for a bespoke (TAILOR_MADE)
   * departure, which has no package tags to match against. The caller
   * (staff UI) pre-selects the top pick; the admin can still choose any
   * other eligible candidate instead. DR-252: if the top guide also holds
   * an eligible DriverProfile of their own, they're moved to the front of
   * the driver list/pick too -- see this function's own inline comment. */
  async recommendAssignment(ctx: AuthContext, departureId: string): Promise<AssignmentRecommendation> {
    assertCan(ctx, 'assignment.write');
    const organizationId = requireOrg(ctx);
    const { departure } = await catalogService.getDepartureDetail(ctx, departureId);
    // DR-247: a bespoke (TAILOR_MADE) departure has no linked TourPackage,
    // hence no tags -- compareGuidesByMatch degrades to pure
    // compareByRating for it, same as before this DR.
    const packageTags = departure.tourPackageId ? (await catalogService.getPackage(ctx, departure.tourPackageId)).tags : [];

    const [allVehicles, allDrivers, allGuides] = await Promise.all([
      fleetService.listVehicles(ctx),
      fleetService.listDriverProfiles(ctx),
      fleetService.listGuideProfiles(ctx),
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
    eligibleDrivers.sort(compareByRating);

    // Symmetric to the driver loop above -- candidates come from
    // GuideProfile rows only (a guide with no profile yet is simply absent
    // from ranking, same as how driver ranking only ever sees profiled
    // drivers). Assignment.guideUserId references User directly, so
    // otherDepartureIds is resolved by guideProfile.userId, not its own id.
    // DR-081 incident fix: GuideProfile.status has no cascade when its
    // underlying User is soft-deleted (deactivateUser only sets
    // User.deletedAt, nothing touches GuideProfile) -- an ACTIVE profile
    // can point at a deleted user. createAssignment's own validation
    // (authService.getUser returning null for a deleted user) already
    // rejects that combination; re-check it here too so the recommendation
    // never offers a candidate the service will then refuse.
    const eligibleGuides: GuideProfileView[] = [];
    for (const guideProfile of allGuides) {
      if (guideProfile.status !== 'ACTIVE') continue;
      const guideUser = await authService.getUser(guideProfile.userId);
      if (!guideUser || !guideUser.roles.includes('TOUR_GUIDE')) continue;
      const otherDepartureIds = (await assignmentRepository.listForGuide(organizationId, guideProfile.userId)).map(
        (a) => a.departureId,
      );
      if (await hasOverlappingAssignment(ctx, organizationId, departureId, departure, otherDepartureIds)) continue;
      eligibleGuides.push(guideProfile);
    }
    eligibleGuides.sort(compareGuidesByMatch(packageTags));

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

    // DR-252 (explicit user request): if the top-recommended guide also
    // holds an eligible DriverProfile of their own (ROLE_COMPATIBILITY,
    // DR-221, allows one person to hold both DRIVER and TOUR_GUIDE), prefer
    // recommending that same person as the driver too, over whoever merely
    // has the highest averageRating -- one person doing both jobs is a real,
    // common staffing pattern for a small tour operator. Falls back to the
    // plain highest-rated driver when the top guide has no DriverProfile at
    // all, or has one that isn't currently eligible (SUSPENDED, or already
    // conflicting with another departure) -- same as before this DR.
    const topGuide = eligibleGuides[0];
    const dualRoleDriverIndex = topGuide ? eligibleDrivers.findIndex((d) => d.userId === topGuide.userId) : -1;
    const orderedDrivers =
      dualRoleDriverIndex > 0
        ? [eligibleDrivers[dualRoleDriverIndex]!, ...eligibleDrivers.slice(0, dualRoleDriverIndex), ...eligibleDrivers.slice(dualRoleDriverIndex + 1)]
        : eligibleDrivers;

    return {
      vehicles: scoredVehicles,
      drivers: orderedDrivers,
      guides: eligibleGuides,
      recommendedVehicleId: scoredVehicles[0]?.vehicle.id ?? null,
      recommendedDriverId: orderedDrivers[0]?.id ?? null,
      recommendedGuideId: topGuide?.userId ?? null,
    };
  },

  /** Manager-only -- the staff departure-detail page's data source. */
  async listForDeparture(ctx: AuthContext, departureId: string): Promise<AssignmentView[]> {
    assertCan(ctx, 'assignment.write');
    const organizationId = requireOrg(ctx);
    await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible
    return assignmentRepository.listForDeparture(organizationId, departureId);
  },

  /** DR-260 (explicit user request): resolves the distinct staff user ids
   * with a real stake in a departure -- every assignment's driver, guide,
   * and vehicle owner (when the vehicle has one) -- so a caller can notify
   * the people actually running the trip rather than the guest. Used by
   * itinerary/service.ts's approveItinerary, which used to notify the
   * guest instead; kept here (not duplicated into itinerary) since
   * assignment already depends on fleet for exactly this driver/vehicle
   * resolution (see createAssignment above), and itinerary has no reason
   * to gain its own fleet dependency just for this. Same permission/
   * visibility gate as listForDeparture -- manager-only. */
  async listAssignedStaffUserIds(ctx: AuthContext, departureId: string): Promise<string[]> {
    assertCan(ctx, 'assignment.write');
    const organizationId = requireOrg(ctx);
    await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible
    const assignments = await assignmentRepository.listForDeparture(organizationId, departureId);

    const userIds = new Set<string>();
    for (const assignment of assignments) {
      const [vehicle, driverProfile] = await Promise.all([
        fleetService.getVehicle(ctx, assignment.vehicleId),
        fleetService.getDriverProfile(ctx, assignment.driverProfileId),
      ]);
      userIds.add(driverProfile.userId);
      if (assignment.guideUserId) userIds.add(assignment.guideUserId);
      if (vehicle.ownerId) userIds.add(vehicle.ownerId);
    }
    return [...userIds];
  },

  /** Insights & Decision Making (DR-038): every assignment in the org, for
   * utilization reporting. Gated on `assignment.write` (manager-only),
   * matching `listForDeparture` above -- `assignment.read` is also held by
   * TOUR_GUIDE/DRIVER/VEHICLE_OWNER for their own self-scoped view
   * (`listMyAssignments`), who must not see the whole org's assignments. */
  async listAllAssignments(ctx: AuthContext): Promise<AssignmentView[]> {
    assertCan(ctx, 'assignment.write');
    return assignmentRepository.listAllForOrg(requireOrg(ctx));
  },

  /** Ratings module (DR-037): resolves which driver(s)/guide(s) served a
   * departure so a client can rate the actual people, not an arbitrary
   * picker. No ctx -- the caller (ratings service) has already
   * independently verified the guest's two-factor Rating Code before
   * reaching here, same "caller already gates" convention as
   * bookingService.listTravelersForDeparture (DR-030), deliberately not a
   * public REST route for the same reason. */
  async listAssignmentsForRating(organizationId: string, departureId: string): Promise<AssignmentView[]> {
    return assignmentRepository.listForDeparture(organizationId, departureId);
  },

  /** Returns the removed row (DR-082: the departure page's
   * removeAssignmentAction needs the freed vehicleId/driverProfileId/
   * guideUserId to recompute their availability -- a departure-scoped
   * lookup can't find them anymore once the assignment is gone). */
  async removeAssignment(ctx: AuthContext, assignmentId: string): Promise<AssignmentView> {
    assertCan(ctx, 'assignment.write');
    const organizationId = requireOrg(ctx);

    const existing = await assignmentRepository.findById(organizationId, assignmentId);
    if (!existing) throw Errors.notFound('Assignment not found');
    const { departure } = await catalogService.getDepartureDetail(ctx, existing.departureId);
    if (hasDepartureEnded(departure.endDate, new Date())) {
      throw Errors.conflict('This departure has already ended -- assignments can no longer be changed');
    }

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
    return removed;
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
    assertCan(ctx, 'assignment.read');
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
