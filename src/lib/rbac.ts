import type { Role } from '@prisma/client';

/**
 * Application-layer RBAC — the single source of truth for authorization
 * (Vol. 4). The DB's RLS is defense in depth; this map decides intent. Every
 * API route declares a required permission; unmapped routes fail closed.
 *
 * Permissions are `resource.action`. Scope (own/org) is enforced separately by
 * object-level ownership checks in services (anti-BOLA, Vol. 8 API1).
 *
 * DR-159 (reverses DR-035): what a role grants is a hardcoded, in-code map
 * again (`ROLE_PERMISSIONS` below), not DB-backed. The runtime permission-
 * matrix editor (`/staff/admin/permissions`, the `RolePermission` table) is
 * removed entirely — every grant here is a deliberate, reviewed decision,
 * not something any SUPERADMIN could silently reconfigure at runtime.
 * SUPERADMIN itself is unchanged from DR-035: a hardcoded, unconditional
 * wildcard, never listed in `ROLE_PERMISSIONS`, so there is always at least
 * one role that can never be locked out of the system.
 *
 * `can`/`assertCan` stay synchronous, same as under DR-035 — the effective
 * permission set is resolved ONCE per request inside
 * `authService.resolveSession` (via `resolvePermissionsForRoles` below, a
 * pure in-memory lookup now, not a DB query) and attached to
 * `AuthContext.permissions`.
 *
 * Several menu items/pages are gated by a plain role check instead of a
 * `Permission` at all (`requiresAnyRole` in `nav.tsx`/`settings-items.ts`,
 * and the analogous `requireStaffRole`/`withRole` guards) — this is
 * deliberate wherever a `Permission` is also load-bearing for an unrelated
 * internal composition (e.g. `booking.read` is still needed by
 * `visaService.findTraveler` and the guide/driver "My Schedule" self-service
 * view, so it can't be narrowed just to gate the general staff Bookings
 * list/detail pages without breaking those). See `STAFF_PAGE_ACCESS` below.
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
  // DR-151: deletes an individual VisaApplication -- never granted to any
  // role in ROLE_PERMISSIONS, same layering as booking.delete/fleet.delete/
  // rating.delete: visaService's isVisaDeleter check
  // (roles.includes('SUPERADMIN')) is the real gate, this permission alone
  // unlocks nothing for anyone but SUPERADMIN's hardcoded wildcard.
  | 'visa.delete'
  | 'fleet.read'
  | 'fleet.write'
  | 'fleet.delete'
  | 'itinerary.read'
  | 'itinerary.write'
  | 'itinerary.approve'
  | 'country_regulation.read'
  // Never granted to any role but SUPERADMIN's wildcard --
  // immigration/service.ts's isCountryRegulationWriter check
  // (`roles.includes('SUPERADMIN')`) blocks every other role unconditionally
  // regardless of this map.
  | 'country_regulation.write'
  | 'admin.all'
  // Customer Ratings & Feedback (DR-037). Separate from `booking.confirm`
  // because issuing a Rating Code / reading reviews creates and reads rows
  // in the ratings module's own tables, not Booking itself -- matches the
  // `itinerary.write`/`itinerary.read` precedent, not `booking.confirm`'s.
  | 'rating.issue'
  | 'rating.read'
  // DR-148: deletes an individual Review (and its ReviewSubjectRating rows,
  // via schema cascade) -- never granted to any role, SUPERADMIN-only via
  // ratingsService's isRatingDeleter check.
  | 'rating.delete'
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
  // rate configuration a vehicle owner has no business seeing). DR-159:
  // narrowed to SUPERADMIN-only (both read and write) -- Finance Settings
  // (Tax Rates/Platform Rate/Coupons/Operational Rates) is now a
  // SUPERADMIN-only area end to end.
  | 'finance_config.read'
  | 'finance_config.write'
  // Tracking (DR-041): gates the "what's happening right now" fleet-
  // location + active-trip-progress page/route -- every composed call
  // still re-checks its own underlying permission (fleet.read,
  // assignment.write, catalog.read) inside the module it calls through,
  // same additional-gate-not-a-bypass posture as insights.read.
  | 'tracking.read'
  // Settings (DR-042): TaxRate + PlatformRate + Coupon CRUD. DR-159:
  // narrowed to SUPERADMIN-only (both read and write), same reasoning as
  // finance_config.*.
  | 'platform_settings.read'
  | 'platform_settings.write'
  // Staff-only 5-star hotel/restaurant rating -- distinct from `rating.issue`/
  // `rating.read` (the tourist-facing DRIVER/GUIDE reviews module). Held by
  // TOUR_GUIDE/DRIVER (anti-BOLA-scoped in itinerary/service.ts to only a
  // hotel/restaurant actually assigned to one of their own toured
  // itineraries) and by TOUR_OPERATOR/PLATFORM_ADMIN (unscoped, matching
  // their existing org-wide itinerary.write access).
  | 'hotel_restaurant_rating.write'
  // Content (DR-071): SiteContent (About page)/FaqEntry CRUD -- SUPERADMIN-
  // only for both read and write (explicit user choice, unchanged by
  // DR-159); contentService's requireContentWriter additionally hardcodes a
  // SUPERADMIN role check on every write. The public /about and /faq guest
  // pages don't go through this gate at all.
  | 'content.read'
  | 'content.write'
  // Insights & Decision Making (DR-155): gates ONLY the staff-headcount/
  // roster-summary aggregate (authService.getStaffRosterSummary) --
  // deliberately NOT `admin.all`, which also unlocks full user CRUD.
  | 'staff_roster.read';

export type RoleName =
  | 'SUPERADMIN'
  | 'PLATFORM_ADMIN'
  | 'TOUR_OPERATOR'
  | 'TOUR_GUIDE'
  | 'DRIVER'
  | 'VEHICLE_OWNER'
  | 'VISA_FACILITATOR'
  | 'TOURIST';

/**
 * DR-159: the hardcoded, in-code source of truth for what each role grants
 * (replaces DR-035's DB-backed `RolePermission` table). SUPERADMIN is
 * deliberately absent -- it never consults this map, see `can()` below.
 *
 * PLATFORM_ADMIN was deliberately narrowed in this reversal, in a
 * per-menu-item review with the user (not restored to its old DR-035
 * "almost-SUPERADMIN" shape): it keeps org-wide read visibility and a few
 * write actions (fleet, itinerary edit, assignment, ratings), but lost
 * write/process actions on Bookings (confirm handled separately, see
 * `isBookingConfirmer` in booking/domain.ts; cancel, documents, invoice,
 * payment), Packages (catalog.write), Itinerary approval, Visa processing,
 * and all of Finance Settings (finance_config.*/platform_settings.*, now
 * SUPERADMIN-only) -- TOUR_OPERATOR is the operational role for all of
 * those now.
 */
