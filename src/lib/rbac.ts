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
  | 'assignment.write'
  | 'finance.read'
  | 'documents.read'
  | 'documents.write'
  | 'visa.process'
  | 'immigration.read'
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
    'booking.read',
    'assignment.write',
    'finance.read',
    'documents.read',
  ],
  TOUR_GUIDE: ['catalog.read', 'booking.read', 'documents.read'],
  DRIVER: ['catalog.read', 'booking.read'],
  VEHICLE_OWNER: ['catalog.read', 'finance.read'],
  VISA_FACILITATOR: ['documents.read', 'documents.write', 'visa.process'],
  IMMIGRATION_OFFICER: ['immigration.read'], // strictly read-only (BR-10)
  TOURIST: ['catalog.read', 'booking.create', 'booking.read', 'documents.write'],
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
