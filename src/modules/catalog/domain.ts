// catalog module — domain types & rules. Pure; no framework or DB imports.
import type { AddonCode, Currency, DepartureStatus, PackageStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { money, type Money } from '@lib/money';

export interface TourPackageView {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  country: string;
  priceMinor: number;
  currency: Currency;
  durationDays: number | null;
  status: PackageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartureView {
  id: string;
  organizationId: string;
  tourPackageId: string;
  startDate: Date;
  endDate: Date | null;
  capacity: number;
  priceOverrideMinor: number | null;
  status: DepartureStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const CreatePackageInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  country: z.string().length(2), // ISO-3166 alpha-2
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
  durationDays: z.number().int().positive().optional(),
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

/** Departure's own price wins; otherwise inherit the package's. */
export function effectivePrice(pkg: TourPackageView, dep: DepartureView): Money {
  const minor = dep.priceOverrideMinor ?? pkg.priceMinor;
  return money(minor, pkg.currency);
}

/** A tourist can only act on a live package + a still-running departure. */
export function isBookable(pkg: TourPackageView, dep: DepartureView): boolean {
  return pkg.status === 'PUBLISHED' && dep.status === 'SCHEDULED';
}

function isOperatorRole(role: Role): boolean {
  return role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN';
}

/** Non-operator roles only ever see published packages, regardless of their catalog.read grant. */
export function isPackageVisible(pkg: TourPackageView, role: Role): boolean {
  return isOperatorRole(role) || pkg.status === 'PUBLISHED';
}

/** Non-operator roles only ever see scheduled departures. */
export function isDepartureVisible(dep: DepartureView, role: Role): boolean {
  return isOperatorRole(role) || dep.status === 'SCHEDULED';
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
