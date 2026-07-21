// fleet module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { documentsService, type DocumentSummary } from '@modules/documents';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  isFleetDeleter,
  type CreateDriverProfileInput,
  type CreateGuideProfileInput,
  type CreateMaintenanceRecordInput,
  type CreateStarlinkKitInput,
  type CreateVehicleInput,
  type DriverProfileView,
  type GuideProfileView,
  type MaintenanceRecordView,
  type SetStarlinkLocationInput,
  type StarlinkKitView,
  type UpdateDriverProfileInput,
  type UpdateGuideProfileInput,
  type UpdateStarlinkKitInput,
  type UpdateVehicleInput,
  type VehicleView,
} from './domain';
import { fleetRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOUR_OPERATOR/SUPERADMIN/PLATFORM_ADMIN manage the whole fleet; everyone
// else with fleet.read (VEHICLE_OWNER, DRIVER) only ever sees their own
// records -- enforced here, not in rbac.ts (anti-BOLA, same convention as
// invoicing/service.ts's "own invoice only" checks).
function isFleetManager(roles: Role[]): boolean {
  return roles.some((role) => role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN');
}

type VehicleComplianceKind = 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'VEHICLE_INSPECTION';

export interface UploadComplianceDocumentInput {
  kind: VehicleComplianceKind | 'DRIVER_LICENSE' | 'GUIDE_CERTIFICATION';
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
  expiresAt?: Date;
}

export const fleetService = {
  async createVehicle(ctx: AuthContext, input: CreateVehicleInput): Promise<VehicleView> {
    assertCan(ctx, 'fleet.write');
    return fleetRepository.createVehicle(requireOrg(ctx), input);
  },

  async updateVehicle(ctx: AuthContext, vehicleId: string, input: UpdateVehicleInput): Promise<VehicleView> {
    assertCan(ctx, 'fleet.write');
    const updated = await fleetRepository.updateVehicle(requireOrg(ctx), vehicleId, input);
    if (!updated) throw Errors.notFound('Vehicle not found');
    return updated;
  },

  /** DR-059: genuinely destructive, unlike every other fleet mutation --
   * SUPERADMIN-only. `assertCan` alone isn't enough, since `fleet.delete`
   * could in principle be granted to another role via the runtime-editable
   * permission matrix -- `isFleetDeleter` is the real gate, same layering
   * as bookingService.deleteBooking (DR-058). Soft delete (Vehicle
   * .deletedAt already existed, scaffolded but unwritten until now) --
   * every FK into Vehicle is onDelete: Cascade with no Restrict anywhere,
   * so a real hard delete would silently destroy Assignment history with
   * no warning; this avoids that entirely. */
  async deleteVehicle(ctx: AuthContext, vehicleId: string): Promise<void> {
    assertCan(ctx, 'fleet.delete');
    if (!isFleetDeleter(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a vehicle');
    const organizationId = requireOrg(ctx);
    const deleted = await fleetRepository.softDeleteVehicle(organizationId, vehicleId);
    if (!deleted) throw Errors.notFound('Vehicle not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.vehicle_deleted',
      resourceType: 'Vehicle',
      resourceId: vehicleId,
      organizationId,
    });
  },

  async getVehicle(ctx: AuthContext, vehicleId: string): Promise<VehicleView> {
    assertCan(ctx, 'fleet.read');
    const vehicle = await fleetRepository.findVehicleById(requireOrg(ctx), vehicleId);
    // Ownership check returns notFound (not forbidden) so a non-owner can't
    // tell a vehicle exists at all -- same convention as invoicing/service.ts.
    if (!vehicle || (!isFleetManager(ctx.roles) && vehicle.ownerId !== ctx.userId)) {
      throw Errors.notFound('Vehicle not found');
    }
    return vehicle;
  },

  async listVehicles(ctx: AuthContext): Promise<VehicleView[]> {
    assertCan(ctx, 'fleet.read');
    const all = await fleetRepository.listVehicles(requireOrg(ctx));
    if (isFleetManager(ctx.roles)) return all;
    // VEHICLE_OWNER sees only their own vehicles; any other fleet.read role
    // (e.g. DRIVER) has no ownership concept here yet -- empty until
    // Assignments (a later Phase 2 increment) links a driver to a vehicle.
    return all.filter((v) => v.ownerId === ctx.userId);
  },

  async createDriverProfile(ctx: AuthContext, input: CreateDriverProfileInput): Promise<DriverProfileView> {
    assertCan(ctx, 'fleet.write');
    return fleetRepository.createDriverProfile(requireOrg(ctx), input);
  },

  async updateDriverProfile(
    ctx: AuthContext,
    driverProfileId: string,
    input: UpdateDriverProfileInput,
  ): Promise<DriverProfileView> {
    assertCan(ctx, 'fleet.write');
    const updated = await fleetRepository.updateDriverProfile(requireOrg(ctx), driverProfileId, input);
    if (!updated) throw Errors.notFound('Driver profile not found');
    return updated;
  },

  /** DR-059: SUPERADMIN-only, same layering as deleteVehicle -- soft delete
   * (new DriverProfile.deletedAt) since Assignment/ReviewSubjectRating both
   * cascade from this table with no Restrict guard anywhere. */
  async deleteDriverProfile(ctx: AuthContext, driverProfileId: string): Promise<void> {
    assertCan(ctx, 'fleet.delete');
    if (!isFleetDeleter(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a driver profile');
    const organizationId = requireOrg(ctx);
    const deleted = await fleetRepository.softDeleteDriverProfile(organizationId, driverProfileId);
    if (!deleted) throw Errors.notFound('Driver profile not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.driver_profile_deleted',
      resourceType: 'DriverProfile',
      resourceId: driverProfileId,
      organizationId,
    });
  },

  async getDriverProfile(ctx: AuthContext, driverProfileId: string): Promise<DriverProfileView> {
    assertCan(ctx, 'fleet.read');
    const profile = await fleetRepository.findDriverProfileById(requireOrg(ctx), driverProfileId);
    if (!profile || (!isFleetManager(ctx.roles) && profile.userId !== ctx.userId)) {
      throw Errors.notFound('Driver profile not found');
    }
    return profile;
  },

  /** Managers only -- a DRIVER looks up their own profile via getDriverProfile. */
  async listDriverProfiles(ctx: AuthContext): Promise<DriverProfileView[]> {
    assertCan(ctx, 'fleet.read');
    if (!isFleetManager(ctx.roles)) throw Errors.forbidden('Only fleet managers may list all driver profiles');
    return fleetRepository.listDriverProfiles(requireOrg(ctx));
  },

  /** Resolves the caller's own DriverProfile by userId (null if they don't
   * have one) -- used by assignment/service.ts's listMyAssignments (DR-018),
   * since a DRIVER's assignments are keyed by driverProfileId, not userId. */
  async getMyDriverProfile(ctx: AuthContext): Promise<DriverProfileView | null> {
    assertCan(ctx, 'fleet.read');
    return fleetRepository.findDriverProfileByUserId(requireOrg(ctx), ctx.userId);
  },

  /** Org-scoped lookup by a known set of IDs, deliberately with no
   * ownership/manager filter -- same "caller already gates" convention as
   * authService.getUser. Used by the "my schedule" self-service page
   * (DR-021) so a DRIVER/TOUR_GUIDE can see the vehicle/driver tied to their
   * own assignment even though they don't own it; the assignment itself is
   * the caller's authorization, not fleet ownership. */
  async listVehiclesByIds(ctx: AuthContext, ids: string[]): Promise<VehicleView[]> {
    assertCan(ctx, 'fleet.read');
    if (ids.length === 0) return [];
    return fleetRepository.findVehiclesByIds(requireOrg(ctx), ids);
  },

  async listDriverProfilesByIds(ctx: AuthContext, ids: string[]): Promise<DriverProfileView[]> {
    assertCan(ctx, 'fleet.read');
    if (ids.length === 0) return [];
    return fleetRepository.findDriverProfilesByIds(requireOrg(ctx), ids);
  },

  /** Ratings module (DR-037): resolves the driver(s) a guest is rating, by
   * id, with no ctx -- the caller has already independently verified the
   * guest's two-factor Rating Code before reaching here, same "caller
   * already gates" convention as listVehiclesByIds/listDriverProfilesByIds
   * (DR-021). Unlike those, organizationId is passed explicitly since there
   * is no ctx to derive it from. */
  async listDriverProfilesForRating(organizationId: string, ids: string[]): Promise<DriverProfileView[]> {
    if (ids.length === 0) return [];
    return fleetRepository.findDriverProfilesByIds(organizationId, ids);
  },

  /** Guest `/find-booking` lookup: resolves the vehicle(s)/Starlink kit(s)
   * assigned to a booking's departure, with no ctx -- same "caller already
   * gates" convention as listDriverProfilesForRating above (the page has
   * already independently verified the guest's two-factor lookup before
   * reaching here). Explicit, informed user choice to show real vehicle
   * details (plate/make/model) on this no-login page. */
  async listVehiclesForBookingLookup(organizationId: string, ids: string[]): Promise<VehicleView[]> {
    if (ids.length === 0) return [];
    return fleetRepository.findVehiclesByIds(organizationId, ids);
  },

  async listStarlinkKitsByVehicleIdsForBookingLookup(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, StarlinkKitView>> {
    if (vehicleIds.length === 0) return new Map();
    return fleetRepository.findStarlinkKitsByVehicleIds(organizationId, vehicleIds);
  },

  /** Ratings module (DR-037) -- this codebase's first no-ctx cross-module
   * WRITE (every prior "caller already gates" method, e.g. the read above,
   * only ever reads). Deliberately narrow: it can only ever set
   * averageRating/ratingCount, never a general update payload, and is still
   * routed through withOrg/RLS so a cross-tenant id fails closed at the DB
   * layer even if the app-layer trust assumption above is ever violated by
   * a future caller. Do not widen this into a generic profile updater, and
   * do not add a third no-ctx write without re-reading this comment. */
  async recordDriverRatingAggregate(
    organizationId: string,
    driverProfileId: string,
    aggregate: { averageRating: number; ratingCount: number },
  ): Promise<void> {
    return fleetRepository.updateDriverRatingAggregate(organizationId, driverProfileId, aggregate);
  },

  /** Same no-ctx write exception as recordDriverRatingAggregate, keyed by
   * userId (see updateGuideRatingAggregateByUserId) -- no-ops if the guide
   * has no GuideProfile row yet (profiles are optional, DR-030). */
  async recordGuideRatingAggregateByUserId(
    organizationId: string,
    guideUserId: string,
    aggregate: { averageRating: number; ratingCount: number },
  ): Promise<void> {
    return fleetRepository.updateGuideRatingAggregateByUserId(organizationId, guideUserId, aggregate);
  },

  // ------------------------------------------------------------ guides (DR-030)

  async createGuideProfile(ctx: AuthContext, input: CreateGuideProfileInput): Promise<GuideProfileView> {
    assertCan(ctx, 'fleet.write');
    return fleetRepository.createGuideProfile(requireOrg(ctx), input);
  },

  async updateGuideProfile(
    ctx: AuthContext,
    guideProfileId: string,
    input: UpdateGuideProfileInput,
  ): Promise<GuideProfileView> {
    assertCan(ctx, 'fleet.write');
    const updated = await fleetRepository.updateGuideProfile(requireOrg(ctx), guideProfileId, input);
    if (!updated) throw Errors.notFound('Guide profile not found');
    return updated;
  },

  /** DR-059: SUPERADMIN-only, same layering as deleteVehicle/
   * deleteDriverProfile. Soft delete (new GuideProfile.deletedAt). */
  async deleteGuideProfile(ctx: AuthContext, guideProfileId: string): Promise<void> {
    assertCan(ctx, 'fleet.delete');
    if (!isFleetDeleter(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a guide profile');
    const organizationId = requireOrg(ctx);
    const deleted = await fleetRepository.softDeleteGuideProfile(organizationId, guideProfileId);
    if (!deleted) throw Errors.notFound('Guide profile not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.guide_profile_deleted',
      resourceType: 'GuideProfile',
      resourceId: guideProfileId,
      organizationId,
    });
  },

  async getGuideProfile(ctx: AuthContext, guideProfileId: string): Promise<GuideProfileView> {
    assertCan(ctx, 'fleet.read');
    const profile = await fleetRepository.findGuideProfileById(requireOrg(ctx), guideProfileId);
    if (!profile || (!isFleetManager(ctx.roles) && profile.userId !== ctx.userId)) {
      throw Errors.notFound('Guide profile not found');
    }
    return profile;
  },

  /** Managers only -- a TOUR_GUIDE looks up their own profile via getGuideProfile. */
  async listGuideProfiles(ctx: AuthContext): Promise<GuideProfileView[]> {
    assertCan(ctx, 'fleet.read');
    if (!isFleetManager(ctx.roles)) throw Errors.forbidden('Only fleet managers may list all guide profiles');
    return fleetRepository.listGuideProfiles(requireOrg(ctx));
  },

  /** Resolves the caller's own GuideProfile by userId (null if they don't
   * have one yet) -- mirrors getMyDriverProfile. */
  async getMyGuideProfile(ctx: AuthContext): Promise<GuideProfileView | null> {
    assertCan(ctx, 'fleet.read');
    return fleetRepository.findGuideProfileByUserId(requireOrg(ctx), ctx.userId);
  },

  /** Managers-only lookup of an arbitrary user's GuideProfile by userId (not
   * necessarily the caller's own) -- used by assignment/service.ts to check
   * a candidate guide's ACTIVE status before assigning them (DR-030). Unlike
   * getGuideProfile/getMyGuideProfile this is keyed by User.id, since
   * Assignment.guideUserId references User directly, not GuideProfile. */
  async findGuideProfileByUserId(ctx: AuthContext, userId: string): Promise<GuideProfileView | null> {
    assertCan(ctx, 'fleet.read');
    if (!isFleetManager(ctx.roles)) throw Errors.forbidden('Only fleet managers may look up another user\'s guide profile');
    return fleetRepository.findGuideProfileByUserId(requireOrg(ctx), userId);
  },

  /** Org-scoped lookup by a known set of IDs, no ownership/manager filter --
   * same "caller already gates" convention as listVehiclesByIds/
   * listDriverProfilesByIds (DR-021). */
  async listGuideProfilesByIds(ctx: AuthContext, ids: string[]): Promise<GuideProfileView[]> {
    assertCan(ctx, 'fleet.read');
    if (ids.length === 0) return [];
    return fleetRepository.findGuideProfilesByIds(requireOrg(ctx), ids);
  },

  async uploadGuideDocument(
    ctx: AuthContext,
    guideProfileId: string,
    input: UploadComplianceDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx, 'fleet.write');
    const profile = await fleetRepository.findGuideProfileById(requireOrg(ctx), guideProfileId);
    if (!profile) throw Errors.notFound('Guide profile not found');
    return documentsService.uploadDocument(ctx, { ...input, guideProfileId });
  },

  async listGuideDocuments(ctx: AuthContext, guideProfileId: string): Promise<DocumentSummary[]> {
    await fleetService.getGuideProfile(ctx, guideProfileId); // fleet.read + ownership check
    return documentsService.listGuideProfileDocuments(ctx, guideProfileId);
  },

  async uploadVehicleDocument(
    ctx: AuthContext,
    vehicleId: string,
    input: UploadComplianceDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx, 'fleet.write');
    await fleetService.getVehicle(ctx, vehicleId); // 404s if the vehicle isn't in this org
    return documentsService.uploadDocument(ctx, { ...input, vehicleId });
  },

  async listVehicleDocuments(ctx: AuthContext, vehicleId: string): Promise<DocumentSummary[]> {
    await fleetService.getVehicle(ctx, vehicleId); // fleet.read + ownership check
    return documentsService.listVehicleDocuments(ctx, vehicleId);
  },

  async uploadDriverDocument(
    ctx: AuthContext,
    driverProfileId: string,
    input: UploadComplianceDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx, 'fleet.write');
    const profile = await fleetRepository.findDriverProfileById(requireOrg(ctx), driverProfileId);
    if (!profile) throw Errors.notFound('Driver profile not found');
    return documentsService.uploadDocument(ctx, { ...input, driverProfileId });
  },

  async listDriverDocuments(ctx: AuthContext, driverProfileId: string): Promise<DocumentSummary[]> {
    await fleetService.getDriverProfile(ctx, driverProfileId); // fleet.read + ownership check
    return documentsService.listDriverProfileDocuments(ctx, driverProfileId);
  },

  // ------------------------------------------------------------ maintenance history (DR-029)

  async addMaintenanceRecord(
    ctx: AuthContext,
    vehicleId: string,
    input: CreateMaintenanceRecordInput,
  ): Promise<MaintenanceRecordView> {
    assertCan(ctx, 'fleet.write');
    const organizationId = requireOrg(ctx);
    await fleetService.getVehicle(ctx, vehicleId); // 404s if not in this org
    const record = await fleetRepository.createMaintenanceRecord(organizationId, vehicleId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.maintenance_logged',
      resourceType: 'MaintenanceRecord',
      resourceId: record.id,
      organizationId,
    });
    return record;
  },

  async listMaintenanceRecords(ctx: AuthContext, vehicleId: string): Promise<MaintenanceRecordView[]> {
    assertCan(ctx, 'fleet.read');
    await fleetService.getVehicle(ctx, vehicleId); // fleet.read + ownership check
    return fleetRepository.listMaintenanceRecordsForVehicle(requireOrg(ctx), vehicleId);
  },

  // ------------------------------------------------------------ Starlink kits (DR-029)

  async createStarlinkKit(ctx: AuthContext, input: CreateStarlinkKitInput): Promise<StarlinkKitView> {
    assertCan(ctx, 'fleet.write');
    const organizationId = requireOrg(ctx);
    const kit = await fleetRepository.createStarlinkKit(organizationId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.starlink_kit_created',
      resourceType: 'StarlinkKit',
      resourceId: kit.id,
      organizationId,
    });
    return kit;
  },

  async updateStarlinkKit(ctx: AuthContext, kitId: string, input: UpdateStarlinkKitInput): Promise<StarlinkKitView> {
    assertCan(ctx, 'fleet.write');
    const organizationId = requireOrg(ctx);
    const updated = await fleetRepository.updateStarlinkKit(organizationId, kitId, input);
    if (!updated) throw Errors.notFound('Starlink kit not found');
    return updated;
  },

  /** Staff-entered position (no live API feed yet -- see the StarlinkKit
   * model comment in schema.prisma). */
  async setStarlinkLocation(ctx: AuthContext, kitId: string, input: SetStarlinkLocationInput): Promise<StarlinkKitView> {
    assertCan(ctx, 'fleet.write');
    const organizationId = requireOrg(ctx);
    const updated = await fleetRepository.updateStarlinkKit(organizationId, kitId, {
      lastLatitude: input.latitude,
      lastLongitude: input.longitude,
      lastLocationAt: new Date(),
    });
    if (!updated) throw Errors.notFound('Starlink kit not found');
    return updated;
  },

  async getStarlinkKit(ctx: AuthContext, kitId: string): Promise<StarlinkKitView> {
    assertCan(ctx, 'fleet.read');
    const kit = await fleetRepository.findStarlinkKitById(requireOrg(ctx), kitId);
    if (!kit) throw Errors.notFound('Starlink kit not found');
    return kit;
  },

  async listStarlinkKits(ctx: AuthContext): Promise<StarlinkKitView[]> {
    assertCan(ctx, 'fleet.read');
    return fleetRepository.listStarlinkKits(requireOrg(ctx));
  },

  /** DR-059: SUPERADMIN-only, same layering as deleteVehicle/
   * deleteDriverProfile/deleteGuideProfile -- but a real hard delete here,
   * not soft: no other table has an FK pointing at StarlinkKit.id at all
   * (confirmed by reading the full schema), so there's no cascade/history
   * risk a soft delete would need to guard against. */
  async deleteStarlinkKit(ctx: AuthContext, kitId: string): Promise<void> {
    assertCan(ctx, 'fleet.delete');
    if (!isFleetDeleter(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a Starlink kit');
    const organizationId = requireOrg(ctx);
    const deleted = await fleetRepository.deleteStarlinkKit(organizationId, kitId);
    if (!deleted) throw Errors.notFound('Starlink kit not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.starlink_kit_deleted',
      resourceType: 'StarlinkKit',
      resourceId: kitId,
      organizationId,
    });
  },

  /** Backs assignmentService.recommendAssignment's maintenance-recency
   * scoring -- one query across every candidate vehicle, not an N+1. */
  async getMaintenanceRecencyByVehicleIds(ctx: AuthContext, vehicleIds: string[]): Promise<Map<string, Date>> {
    assertCan(ctx, 'fleet.read');
    if (vehicleIds.length === 0) return new Map();
    return fleetRepository.findMostRecentMaintenanceByVehicleIds(requireOrg(ctx), vehicleIds);
  },

  /** Backs assignmentService.recommendAssignment's distance-from-pickup
   * scoring -- only vehicles with a located Starlink kit contribute.
   * lastLocationAt is included for the tracking module's freshness display
   * (DR-041) -- recommendAssignment itself just ignores the extra field. */
  async getStarlinkLocationsByVehicleIds(
    ctx: AuthContext,
    vehicleIds: string[],
  ): Promise<Map<string, { latitude: number; longitude: number; lastLocationAt: Date | null }>> {
    assertCan(ctx, 'fleet.read');
    if (vehicleIds.length === 0) return new Map();
    const kits = await fleetRepository.findStarlinkKitsByVehicleIds(requireOrg(ctx), vehicleIds);
    const locations = new Map<string, { latitude: number; longitude: number; lastLocationAt: Date | null }>();
    for (const [vehicleId, kit] of kits) {
      if (kit.lastLatitude != null && kit.lastLongitude != null) {
        locations.set(vehicleId, { latitude: kit.lastLatitude, longitude: kit.lastLongitude, lastLocationAt: kit.lastLocationAt });
      }
    }
    return locations;
  },
};
