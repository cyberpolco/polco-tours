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
  | 'fleet.read'
  | 'fleet.write'
  | 'itinerary.read'
  | 'itinerary.write'
  | 'itinerary.approve'
  | 'admin.all';

type RoleName =
  | 'SUPERADMIN'
  | 'PLATFORM_ADMIN'
  | 'TOUR_OPERATOR'
  | 'TOUR_GUIDE'
  | 'DRIVER'
  | 'VEHICLE_OWNER'
  | 'VISA_FACILITATOR'
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
    // Itinerary Management (DR-033): the spec's literal "Super Admin"/
    // "Platform Admin" split is deliberately NOT introduced here (explicit
    // user choice) -- same "Tour operator = platform admin" precedent as
    // DR-027/028, so TOUR_OPERATOR gets full create/edit/review/approve.
    'itinerary.read',
    'itinerary.write',
    'itinerary.approve',
  ],
  // assignment.read scoped to only their own assignments in
  // assignment/service.ts's listMyAssignments (DR-018). fleet.read scoped to
  // only their own GuideProfile in fleet/service.ts, same convention as
  // DRIVER/VEHICLE_OWNER below (DR-030 -- this role previously had no
  // fleet.read at all, a deliberate DR-021 choice that's now superseded by
  // the Guides Module needing a real self-view of languages/certifications/
  // specialties).
  // itinerary.read scoped to only itineraries for their own assigned
  // departures in itinerary/service.ts (DR-033: "Drivers and Tour Guides
  // have read-only access to their assigned itineraries").
  TOUR_GUIDE: [
    'catalog.read',
    'booking.read',
    'documents.read',
    'profile.write',
    'assignment.read',
    'fleet.read',
    'itinerary.read',
  ],
  // fleet.read scoped to only their own DriverProfile in fleet/service.ts (DR-017)
  DRIVER: ['catalog.read', 'booking.read', 'profile.write', 'fleet.read', 'assignment.read', 'itinerary.read'],
  // fleet.read scoped to only vehicles they own in fleet/service.ts (DR-017)
  VEHICLE_OWNER: ['catalog.read', 'finance.read', 'profile.write', 'fleet.read', 'assignment.read'],
  // booking.read is needed to resolve a traveler by bookingId+travelerId
  // (visa/service.ts's findTraveler, same pattern the passport route uses)
  // -- without it every visa route 500s, since bookingService.listTravelers
  // itself asserts booking.read. catalog.read is needed because
  // submitApplication also calls catalogService.getDepartureDetail (to
  // snapshot the destination country) -- both caught by real CI failures,
  // not locally (this sandbox has no DB to run tests/api/visa.api.test.ts
  // against), fixed here (DR-019).
  VISA_FACILITATOR: [
    'catalog.read',
    'booking.read',
    'documents.read',
    'documents.write',
    'visa.process',
    'profile.write',
  ],
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

/**
 * DR-026: a user may hold several simultaneous roles (Membership rows) --
 * `can` grants a permission if ANY held role grants it (union semantics).
 * `roles` is always non-empty (resolveSession falls back to [User.role]
 * when a user has no Membership rows, e.g. every tourist/guest).
 */
function grantsPermission(role: Role, permission: Permission): boolean {
  const grants = MATRIX[role as RoleName];
  if (!grants) return false; // unknown role -> deny
  return grants[0] === '*' || (grants as Permission[]).includes(permission);
}

export function can(roles: Role[], permission: Permission): boolean {
  return roles.some((role) => grantsPermission(role, permission));
}

/**
 * Every operational role except TOURIST belongs on the staff dashboard --
 * tourists never get one (guest checkout is a separate, account-less site,
 * DR-016). Used as the `(dashboard)` layout's baseline "are you staff at
 * all" gate (staff-guard.ts), which previously hardcoded `booking.confirm`
 * and so silently locked out any role that isn't TOUR_OPERATOR/admin
 * (DR-020). Individual pages still gate on their own specific permission;
 * this only decides who reaches the shell.
 */
export function isStaffRole(roles: Role[]): boolean {
  return roles.some((role) => (role as RoleName) !== 'TOURIST');
}

/** Throwable guard for use in services/route handlers. */
export function assertCan(roles: Role[], permission: Permission): void {
  if (!can(roles, permission)) {
    // Imported lazily to keep this module free of framework deps for unit tests.
    throw new Error(`FORBIDDEN: ${roles.join('+')} lacks ${permission}`);
  }
}
