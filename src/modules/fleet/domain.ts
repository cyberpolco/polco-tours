// fleet module — domain types & rules. Pure; no framework or DB imports.
import type { DriverStatus, VehicleStatus } from '@prisma/client';
import { z } from 'zod';

export interface VehicleView {
  id: string;
  organizationId: string;
  ownerId: string | null;
  plateNumber: string;
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
  status: DriverStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateVehicleInput = z.object({
  ownerId: z.string().uuid().optional(),
  plateNumber: z.string().min(1).max(32),
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
});
export type CreateDriverProfileInput = z.infer<typeof CreateDriverProfileInput>;

export const UpdateDriverProfileInput = z.object({
  licenseNumber: z.string().min(1).max(100).optional(),
  licenseExpiresAt: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type UpdateDriverProfileInput = z.infer<typeof UpdateDriverProfileInput>;

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
