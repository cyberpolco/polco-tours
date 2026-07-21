// catalog module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { PackageStatus, Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { money, type Money } from '@lib/money';
import { getPrimaryOrgId } from '@lib/primary-org';
import { assertCan } from '@lib/rbac';
import {
  computeDepartureEndDate,
  effectivePrice,
  isBookable,
  isDepartureVisible,
  isPackageVisible,
  type AddonServiceView,
  type AddPackageItineraryDayInput,
  type CreateBespokeDepartureParams,
  type CreateDepartureForBookingParams,
  type CreateDepartureInput,
  type CreatePackageInput,
  type DepartureView,
  type PackageItineraryDayView,
  type SetDeparturePickupLocationInput,
  type TourPackageView,
  type UpdatePackageInput,
  type UpdatePackageItineraryDayInput,
} from './domain';
import { catalogRepository } from './repository';

// Public/anonymous callers have no role of their own -- reuse the exact same
// non-operator visibility rule every authenticated non-staff caller already
// gets (isPackageVisible/isDepartureVisible only special-case operator
// roles), rather than inventing a parallel "public" visibility concept.
const PUBLIC_VIEW_ROLE: Role[] = ['TOURIST'];

export interface PublicPackageFilter {
  country?: string;
  search?: string;
}

export interface DepartureDetail {
  departure: DepartureView;
  // Null for a bespoke departure (DR-028) -- there's no TourPackage to have a status.
  packageStatus: PackageStatus | null;
  packageCountry: string;
  // Null when the package has no cost breakdown yet and no departure
  // override (DR-039) -- isBookable already independently guards this via
  // the PUBLISHED-requires-a-price rule in updatePackage below, so this is
  // a defensive null, not a routine one.
  effectiveUnitPrice: Money | null;
  bookable: boolean;
}

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

