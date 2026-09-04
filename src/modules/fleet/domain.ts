// fleet module — domain types & rules. Pure; no framework or DB imports.
// DR-245: PACKAGE_TAGS is imported from @modules/catalog's public index.ts
// (not reaching into catalog/domain.ts directly) so a guide's specialties
// are drawn from the exact same controlled vocabulary as TourPackage.tags,
// instead of the previous freeform string -- same "share the vocabulary via
// index.ts" precedent booking/domain.ts's preferredTags already established
// (DR-046). Confirmed acyclic: catalog imports nothing from fleet.
import type { AvailabilityStatus, Currency, DriverStatus, GuideStatus, PackageTag, Role, StarlinkStatus, VehicleStatus } from '@prisma/client';
import { z } from 'zod';
import { PACKAGE_TAGS } from '@modules/catalog';

// DR-246: explicit user direction -- both DriverProfile.languages and
// GuideProfile.languages move from freeform-typed text to a fixed checklist.
// The list covers the official/working language of each of the 5 operating
// countries (en: NA/ZM/ZW/BW, fr: DRC) plus Afrikaans and Portuguese, major
// local languages spoken in those countries' communities (not just with
// guests), and major tourist source-market languages -- all three groups
// were explicitly requested. Not backed by a Prisma enum (unlike
// PackageTag/specialties, DR-245) since this vocabulary isn't shared with
// any other module -- the `languages` column stays a plain String[]; only
// this zod list changes, no schema/DB migration needed. A handful of these
// (Bemba, Ndebele, Herero, Oshiwambo/Ndonga) have no real ISO 639-1
// (2-letter) code, so the length-2 constraint the old freeform validation
// used is dropped in favor of this fixed enum, which is a strictly stronger
// check anyway.
export const LANGUAGE_CODES = ['en', 'fr', 'af', 'pt', 'sw', 'ln', 'sn', 'nd', 'tn', 'bem', 'ny', 'ng', 'hz', 'de', 'es', 'it', 'zh'] as const;
export const LANGUAGE_LABELS: Record<(typeof LANGUAGE_CODES)[number], string> = {
  en: 'English',
  fr: 'French',
  af: 'Afrikaans',
  pt: 'Portuguese',
  sw: 'Swahili',
  ln: 'Lingala',
  sn: 'Shona',
  nd: 'Ndebele',
  tn: 'Setswana',
  bem: 'Bemba',
  ny: 'Nyanja',
  ng: 'Oshiwambo (Ndonga)',
  hz: 'Herero',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  zh: 'Mandarin Chinese',
};

/** Genuinely destructive (Vehicle/DriverProfile/GuideProfile deletion has no
 * status-transition table and no way back within the app) -- SUPERADMIN-only,
 * same "route passes via the DB-editable permission matrix, service still
 * rejects" layering as isBookingDeleter/isCountryRegulationWriter/
 * isFinanceConfigWriter. */
