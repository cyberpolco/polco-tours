// catalog module — repository. The only place that touches the DB for this module.
import type { AddonService, Departure, PackageStatus, TourPackage } from '@prisma/client';
import { withOrg, type TenantTx } from '@lib/db';
import { formatPackageReference } from './domain';
import type {
  AddonServiceView,
  CreateBespokeDepartureParams,
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
    packageReference: p.packageReference,
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
    currency: d.currency,
    customCountry: d.customCountry,
    pickupLatitude: d.pickupLatitude,
    pickupLongitude: d.pickupLongitude,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function nextPackageReference(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('package_reference_seq') AS nextval`;
  const row = rows[0];
  if (!row) throw new Error('package_reference_seq returned no row');
  return formatPackageReference(row.nextval);
}

export const catalogRepository = {
  async createPackage(organizationId: string, input: CreatePackageInput): Promise<TourPackageView> {
    return withOrg(organizationId, async (tx) => {
      const p = await tx.tourPackage.create({
        data: { organizationId, packageReference: await nextPackageReference(tx), ...input },
      });
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

  /** Soft delete (DR-028) -- sets deletedAt; every read in this module already
   * filters on deletedAt: null, so this alone hides it everywhere. */
  async deletePackage(organizationId: string, id: string): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.tourPackage.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const p = await tx.tourPackage.update({ where: { id }, data: { deletedAt: new Date() } });
      return toPackageView(p);
    });
  },

  /** Clones the package definition only (title/description/country/price/
   * currency/durationDays/tags) as a new DRAFT package with a fresh
   * packageReference -- deliberately no departures (DR-028). */
  async duplicatePackage(organizationId: string, id: string): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.tourPackage.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const p = await tx.tourPackage.create({
        data: {
          organizationId,
          packageReference: await nextPackageReference(tx),
          title: existing.title,
          description: existing.description,
          country: existing.country,
          priceMinor: existing.priceMinor,
          currency: existing.currency,
          durationDays: existing.durationDays,
          tags: existing.tags,
          status: 'DRAFT',
        },
      });
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

  /** A bespoke departure has no TourPackage -- converted from an approved
   * TAILOR_MADE booking (bookingService.convertToItinerary). Capacity is
   * exactly the booking's seat count (this departure exists for one group,
   * not public sale); country/price/currency are snapshotted from the
   * booking since there's no package to join to. */
  async createBespokeDeparture(organizationId: string, params: CreateBespokeDepartureParams): Promise<DepartureView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.departure.create({
        data: {
          organizationId,
          tourPackageId: null,
          startDate: params.startDate,
          endDate: params.endDate,
          capacity: params.capacity,
          priceOverrideMinor: params.priceMinor,
          currency: params.currency,
          customCountry: params.customCountry,
        },
      });
      return toDepartureView(d);
    });
  },

  async setDeparturePickupLocation(
    organizationId: string,
    id: string,
    location: { latitude: number; longitude: number },
  ): Promise<DepartureView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.departure.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const d = await tx.departure.update({
        where: { id },
        data: { pickupLatitude: location.latitude, pickupLongitude: location.longitude },
      });
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
