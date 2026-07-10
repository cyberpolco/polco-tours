// fleet module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { documentsService, type DocumentSummary } from '@modules/documents';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import type {
  CreateDriverProfileInput,
  CreateVehicleInput,
  DriverProfileView,
  UpdateDriverProfileInput,
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
function isFleetManager(role: Role): boolean {
  return role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN';
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
    assertCan(ctx.role, 'fleet.write');
    return fleetRepository.createVehicle(requireOrg(ctx), input);
  },

  async updateVehicle(ctx: AuthContext, vehicleId: string, input: UpdateVehicleInput): Promise<VehicleView> {
    assertCan(ctx.role, 'fleet.write');
    const updated = await fleetRepository.updateVehicle(requireOrg(ctx), vehicleId, input);
    if (!updated) throw Errors.notFound('Vehicle not found');
    return updated;
  },

  async getVehicle(ctx: AuthContext, vehicleId: string): Promise<VehicleView> {
    assertCan(ctx.role, 'fleet.read');
    const vehicle = await fleetRepository.findVehicleById(requireOrg(ctx), vehicleId);
    // Ownership check returns notFound (not forbidden) so a non-owner can't
    // tell a vehicle exists at all -- same convention as invoicing/service.ts.
    if (!vehicle || (!isFleetManager(ctx.role) && vehicle.ownerId !== ctx.userId)) {
      throw Errors.notFound('Vehicle not found');
    }
    return vehicle;
  },

  async listVehicles(ctx: AuthContext): Promise<VehicleView[]> {
    assertCan(ctx.role, 'fleet.read');
    const all = await fleetRepository.listVehicles(requireOrg(ctx));
    if (isFleetManager(ctx.role)) return all;
    // VEHICLE_OWNER sees only their own vehicles; any other fleet.read role
    // (e.g. DRIVER) has no ownership concept here yet -- empty until
    // Assignments (a later Phase 2 increment) links a driver to a vehicle.
    return all.filter((v) => v.ownerId === ctx.userId);
  },

  async createDriverProfile(ctx: AuthContext, input: CreateDriverProfileInput): Promise<DriverProfileView> {
    assertCan(ctx.role, 'fleet.write');
    return fleetRepository.createDriverProfile(requireOrg(ctx), input);
  },

  async updateDriverProfile(
    ctx: AuthContext,
    driverProfileId: string,
    input: UpdateDriverProfileInput,
  ): Promise<DriverProfileView> {
    assertCan(ctx.role, 'fleet.write');
    const updated = await fleetRepository.updateDriverProfile(requireOrg(ctx), driverProfileId, input);
    if (!updated) throw Errors.notFound('Driver profile not found');
    return updated;
  },

  async getDriverProfile(ctx: AuthContext, driverProfileId: string): Promise<DriverProfileView> {
    assertCan(ctx.role, 'fleet.read');
    const profile = await fleetRepository.findDriverProfileById(requireOrg(ctx), driverProfileId);
    if (!profile || (!isFleetManager(ctx.role) && profile.userId !== ctx.userId)) {
      throw Errors.notFound('Driver profile not found');
    }
    return profile;
  },

  /** Managers only -- a DRIVER looks up their own profile via getDriverProfile. */
  async listDriverProfiles(ctx: AuthContext): Promise<DriverProfileView[]> {
    assertCan(ctx.role, 'fleet.read');
    if (!isFleetManager(ctx.role)) throw Errors.forbidden('Only fleet managers may list all driver profiles');
    return fleetRepository.listDriverProfiles(requireOrg(ctx));
  },

  async uploadVehicleDocument(
    ctx: AuthContext,
    vehicleId: string,
    input: UploadComplianceDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx.role, 'fleet.write');
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
    assertCan(ctx.role, 'fleet.write');
    const profile = await fleetRepository.findDriverProfileById(requireOrg(ctx), driverProfileId);
    if (!profile) throw Errors.notFound('Driver profile not found');
    return documentsService.uploadDocument(ctx, { ...input, driverProfileId });
  },

  async listDriverDocuments(ctx: AuthContext, driverProfileId: string): Promise<DocumentSummary[]> {
    await fleetService.getDriverProfile(ctx, driverProfileId); // fleet.read + ownership check
    return documentsService.listDriverProfileDocuments(ctx, driverProfileId);
  },
};
