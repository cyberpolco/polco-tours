// fleet module — repository. The only place that touches the DB for this module.
import type { DriverProfile, GuideProfile, MaintenanceRecord, StarlinkKit, Vehicle } from '@prisma/client';
import { withOrg } from '@lib/db';
import type {
  CreateDriverProfileInput,
  CreateGuideProfileInput,
  CreateMaintenanceRecordInput,
  CreateStarlinkKitInput,
  CreateVehicleInput,
  DriverProfileView,
  GuideProfileView,
  MaintenanceRecordView,
  StarlinkKitView,
  UpdateDriverProfileInput,
  UpdateGuideProfileInput,
  UpdateStarlinkKitInput,
  UpdateVehicleInput,
  VehicleView,
} from './domain';

function toVehicleView(v: Vehicle): VehicleView {
  return {
    id: v.id,
    organizationId: v.organizationId,
    ownerId: v.ownerId,
    plateNumber: v.plateNumber,
    vin: v.vin,
    make: v.make,
    model: v.model,
    year: v.year,
    vehicleType: v.vehicleType,
    seatCapacity: v.seatCapacity,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

function toDriverProfileView(d: DriverProfile): DriverProfileView {
  return {
    id: d.id,
    organizationId: d.organizationId,
    userId: d.userId,
    licenseNumber: d.licenseNumber,
    licenseExpiresAt: d.licenseExpiresAt,
    languages: d.languages,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toGuideProfileView(g: GuideProfile): GuideProfileView {
  return {
    id: g.id,
    organizationId: g.organizationId,
    userId: g.userId,
    languages: g.languages,
    specialties: g.specialties,
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function toMaintenanceRecordView(m: MaintenanceRecord): MaintenanceRecordView {
  return {
    id: m.id,
    organizationId: m.organizationId,
    vehicleId: m.vehicleId,
    performedAt: m.performedAt,
    description: m.description,
    costMinor: m.costMinor,
    currency: m.currency,
    createdAt: m.createdAt,
  };
}

function toStarlinkKitView(k: StarlinkKit): StarlinkKitView {
  return {
    id: k.id,
    organizationId: k.organizationId,
    kitId: k.kitId,
    status: k.status,
    vehicleId: k.vehicleId,
    lastLatitude: k.lastLatitude,
    lastLongitude: k.lastLongitude,
    lastLocationAt: k.lastLocationAt,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

export const fleetRepository = {
  async createVehicle(organizationId: string, input: CreateVehicleInput): Promise<VehicleView> {
    return withOrg(organizationId, async (tx) => {
      const v = await tx.vehicle.create({ data: { organizationId, ...input } });
      return toVehicleView(v);
    });
  },

  async updateVehicle(organizationId: string, id: string, input: UpdateVehicleInput): Promise<VehicleView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.vehicle.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const v = await tx.vehicle.update({ where: { id }, data: input });
      return toVehicleView(v);
    });
  },

  async findVehicleById(organizationId: string, id: string): Promise<VehicleView | null> {
    return withOrg(organizationId, async (tx) => {
      const v = await tx.vehicle.findUnique({ where: { id } });
      if (!v || v.deletedAt) return null;
      return toVehicleView(v);
    });
  },

  async listVehicles(organizationId: string): Promise<VehicleView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.vehicle.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
      return rows.map(toVehicleView);
    });
  },

  async findVehiclesByIds(organizationId: string, ids: string[]): Promise<VehicleView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.vehicle.findMany({ where: { id: { in: ids }, deletedAt: null } });
      return rows.map(toVehicleView);
    });
  },

  async createDriverProfile(organizationId: string, input: CreateDriverProfileInput): Promise<DriverProfileView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.driverProfile.create({ data: { organizationId, ...input } });
      return toDriverProfileView(d);
    });
  },

  async updateDriverProfile(
    organizationId: string,
    id: string,
    input: UpdateDriverProfileInput,
  ): Promise<DriverProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.driverProfile.findUnique({ where: { id } });
      if (!existing) return null;
      const d = await tx.driverProfile.update({ where: { id }, data: input });
      return toDriverProfileView(d);
    });
  },

  async findDriverProfileById(organizationId: string, id: string): Promise<DriverProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.driverProfile.findUnique({ where: { id } });
      return d ? toDriverProfileView(d) : null;
    });
  },

  async findDriverProfileByUserId(organizationId: string, userId: string): Promise<DriverProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.driverProfile.findUnique({ where: { userId } });
      return d ? toDriverProfileView(d) : null;
    });
  },

  async listDriverProfiles(organizationId: string): Promise<DriverProfileView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.driverProfile.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toDriverProfileView);
    });
  },

  async findDriverProfilesByIds(organizationId: string, ids: string[]): Promise<DriverProfileView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.driverProfile.findMany({ where: { id: { in: ids } } });
      return rows.map(toDriverProfileView);
    });
  },

  // ------------------------------------------------------------ guides (DR-030)

  async createGuideProfile(organizationId: string, input: CreateGuideProfileInput): Promise<GuideProfileView> {
    return withOrg(organizationId, async (tx) => {
      const g = await tx.guideProfile.create({ data: { organizationId, ...input } });
      return toGuideProfileView(g);
    });
  },

  async updateGuideProfile(
    organizationId: string,
    id: string,
    input: UpdateGuideProfileInput,
  ): Promise<GuideProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.guideProfile.findUnique({ where: { id } });
      if (!existing) return null;
      const g = await tx.guideProfile.update({ where: { id }, data: input });
      return toGuideProfileView(g);
    });
  },

  async findGuideProfileById(organizationId: string, id: string): Promise<GuideProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const g = await tx.guideProfile.findUnique({ where: { id } });
      return g ? toGuideProfileView(g) : null;
    });
  },

  async findGuideProfileByUserId(organizationId: string, userId: string): Promise<GuideProfileView | null> {
    return withOrg(organizationId, async (tx) => {
      const g = await tx.guideProfile.findUnique({ where: { userId } });
      return g ? toGuideProfileView(g) : null;
    });
  },

  async listGuideProfiles(organizationId: string): Promise<GuideProfileView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.guideProfile.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toGuideProfileView);
    });
  },

  async findGuideProfilesByIds(organizationId: string, ids: string[]): Promise<GuideProfileView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.guideProfile.findMany({ where: { id: { in: ids } } });
      return rows.map(toGuideProfileView);
    });
  },

  // ------------------------------------------------------------ maintenance history (DR-029)

  async createMaintenanceRecord(
    organizationId: string,
    vehicleId: string,
    input: CreateMaintenanceRecordInput,
  ): Promise<MaintenanceRecordView> {
    return withOrg(organizationId, async (tx) => {
      const m = await tx.maintenanceRecord.create({ data: { organizationId, vehicleId, ...input } });
      return toMaintenanceRecordView(m);
    });
  },

  async listMaintenanceRecordsForVehicle(organizationId: string, vehicleId: string): Promise<MaintenanceRecordView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.maintenanceRecord.findMany({ where: { vehicleId }, orderBy: { performedAt: 'desc' } });
      return rows.map(toMaintenanceRecordView);
    });
  },

  /** Most recent record per vehicle, in one query -- backs the recommendation
   * engine's maintenance-recency scoring across every candidate vehicle
   * without an N+1. */
  async findMostRecentMaintenanceByVehicleIds(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, Date>> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.maintenanceRecord.findMany({
        where: { vehicleId: { in: vehicleIds } },
        orderBy: { performedAt: 'desc' },
        select: { vehicleId: true, performedAt: true },
      });
      const map = new Map<string, Date>();
      for (const row of rows) {
        if (!map.has(row.vehicleId)) map.set(row.vehicleId, row.performedAt);
      }
      return map;
    });
  },

  // ------------------------------------------------------------ Starlink kits (DR-029)

  async createStarlinkKit(organizationId: string, input: CreateStarlinkKitInput): Promise<StarlinkKitView> {
    return withOrg(organizationId, async (tx) => {
      const k = await tx.starlinkKit.create({ data: { organizationId, ...input } });
      return toStarlinkKitView(k);
    });
  },

  async updateStarlinkKit(
    organizationId: string,
    id: string,
    input: UpdateStarlinkKitInput & { lastLatitude?: number; lastLongitude?: number; lastLocationAt?: Date },
  ): Promise<StarlinkKitView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.starlinkKit.findUnique({ where: { id } });
      if (!existing) return null;
      const k = await tx.starlinkKit.update({ where: { id }, data: input });
      return toStarlinkKitView(k);
    });
  },

  async findStarlinkKitById(organizationId: string, id: string): Promise<StarlinkKitView | null> {
    return withOrg(organizationId, async (tx) => {
      const k = await tx.starlinkKit.findUnique({ where: { id } });
      return k ? toStarlinkKitView(k) : null;
    });
  },

  async listStarlinkKits(organizationId: string): Promise<StarlinkKitView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.starlinkKit.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toStarlinkKitView);
    });
  },

  /** Backs the recommendation engine's distance-from-pickup scoring -- one
   * query for every candidate vehicle's kit, keyed by vehicleId. */
  async findStarlinkKitsByVehicleIds(organizationId: string, vehicleIds: string[]): Promise<Map<string, StarlinkKitView>> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.starlinkKit.findMany({ where: { vehicleId: { in: vehicleIds } } });
      return new Map(rows.map((k) => [k.vehicleId as string, toStarlinkKitView(k)]));
    });
  },
};