export const catalogService = {
  async createPackage(ctx: AuthContext, input: CreatePackageInput): Promise<TourPackageView> {
    assertCan(ctx, 'catalog.write');
    return catalogRepository.createPackage(requireOrg(ctx), input);
  },

  async updatePackage(ctx: AuthContext, packageId: string, input: UpdatePackageInput): Promise<TourPackageView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    // DR-039: a package with no price at all (no cost breakdown yet, never
    // manually priced) must not be publishable -- keeps isBookable's
    // PUBLISHED gate a real guarantee rather than something every
    // downstream consumer has to re-check defensively. DR-054 (revised same
    // session) adds the same gate for durationDays -- a guest booking now
    // only ever picks a start date, so a package with no staff-set trip
    // length has no way to get a bookable Departure at all.
    if (input.status === 'PUBLISHED') {
      const existing = await catalogRepository.findPackageById(organizationId, packageId);
      const priceMinor = input.priceMinor ?? existing?.priceMinor;
      if (priceMinor == null) {
        throw Errors.conflict('This package has no price yet -- set one via a cost breakdown before publishing');
      }
      const durationDays = input.durationDays ?? existing?.durationDays;
      if (durationDays == null) {
        throw Errors.conflict('This package has no duration set yet -- set one before publishing');
      }
    }
    const updated = await catalogRepository.updatePackage(organizationId, packageId, input);
    if (!updated) throw Errors.notFound('Package not found');
    return updated;
  },

  async getPackage(ctx: AuthContext, packageId: string): Promise<TourPackageView> {
    assertCan(ctx, 'catalog.read');
    const pkg = await catalogRepository.findPackageById(requireOrg(ctx), packageId);
    if (!pkg || !isPackageVisible(pkg, ctx.roles)) throw Errors.notFound('Package not found');
    return pkg;
  },

  // ------------------------------------------------------------ itinerary template

  /** Reusable day-by-day itinerary template for a package -- copied onto a
   * fresh Itinerary's real ItineraryDay rows the moment one is created for a
   * booking against this package (itineraryService.createItinerary). */
  async addTemplateDay(ctx: AuthContext, packageId: string, input: AddPackageItineraryDayInput): Promise<PackageItineraryDayView> {
    assertCan(ctx, 'catalog.write');
    return catalogRepository.addTemplateDay(requireOrg(ctx), packageId, input);
  },

  async updateTemplateDay(
    ctx: AuthContext,
    dayId: string,
    input: UpdatePackageItineraryDayInput,
  ): Promise<PackageItineraryDayView> {
    assertCan(ctx, 'catalog.write');
    const updated = await catalogRepository.updateTemplateDay(requireOrg(ctx), dayId, input);
    if (!updated) throw Errors.notFound('Itinerary template day not found');
    return updated;
  },

  async removeTemplateDay(ctx: AuthContext, dayId: string): Promise<void> {
    assertCan(ctx, 'catalog.write');
    const removed = await catalogRepository.removeTemplateDay(requireOrg(ctx), dayId);
    if (!removed) throw Errors.notFound('Itinerary template day not found');
  },

  async listTemplateDays(ctx: AuthContext, packageId: string): Promise<PackageItineraryDayView[]> {
    assertCan(ctx, 'catalog.read');
    return catalogRepository.listTemplateDays(requireOrg(ctx), packageId);
  },

  /** No-ctx variant for itineraryService.createItinerary's auto-copy step --
   * that caller already holds itinerary.write and has independently
   * resolved this exact packageId via the booking's own departure, same
   * "caller already gates" convention as getDepartureWindow above. */
  async listTemplateDaysForItineraryCopy(organizationId: string, packageId: string): Promise<PackageItineraryDayView[]> {
    return catalogRepository.listTemplateDays(organizationId, packageId);
  },

  async listPackages(ctx: AuthContext): Promise<TourPackageView[]> {
    assertCan(ctx, 'catalog.read');
    const all = await catalogRepository.listPackages(requireOrg(ctx));
    return all.filter((p) => isPackageVisible(p, ctx.roles));
  },

  async createDeparture(
    ctx: AuthContext,
    packageId: string,
    input: CreateDepartureInput,
  ): Promise<DepartureView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg) throw Errors.notFound('Package not found');
    return catalogRepository.createDeparture(organizationId, packageId, input);
  },

  /** DR-029: the only mutable field on an existing Departure. Feeds the
   * assignment recommendation engine's distance-from-pickup factor. */
  async setDeparturePickupLocation(
    ctx: AuthContext,
    departureId: string,
    input: SetDeparturePickupLocationInput,
  ): Promise<DepartureView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const updated = await catalogRepository.setDeparturePickupLocation(organizationId, departureId, input);
    if (!updated) throw Errors.notFound('Departure not found');
    return updated;
  },

  async listDepartures(ctx: AuthContext, packageId: string): Promise<DepartureView[]> {
    assertCan(ctx, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg || !isPackageVisible(pkg, ctx.roles)) throw Errors.notFound('Package not found');
    const all = await catalogRepository.listDeparturesForPackage(organizationId, packageId);
    return all.filter((d) => isDepartureVisible(d, ctx.roles));
  },

  /** The one cross-module entry point the booking module calls. Branches for
   * a bespoke departure (DR-028, tourPackageId null) -- its country/price/
   * currency were snapshotted directly onto the Departure row at conversion
   * time (createBespokeDeparture) instead of coming from a TourPackage join,
   * since the catalog module can't depend on the booking module to look them
   * up any other way (module boundary). Never bookable -- it's not for
   * public sale, it exists for exactly the one group it was created for. */
  async getDepartureDetail(ctx: AuthContext, departureId: string): Promise<DepartureDetail> {
    assertCan(ctx, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const departure = await catalogRepository.findDepartureById(organizationId, departureId);
    if (!departure) throw Errors.notFound('Departure not found');

    if (!departure.tourPackageId) {
      if (!isDepartureVisible(departure, ctx.roles)) throw Errors.notFound('Departure not found');
      if (departure.priceOverrideMinor == null || !departure.currency || !departure.customCountry) {
        throw Errors.conflict('Bespoke departure is missing required pricing/country data');
      }
      return {
        departure,
        packageStatus: null,
        packageCountry: departure.customCountry,
        effectiveUnitPrice: money(departure.priceOverrideMinor, departure.currency),
        bookable: false,
      };
    }

    const pkg = await catalogRepository.findPackageById(organizationId, departure.tourPackageId);
    if (!pkg || !isPackageVisible(pkg, ctx.roles) || !isDepartureVisible(departure, ctx.roles)) {
      throw Errors.notFound('Departure not found');
    }
    return {
      departure,
      packageStatus: pkg.status,
      packageCountry: pkg.country,
      effectiveUnitPrice: effectivePrice(pkg, departure),
      bookable: isBookable(pkg, departure),
    };
  },

  /** Soft delete (DR-028) -- hides it from every listing (all reads already
   * filter deletedAt: null); no cascade risk to real Departures/Bookings. */
  async deletePackage(ctx: AuthContext, packageId: string): Promise<void> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const deleted = await catalogRepository.deletePackage(organizationId, packageId);
    if (!deleted) throw Errors.notFound('Package not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'catalog.package_deleted',
      resourceType: 'TourPackage',
      resourceId: deleted.id,
      organizationId,
    });
  },

  /** Clones the package definition only, as a new DRAFT package -- no
   * departures come along (old dates wouldn't make sense on a copy). */
  async duplicatePackage(ctx: AuthContext, packageId: string): Promise<TourPackageView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const duplicated = await catalogRepository.duplicatePackage(organizationId, packageId);
    if (!duplicated) throw Errors.notFound('Package not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'catalog.package_duplicated',
      resourceType: 'TourPackage',
      resourceId: duplicated.id,
      organizationId,
      metadata: { sourcePackageId: packageId },
    });
    return duplicated;
  },

  /** DR-028: the operational-itinerary half of an approved TAILOR_MADE
   * booking. Takes plain params rather than a Booking -- this module has no
   * knowledge of Booking at all (module boundary); bookingService.
   * convertToItinerary builds these from its own already-validated fields. */
  async createBespokeDeparture(ctx: AuthContext, params: CreateBespokeDepartureParams): Promise<DepartureView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const departure = await catalogRepository.createBespokeDeparture(organizationId, params);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'catalog.bespoke_departure_created',
      resourceType: 'Departure',
      resourceId: departure.id,
      organizationId,
    });
    return departure;
  },

  /** DR-054 (revised same session): a guest booking a real, published
   * TourPackage now chooses only their own travel start date instead of
   * joining a staff-pre-scheduled Departure -- trip length is
   * `pkg.durationDays` (staff-set at package creation, not guest-chosen), so
   * this creates a brand-new Departure scoped to that start date + computed
   * end date + this one booking's seat count (capacity == seats, same
   * "exists for one group, not public sale" precedent as
   * createBespokeDeparture, DR-028), inheriting the package's
   * price/currency/country via the normal TourPackage join (no
   * priceOverrideMinor/customCountry set -- unlike a bespoke departure, this
   * one has a real tourPackageId). Gated on catalog.read, not catalog.write
   * -- a TOURIST triggers this themselves as part of booking, not
   * administering the catalog; the package itself must already be
   * PUBLISHED, priced, and have a set duration, mirroring isBookable's own
   * gate (which can't be called directly here since it needs a Departure
   * that doesn't exist yet). */
  async createDepartureForBooking(
    ctx: AuthContext,
    packageId: string,
    params: CreateDepartureForBookingParams,
  ): Promise<DepartureView> {
    assertCan(ctx, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg || !isPackageVisible(pkg, ctx.roles)) throw Errors.notFound('Package not found');
    if (pkg.status !== 'PUBLISHED' || pkg.priceMinor == null || pkg.durationDays == null) {
      throw Errors.conflict('This package is not currently bookable');
    }
    const endDate = computeDepartureEndDate(params.startDate, pkg.durationDays);
    const departure = await catalogRepository.createDeparture(organizationId, packageId, {
      startDate: params.startDate,
      endDate,
      capacity: params.capacity,
    });
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'catalog.departure_created_for_booking',
      resourceType: 'Departure',
      resourceId: departure.id,
      organizationId,
    });
    return departure;
  },

  /** Staff-managed, read-only for now -- seeded via prisma/seed.ts. */
  async listActiveAddonServices(ctx: AuthContext): Promise<AddonServiceView[]> {
    assertCan(ctx, 'catalog.read');
    return catalogRepository.listActiveAddonServices(requireOrg(ctx));
  },

  /** The cross-module entry point the booking module calls to price-snapshot a selection. */
  async getAddonService(ctx: AuthContext, addonServiceId: string): Promise<AddonServiceView> {
    assertCan(ctx, 'catalog.read');
    const addon = await catalogRepository.findAddonServiceById(requireOrg(ctx), addonServiceId);
    if (!addon || !addon.active) throw Errors.notFound('Add-on service not found');
    return addon;
  },

  // ---------------------------------------------------------- public (DR-016)
  // No ctx/session exists for these callers -- the public browse/quiz pages
  // and the guest-checkout flow before a departure is picked. Every method
  // resolves the primary (single-tenant launch, DR-005) org itself.

  async listPublicPackages(filter: PublicPackageFilter = {}): Promise<TourPackageView[]> {
    const organizationId = await getPrimaryOrgId();
    const all = await catalogRepository.listPackages(organizationId);
    let visible = all.filter((p) => isPackageVisible(p, PUBLIC_VIEW_ROLE));
    if (filter.country) visible = visible.filter((p) => p.country === filter.country);
    const needle = filter.search?.trim().toLowerCase();
    if (needle) {
      visible = visible.filter(
        (p) => p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle),
      );
    }
    return visible;
  },

  async getPublicPackageWithDepartures(
    packageId: string,
  ): Promise<{ pkg: TourPackageView; departures: DepartureView[] }> {
    const organizationId = await getPrimaryOrgId();
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg || !isPackageVisible(pkg, PUBLIC_VIEW_ROLE)) throw Errors.notFound('Package not found');
    const departures = (await catalogRepository.listDeparturesForPackage(organizationId, packageId)).filter((d) =>
      isDepartureVisible(d, PUBLIC_VIEW_ROLE),
    );
    return { pkg, departures };
  },

  async getPublicDepartureDetail(departureId: string): Promise<DepartureDetail> {
    const organizationId = await getPrimaryOrgId();
    const departure = await catalogRepository.findDepartureById(organizationId, departureId);
    // A bespoke departure (DR-028, no TourPackage) is never for public sale --
    // it has no publicly-reachable link anywhere, but guard defensively
    // rather than let a guessed id hit findPackageById with a null id.
    if (!departure || !departure.tourPackageId) throw Errors.notFound('Departure not found');
    const pkg = await catalogRepository.findPackageById(organizationId, departure.tourPackageId);
    if (!pkg || !isPackageVisible(pkg, PUBLIC_VIEW_ROLE) || !isDepartureVisible(departure, PUBLIC_VIEW_ROLE)) {
      throw Errors.notFound('Departure not found');
    }
    return {
      departure,
      packageStatus: pkg.status,
      packageCountry: pkg.country,
      effectiveUnitPrice: effectivePrice(pkg, departure),
      bookable: isBookable(pkg, departure),
    };
  },

  /** Ratings module (DR-037): resolves "when did this tour end" for the
   * guest-facing rating-eligibility check. Deliberately no visibility gate
   * (unlike getPublicDepartureDetail) -- a COMPLETED booking's departure may
   * no longer be `SCHEDULED` (isDepartureVisible would incorrectly 404 it
   * for a non-operator caller), and the caller here has already
   * independently verified the guest's two-factor Rating Code before
   * reaching this, same "caller already gates" convention as
   * bookingService.getBookingForTraveler. */
  async getDepartureWindow(departureId: string): Promise<{ startDate: Date; endDate: Date | null } | null> {
    const organizationId = await getPrimaryOrgId();
    const departure = await catalogRepository.findDepartureById(organizationId, departureId);
    if (!departure) return null;
    return { startDate: departure.startDate, endDate: departure.endDate };
  },
};
