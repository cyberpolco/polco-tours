import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import {
  can,
  hasAnyRole,
  isStaffRole,
  ROLE_PERMISSIONS,
  STAFF_PAGE_ACCESS,
  type Permission,
  type PermissionSource,
} from '../src/lib/rbac';

/**
 * DR-159 (reverses DR-035) rewrites this file to match the reversal:
 *
 * - "can()/assertCan() mechanism" -- the pure logic (SUPERADMIN's hardcoded
 *   wildcard, union-of-held-roles semantics, isStaffRole) tested against
 *   hand-built PermissionSource contexts. Unaffected by DR-159 -- this
 *   never touched the DB even under DR-035.
 * - "ROLE_PERMISSIONS map" -- what each role's grants ARE, hardcoded and
 *   live (no longer a one-time DB seed a SUPERADMIN can edit away at
 *   runtime -- the permission-matrix editor is gone). These assertions
 *   describe the actual, permanent state now.
 * - "hasAnyRole()/STAFF_PAGE_ACCESS" -- the new plain role-only gate
 *   mechanism for menu items whose old gating Permission is also
 *   load-bearing elsewhere (DR-159).
 */

function ctx(roles: Role[], permissions: Permission[] = []): PermissionSource {
  return { roles, permissions: new Set(permissions) };
}

