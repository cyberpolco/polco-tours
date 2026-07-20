import type { Role } from '@prisma/client';

/**
 * Application-layer RBAC — the single source of truth for authorization
 * (Vol. 4). The DB's RLS is defense in depth; this map decides intent. Every
 * API route declares a required permission; unmapped routes fail closed.
 *
 * Permissions are `resource.action`. Scope (own/org) is enforced separately by
 * object-level ownership checks in services (anti-BOLA, Vol. 8 API1).
 *
 * DR-035 (User Management / permission-matrix editor): what a role grants is
 * now DB-backed (`RolePermission`, one row per role+permission), not a
 * static in-memory map -- a SUPERADMIN can edit it at runtime via
 * `/staff/admin/permissions`. SUPERADMIN itself is the one exception: it
 * stays a hardcoded, unconditional wildcard below, never stored in the DB
 * and never editable, so there is always at least one role that can never
 * be locked out of the system ("Super Admin: full system access", per the
 * spec). Every other role -- including PLATFORM_ADMIN, which lost its own
 * hardcoded wildcard this increment -- is fully editable.
 *
 * `can`/`assertCan` stay synchronous: the effective permission set is
 * resolved ONCE per request inside `authService.resolveSession` (already
 * async, already hitting the DB for the session/user) and attached to
 * `AuthContext.permissions` -- not re-derived from the DB on every check.
 * This avoids making `can`/`assertCan` themselves async, which would have
 * broken `StaffNav` (a client component that can't `await`) and turned
 * `tests/rbac.test.ts`'s pure, DB-free unit tests into DB-backed ones for
 * no benefit the already-async session resolution doesn't already give.
 */
export type Permission =
  | 'catalog.read'
  | 'catalog.write'
  | 'booking.create'
  | 'booking.read'
  | 'booking.confirm'
  | 'booking.cancel'
  | 'booking.delete'
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
  | 'fleet.delete'
  | 'itinerary.read'
  | 'itinerary.write'
  | 'itinerary.approve'
  | 'country_regulation.read'
  // Deliberately NOT included in PLATFORM_ADMIN's DR-035 "full access" seed
  // grants (see prisma/seed.ts) -- immigration/service.ts's
  // isCountryRegulationWriter check (`roles.includes('SUPERADMIN')`) blocks
  // every non-SUPERADMIN role unconditionally regardless of what this table
  // says, so granting it to PLATFORM_ADMIN would just be a checkbox that
  // silently lies in the matrix editor. This was the first genuine
  // behavioral gap between the two admin roles in this app (DR-034), before
  // PLATFORM_ADMIN lost its own hardcoded wildcard entirely (DR-035).
  | 'country_regulation.write'
  | 'admin.all'
  // Customer Ratings & Feedback (DR-037). Separate from `booking.confirm`
  // because issuing a Rating Code / reading reviews creates and reads rows
  // in the ratings module's own tables, not Booking itself -- matches the
  // `itinerary.write`/`itinerary.read` precedent, not `booking.confirm`'s.
  | 'rating.issue'
  | 'rating.read'
  // Insights & Decision Making (DR-038). Gates the executive-dashboard
  // page/route itself; every metric it composes still re-checks its own
  // underlying permission (assignment.write, invoice.read, fleet.read,
  // rating.read, visa.process, catalog.read, booking.read) inside the
  // module it calls through -- this is an additional top-level gate, not a
  // bypass.
  | 'insights.read'
  // Finance Module (DR-039), the operational-rates/cost-breakdown config
  // side -- deliberately NOT the pre-existing `finance.read` (that's about
  // invoice/payment financial data, held by VEHICLE_OWNER too, unrelated to
  // rate configuration a vehicle owner has no business seeing).
  // finance_config.write is never seeded to PLATFORM_ADMIN in
  // DEFAULT_PERMISSIONS -- financeService's isFinanceConfigWriter check
  // (`roles.includes('SUPERADMIN')`) blocks every non-SUPERADMIN role
  // unconditionally, same layering as isCountryRegulationWriter (DR-034).
  | 'finance_config.read'
  | 'finance_config.write'
  // Tracking (DR-041): gates the "what's happening right now" fleet-
  // location + active-trip-progress page/route -- every composed call
  // still re-checks its own underlying permission (fleet.read,
  // assignment.write, catalog.read) inside the module it calls through,
  // same additional-gate-not-a-bypass posture as insights.read.
  | 'tracking.read'
  // Settings (DR-042): TaxRate + PlatformRate CRUD, closing DR-035's
  // parked "Configure system settings" item. platform_settings.write is
  // never seeded to any role including PLATFORM_ADMIN -- settingsService's
  // requireSettingsWriter check (roles.includes('SUPERADMIN')) blocks
  // every non-SUPERADMIN role unconditionally, same layering as
  // isFinanceConfigWriter/isCountryRegulationWriter.
  | 'platform_settings.read'
  | 'platform_settings.write';

