import type { Role } from '@prisma/client';

/**
 * Application-layer RBAC — the single source of truth for authorization
 * (Vol. 4). The DB's RLS is defense in depth; this map decides intent. Every
 * API route declares a required permission; unmapped routes fail closed.
 *
 * Permissions are `resource.action`. Scope (own/org) is enforced separately by
 * object-level ownership checks in services (anti-BOLA, Vol. 8 API1).
 */
export type Permission =
  | 'catalog.read'
  | 'catalog.write'
  | 'booking.create'
  | 'booking.read'
  | 'booking.confirm'
  | 'booking.cancel'
  | 'assignment.read'
  | 'assignment.write'
  | 'finance.read'
  | 'invoice.read'
  | 'payment.initiate'
  | 'payment.resolve'
  | 'profile.write'
  | 'documents.read'
  | 'documents.write'
  | 'visa.process'
  | 'immigration.read'
  | 'fleet.read'
  | 'fleet.write'
  | 'admin.all';

type RoleName =
  | 'SUPERADMIN'
  | 'PLATFORM_ADMIN'
  | 'TOUR_OPERATOR'
  | 'TOUR_GUIDE'
  | 'DRIVER'
  | 'VEHICLE_OWNER'
  | 'VISA_FACILITATOR'
  | 'IMMIGRATION_OFFICER'
  | 'TOURIST';

// A role's granted permissions. '*' means all (superadmin).
const MATRIX: Record<RoleName, Permission[] | ['*']> = {
  SUPERADMIN: ['*'],
  PLATFORM_ADMIN: ['*'],
  TOUR_OPERATOR: [
    'catalog.read',
    'catalog.write',
    'booking.create', // phone/walk-in bookings entered on a tourist's behalf
    'booking.read',
    'booking.confirm',
    'booking.cancel',
    'assignment.read',
    'assignment.write',
    'finance.read',
    'documents.read',
    'documents.write', // staff upload a tour lead's passport on their behalf (DR-015)
    'invoice.read',
    'payment.initiate',
    'payment.resolve',
    'profile.write',
    'fleet.read', // manages the whole org's fleet (DR-017)
    'fleet.write',
  ],
  // assignment.read scoped to only their own assignments in
  // assignment/service.ts's listMyAssignments (DR-018, API-only this
  // increment -- no staff-dashboard portal yet for this role)
  TOUR_GUIDE: ['catalog.read', 'booking.read', 'documents.read', 'profile.write', 'assignment.read'],
  // fleet.read scoped to only their own DriverProfile in fleet/service.ts (DR-017)
  DRIVER: ['catalog.read', 'booking.read', 'profile.write', 'fleet.read', 'assignment.read'],
  // fleet.read scoped to only vehicles they own in fleet/service.ts (DR-017)
  VEHICLE_OWNER: ['catalog.read', 'finance.read', 'profile.write', 'fleet.read', 'assignment.read'],
  VISA_FACILITATOR: ['documents.read', 'documents.write', 'visa.process', 'profile.write'],
  // Deliberately no profile.write either: BR-10's "strictly read-only" is
  // interpreted broadly here to preserve this role's single-permission
  // footprint, even though a self-service phone/locale update isn't itself
  // an immigration-data write (DR-013).
  IMMIGRATION_OFFICER: ['immigration.read'], // strictly read-only (BR-10)
  TOURIST: [
    'catalog.read',
    'booking.create',
    'booking.read',
    'booking.cancel', // own bookings only -- enforced in booking/service.ts, not here
    'documents.write',
    'invoice.read', // own invoice only -- enforced in invoicing/service.ts, not here
    'payment.initiate', // own invoice only -- enforced in invoicing/service.ts, not here
    // Deliberately no payment.resolve: only staff resolve a payment
    // (mirrors the future DPO webhook actor) -- a tourist self-marking
    // their own payment succeeded would be a fraud vector (DR-012).
    'profile.write', // set own phone/preferredLocale for notifications (DR-013)
  ],
};

export function can(role: Role, permission: Permission): boolean {
  const grants = MATRIX[role as RoleName];
  if (!grants) return false; // unknown role -> deny
  return grants[0] === '*' || (grants as Permission[]).includes(permission);
}

/** Throwable guard for use in services/route handlers. */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    // Imported lazily to keep this module free of framework deps for unit tests.
    throw new Error(`FORBIDDEN: ${role} lacks ${permission}`);
  }
}
