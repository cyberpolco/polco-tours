// catalog module — repository. The only place that touches the DB for this module.
import type { AddonService, Departure, PackageStatus, TourPackage } from '@prisma/client';
import { withOrg } from '@lib/db';
import type {
  AddonServiceView,
  CreateDepartureInput,
  CreatePackageInput,
  DepartureView,
  TourPackageView,
  UpdatePackageInput,
} from './domain';

function toPackageView(p: TourPackage): TourPackageView {
  return {
    id: p.id,
    organizationId: p.organizationId,
    title: p.title,
    description: p.description,
    country: p.country,
    priceMinor: p.priceMinor,
    currency: p.currency,
    durationDays: p.durationDays,
    tags: p.tags,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toAddonServiceView(a: AddonService): AddonServiceView {
  return {
    id: a.id,
    organizationId: a.organizationId,
    code: a.code,
    name: a.name,
    description: a.description,
    priceMinor: a.priceMinor,
    currency: a.currency,
    active: a.active,
  };
}

function toDepartureView(d: Departure): DepartureView {
  return {
    id: d.id,
    organizationId: d.organizationId,
    tourPackageId: d.tourPackageId,
    startDate: d.startDate,
    endDate: d.endDate,
    capacity: d.capacity,
    priceOverrideMinor: d.priceOverrideMinor,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export const catalogRepository = {
  async createPackage(organizationId: string, input: CreatePackageInput): Promise<TourPackageView> {
    return withOrg(organizationId, async (tx) => {
      const p = await tx.tourPackage.create({ data: { organizationId, ...input } });
      return toPackageView(p);
    });
  },

  async updatePackage(
    organizationId: string,
    id: string,
    input: UpdatePackageInput,
  ): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.tourPackage.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const p = await tx.tourPackage.update({ where: { id }, data: input });
      return toPackageView(p);
    });
  },

  async findPackageById(organizationId: string, id: string): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const p = await tx.tourPackage.findUnique({ where: { id } });
      if (!p || p.deletedAt) return null;
      return toPackageView(p);
    });
  },

  async listPackages(organizationId: string, status?: PackageStatus): Promise<TourPackageView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.tourPackage.findMany({
        where: { deletedAt: null, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toPackageView);
    });
  },

  async createDeparture(
    organizationId: string,
    tourPackageId: string,
    input: CreateDepartureInput,
  ): Promise<DepartureView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.departure.create({ data: { organizationId, tourPackageId, ...input } });
      return toDepartureView(d);
    });
  },

  async findDepartureById(organizationId: string, id: string): Promise<DepartureView | null> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.departure.findUnique({ where: { id } });
      if (!d || d.deletedAt) return null;
      return toDepartureView(d);
    });
  },

  async listDeparturesForPackage(organizationId: string, tourPackageId: string): Promise<DepartureView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.departure.findMany({
        where: { tourPackageId, deletedAt: null },
        orderBy: { startDate: 'asc' },
      });
      return rows.map(toDepartureView);
    });
  },

  async listActiveAddonServices(organizationId: string): Promise<AddonServiceView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.addonService.findMany({ where: { active: true }, orderBy: { code: 'asc' } });
      return rows.map(toAddonServiceView);
    });
  },

  async findAddonServiceById(organizationId: string, id: string): Promise<AddonServiceView | null> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.addonService.findUnique({ where: { id } });
      return a ? toAddonServiceView(a) : null;
    });
  },
};
