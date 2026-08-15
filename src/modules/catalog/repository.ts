// catalog module — repository. The only place that touches the DB for this module.
import type { AddonService, Departure, PackageItineraryDay, PackageStatus, TourPackage } from '@prisma/client';
import { prisma, withOrg, type TenantTx } from '@lib/db';
import { slugify } from '@lib/slug';
import { formatPackageReference } from './domain';
import type {
  AddonServiceView,
  AddPackageItineraryDayInput,
  CreateBespokeDepartureParams,
  CreateDepartureInput,
  CreatePackageInput,
  DepartureView,
  PackageItineraryDayView,
  TourPackageView,
  UpdatePackageInput,
  UpdatePackageItineraryDayInput,
} from './domain';

function toPackageView(p: TourPackage): TourPackageView {
  return {
    id: p.id,
    organizationId: p.organizationId,
    packageReference: p.packageReference,
    slug: p.slug,
    title: p.title,
    description: p.description,
    country: p.country,
    countries: p.countries,
    priceMinor: p.priceMinor,
    currency: p.currency,
    durationDays: p.durationDays,
    imageUrl: p.imageUrl,
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

function toPackageItineraryDayView(d: PackageItineraryDay): PackageItineraryDayView {
  return {
    id: d.id,
    tourPackageId: d.tourPackageId,
    dayNumber: d.dayNumber,
    departureTime: d.departureTime,
    arrivalTime: d.arrivalTime,
    pickupLocation: d.pickupLocation,
    dropoffLocation: d.dropoffLocation,
    plannedSites: d.plannedSites,
    activities: d.activities,
    activityIds: d.activityIds,
    estimatedTravelMinutes: d.estimatedTravelMinutes,
    notes: d.notes,
  };
}

async function nextPackageReference(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('package_reference_seq') AS nextval`;
  const row = rows[0];
  if (!row) throw new Error('package_reference_seq returned no row');
  return formatPackageReference(row.nextval);
}

/** DR-118: a guest-facing package URL isn't org-scoped, so a slug must be
 * unique across every organization, not just this one -- deliberately the
 * plain unscoped `prisma` client (not `tx`), since RLS would otherwise hide
 * another org's slug and let two orgs collide on the same one. Appends
 * -2, -3, ... on collision; never reassigned once a package has one. */
async function nextUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || 'package';
  let candidate = base;
  let suffix = 2;
  while (await prisma.tourPackage.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export const catalogRepository = {
  async createPackage(organizationId: string, input: CreatePackageInput): Promise<TourPackageView> {
    const slug = await nextUniqueSlug(input.title);
    return withOrg(organizationId, async (tx) => {
      const p = await tx.tourPackage.create({
        data: { organizationId, packageReference: await nextPackageReference(tx), slug, ...input },
      });
      return toPackageView(p);
    });
  },

  /** Public package-detail lookup by its personalized URL slug (DR-118). */
  async findPackageBySlug(organizationId: string, slug: string): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const p = await tx.tourPackage.findFirst({ where: { slug, deletedAt: null } });
      return p ? toPackageView(p) : null;
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

  /** Clones the package definition only (title/description/country/
   * countries/price/currency/durationDays/imageUrl/tags) as a new DRAFT
   * package with a fresh packageReference -- deliberately no departures
   * (DR-028). */
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
          countries: existing.countries,
          priceMinor: existing.priceMinor,
          currency: existing.currency,
          durationDays: existing.durationDays,
          imageUrl: existing.imageUrl,
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

  /** DR-107: cross-org lookup backing the fleet-availability cooldown
   * sweep -- mirrors bookingRepository.sweepAllOrganizations's org-loop
   * shape (no ctx, platform-scheduler-only, same DR-067 precedent). */
  async listRecentlyEndedDepartures(sinceHoursAgo: number): Promise<{ organizationId: string; departureId: string }[]> {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    const since = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000);
    const now = new Date();
    const results: { organizationId: string; departureId: string }[] = [];
    for (const org of orgs) {
      const rows = await withOrg(org.id, (tx) =>
        tx.departure.findMany({ where: { endDate: { gte: since, lte: now } }, select: { id: true } }),
      );
      for (const row of rows) results.push({ organizationId: org.id, departureId: row.id });
    }
    return results;
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

  // Deliberately no `active: true` filter (unlike listActiveAddonServices,
  // which is for the "pick new add-ons" wizard) -- an already-selected
  // add-on must keep showing its name even if later deactivated.
  async findAddonServicesByIds(organizationId: string, ids: string[]): Promise<AddonServiceView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.addonService.findMany({ where: { id: { in: ids } } });
      return rows.map(toAddonServiceView);
    });
  },

  // ------------------------------------------------------------ package itinerary template

  async addTemplateDay(
    organizationId: string,
    tourPackageId: string,
    input: AddPackageItineraryDayInput,
  ): Promise<PackageItineraryDayView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.packageItineraryDay.create({ data: { organizationId, tourPackageId, ...input } });
      return toPackageItineraryDayView(d);
    });
  },

  async updateTemplateDay(
    organizationId: string,
    dayId: string,
    input: UpdatePackageItineraryDayInput,
  ): Promise<PackageItineraryDayView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.packageItineraryDay.findUnique({ where: { id: dayId } });
      if (!existing) return null;
      const d = await tx.packageItineraryDay.update({ where: { id: dayId }, data: input });
      return toPackageItineraryDayView(d);
    });
  },

  async removeTemplateDay(organizationId: string, dayId: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.packageItineraryDay.findUnique({ where: { id: dayId } });
      if (!existing) return false;
      await tx.packageItineraryDay.delete({ where: { id: dayId } });
      return true;
    });
  },

  async listTemplateDays(organizationId: string, tourPackageId: string): Promise<PackageItineraryDayView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.packageItineraryDay.findMany({ where: { tourPackageId }, orderBy: { dayNumber: 'asc' } });
      return rows.map(toPackageItineraryDayView);
    });
  },
};