describe('can()/assertCan() mechanism', () => {
  it('SUPERADMIN bypasses the permissions set entirely -- a hardcoded, unconditional wildcard', () => {
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

  it('PLATFORM_ADMIN is NOT a wildcard -- it only has what its resolved permissions set contains, same as any other role', () => {
    expect(can(ctx(['PLATFORM_ADMIN'], []), 'admin.all')).toBe(false);
    expect(can(ctx(['PLATFORM_ADMIN'], ['admin.all']), 'admin.all')).toBe(true);
  });

  it('DR-026: a user holding multiple roles gets the union of their grants', () => {
    const multiRole = ctx(['VISA_FACILITATOR', 'TOUR_GUIDE'], ['visa.process', 'fleet.read']);
    expect(can(multiRole, 'visa.process')).toBe(true);
    expect(can(multiRole, 'fleet.read')).toBe(true);
    expect(can(multiRole, 'admin.all')).toBe(false);
  });

  it('isStaffRole: every role except TOURIST reaches the staff dashboard baseline gate (DR-020)', () => {
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

describe('hasAnyRole() / STAFF_PAGE_ACCESS (DR-159)', () => {
  it('SUPERADMIN bypasses hasAnyRole entirely, same wildcard as can()', () => {
    expect(hasAnyRole(ctx(['SUPERADMIN']), ['TOUR_OPERATOR'])).toBe(true);
  });

  it('a role in the given list passes, one that is not fails', () => {
    expect(hasAnyRole(ctx(['TOUR_OPERATOR']), STAFF_PAGE_ACCESS.bookingsBrowse)).toBe(true);
    expect(hasAnyRole(ctx(['TOUR_GUIDE']), STAFF_PAGE_ACCESS.bookingsBrowse)).toBe(false);
  });

  it('bookingDetail includes VISA_FACILITATOR (the visa-queue-linked view) but bookingsBrowse (the general list) does not', () => {
    expect(hasAnyRole(ctx(['VISA_FACILITATOR']), STAFF_PAGE_ACCESS.bookingDetail)).toBe(true);
    expect(hasAnyRole(ctx(['VISA_FACILITATOR']), STAFF_PAGE_ACCESS.bookingsBrowse)).toBe(false);
  });

  it('packagesBrowse is PLATFORM_ADMIN/TOUR_OPERATOR only, decoupled from the broadly-held catalog.read', () => {
    expect(hasAnyRole(ctx(['PLATFORM_ADMIN']), STAFF_PAGE_ACCESS.packagesBrowse)).toBe(true);
    expect(hasAnyRole(ctx(['TOUR_GUIDE']), STAFF_PAGE_ACCESS.packagesBrowse)).toBe(false);
    expect(hasAnyRole(ctx(['VISA_FACILITATOR']), STAFF_PAGE_ACCESS.packagesBrowse)).toBe(false);
  });
});

function granted(role: keyof typeof ROLE_PERMISSIONS, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Asserts the DR-159 hardcoded map -- the live, permanent state (no
// runtime-editable matrix exists anymore).
describe('ROLE_PERMISSIONS map (DR-159)', () => {
  it('PLATFORM_ADMIN keeps org-wide read visibility and some write actions, but lost catalog.write, itinerary.approve, visa.process, and Bookings sub-actions (documents/invoice/payment)', () => {
    expect(granted('PLATFORM_ADMIN', 'admin.all')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'finance.read')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'catalog.write')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'itinerary.approve')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'visa.process')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'documents.read')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'documents.write')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'invoice.read')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'payment.initiate')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'payment.resolve')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'booking.cancel')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'country_regulation.write')).toBe(false);
    // booking.confirm stays granted (Refund/Quotation/Convert-to-Itinerary/
    // cost breakdown) -- the Confirm action itself is separately narrowed by
    // isBookingConfirmer (booking/domain.ts), not this permission.
    expect(granted('PLATFORM_ADMIN', 'booking.confirm')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'itinerary.write')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'fleet.write')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'assignment.write')).toBe(true);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR both lost Finance Settings entirely (finance_config.*/platform_settings.* now SUPERADMIN-only)', () => {
    expect(granted('PLATFORM_ADMIN', 'finance_config.read')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'finance_config.write')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'platform_settings.read')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'platform_settings.write')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'finance_config.read')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'finance_config.write')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'platform_settings.read')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'platform_settings.write')).toBe(false);
  });

  it('TOUR_OPERATOR is the operational role -- keeps catalog.write, itinerary.approve, visa.process, and every Bookings sub-action', () => {
    expect(granted('TOUR_OPERATOR', 'catalog.write')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'itinerary.approve')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'visa.process')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'documents.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'documents.write')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'invoice.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'payment.initiate')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'payment.resolve')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'booking.confirm')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'booking.cancel')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'admin.all')).toBe(false);
  });

  it('DR-155: TOUR_OPERATOR and PLATFORM_ADMIN get staff_roster.read (the Insights Staff-stats section) without needing admin.all', () => {
    expect(granted('TOUR_OPERATOR', 'staff_roster.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'admin.all')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'staff_roster.read')).toBe(true);
    expect(granted('TOUR_GUIDE', 'staff_roster.read')).toBe(false);
  });

  it('TOURIST cannot write catalog', () => {
    expect(granted('TOURIST', 'catalog.write')).toBe(false);
    expect(granted('TOURIST', 'booking.create')).toBe(true);
  });

  it('TOURIST can cancel bookings but not confirm them (operator-only)', () => {
    expect(granted('TOURIST', 'booking.cancel')).toBe(true);
    expect(granted('TOURIST', 'booking.confirm')).toBe(false);
  });

  it('TOUR_GUIDE and DRIVER cannot confirm or cancel bookings', () => {
    expect(granted('TOUR_GUIDE', 'booking.confirm')).toBe(false);
    expect(granted('TOUR_GUIDE', 'booking.cancel')).toBe(false);
    expect(granted('DRIVER', 'booking.confirm')).toBe(false);
    expect(granted('DRIVER', 'booking.cancel')).toBe(false);
  });

  it('TOURIST can read invoices and initiate payments but not resolve them (DR-012)', () => {
    expect(granted('TOURIST', 'invoice.read')).toBe(true);
    expect(granted('TOURIST', 'payment.initiate')).toBe(true);
    expect(granted('TOURIST', 'payment.resolve')).toBe(false);
  });

  it('TOUR_GUIDE and DRIVER have no invoicing/payment/document grants (DR-159: staff-side document/invoice/payment access narrowed to TOUR_OPERATOR/VISA_FACILITATOR)', () => {
    expect(granted('TOUR_GUIDE', 'invoice.read')).toBe(false);
    expect(granted('TOUR_GUIDE', 'payment.initiate')).toBe(false);
    expect(granted('TOUR_GUIDE', 'documents.read')).toBe(false);
    expect(granted('DRIVER', 'invoice.read')).toBe(false);
    expect(granted('DRIVER', 'payment.initiate')).toBe(false);
  });

  it('every operational role can self-service their profile (DR-013)', () => {
    expect(granted('TOUR_OPERATOR', 'profile.write')).toBe(true);
    expect(granted('TOURIST', 'profile.write')).toBe(true);
    expect(granted('TOUR_GUIDE', 'profile.write')).toBe(true);
    expect(granted('DRIVER', 'profile.write')).toBe(true);
    expect(granted('VEHICLE_OWNER', 'profile.write')).toBe(true);
    expect(granted('VISA_FACILITATOR', 'profile.write')).toBe(true);
  });

  it('TOUR_OPERATOR manages the whole fleet (DR-017); PLATFORM_ADMIN keeps fleet.write too (unchanged by DR-159)', () => {
    expect(granted('TOUR_OPERATOR', 'fleet.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'fleet.write')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'fleet.write')).toBe(true);
  });

  it('VEHICLE_OWNER and DRIVER can read but not write fleet data (DR-017, scoped to own records in fleet/service.ts)', () => {
    expect(granted('VEHICLE_OWNER', 'fleet.read')).toBe(true);
    expect(granted('VEHICLE_OWNER', 'fleet.write')).toBe(false);
    expect(granted('DRIVER', 'fleet.read')).toBe(true);
    expect(granted('DRIVER', 'fleet.write')).toBe(false);
  });

  it('TOUR_OPERATOR can read and write assignments (DR-018); PLATFORM_ADMIN keeps assignment.write too (unchanged by DR-159)', () => {
    expect(granted('TOUR_OPERATOR', 'assignment.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'assignment.write')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'assignment.write')).toBe(true);
  });

  it('TOUR_GUIDE, DRIVER, and VEHICLE_OWNER can read but not write assignments (DR-018, scoped to their own in assignment/service.ts)', () => {
    expect(granted('TOUR_GUIDE', 'assignment.read')).toBe(true);
    expect(granted('TOUR_GUIDE', 'assignment.write')).toBe(false);
    expect(granted('DRIVER', 'assignment.read')).toBe(true);
    expect(granted('DRIVER', 'assignment.write')).toBe(false);
    expect(granted('VEHICLE_OWNER', 'assignment.read')).toBe(true);
    expect(granted('VEHICLE_OWNER', 'assignment.write')).toBe(false);
  });

  it('VISA_FACILITATOR can process visas and read catalog/bookings/documents (DR-019); TOUR_OPERATOR gains visa.process too (DR-034), PLATFORM_ADMIN does not (DR-159)', () => {
    expect(granted('VISA_FACILITATOR', 'visa.process')).toBe(true);
    expect(granted('VISA_FACILITATOR', 'documents.read')).toBe(true);
    expect(granted('VISA_FACILITATOR', 'booking.read')).toBe(true);
    expect(granted('VISA_FACILITATOR', 'catalog.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'visa.process')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'visa.process')).toBe(false);
  });

  it('TOUR_GUIDE no longer reads documents (DR-159, narrowed to TOUR_OPERATOR/VISA_FACILITATOR) and never processed visas', () => {
    expect(granted('TOUR_GUIDE', 'documents.read')).toBe(false);
    expect(granted('TOUR_GUIDE', 'visa.process')).toBe(false);
  });

  it('no role is seeded with country_regulation.write -- SUPERADMIN reaches it only via its hardcoded wildcard', () => {
    expect(granted('PLATFORM_ADMIN', 'country_regulation.write')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'country_regulation.write')).toBe(false);
    expect(granted('TOUR_GUIDE', 'country_regulation.write')).toBe(false);
    expect(granted('DRIVER', 'country_regulation.write')).toBe(false);
    expect(granted('VISA_FACILITATOR', 'country_regulation.write')).toBe(false);
    expect(granted('TOURIST', 'country_regulation.write')).toBe(false);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR gain rating.issue/rating.read (DR-037); no other role does', () => {
    expect(granted('PLATFORM_ADMIN', 'rating.issue')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'rating.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'rating.issue')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'rating.read')).toBe(true);
    expect(granted('TOUR_GUIDE', 'rating.issue')).toBe(false);
    expect(granted('DRIVER', 'rating.issue')).toBe(false);
    expect(granted('VISA_FACILITATOR', 'rating.issue')).toBe(false);
    expect(granted('TOURIST', 'rating.issue')).toBe(false);
  });

  it('PLATFORM_ADMIN and TOUR_OPERATOR gain insights.read (DR-038); no other role does', () => {
    expect(granted('PLATFORM_ADMIN', 'insights.read')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'insights.read')).toBe(true);
    expect(granted('TOUR_GUIDE', 'insights.read')).toBe(false);
    expect(granted('DRIVER', 'insights.read')).toBe(false);
    expect(granted('VEHICLE_OWNER', 'insights.read')).toBe(false);
    expect(granted('VISA_FACILITATOR', 'insights.read')).toBe(false);
    expect(granted('TOURIST', 'insights.read')).toBe(false);
  });

  it('booking.delete is never granted to any role (DR-058, same layering as finance_config.write/country_regulation.write)', () => {
    expect(granted('PLATFORM_ADMIN', 'booking.delete')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'booking.delete')).toBe(false);
    expect(granted('TOURIST', 'booking.delete')).toBe(false);
    expect(granted('TOUR_GUIDE', 'booking.delete')).toBe(false);
    expect(granted('DRIVER', 'booking.delete')).toBe(false);
    expect(granted('VEHICLE_OWNER', 'booking.delete')).toBe(false);
    expect(granted('VISA_FACILITATOR', 'booking.delete')).toBe(false);
  });

  it('fleet.delete is never granted to any role (DR-059, same layering as booking.delete)', () => {
    expect(granted('PLATFORM_ADMIN', 'fleet.delete')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'fleet.delete')).toBe(false);
    expect(granted('DRIVER', 'fleet.delete')).toBe(false);
    expect(granted('VEHICLE_OWNER', 'fleet.delete')).toBe(false);
    expect(granted('TOUR_GUIDE', 'fleet.delete')).toBe(false);
  });

  it('hotel_restaurant_rating.write is granted to TOUR_GUIDE, DRIVER, TOUR_OPERATOR, and PLATFORM_ADMIN, but not VEHICLE_OWNER/VISA_FACILITATOR/TOURIST', () => {
    expect(granted('TOUR_GUIDE', 'hotel_restaurant_rating.write')).toBe(true);
    expect(granted('DRIVER', 'hotel_restaurant_rating.write')).toBe(true);
    expect(granted('TOUR_OPERATOR', 'hotel_restaurant_rating.write')).toBe(true);
    expect(granted('PLATFORM_ADMIN', 'hotel_restaurant_rating.write')).toBe(true);
    expect(granted('VEHICLE_OWNER', 'hotel_restaurant_rating.write')).toBe(false);
    expect(granted('VISA_FACILITATOR', 'hotel_restaurant_rating.write')).toBe(false);
    expect(granted('TOURIST', 'hotel_restaurant_rating.write')).toBe(false);
  });

  it('content.read/write are never granted to any role -- SUPERADMIN-only via its hardcoded wildcard (DR-071, unchanged by DR-159)', () => {
    expect(granted('PLATFORM_ADMIN', 'content.read')).toBe(false);
    expect(granted('PLATFORM_ADMIN', 'content.write')).toBe(false);
    expect(granted('TOUR_OPERATOR', 'content.read')).toBe(false);
  });
});
