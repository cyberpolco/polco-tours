// fleet module — domain types & rules. Pure; no framework or DB imports.
import type { Currency, DriverStatus, GuideStatus, Role, StarlinkStatus, VehicleStatus } from '@prisma/client';
import { z } from 'zod';

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
  languages: z.array(z.string().length(2)).optional(), // ISO-639-1
});
export type CreateDriverProfileInput = z.infer<typeof CreateDriverProfileInput>;

export const UpdateDriverProfileInput = z.object({
  licenseNumber: z.string().min(1).max(100).optional(),
  licenseExpiresAt: z.coerce.date().optional(),
  languages: z.array(z.string().length(2)).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type UpdateDriverProfileInput = z.infer<typeof UpdateDriverProfileInput>;

// -------------------------------------------------------------- guides (DR-030)

export interface GuideProfileView {
  id: string;
  organizationId: string;
  userId: string;
  languages: string[];
  specialties: string[];
  status: GuideStatus;
  // Live-recomputed by the ratings module (DR-037) -- null until the first
  // Review, never incremented here. Written by userId, not this table's id
  // (ReviewSubjectRating.guideUserId points at User).
  averageRating: number | null;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateGuideProfileInput = z.object({
  userId: z.string().uuid(),
  languages: z.array(z.string().length(2)).optional(), // ISO-639-1
  specialties: z.array(z.string().min(1).max(50)).optional(),
});
export type CreateGuideProfileInput = z.infer<typeof CreateGuideProfileInput>;

export const UpdateGuideProfileInput = z.object({
  languages: z.array(z.string().length(2)).optional(),
  specialties: z.array(z.string().min(1).max(50)).optional(),
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