export const ROLE_PERMISSIONS: Record<Exclude<RoleName, 'SUPERADMIN'>, Permission[]> = {
  PLATFORM_ADMIN: [
    'catalog.read',
    'booking.create',
    'booking.read',
    // booking.confirm stays granted (it also gates Refund/Send Quotation/
    // Convert-to-Itinerary/link Customized Package/the TAILOR_MADE cost
    // breakdown editor, all kept for PLATFORM_ADMIN) -- the Confirm action
    // itself is separately hardcoded to TOUR_OPERATOR-only via
    // isBookingConfirmer (booking/domain.ts), same "route passes, service
    // still narrows" layering as isBookingDeleter.
    'booking.confirm',
    'assignment.read',
    'assignment.write',
    'finance.read',
    'profile.write',
    'fleet.read',
    'fleet.write',
    'itinerary.read',
    'itinerary.write',
    'country_regulation.read',
    'admin.all',
    'rating.issue',
    'rating.read',
    'insights.read',
    'staff_roster.read',
    'tracking.read',
    'hotel_restaurant_rating.write',
  ],
  TOUR_OPERATOR: [
    'catalog.read',
    'catalog.write',
    'booking.create',
    'booking.read',
    'booking.confirm',
    'booking.cancel',
    'assignment.read',
    'assignment.write',
    'finance.read',
    'documents.read',
    'documents.write',
    'invoice.read',
    'payment.initiate',
    'payment.resolve',
    'profile.write',
    'fleet.read',
    'fleet.write',
    'itinerary.read',
    'itinerary.write',
    'itinerary.approve',
    'visa.process',
    'country_regulation.read',
    'rating.issue',
    'rating.read',
    'insights.read',
    'staff_roster.read',
    'tracking.read',
    'hotel_restaurant_rating.write',
  ],
  // assignment.read scoped to only their own assignments in
  // assignment/service.ts's listMyAssignments (DR-018). fleet.read scoped to
  // only their own GuideProfile in fleet/service.ts. itinerary.read scoped
  // to only itineraries for their own assigned departures in
  // itinerary/service.ts. DR-159: documents.read removed -- staff-side
  // passport/visa-document viewing is now TOUR_OPERATOR/VISA_FACILITATOR
  // only.
  TOUR_GUIDE: [
    'catalog.read',
    'booking.read',
    'profile.write',
    'assignment.read',
    'fleet.read',
    'itinerary.read',
    'hotel_restaurant_rating.write',
  ],
  // fleet.read scoped to only their own DriverProfile in fleet/service.ts (DR-017)
  DRIVER: [
    'catalog.read',
    'booking.read',
    'profile.write',
    'fleet.read',
    'assignment.read',
    'itinerary.read',
    'hotel_restaurant_rating.write',
  ],
  // fleet.read scoped to only vehicles they own in fleet/service.ts (DR-017)
  VEHICLE_OWNER: ['catalog.read', 'finance.read', 'profile.write', 'fleet.read', 'assignment.read'],
  // booking.read is needed to resolve a traveler by bookingId+travelerId
  // (visa/service.ts's findTraveler) -- without it every visa route 500s.
  // catalog.read is needed because submitApplication also calls
  // catalogService.getDepartureDetail.
  VISA_FACILITATOR: [
    'catalog.read',
    'booking.read',
    'documents.read',
    'documents.write',
    'visa.process',
    'profile.write',
    'country_regulation.read',
  ],
  TOURIST: [
    'catalog.read',
    'booking.create',
    'booking.read',
    'booking.cancel', // own bookings only -- enforced in booking/service.ts, not here
    'documents.write',
    'invoice.read', // own invoice only -- enforced in invoicing/service.ts, not here
    'payment.initiate', // own invoice only -- enforced in invoicing/service.ts, not here
    // Deliberately no payment.resolve: only staff resolve a payment.
    'profile.write', // set own phone/preferredLocale for notifications (DR-013)
  ],
};

