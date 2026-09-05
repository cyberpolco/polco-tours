// catalog module — domain types & rules. Pure; no framework or DB imports.
import type { AddonCode, Currency, DepartureStatus, PackageStatus, PackageTag, Role } from '@prisma/client';
import { z } from 'zod';
import { money, type Money } from '@lib/money';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';

export interface TourPackageView {
  id: string;
  organizationId: string;
  packageReference: string;
  // DR-118: personalized public URL segment, generated once from `title` at
  // creation time. Null only for a pre-DR-118 row awaiting backfill.
  slug: string | null;
  title: string;
  description: string;
  // PRIMARY/billing country -- one of countries[] below. Drives tax
  // (getEffectiveTaxRate) and finance rate resolution (resolveRatesForCost);
  // never read for anything else once countries[] exists (DR-114).
  country: string;
  // Full set of countries this package touches (superset including
  // `country`) -- display/filtering only, e.g. a combo Zambia+Zimbabwe tour.
  countries: string[];
  // Nullable since DR-039 -- a brand-new package starts unpriced until the
  // finance module's cost breakdown computes it (or an admin override sets
  // it). Existing packages keep their pre-DR-039 value (grandfathered).
  priceMinor: number | null;
  // DR-134: components financeService.saveCostBreakdown baked into
  // priceMinor (per seat) -- null for a package priced any other way.
  // priceSubtotalMinor is the tax/fee-exclusive base; the two rates are
  // whatever was effective when the breakdown was last saved.
  priceSubtotalMinor: number | null;
  priceTaxRateBp: number | null;
  pricePlatformFeeRateBp: number | null;
  currency: Currency;
  durationDays: number | null;
  // DR-068: optional hero image(s). Empty until staff upload one. Since
  // DR-114 each is a Vercel Blob public URL (catalogService.uploadPackageImage),
  // not a pasted string. DR-172: up to 3, display/slideshow order -- the
  // first is the "cover" image used wherever only one fits.
  imageUrls: string[];
  tags: PackageTag[];
  status: PackageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartureView {
  id: string;
  organizationId: string;
  // Null only for a bespoke departure (DR-028) converted from a TAILOR_MADE
  // booking with no TourPackage -- see catalogService.createBespokeDeparture.
  tourPackageId: string | null;
  startDate: Date;
  endDate: Date | null;
  capacity: number;
  priceOverrideMinor: number | null;
  currency: Currency | null;
  customCountry: string | null;
  // Staff-entered (DR-029) -- feeds the assignment recommendation engine's
  // distance-from-pickup factor. Optional; most departures won't have it.
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  status: DepartureStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Exported (DR-046) so booking/domain.ts can validate Booking.preferredTags
// against the same vocabulary without hand-duplicating it -- modules only
// share data through index.ts, never by reaching into each other's domain.ts.
export const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET', 'CAMPING', 'ADRENALINE', 'BIRDWATCHING', 'HONEYMOON', 'SELF_DRIVE'] as const;

// DR-114 (extended to 5 countries, DR-218): country/countries restricted to
// the operating countries (OPERATING_COUNTRY_CODES) -- previously an
// unrestricted z.string().length(2) with the limit enforced only
// client-side (the staff form's
// hardcoded <option> list). `countries` must include `country` (the primary/
// billing country can't be selected without also being one of the visited
// countries) -- same "client prevents for UX, server still validates"
// precedent as itinerary/domain.ts's CreateSiteInput country/province refine.
// Can't build UpdatePackageInput via CreatePackageInput.partial().extend()
// once a .refine() is involved -- refine()'d schemas don't expose .partial()
// (same reason CreateSiteInput/UpdateSiteInput are two separate full
// definitions, not one derived from the other) -- so this is written out
// twice, the update variant checking the cross-field rule only when both
// fields are actually present in a given update.
export const CreatePackageInput = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    country: z.enum(OPERATING_COUNTRY_CODES),
    countries: z.array(z.enum(OPERATING_COUNTRY_CODES)).min(1),
    // No priceMinor field (DR-128) -- a brand-new package starts unpriced
    // until financeService.saveCostBreakdown computes it from Operational
    // Rates. The pre-DR-039 manual-entry override this schema used to also
    // accept was dead in practice (no UI ever set it) and is a real gap
    // against "every price traces back to a rate," so it's removed rather
    // than left reachable via a direct API call.
    currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
    durationDays: z.number().int().positive().optional(),
    // Since DR-114 each is populated from catalogService.uploadPackageImage's
    // returned Blob URL, not staff-typed -- still just strings here (the
    // Server Action decides the values, this schema only bounds their shape
    // and count). DR-172: up to 3, display/slideshow order.
    imageUrls: z.array(z.string().max(500)).max(3).optional(),
    tags: z.array(z.enum(PACKAGE_TAGS)).optional(),
  })
  .refine((v) => v.countries.includes(v.country), {
    message: 'Primary country must be one of the selected countries',
    path: ['countries'],
  });