/** Runtime enumeration of every Permission literal -- powers the
 * permission-matrix editor's columns (DR-035). Keep in sync with the
 * `Permission` union above by hand; there's no existing automatic
 * completeness check in this file for role/permission lists (same as
 * ASSIGNABLE_ROLES not being checked against the Role enum), so add new
 * permissions here when adding them to the union. */
export const ALL_PERMISSIONS = [
  'catalog.read',
  'catalog.write',
  'booking.create',
  'booking.read',
  'booking.confirm',
  'booking.cancel',
  'booking.delete', // DR-058: never seeded to any role (see DEFAULT_PERMISSIONS) -- SUPERADMIN-only via isBookingDeleter in booking/service.ts, same layering as country_regulation.write/platform_settings.write
  'assignment.read',
  'assignment.write',
  'finance.read',
  'invoice.read',
  'payment.initiate',
  'payment.resolve',
  'profile.write',
  'documents.read',
  'documents.write',
  'visa.process',
  'fleet.read',
  'fleet.write',
  'fleet.delete', // DR-059: never seeded to any role (see DEFAULT_PERMISSIONS) -- SUPERADMIN-only via isFleetDeleter in fleet/service.ts, same layering as booking.delete/country_regulation.write
  'itinerary.read',
  'itinerary.write',
  'itinerary.approve',
  'country_regulation.read',
  'country_regulation.write',
  'admin.all',
  'rating.issue',
  'rating.read',
  'insights.read',
  'finance_config.read',
  'finance_config.write',
  'tracking.read',
  'platform_settings.read',
  'platform_settings.write',
] as const satisfies readonly Permission[];

export type RoleName =
  | 'SUPERADMIN'
  | 'PLATFORM_ADMIN'
  | 'TOUR_OPERATOR'
  | 'TOUR_GUIDE'
  | 'DRIVER'
  | 'VEHICLE_OWNER'
  | 'VISA_FACILITATOR'
  | 'TOURIST';

/** Every role whose grants live in the DB-backed RolePermission table
 * (DR-035) -- every role except SUPERADMIN, which is hardcoded and never
 * gets rows. Used by the permission-matrix editor to enumerate rows and by
 * prisma/seed.ts to know what to seed. */
export const EDITABLE_ROLES = [
  'PLATFORM_ADMIN',
  'TOUR_OPERATOR',
  'TOUR_GUIDE',
  'DRIVER',
  'VEHICLE_OWNER',
  'VISA_FACILITATOR',
  'TOURIST',
] as const satisfies readonly Exclude<RoleName, 'SUPERADMIN'>[];

/**
 * DR-035: the historical default permission set, one-time-seeded into
 * `RolePermission` (see prisma/seed.ts) and never consulted directly by
 * `can()`/`assertCan()` after that -- kept here purely as a readable record
 * of what used to be hardcoded, and as the seed script's data source.
 * SUPERADMIN is deliberately absent (see the Permission union's top-of-file
 * comment): it never gets DB rows, and PLATFORM_ADMIN's list below is the
 * former SUPERADMIN-equivalent "full access" set MINUS
 * `country_regulation.write` (see that permission's own comment for why).
 */
