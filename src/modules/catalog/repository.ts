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
    priceSubtotalMinor: p.priceSubtotalMinor,
    priceTaxRateBp: p.priceTaxRateBp,
    pricePlatformFeeRateBp: p.pricePlatformFeeRateBp,
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
    activities: d.activities,
    activityIds: d.activityIds,
    hotelId: d.hotelId,
    restaurantId: d.restaurantId,
    notes: d.notes,
  };
}

async function nextPackageReference(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('package_reference_seq') AS nextval`;
  const row = rows[0];
  if (!row) throw new Error('package_reference_seq returned no row');
  return formatPackageReference(row.nextval);
}

const MAX_SLUG_ATTEMPTS = 50;

function isSlugUniqueConstraintViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** DR-118/DR-131: a guest-facing package URL isn't org-scoped, so a slug
 * must be unique across every organization, not just this one. This can't
 * be checked with a pre-write SELECT: `tour_packages` has FORCE ROW LEVEL
 * SECURITY, and a query with no `app.org_id` GUC set (this helper never
 * opens a tenant transaction) sees zero rows under Postgres's own
 * deny-by-default policy -- including every other org's rows, which is
 * exactly what a global-uniqueness check needs to see. A unique index,
 * unlike a SELECT, is not RLS-filtered -- it still rejects a value already
 * used by another org's row whether that row is visible to the caller or
 * not -- so collisions are instead detected by attempting the write itself
 * (via `attempt`) and retrying with `-2`, `-3`, ... on a real unique-
 * constraint conflict. Once a package has a slug it's never reassigned,
 * except DR-131's own first-publish regeneration. */
async function withUniqueSlug<T>(title: string, attempt: (slug: string) => Promise<T>): Promise<T> {
  const base = slugify(title) || 'package';
  for (let suffix = 1; suffix <= MAX_SLUG_ATTEMPTS; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    try {
      return await attempt(candidate);
    } catch (e) {
      if (isSlugUniqueConstraintViolation(e) && suffix < MAX_SLUG_ATTEMPTS) continue;
      throw e;
    }
  }
  throw new Error('Could not generate a unique package slug');
}

export const catalogRepository = {
  async createPackage(organizationId: string, input: CreatePackageInput): Promise<TourPackageView> {
    return withUniqueSlug(input.title, (slug) =>
      withOrg(organizationId, async (tx) => {
        const p = await tx.tourPackage.create({
          data: { organizationId, packageReference: await nextPackageReference(tx), slug, ...input },
        });
        return toPackageView(p);
      }),
    );
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

  // DR-128: the only writer of TourPackage.priceMinor left -- deliberately
  // not routed through updatePackage/UpdatePackageInput (which no longer
  // carries a priceMinor field at all) so a package's price can never be set
  // by anything other than financeService.saveCostBreakdown's own
  // Operational-Rates-derived computation. DR-134: also writes the
  // tax+fee-composition snapshot fields alongside priceMinor in the same
  // update, since they're only ever set together.
  async updatePackagePrice(
    organizationId: string,
    id: string,
    input: { priceMinor: number; priceSubtotalMinor: number | null; priceTaxRateBp: number | null; pricePlatformFeeRateBp: number | null },
  ): Promise<TourPackageView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.tourPackage.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const p = await tx.tourPackage.update({
        where: { id },
        data: {
          priceMinor: input.priceMinor,
          priceSubtotalMinor: input.priceSubtotalMinor,
          priceTaxRateBp: input.priceTaxRateBp,
          pricePlatformFeeRateBp: input.pricePlatformFeeRateBp,
        },
      });
      return toPackageView(p);
    });
  },

  /** DR-131: re-derives a package's slug from `title` at first publish
   * (DRAFT -> a PUBLISHED_* status), so the public URL reflects whatever
   * title the package actually launched with rather than whatever it was
   * called at creation time (DR-118's slug is otherwise frozen forever).
   * Deliberately outside UpdatePackageInput/updatePackage -- same
   * bypass-the-generic-update precedent as updatePackagePrice above -- since
   * staff must never set a slug directly. */
  async regeneratePackageSlug(organizationId: string, id: string, title: string): Promise<TourPackageView | null> {
    return withUniqueSlug(title, (slug) =>
      withOrg(organizationId, async (tx) => {
        const existing = await tx.tourPackage.findUnique({ where: { id } });
        if (!existing || existing.deletedAt) return null;
        const p = await tx.tourPackage.update({ where: { id }, data: { slug } });
        return toPackageView(p);
      }),
    );
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
          priceSubtotalMinor: existing.priceSubtotalMinor,
          priceTaxRateBp: existing.priceTaxRateBp,
          pricePlatformFeeRateBp: existing.pricePlatformFeeRateBp,
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

  // DR-129: bulk-fills day numbers 1..durationDays that don't already have a
  // template row -- skipDuplicates relies on the existing
  // @@unique([tourPackageId, dayNumber]) constraint, so re-running this after
  // staff have already edited some days only fills the remaining gaps, never
  // touches or duplicates an existing row.
  async generateMissingTemplateDays(
    organizationId: string,
    tourPackageId: string,
    durationDays: number,
  ): Promise<PackageItineraryDayView[]> {
    return withOrg(organizationId, async (tx) => {
      const dayNumbers = Array.from({ length: durationDays }, (_, i) => i + 1);
      await tx.packageItineraryDay.createMany({
        data: dayNumbers.map((dayNumber) => ({ organizationId, tourPackageId, dayNumber })),
        skipDuplicates: true,
      });
      const rows = await tx.packageItineraryDay.findMany({ where: { tourPackageId }, orderBy: { dayNumber: 'asc' } });
      return rows.map(toPackageItineraryDayView);
    });
  },
};