/**
 * DR-159: plain role gates for menu items/pages whose old gating
 * `Permission` is also load-bearing for an unrelated internal composition,
 * so it can't itself be narrowed without breaking that other use. Consumed
 * by `nav.tsx`/`settings-items.ts` (`requiresAnyRole`) for visibility and by
 * `requireStaffRole`/`withRole` for actual enforcement -- always the real
 * gate, nav/sidebar visibility is UX only.
 *
 * - bookingsBrowse: the general Bookings tab + /staff/bookings* list pages.
 *   booking.read itself stays granted more broadly (TOUR_GUIDE/DRIVER's own-
 *   assignment-scoped "My Schedule" view, VISA_FACILITATOR's
 *   findTraveler) -- this is a narrower, separate gate just for browsing the
 *   full org-wide list.
 * - bookingDetail: a single booking's detail page + its GET routes.
 *   VISA_FACILITATOR is included (not bookingsBrowse) because
 *   /staff/visa-queue links directly into a booking's detail page for the
 *   application they're processing -- TOUR_GUIDE/DRIVER are not included,
 *   they never link into this page (their own scoped view is My Schedule).
 * - packagesBrowse: the Packages tab + /staff/packages* pages. catalog.read
 *   itself stays broadly granted for other roles' internal needs (guest
 *   checkout, visa/booking destination-country lookups).
 */
