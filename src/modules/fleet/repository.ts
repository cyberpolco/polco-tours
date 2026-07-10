// fleet module — repository. The only place that touches the DB for this module.
import type { DriverProfile, Vehicle } from '@prisma/client';
import { withOrg } from '@lib/db';
import type {
  CreateDriverProfileInput,
  CreateVehicleInput,
  DriverProfileView,
  UpdateDriverProfileInput,
  UpdateVehicleInput,
  VehicleView,
} from './domain';

function toVehicleView(v: Vehicle): VehicleView {
  return {
    id: v.id,
    organizationId: v.organizationId,
    ownerId: v.ownerId,
    plateNumber: v.plateNumber,
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
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
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

  async listDriverProfiles(organizationId: string): Promise<DriverProfileView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.driverProfile.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toDriverProfileView);
    });
  },
};