export function isFleetDeleter(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

export interface VehicleView {
  id: string;
  organizationId: string;
  ownerId: string | null;
  plateNumber: string;
  vin: string | null;
  make: string;
  model: string;
  year: number | null;
  vehicleType: string;
  seatCapacity: number;
  status: VehicleStatus;
  // DR-082: usage-recency, a dimension independent of `status` above -- see
  // computeAvailabilityStatus.
  availability: AvailabilityStatus;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverProfileView {
  id: string;
  organizationId: string;
  userId: string;
  licenseNumber: string;
  licenseExpiresAt: Date | null;
  languages: string[];
  status: DriverStatus;
  // Live-recomputed by the ratings module (DR-037) -- null until the first
  // Review, never incremented here.
  averageRating: number | null;
  ratingCount: number;
  // DR-082: usage-recency, independent of `status` above.
  availability: AvailabilityStatus;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateVehicleInput = z.object({
  ownerId: z.string().uuid().optional(),
  plateNumber: z.string().min(1).max(32),
  vin: z.string().min(1).max(64).optional(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().positive().optional(),
  vehicleType: z.string().min(1).max(50),
  seatCapacity: z.number().int().positive(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleInput>;

export const UpdateVehicleInput = CreateVehicleInput.partial().extend({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']).optional(),
});
export type UpdateVehicleInput = z.infer<typeof UpdateVehicleInput>;

export const CreateDriverProfileInput = z.object({
  userId: z.string().uuid(),
  licenseNumber: z.string().min(1).max(100),
  licenseExpiresAt: z.coerce.date().optional(),
  languages: z.array(z.enum(LANGUAGE_CODES)).optional(),
});
export type CreateDriverProfileInput = z.infer<typeof CreateDriverProfileInput>;

export const UpdateDriverProfileInput = z.object({
  licenseNumber: z.string().min(1).max(100).optional(),
  licenseExpiresAt: z.coerce.date().optional(),
  languages: z.array(z.enum(LANGUAGE_CODES)).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type UpdateDriverProfileInput = z.infer<typeof UpdateDriverProfileInput>;

// -------------------------------------------------------------- guides (DR-030)

export interface GuideProfileView {
  id: string;
  organizationId: string;
  userId: string;
  languages: string[];
  // DR-245: was freeform string[]; now the same PackageTag enum
  // TourPackage.tags uses, so a guide's specialties can be matched directly
  // against a package/departure's tags (see assignment/service.ts's
  // recommendAssignment).
  specialties: PackageTag[];
  status: GuideStatus;
  // Live-recomputed by the ratings module (DR-037) -- null until the first
  // Review, never incremented here. Written by userId, not this table's id
  // (ReviewSubjectRating.guideUserId points at User).
  averageRating: number | null;
  ratingCount: number;
  // DR-082: usage-recency, independent of `status` above.
  availability: AvailabilityStatus;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateGuideProfileInput = z.object({
  userId: z.string().uuid(),
  languages: z.array(z.enum(LANGUAGE_CODES)).optional(),
  specialties: z.array(z.enum(PACKAGE_TAGS)).optional(),
});
export type CreateGuideProfileInput = z.infer<typeof CreateGuideProfileInput>;

export const UpdateGuideProfileInput = z.object({
  languages: z.array(z.enum(LANGUAGE_CODES)).optional(),
  specialties: z.array(z.enum(PACKAGE_TAGS)).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type UpdateGuideProfileInput = z.infer<typeof UpdateGuideProfileInput>;

// -------------------------------------------------------------- maintenance history (DR-029)

export interface MaintenanceRecordView {
  id: string;
  organizationId: string;
  vehicleId: string;
  performedAt: Date;
  description: string;
  costMinor: number | null;
  currency: Currency | null;
  createdAt: Date;
}

export const CreateMaintenanceRecordInput = z
  .object({
    performedAt: z.coerce.date(),
    description: z.string().min(1).max(500),
    costMinor: z.number().int().nonnegative().optional(),
    currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']).optional(),
  })
  .refine((v) => (v.costMinor == null) === (v.currency == null), {
    message: 'costMinor and currency must be given together, or not at all',
  });
export type CreateMaintenanceRecordInput = z.infer<typeof CreateMaintenanceRecordInput>;

/** Recency-based proxy for maintenance risk -- 1 = serviced very recently,
 * trending toward 0 the longer it's been. No record at all is a neutral
 * middle score (0.5), not a penalty -- most vehicles won't have logged
 * history yet and shouldn't be unfairly ranked below ones that do. */
const MAINTENANCE_LOOKBACK_DAYS = 180;

export function maintenanceRecencyScore(mostRecentPerformedAt: Date | null, now: Date): number {
  if (!mostRecentPerformedAt) return 0.5;
  const daysSince = (now.getTime() - mostRecentPerformedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1;
  return Math.max(0, 1 - daysSince / MAINTENANCE_LOOKBACK_DAYS);
}

// -------------------------------------------------------------- Starlink kits (DR-029)

export interface StarlinkKitView {
  id: string;
  organizationId: string;
  kitId: string;
  status: StarlinkStatus;
  vehicleId: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateStarlinkKitInput = z.object({
  kitId: z.string().min(1).max(100),
  vehicleId: z.string().uuid().optional(),
});
export type CreateStarlinkKitInput = z.infer<typeof CreateStarlinkKitInput>;

export const UpdateStarlinkKitInput = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
});
export type UpdateStarlinkKitInput = z.infer<typeof UpdateStarlinkKitInput>;

// Staff manually update this for now -- see the StarlinkKit model comment
// (schema.prisma) for why there's no live API feed yet.
export const SetStarlinkLocationInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type SetStarlinkLocationInput = z.infer<typeof SetStarlinkLocationInput>;

export type ComplianceStatus = 'MISSING' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

const EXPIRING_SOON_WINDOW_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Pure compliance-expiry rule -- no expiry date on file is MISSING, not VALID
 * (a vehicle/driver with nothing uploaded yet must never read as compliant). */
export function complianceStatus(expiresAt: Date | null, now: Date): ComplianceStatus {
  if (!expiresAt) return 'MISSING';
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / MS_PER_DAY;
  if (daysUntilExpiry <= 0) return 'EXPIRED';
  if (daysUntilExpiry <= EXPIRING_SOON_WINDOW_DAYS) return 'EXPIRING_SOON';
  return 'VALID';
}

// -------------------------------------------------------------- availability (DR-082)
//
// A dimension deliberately independent of Vehicle/DriverStatus/GuideStatus
// above -- those are manual operational/compliance holds (MAINTENANCE/
// RETIRED/SUSPENDED); this tracks whether a resource is currently on a
// CONFIRMED-or-later booking (BOOKED), free (AVAILABLE), or hasn't been on
// one in 2+ months (INACTIVE). Per explicit user direction: "active can be
// followed by booked or available" -- i.e. AVAILABLE/INACTIVE are the two
// sub-states of "not currently booked", not a third independent axis.

export const INACTIVITY_THRESHOLD_DAYS = 60;

/** `lastActiveAt` only ever advances while `isCurrentlyBooked` -- between
 * bookings it stays put, so this is really "how long since the last
 * CONFIRMED-or-later booking ended", not merely "since created". Callers
 * update lastActiveAt to `now` themselves whenever isCurrentlyBooked is
 * true (see fleetService.recompute*Availability) so it always reflects the
 * most recent time this resource was actually in use. */
export function computeAvailabilityStatus(isCurrentlyBooked: boolean, lastActiveAt: Date, now: Date): AvailabilityStatus {
  if (isCurrentlyBooked) return 'BOOKED';
  const daysSinceActive = (now.getTime() - lastActiveAt.getTime()) / MS_PER_DAY;
  return daysSinceActive > INACTIVITY_THRESHOLD_DAYS ? 'INACTIVE' : 'AVAILABLE';
}

// DR-107: explicit user direction -- a vehicle/driver/guide shouldn't read
// as AVAILABLE the instant a tour ends; give it a fixed turnaround window
// first (cleaning, fuel, rest) before it's offered again. Deliberately
// Vehicle/DriverProfile/GuideProfile only -- StarlinkKit has no parallel
// `availability` field today (only the separate ACTIVE/INACTIVE/MAINTENANCE
// StarlinkStatus), left out of scope for this change.
// DR-242: shortened 24h -> 2h, explicit user direction.
export const POST_TOUR_AVAILABILITY_DELAY_HOURS = 2;
const MS_PER_HOUR = 1000 * 60 * 60;

/** True from the moment a departure ends until POST_TOUR_AVAILABILITY_DELAY_HOURS
 * later. A departure with no endDate is never "just ended" by this measure. */
export function isWithinPostTourCooldown(departureEndDate: Date | null, now: Date): boolean {
  if (!departureEndDate) return false;
  const hoursSinceEnd = (now.getTime() - departureEndDate.getTime()) / MS_PER_HOUR;
  return hoursSinceEnd >= 0 && hoursSinceEnd < POST_TOUR_AVAILABILITY_DELAY_HOURS;
}