export type CreatePackageInput = z.infer<typeof CreatePackageInput>;

export const UpdatePackageInput = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).optional(),
    country: z.enum(OPERATING_COUNTRY_CODES).optional(),
    countries: z.array(z.enum(OPERATING_COUNTRY_CODES)).min(1).optional(),
    currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']).optional(),
    durationDays: z.number().int().positive().optional(),
    imageUrls: z.array(z.string().max(500)).max(3).optional(),
    tags: z.array(z.enum(PACKAGE_TAGS)).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED_AVAILABLE', 'PUBLISHED_UNAVAILABLE', 'ARCHIVED']).optional(),
  })
  .refine((v) => !v.country || !v.countries || v.countries.includes(v.country), {
    message: 'Primary country must be one of the selected countries',
    path: ['countries'],
  });
export type UpdatePackageInput = z.infer<typeof UpdatePackageInput>;

export const CreateDepartureInput = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().positive(),
  priceOverrideMinor: z.number().int().nonnegative().optional(),
});
export type CreateDepartureInput = z.infer<typeof CreateDepartureInput>;

// DR-029: the only mutable fields on an existing Departure are its pickup
// coordinates -- nothing else about a scheduled departure (dates/capacity/
// price/package) has ever needed post-creation editing, so this stays
// narrow rather than a general-purpose UpdateDepartureInput.
export const SetDeparturePickupLocationInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type SetDeparturePickupLocationInput = z.infer<typeof SetDeparturePickupLocationInput>;

/** Business-facing reference, e.g. PKG-00034 -- the numeric part comes from
 * a plain Postgres sequence (repository.ts); this just formats it. No year
 * component, unlike Booking.bookingReference (DR-027), per the spec's own
 * example. */
export function formatPackageReference(sequence: number | bigint): string {
  return `PKG-${String(sequence).padStart(5, '0')}`;
}

/** Params for a bespoke (package-less) departure converted from an approved
 * TAILOR_MADE booking (DR-028). Plain interface, not a zod input schema --
 * this is never parsed from a raw HTTP body; the booking module builds it
 * from its own already-validated fields, and the catalog module deliberately
 * has no knowledge of Booking (module boundary). */
export interface CreateBespokeDepartureParams {
  customCountry: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  priceMinor: number;
  currency: Currency;
}

/** Params for a guest-chosen-start-date departure on a real, existing
 * TourPackage (DR-054, revised same session -- a guest picks only a start
 * date, not a range; trip length is `pkg.durationDays`, set by staff at
 * package creation, not something a tourist can vary per booking). Same
 * "plain interface, booking module already validated it" convention as
 * CreateBespokeDepartureParams above -- the difference is this one DOES have
 * a real tourPackageId, so price/currency/country are inherited via the
 * normal package join rather than snapshotted onto the row. */
export interface CreateDepartureForBookingParams {
  startDate: Date;
  capacity: number;
}

/** A package's trip length is staff-set (`TourPackage.durationDays`), not
 * guest-chosen -- this is the one place that turns "starts on X, runs for N
 * days" into a calendar end date, so createDepartureForBooking is the only
 * caller and there is exactly one definition of what "N days" means. N=1 is
 * a single-day trip (endDate == startDate); N=7 spans 7 calendar days
 * (startDate through startDate+6). */
export function computeDepartureEndDate(startDate: Date, durationDays: number): Date {
  const end = new Date(startDate);
  end.setUTCDate(end.getUTCDate() + durationDays - 1);
  return end;
}

/** Departure's own price wins; otherwise inherit the package's. Null when
 * neither is set (DR-039: an unpriced package with no departure override) --
 * updatePackage's publish gate keeps this defensive rather than routine for
 * any published (either sub-status, DR-117) package a tourist could actually
 * reach. */
