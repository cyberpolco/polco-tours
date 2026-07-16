// fleet module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { documentsService, type DocumentSummary } from '@modules/documents';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import type {
  CreateDriverProfileInput,
  CreateMaintenanceRecordInput,
  CreateStarlinkKitInput,
  CreateVehicleInput,
  DriverProfileView,
  MaintenanceRecordView,
  SetStarlinkLocationInput,
  StarlinkKitView,
  UpdateDriverProfileInput,
  UpdateStarlinkKitInput,
  UpdateVehicleInput,
  VehicleView,
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
  kind: VehicleComplianceKind | 'DRIVER_LICENSE';
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
  expiresAt?: Date;
}

export const fleetService = {
  async createVehicle(ctx: AuthContext, input: CreateVehicleInput): Promise<VehicleView> {
    assertCan(ctx.roles, 'fleet.write');
    return fleetRepository.createVehicle(requireOrg(ctx), input);
  },

  async updateVehicle(ctx: AuthContext, vehicleId: string, input: UpdateVehicleInput): Promise<VehicleView> {
    assertCan(ctx.roles, 'fleet.write');
    const updated = await fleetRepository.updateVehicle(requireOrg(ctx), vehicleId, input);
    if (!updated) throw Errors.notFound('Vehicle not found');
    return updated;
  },

  async getVehicle(ctx: AuthContext, vehicleId: string): Promise<VehicleView> {
    assertCan(ctx.roles, 'fleet.read');
    const vehicle = await fleetRepository.findVehicleById(requireOrg(ctx), vehicleId);
    // Ownership check returns notFound (not forbidden) so a non-owner can't
    // tell a vehicle exists at all -- same convention as invoicing/service.ts.
    if (!vehicle || (!isFleetManager(ctx.roles) && vehicle.ownerId !== ctx.userId)) {
      throw Errors.notFound('Vehicle not found');
    }
    return vehicle;
  },

  async listVehicles(ctx: AuthContext): Promise<VehicleView[]> {
    assertCan(ctx.roles, 'fleet.read');
    const all = await fleetRepository.listVehicles(requireOrg(ctx));
    if (isFleetManager(ctx.roles)) return all;
    // VEHICLE_OWNER sees only their own vehicles; any other fleet.read role
    // (e.g. DRIVER) has no ownership concept here yet -- empty until
    // Assignments (a later Phase 2 increment) links a driver to a vehicle.
    return all.filter((v) => v.ownerId === ctx.userId);
  },

  async createDriverProfile(ctx: AuthContext, input: CreateDriverProfileInput): Promise<DriverProfileView> {
    assertCan(ctx.roles, 'fleet.write');
    return fleetRepository.createDriverProfile(requireOrg(ctx), input);
  },

  async updateDriverProfile(
    ctx: AuthContext,
    driverProfileId: string,
    input: UpdateDriverProfileInput,
  ): Promise<DriverProfileView> {
    assertCan(ctx.roles, 'fleet.write');
    const updated = await fleetRepository.updateDriverProfile(requireOrg(ctx), driverProfileId, input);
    if (!updated) throw Errors.notFound('Driver profile not found');
    return updated;
  },

  async getDriverProfile(ctx: AuthContext, driverProfileId: string): Promise<DriverProfileView> {
    assertCan(ctx.roles, 'fleet.read');
    const profile = await fleetRepository.findDriverProfileById(requireOrg(ctx), driverProfileId);
    if (!profile || (!isFleetManager(ctx.roles) && profile.userId !== ctx.userId)) {
      throw Errors.notFound('Driver profile not found');
    }
    return profile;
  },

  /** Managers only -- a DRIVER looks up their own profile via getDriverProfile. */
  async listDriverProfiles(ctx: AuthContext): Promise<DriverProfileView[]> {
    assertCan(ctx.roles, 'fleet.read');
    if (!isFleetManager(ctx.roles)) throw Errors.forbidden('Only fleet managers may list all driver profiles');
    return fleetRepository.listDriverProfiles(requireOrg(ctx));
  },

  /** Resolves the caller's own DriverProfile by userId (null if they don't
   * have one) -- used by assignment/service.ts's listMyAssignments (DR-018),
   * since a DRIVER's assignments are keyed by driverProfileId, not userId. */
  async getMyDriverProfile(ctx: AuthContext): Promise<DriverProfileView | null> {
    assertCan(ctx.roles, 'fleet.read');
    return fleetRepository.findDriverProfileByUserId(requireOrg(ctx), ctx.userId);
  },

  /** Org-scoped lookup by a known set of IDs, deliberately with no
   * ownership/manager filter -- same "caller already gates" convention as
   * authService.getUser. Used by the "my schedule" self-service page
   * (DR-021) so a DRIVER/TOUR_GUIDE can see the vehicle/driver tied to their
   * own assignment even though they don't own it; the assignment itself is
   * the caller's authorization, not fleet ownership. */
  async listVehiclesByIds(ctx: AuthContext, ids: string[]): Promise<VehicleView[]> {
    assertCan(ctx.roles, 'fleet.read');
    if (ids.length === 0) return [];
    return fleetRepository.findVehiclesByIds(requireOrg(ctx), ids);
  },

  async listDriverProfilesByIds(ctx: AuthContext, ids: string[]): Promise<DriverProfileView[]> {
    assertCan(ctx.roles, 'fleet.read');
    if (ids.length === 0) return [];
    return fleetRepository.findDriverProfilesByIds(requireOrg(ctx), ids);
  },

  async uploadVehicleDocument(
    ctx: AuthContext,
    vehicleId: string,
    input: UploadComplianceDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx.roles, 'fleet.write');
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
    assertCan(ctx.roles, 'fleet.write');
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
    assertCan(ctx.roles, 'fleet.write');
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
    assertCan(ctx.roles, 'fleet.read');
    await fleetService.getVehicle(ctx, vehicleId); // fleet.read + ownership check
    return fleetRepository.listMaintenanceRecordsForVehicle(requireOrg(ctx), vehicleId);
  },

  // ------------------------------------------------------------ Starlink kits (DR-029)

  async createStarlinkKit(ctx: AuthContext, input: CreateStarlinkKitInput): Promise<StarlinkKitView> {
    assertCan(ctx.roles, 'fleet.write');
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
    assertCan(ctx.roles, 'fleet.write');
    const organizationId = requireOrg(ctx);
    const updated = await fleetRepository.updateStarlinkKit(organizationId, kitId, input);
    if (!updated) throw Errors.notFound('Starlink kit not found');
    return updated;
  },

  /** Staff-entered position (no live API feed yet -- see the StarlinkKit
   * model comment in schema.prisma). */
  async setStarlinkLocation(ctx: AuthContext, kitId: string, input: SetStarlinkLocationInput): Promise<StarlinkKitView> {
    assertCan(ctx.roles, 'fleet.write');
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
    assertCan(ctx.roles, 'fleet.read');
    const kit = await fleetRepository.findStarlinkKitById(requireOrg(ctx), kitId);
    if (!kit) throw Errors.notFound('Starlink kit not found');
    return kit;
  },

  async listStarlinkKits(ctx: AuthContext): Promise<StarlinkKitView[]> {
    assertCan(ctx.roles, 'fleet.read');
    return fleetRepository.listStarlinkKits(requireOrg(ctx));
  },

  /** Backs assignmentService.recommendAssignment's maintenance-recency
   * scoring -- one query across every candidate vehicle, not an N+1. */
  async getMaintenanceRecencyByVehicleIds(ctx: AuthContext, vehicleIds: string[]): Promise<Map<string, Date>> {
    assertCan(ctx.roles, 'fleet.read');
    if (vehicleIds.length === 0) return new Map();
    return fleetRepository.findMostRecentMaintenanceByVehicleIds(requireOrg(ctx), vehicleIds);
  },

  /** Backs assignmentService.recommendAssignment's distance-from-pickup
   * scoring -- only vehicles with a located Starlink kit contribute. */
  async getStarlinkLocationsByVehicleIds(
    ctx: AuthContext,
    vehicleIds: string[],
  ): Promise<Map<string, { latitude: number; longitude: number }>> {
    assertCan(ctx.roles, 'fleet.read');
    if (vehicleIds.length === 0) return new Map();
    const kits = await fleetRepository.findStarlinkKitsByVehicleIds(requireOrg(ctx), vehicleIds);
    const locations = new Map<string, { latitude: number; longitude: number }>();
    for (const [vehicleId, kit] of kits) {
      if (kit.lastLatitude != null && kit.lastLongitude != null) {
        locations.set(vehicleId, { latitude: kit.lastLatitude, longitude: kit.lastLongitude });
      }
    }
    return locations;
  },
};