export const STAFF_PAGE_ACCESS = {
  bookingsBrowse: ['PLATFORM_ADMIN', 'TOUR_OPERATOR'],
  bookingDetail: ['PLATFORM_ADMIN', 'TOUR_OPERATOR', 'VISA_FACILITATOR'],
  packagesBrowse: ['PLATFORM_ADMIN', 'TOUR_OPERATOR'],
} as const satisfies Record<string, readonly Exclude<RoleName, 'SUPERADMIN'>[]>;

/**
 * Structural, not nominal -- `AuthContext` (src/modules/auth/domain.ts)
 * satisfies this without importing it. `roles` is always non-empty
 * (resolveSession falls back to [User.role] when a user has no Membership
 * rows). `permissions` is the union of every ROLE_PERMISSIONS grant across
 * all held roles, resolved once per request by `authService.resolveSession`
 * via `resolvePermissionsForRoles` below -- never recomputed here.
 */
export interface PermissionSource {
  roles: Role[];
  permissions: ReadonlySet<Permission>;
}

/**
 * DR-159: pure, in-memory replacement for the old DB query
 * (`authRepository.listPermissionsForRoles`) -- called once per request by
 * `authService.resolveSession`. SUPERADMIN sessions get an empty set (its
 * wildcard in `can()` never consults `permissions`, so there's nothing to
 * compute).
 */
export function resolvePermissionsForRoles(roles: Role[]): Set<Permission> {
  if (roles.includes('SUPERADMIN')) return new Set();
  const permissions = new Set<Permission>();
  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role as Exclude<RoleName, 'SUPERADMIN'>];
    granted?.forEach((permission) => permissions.add(permission));
  }
  return permissions;
}

/**
 * DR-026: a user may hold several simultaneous roles (Membership rows) --
 * `can` grants a permission if ANY held role grants it, which is why the
 * union is precomputed as a flat set rather than checked per-role here.
 * SUPERADMIN is the one hardcoded exception -- an unconditional wildcard
 * that bypasses `permissions` entirely.
 */
export function can(ctx: PermissionSource, permission: Permission): boolean {
  if (ctx.roles.includes('SUPERADMIN')) return true;
  return ctx.permissions.has(permission);
}

/**
 * Every operational role except TOURIST belongs on the staff dashboard --
 * tourists never get one (guest checkout is a separate, account-less site,
 * DR-016). Used as the `(dashboard)` layout's baseline "are you staff at
 * all" gate (staff-guard.ts). Individual pages still gate on their own
 * specific permission/role; this only decides who reaches the shell.
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

/**
 * DR-159: plain role-only check, for a menu item/page gated by
 * `STAFF_PAGE_ACCESS` (or any other hardcoded role list) rather than a
 * `Permission`. SUPERADMIN always passes, same wildcard as `can()`.
 */
export function hasAnyRole(ctx: PermissionSource, roles: readonly RoleName[]): boolean {
  if (ctx.roles.includes('SUPERADMIN')) return true;
  return ctx.roles.some((role) => roles.includes(role as RoleName));
}

/** Throwable role-only guard, mirroring `assertCan` for `hasAnyRole`. */
export function assertAnyRole(ctx: PermissionSource, roles: readonly RoleName[]): void {
  if (!hasAnyRole(ctx, roles)) {
    throw new Error(`FORBIDDEN: ${ctx.roles.join('+')} lacks required role`);
  }
}