export function effectivePrice(pkg: TourPackageView, dep: DepartureView): Money | null {
  const minor = dep.priceOverrideMinor ?? pkg.priceMinor;
  if (minor == null) return null;
  return money(minor, pkg.currency);
}

/** DR-117: true for either published sub-status -- both stay listed to
 * guests (isPackageVisible), they differ only in whether a guest can act on
 * one right now (isBookable). Centralized here so no caller hand-rolls its
 * own two-value check. */
export function isPublishedStatus(status: PackageStatus): boolean {
  return status === 'PUBLISHED_AVAILABLE' || status === 'PUBLISHED_UNAVAILABLE';
}

/** A tourist can only act on a live, staff-marked-available package + a
 * still-running departure + an actual price to charge (DR-039 -- defensive;
 * updatePackage already refuses to PUBLISH a package with no price at all).
 * DR-117: PUBLISHED_UNAVAILABLE is deliberately excluded -- still listed
 * (isPackageVisible), just not currently bookable. */
export function isBookable(pkg: TourPackageView, dep: DepartureView): boolean {
  return (
    pkg.status === 'PUBLISHED_AVAILABLE' && dep.status === 'SCHEDULED' && (dep.priceOverrideMinor != null || pkg.priceMinor != null)
  );
}

function isOperatorRole(roles: Role[]): boolean {
  return roles.some((role) => role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN');
}

/** Non-operator roles only ever see published packages (either sub-status,
 * DR-117), regardless of their catalog.read grant. */
export function isPackageVisible(pkg: TourPackageView, roles: Role[]): boolean {
  return isOperatorRole(roles) || isPublishedStatus(pkg.status);
}

/** Non-operator roles only ever see scheduled departures. */
export function isDepartureVisible(dep: DepartureView, roles: Role[]): boolean {
  return isOperatorRole(roles) || dep.status === 'SCHEDULED';
}

// DR-106: "is this tour over" (assignment-lock purposes) is deliberately
// date-based, not `DepartureStatus`-based -- that enum is never actually set
// to COMPLETED/CANCELLED anywhere in the app (SCHEDULED forever in
// practice), while `endDate` is the same real signal `sweepLifecycle`
// (booking/repository.ts) and `resolveTripProgress` (tracking/domain.ts)
// already use. A departure with no endDate never counts as ended.
export function hasDepartureEnded(endDate: Date | null, now: Date): boolean {
  return endDate != null && endDate < now;
}

export interface AddonServiceView {
  id: string;
  organizationId: string;
  code: AddonCode;
  name: string;
  description: string;
  priceMinor: number;
  currency: Currency;
  active: boolean;
}

// A reusable day-by-day itinerary template for a package -- see the schema
// comment on PackageItineraryDay for why this isn't shared with the
// itinerary module's own (structurally identical) ItineraryDayView.
export interface PackageItineraryDayView {
  id: string;
  tourPackageId: string;
  dayNumber: number;
  departureTime: string | null;
  arrivalTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  activities: string | null;
  // DR-116: real Activity ids (itinerary module), picked via a searchable
  // multi-select on the staff day form -- see the schema comment on
  // PackageItineraryDay.activityIds for why this is a plain, un-FK'd array
  // rather than a relation.
  activityIds: string[];
  // DR-119: real Hotel/Restaurant ids (itinerary module), same plain
  // scalar precedent as activityIds -- one of each per day.
  hotelId: string | null;
  restaurantId: string | null;
  notes: string | null;
}

// 24h "HH:MM" -- same convention as itinerary/domain.ts's own local copy of
// this regex (no shared time-of-day type exists in this schema).
const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const AddPackageItineraryDayInput = z.object({
  dayNumber: z.number().int().positive(),
  departureTime: z.string().regex(TIME_HHMM).optional(),
  arrivalTime: z.string().regex(TIME_HHMM).optional(),
  pickupLocation: z.string().max(500).optional(),
  dropoffLocation: z.string().max(500).optional(),
  activities: z.string().max(2000).optional(),
  activityIds: z.array(z.string().uuid()).optional(),
  hotelId: z.string().uuid().optional(),
  restaurantId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type AddPackageItineraryDayInput = z.infer<typeof AddPackageItineraryDayInput>;

export const UpdatePackageItineraryDayInput = AddPackageItineraryDayInput.omit({ dayNumber: true }).partial();
export type UpdatePackageItineraryDayInput = z.infer<typeof UpdatePackageItineraryDayInput>;

