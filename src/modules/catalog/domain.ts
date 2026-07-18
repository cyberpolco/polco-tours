// catalog module — domain types & rules. Pure; no framework or DB imports.
import type { AddonCode, Currency, DepartureStatus, PackageStatus, PackageTag, Role } from '@prisma/client';
import { z } from 'zod';
import { money, type Money } from '@lib/money';

export interface TourPackageView {
  id: string;
  organizationId: string;
  packageReference: string;
  title: string;
  description: string;
  country: string;
  // Nullable since DR-039 -- a brand-new package starts unpriced until the
  // finance module's cost breakdown computes it (or an admin override sets
  // it). Existing packages keep their pre-DR-039 value (grandfathered).
  priceMinor: number | null;
  currency: Currency;
  durationDays: number | null;
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
export const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export const CreatePackageInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  country: z.string().length(2), // ISO-3166 alpha-2
  // Optional since DR-039 -- a brand-new package starts unpriced until the
  // finance module's cost breakdown computes it (or this is set directly,
  // the pre-DR-039 manual-entry path, which still works as an override).
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
  durationDays: z.number().int().positive().optional(),
  tags: z.array(z.enum(PACKAGE_TAGS)).optional(),
});
export type CreatePackageInput = z.infer<typeof CreatePackageInput>;

export const UpdatePackageInput = CreatePackageInput.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
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

/** Departure's own price wins; otherwise inherit the package's. Null when
 * neither is set (DR-039: an unpriced package with no departure override) --
 * updatePackage's publish gate keeps this defensive rather than routine for
 * any PUBLISHED package a tourist could actually reach. */
export function effectivePrice(pkg: TourPackageView, dep: DepartureView): Money | null {
  const minor = dep.priceOverrideMinor ?? pkg.priceMinor;
  if (minor == null) return null;
  return money(minor, pkg.currency);
}

/** A tourist can only act on a live package + a still-running departure +
 * an actual price to charge (DR-039 -- defensive; updatePackage already
 * refuses to PUBLISH a package with no price at all). */
export function isBookable(pkg: TourPackageView, dep: DepartureView): boolean {
  return pkg.status === 'PUBLISHED' && dep.status === 'SCHEDULED' && (dep.priceOverrideMinor != null || pkg.priceMinor != null);
}

function isOperatorRole(roles: Role[]): boolean {
  return roles.some((role) => role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN');
}

/** Non-operator roles only ever see published packages, regardless of their catalog.read grant. */
export function isPackageVisible(pkg: TourPackageView, roles: Role[]): boolean {
  return isOperatorRole(roles) || pkg.status === 'PUBLISHED';
}

/** Non-operator roles only ever see scheduled departures. */
export function isDepartureVisible(dep: DepartureView, roles: Role[]): boolean {
  return isOperatorRole(roles) || dep.status === 'SCHEDULED';
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

