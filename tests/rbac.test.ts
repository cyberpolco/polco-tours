import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import { can, isStaffRole, DEFAULT_PERMISSIONS, type Permission, type PermissionSource } from '../src/lib/rbac';

/**
 * DR-035 split this file in two, matching the architecture change:
 *
 * - "can()/assertCan() mechanism" -- the pure logic (SUPERADMIN's hardcoded
 *   wildcard, union-of-held-roles semantics, isStaffRole) tested against
 *   hand-built PermissionSource contexts. This is what stays a permanent,
 *   DB-free unit test after DR-035 -- these questions never touch the DB.
 * - "DEFAULT_PERMISSIONS seed data" -- what each role's grants USED TO BE
 *   hardcoded to, which is now just the one-time seed for the DB-backed
 *   RolePermission table (prisma/seed.ts). These assertions describe the
 *   defaults, not the live, runtime-editable state -- a SUPERADMIN can
 *   change any of this at /staff/admin/permissions without touching code,
 *   and these tests won't (and shouldn't) catch that. Live-state coverage
 *   lives in tests/api/permissions.security.test.ts instead.
 */

function ctx(roles: Role[], permissions: Permission[] = []): PermissionSource {
  return { roles, permissions: new Set(permissions) };
}

describe('can()/assertCan() mechanism', () => {
  it('SUPERADMIN bypasses the permissions set entirely -- a hardcoded, unconditional wildcard (DR-035)', () => {
    expect(can(ctx(['SUPERADMIN'], []), 'admin.all')).toBe(true);
    expect(can(ctx(['SUPERADMIN'], []), 'country_regulation.write')).toBe(true);
    // Even a permission that doesn't exist in the Permission union at all --
    // SUPERADMIN never even looks at the set.
    expect(can(ctx(['SUPERADMIN'], []), 'anything.at.all' as Permission)).toBe(true);
  });

  it('a non-SUPERADMIN role only has what is in its resolved permissions set', () => {
    expect(can(ctx(['TOUR_OPERATOR'], ['catalog.write']), 'catalog.write')).toBe(true);
    expect(can(ctx(['TOUR_OPERATOR'], ['catalog.write']), 'admin.all')).toBe(false);
    expect(can(ctx(['TOUR_OPERATOR'], []), 'catalog.write')).toBe(false);
  });

  it('PLATFORM_ADMIN is NOT a wildcard (DR-035) -- it only has what its resolved permissions set contains, same as any other DB-backed role', () => {
    expect(can(ctx(['PLATFORM_ADMIN'], []), 'admin.all')).toBe(false);
    expect(can(ctx(['PLATFORM_ADMIN'], ['admin.all']), 'admin.all')).toBe(true);
  });

  it('DR-026: a user holding multiple roles gets the union of their grants', () => {
    const multiRole = ctx(['VISA_FACILITATOR', 'TOUR_GUIDE'], ['visa.process', 'fleet.read']);
    expect(can(multiRole, 'visa.process')).toBe(true);
    expect(can(multiRole, 'fleet.read')).toBe(true);
    expect(can(multiRole, 'admin.all')).toBe(false);
  });

  it('isStaffRole: every role except TOURIST reaches the staff dashboard baseline gate (DR-020) -- unaffected by DR-035, roles-only', () => {
    expect(isStaffRole(['SUPERADMIN'])).toBe(true);
    expect(isStaffRole(['PLATFORM_ADMIN'])).toBe(true);
    expect(isStaffRole(['TOUR_OPERATOR'])).toBe(true);
    expect(isStaffRole(['TOUR_GUIDE'])).toBe(true);
    expect(isStaffRole(['DRIVER'])).toBe(true);
    expect(isStaffRole(['VEHICLE_OWNER'])).toBe(true);
    expect(isStaffRole(['VISA_FACILITATOR'])).toBe(true);
    expect(isStaffRole(['TOURIST'])).toBe(false);
  });

  it('DR-026: isStaffRole is true if ANY held role is non-TOURIST', () => {
    expect(isStaffRole(['TOURIST', 'DRIVER'])).toBe(true);
    expect(isStaffRole(['TOURIST'])).toBe(false);
  });
});