export const DEFAULT_PERMISSIONS: Record<Exclude<RoleName, 'SUPERADMIN'>, Permission[]> = {
  PLATFORM_ADMIN: [
    'catalog.read',
    'catalog.write',
    'booking.create',
    'booking.read',
    'booking.confirm',
    'booking.cancel',
    'assignment.read',
    'assignment.write',
    'finance.read',
    'invoice.read',
    'payment.initiate',
    'payment.resolve',
    'profile.write',
    'documents.read',
    'documents.write',
    'visa.process',
    'fleet.read',
    'fleet.write',
    'itinerary.read',
    'itinerary.write',
    'itinerary.approve',
    'country_regulation.read',
    'admin.all',
    'rating.issue',
    'rating.read',
    'insights.read',
    // Finance Module (DR-039): read-only here even for PLATFORM_ADMIN --
    // finance_config.write is deliberately never seeded to any role (see
    // the Permission union's comment); only SUPERADMIN's hardcoded wildcard
    // reaches it, mirroring country_regulation.write's precedent.
    'finance_config.read',
    // Tracking (DR-041): the fleet-location + active-trip-progress dashboard.
    'tracking.read',
    // Settings (DR-042): read-only here even for PLATFORM_ADMIN --
    // platform_settings.write is deliberately never seeded to any role,
    // same layering as finance_config.write.
    'platform_settings.read',
  ],
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
    // Immigration Module (DR-034): "The Tour Operator is by default also a
    // Visa Facilitator role" -- explicit user instruction. Grants the same
    // visa-processing capability VISA_FACILITATOR holds (documents.read/
    // write are already above). Does NOT get country_regulation.write --
    // that stays SUPERADMIN-only (see PLATFORM_ADMIN note below).
    'visa.process',
    'country_regulation.read',
    // Customer Ratings & Feedback (DR-037): issues Rating Codes once a
    // booking is fully paid, and views the aggregate/individual reviews.
    'rating.issue',
    'rating.read',
    // Insights & Decision Making (DR-038): the executive dashboard.
    'insights.read',
    // Finance Module (DR-039): needs to view rates to build a package's
    // cost breakdown (financeService.saveCostBreakdown is gated
    // catalog.write, already held above) -- not finance_config.write,
    // which stays SUPERADMIN-only.
    'finance_config.read',
    // Tracking (DR-041): the fleet-location + active-trip-progress dashboard.
    'tracking.read',
    // Settings (DR-042): read-only visibility into tax/platform rates that
    // affect their own invoicing -- not platform_settings.write.
    'platform_settings.read',
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
    'country_regulation.read', // needs to see a country's requirements to process its applications (DR-034)
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
 * Structural, not nominal -- `AuthContext` (src/modules/auth/domain.ts)
 * satisfies this without importing it, keeping rbac.ts dependency-free
 * (same reasoning the old code gave for lazily importing Error). `roles` is
 * always non-empty (resolveSession falls back to [User.role] when a user
 * has no Membership rows, e.g. every tourist/guest). `permissions` is the
 * union of every DB-backed grant across all held roles, resolved once per
 * request by `authService.resolveSession` (DR-035) -- never re-queried
 * here.
 */
export interface PermissionSource {
  roles: Role[];
  permissions: ReadonlySet<Permission>;
}

/**
 * DR-026: a user may hold several simultaneous roles (Membership rows) --
 * `can` grants a permission if ANY held role grants it, which is why the
 * union is precomputed as a flat set rather than checked per-role here.
 * DR-035: SUPERADMIN is the one hardcoded exception -- an unconditional
 * wildcard that bypasses `permissions` entirely, so this platform always
 * has at least one role that can never be locked out by a permission-matrix
 * edit gone wrong.
 */
export function can(ctx: PermissionSource, permission: Permission): boolean {
  if (ctx.roles.includes('SUPERADMIN')) return true;
  return ctx.permissions.has(permission);
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
export function assertCan(ctx: PermissionSource, permission: Permission): void {
  if (!can(ctx, permission)) {
    // Imported lazily to keep this module free of framework deps for unit tests.
    throw new Error(`FORBIDDEN: ${ctx.roles.join('+')} lacks ${permission}`);
  }
}