function hasDefault(role: keyof typeof DEFAULT_PERMISSIONS, permission: Permission): boolean {
  return DEFAULT_PERMISSIONS[role].includes(permission);
}

// Asserts representative cells of the DR-035 seed data (what each role's
// grants started as in RolePermission) -- describes prisma/seed.ts's
// intent, not the live, admin-editable state.
describe('DEFAULT_PERMISSIONS seed data', () => {
  it('PLATFORM_ADMIN is seeded with everything except country_regulation.write (DR-035, DR-034)', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'admin.all')).toBe(true);
    expect(hasDefault('PLATFORM_ADMIN', 'finance.read')).toBe(true);
    expect(hasDefault('PLATFORM_ADMIN', 'catalog.write')).toBe(true);
    expect(hasDefault('PLATFORM_ADMIN', 'country_regulation.write')).toBe(false);
  });

  it('TOUR_OPERATOR can manage catalog but is not seeded as a global admin', () => {
    expect(hasDefault('TOUR_OPERATOR', 'catalog.write')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'admin.all')).toBe(false);
  });

  it('TOURIST cannot write catalog', () => {
    expect(hasDefault('TOURIST', 'catalog.write')).toBe(false);
    expect(hasDefault('TOURIST', 'booking.create')).toBe(true);
  });

  it('TOURIST can cancel bookings but not confirm them (operator-only)', () => {
    expect(hasDefault('TOURIST', 'booking.cancel')).toBe(true);
    expect(hasDefault('TOURIST', 'booking.confirm')).toBe(false);
  });

  it('TOUR_OPERATOR can create, confirm, and cancel bookings', () => {
    expect(hasDefault('TOUR_OPERATOR', 'booking.create')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'booking.confirm')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'booking.cancel')).toBe(true);
  });

  it('TOUR_GUIDE and DRIVER cannot confirm or cancel bookings', () => {
    expect(hasDefault('TOUR_GUIDE', 'booking.confirm')).toBe(false);
    expect(hasDefault('TOUR_GUIDE', 'booking.cancel')).toBe(false);
    expect(hasDefault('DRIVER', 'booking.confirm')).toBe(false);
    expect(hasDefault('DRIVER', 'booking.cancel')).toBe(false);
  });

  it('TOUR_OPERATOR can read invoices and both initiate and resolve payments', () => {
    expect(hasDefault('TOUR_OPERATOR', 'invoice.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'payment.initiate')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'payment.resolve')).toBe(true);
  });

  it('TOURIST can read invoices and initiate payments but not resolve them (DR-012)', () => {
    expect(hasDefault('TOURIST', 'invoice.read')).toBe(true);
    expect(hasDefault('TOURIST', 'payment.initiate')).toBe(true);
    expect(hasDefault('TOURIST', 'payment.resolve')).toBe(false);
  });

  it('TOUR_GUIDE and DRIVER have no invoicing/payment grants', () => {
    expect(hasDefault('TOUR_GUIDE', 'invoice.read')).toBe(false);
    expect(hasDefault('TOUR_GUIDE', 'payment.initiate')).toBe(false);
    expect(hasDefault('DRIVER', 'invoice.read')).toBe(false);
    expect(hasDefault('DRIVER', 'payment.initiate')).toBe(false);
  });

  it('every operational role can self-service their profile (DR-013)', () => {
    expect(hasDefault('TOUR_OPERATOR', 'profile.write')).toBe(true);
    expect(hasDefault('TOURIST', 'profile.write')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'profile.write')).toBe(true);
    expect(hasDefault('DRIVER', 'profile.write')).toBe(true);
    expect(hasDefault('VEHICLE_OWNER', 'profile.write')).toBe(true);
    expect(hasDefault('VISA_FACILITATOR', 'profile.write')).toBe(true);
  });

  it('TOUR_OPERATOR manages the whole fleet (DR-017)', () => {
    expect(hasDefault('TOUR_OPERATOR', 'fleet.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'fleet.write')).toBe(true);
  });

  it('VEHICLE_OWNER and DRIVER can read but not write fleet data (DR-017, scoped to own records in fleet/service.ts)', () => {
    expect(hasDefault('VEHICLE_OWNER', 'fleet.read')).toBe(true);
    expect(hasDefault('VEHICLE_OWNER', 'fleet.write')).toBe(false);
    expect(hasDefault('DRIVER', 'fleet.read')).toBe(true);
    expect(hasDefault('DRIVER', 'fleet.write')).toBe(false);
  });

  it('VISA_FACILITATOR and TOURIST have no fleet grants (DR-017); TOUR_GUIDE gained fleet.read in DR-030 for its own GuideProfile self-view', () => {
    expect(hasDefault('TOUR_GUIDE', 'fleet.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'fleet.write')).toBe(false);
    expect(hasDefault('VISA_FACILITATOR', 'fleet.read')).toBe(false);
    expect(hasDefault('TOURIST', 'fleet.read')).toBe(false);
  });

  it('TOUR_OPERATOR can read and write assignments (DR-018)', () => {
    expect(hasDefault('TOUR_OPERATOR', 'assignment.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'assignment.write')).toBe(true);
  });

  it('TOUR_GUIDE, DRIVER, and VEHICLE_OWNER can read but not write assignments (DR-018, scoped to their own in assignment/service.ts)', () => {
    expect(hasDefault('TOUR_GUIDE', 'assignment.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'assignment.write')).toBe(false);
    expect(hasDefault('DRIVER', 'assignment.read')).toBe(true);
    expect(hasDefault('DRIVER', 'assignment.write')).toBe(false);
    expect(hasDefault('VEHICLE_OWNER', 'assignment.read')).toBe(true);
    expect(hasDefault('VEHICLE_OWNER', 'assignment.write')).toBe(false);
  });

  it('VISA_FACILITATOR and TOURIST have no assignment grants (DR-018)', () => {
    expect(hasDefault('VISA_FACILITATOR', 'assignment.read')).toBe(false);
    expect(hasDefault('TOURIST', 'assignment.read')).toBe(false);
  });

  it('VISA_FACILITATOR can process visas and read catalog/bookings/documents (DR-019)', () => {
    expect(hasDefault('VISA_FACILITATOR', 'visa.process')).toBe(true);
    expect(hasDefault('VISA_FACILITATOR', 'documents.read')).toBe(true);
    // Needed to resolve a traveler by bookingId+travelerId (findTraveler) and
    // to snapshot the destination country (catalogService.getDepartureDetail)
    // -- missing these caused every visa route to 500 in CI.
    expect(hasDefault('VISA_FACILITATOR', 'booking.read')).toBe(true);
    expect(hasDefault('VISA_FACILITATOR', 'catalog.read')).toBe(true);
  });

  it('TOUR_GUIDE can read documents (needed for the visa-status line, DR-019) but not process visas', () => {
    expect(hasDefault('TOUR_GUIDE', 'documents.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'visa.process')).toBe(false);
  });

  it('TOUR_OPERATOR gains visa.process (DR-034: "by default also a Visa Facilitator role") and country_regulation.read, but not country_regulation.write', () => {
    expect(hasDefault('TOUR_OPERATOR', 'documents.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'visa.process')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'country_regulation.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'country_regulation.write')).toBe(false);
  });

  it('VISA_FACILITATOR gains country_regulation.read (DR-034) but not country_regulation.write', () => {
    expect(hasDefault('VISA_FACILITATOR', 'country_regulation.read')).toBe(true);
    expect(hasDefault('VISA_FACILITATOR', 'country_regulation.write')).toBe(false);
  });

  it('no role is seeded with country_regulation.write -- SUPERADMIN reaches it only via its hardcoded wildcard, never a DB row (DR-034/DR-035)', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'country_regulation.write')).toBe(false);
    expect(hasDefault('TOUR_OPERATOR', 'country_regulation.write')).toBe(false);
    expect(hasDefault('TOUR_GUIDE', 'country_regulation.write')).toBe(false);
    expect(hasDefault('DRIVER', 'country_regulation.write')).toBe(false);
    expect(hasDefault('VISA_FACILITATOR', 'country_regulation.write')).toBe(false);
    expect(hasDefault('TOURIST', 'country_regulation.write')).toBe(false);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR gain rating.issue/rating.read (DR-037); no other role does', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'rating.issue')).toBe(true);
    expect(hasDefault('PLATFORM_ADMIN', 'rating.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'rating.issue')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'rating.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'rating.issue')).toBe(false);
    expect(hasDefault('DRIVER', 'rating.issue')).toBe(false);
    expect(hasDefault('VISA_FACILITATOR', 'rating.issue')).toBe(false);
    expect(hasDefault('TOURIST', 'rating.issue')).toBe(false);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR gain insights.read (DR-038); no other role does', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'insights.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'insights.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'insights.read')).toBe(false);
    expect(hasDefault('DRIVER', 'insights.read')).toBe(false);
    expect(hasDefault('VEHICLE_OWNER', 'insights.read')).toBe(false);
    expect(hasDefault('VISA_FACILITATOR', 'insights.read')).toBe(false);
    expect(hasDefault('TOURIST', 'insights.read')).toBe(false);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR gain finance_config.read (DR-039); no role is seeded with finance_config.write', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'finance_config.read')).toBe(true);
    expect(hasDefault('TOUR_OPERATOR', 'finance_config.read')).toBe(true);
    expect(hasDefault('TOUR_GUIDE', 'finance_config.read')).toBe(false);
    expect(hasDefault('VEHICLE_OWNER', 'finance_config.read')).toBe(false);
    // finance_config.write is never seeded to any role -- SUPERADMIN's
    // hardcoded wildcard is the only way to reach it (same as
    // country_regulation.write, DR-034/035).
    expect(hasDefault('PLATFORM_ADMIN', 'finance_config.write')).toBe(false);
    expect(hasDefault('TOUR_OPERATOR', 'finance_config.write')).toBe(false);
  });

  it('booking.delete is never seeded to any role (DR-058, same layering as finance_config.write/country_regulation.write)', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'booking.delete')).toBe(false);
    expect(hasDefault('TOUR_OPERATOR', 'booking.delete')).toBe(false);
    expect(hasDefault('TOURIST', 'booking.delete')).toBe(false);
    expect(hasDefault('TOUR_GUIDE', 'booking.delete')).toBe(false);
    expect(hasDefault('DRIVER', 'booking.delete')).toBe(false);
    expect(hasDefault('VEHICLE_OWNER', 'booking.delete')).toBe(false);
    expect(hasDefault('VISA_FACILITATOR', 'booking.delete')).toBe(false);
  });

  it('fleet.delete is never seeded to any role (DR-059, same layering as booking.delete)', () => {
    expect(hasDefault('PLATFORM_ADMIN', 'fleet.delete')).toBe(false);
    expect(hasDefault('TOUR_OPERATOR', 'fleet.delete')).toBe(false);
    expect(hasDefault('DRIVER', 'fleet.delete')).toBe(false);
    expect(hasDefault('VEHICLE_OWNER', 'fleet.delete')).toBe(false);
    expect(hasDefault('TOUR_GUIDE', 'fleet.delete')).toBe(false);
  });
});
