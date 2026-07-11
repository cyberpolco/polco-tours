import { describe, it, expect } from 'vitest';
import { can, isStaffRole } from '../src/lib/rbac';

// Asserts representative cells of the Vol. 4 permission matrix hold in code.
describe('RBAC permission matrix', () => {
  it('SUPERADMIN can do everything (Lam launch principal)', () => {
    expect(can('SUPERADMIN', 'admin.all')).toBe(true);
    expect(can('SUPERADMIN', 'finance.read')).toBe(true);
    expect(can('SUPERADMIN', 'catalog.write')).toBe(true);
  });

  it('TOUR_OPERATOR can manage catalog but is not a global admin', () => {
    expect(can('TOUR_OPERATOR', 'catalog.write')).toBe(true);
    expect(can('TOUR_OPERATOR', 'admin.all')).toBe(false);
  });

  it('TOURIST cannot write catalog', () => {
    expect(can('TOURIST', 'catalog.write')).toBe(false);
    expect(can('TOURIST', 'booking.create')).toBe(true);
  });

  it('TOURIST can cancel bookings but not confirm them (operator-only)', () => {
    expect(can('TOURIST', 'booking.cancel')).toBe(true);
    expect(can('TOURIST', 'booking.confirm')).toBe(false);
  });

  it('TOUR_OPERATOR can create, confirm, and cancel bookings', () => {
    expect(can('TOUR_OPERATOR', 'booking.create')).toBe(true);
    expect(can('TOUR_OPERATOR', 'booking.confirm')).toBe(true);
    expect(can('TOUR_OPERATOR', 'booking.cancel')).toBe(true);
  });

  it('TOUR_GUIDE and DRIVER cannot confirm or cancel bookings', () => {
    expect(can('TOUR_GUIDE', 'booking.confirm')).toBe(false);
    expect(can('TOUR_GUIDE', 'booking.cancel')).toBe(false);
    expect(can('DRIVER', 'booking.confirm')).toBe(false);
    expect(can('DRIVER', 'booking.cancel')).toBe(false);
  });

  it('IMMIGRATION_OFFICER is strictly read-only', () => {
    expect(can('IMMIGRATION_OFFICER', 'immigration.read')).toBe(true);
    expect(can('IMMIGRATION_OFFICER', 'documents.write')).toBe(false);
    expect(can('IMMIGRATION_OFFICER', 'booking.create')).toBe(false);
  });

  it('TOUR_OPERATOR can read invoices and both initiate and resolve payments', () => {
    expect(can('TOUR_OPERATOR', 'invoice.read')).toBe(true);
    expect(can('TOUR_OPERATOR', 'payment.initiate')).toBe(true);
    expect(can('TOUR_OPERATOR', 'payment.resolve')).toBe(true);
  });

  it('TOURIST can read invoices and initiate payments but not resolve them (DR-012)', () => {
    expect(can('TOURIST', 'invoice.read')).toBe(true);
    expect(can('TOURIST', 'payment.initiate')).toBe(true);
    expect(can('TOURIST', 'payment.resolve')).toBe(false);
  });

  it('TOUR_GUIDE and DRIVER have no invoicing/payment grants', () => {
    expect(can('TOUR_GUIDE', 'invoice.read')).toBe(false);
    expect(can('TOUR_GUIDE', 'payment.initiate')).toBe(false);
    expect(can('DRIVER', 'invoice.read')).toBe(false);
    expect(can('DRIVER', 'payment.initiate')).toBe(false);
  });

  it('every role except IMMIGRATION_OFFICER can self-service their profile (DR-013)', () => {
    expect(can('TOUR_OPERATOR', 'profile.write')).toBe(true);
    expect(can('TOURIST', 'profile.write')).toBe(true);
    expect(can('TOUR_GUIDE', 'profile.write')).toBe(true);
    expect(can('DRIVER', 'profile.write')).toBe(true);
    expect(can('VEHICLE_OWNER', 'profile.write')).toBe(true);
    expect(can('VISA_FACILITATOR', 'profile.write')).toBe(true);
    expect(can('IMMIGRATION_OFFICER', 'profile.write')).toBe(false);
  });

  it('TOUR_OPERATOR manages the whole fleet (DR-017)', () => {
    expect(can('TOUR_OPERATOR', 'fleet.read')).toBe(true);
    expect(can('TOUR_OPERATOR', 'fleet.write')).toBe(true);
  });

  it('VEHICLE_OWNER and DRIVER can read but not write fleet data (DR-017, scoped to own records in fleet/service.ts)', () => {
    expect(can('VEHICLE_OWNER', 'fleet.read')).toBe(true);
    expect(can('VEHICLE_OWNER', 'fleet.write')).toBe(false);
    expect(can('DRIVER', 'fleet.read')).toBe(true);
    expect(can('DRIVER', 'fleet.write')).toBe(false);
  });

  it('TOUR_GUIDE, VISA_FACILITATOR, and TOURIST have no fleet grants (DR-017)', () => {
    expect(can('TOUR_GUIDE', 'fleet.read')).toBe(false);
    expect(can('VISA_FACILITATOR', 'fleet.read')).toBe(false);
    expect(can('TOURIST', 'fleet.read')).toBe(false);
  });

  it('TOUR_OPERATOR can read and write assignments (DR-018)', () => {
    expect(can('TOUR_OPERATOR', 'assignment.read')).toBe(true);
    expect(can('TOUR_OPERATOR', 'assignment.write')).toBe(true);
  });

  it('TOUR_GUIDE, DRIVER, and VEHICLE_OWNER can read but not write assignments (DR-018, scoped to their own in assignment/service.ts)', () => {
    expect(can('TOUR_GUIDE', 'assignment.read')).toBe(true);
    expect(can('TOUR_GUIDE', 'assignment.write')).toBe(false);
    expect(can('DRIVER', 'assignment.read')).toBe(true);
    expect(can('DRIVER', 'assignment.write')).toBe(false);
    expect(can('VEHICLE_OWNER', 'assignment.read')).toBe(true);
    expect(can('VEHICLE_OWNER', 'assignment.write')).toBe(false);
  });

  it('VISA_FACILITATOR and TOURIST have no assignment grants (DR-018)', () => {
    expect(can('VISA_FACILITATOR', 'assignment.read')).toBe(false);
    expect(can('TOURIST', 'assignment.read')).toBe(false);
  });

  it('VISA_FACILITATOR can process visas, read catalog/bookings/documents, but not immigration.read (DR-019)', () => {
    expect(can('VISA_FACILITATOR', 'visa.process')).toBe(true);
    expect(can('VISA_FACILITATOR', 'documents.read')).toBe(true);
    // Needed to resolve a traveler by bookingId+travelerId (findTraveler) and
    // to snapshot the destination country (catalogService.getDepartureDetail)
    // -- missing these caused every visa route to 500 in CI.
    expect(can('VISA_FACILITATOR', 'booking.read')).toBe(true);
    expect(can('VISA_FACILITATOR', 'catalog.read')).toBe(true);
    expect(can('VISA_FACILITATOR', 'immigration.read')).toBe(false);
  });

  it('IMMIGRATION_OFFICER holds only immigration.read -- no visa.process, no documents.read (DR-019, BR-10 single-permission footprint)', () => {
    expect(can('IMMIGRATION_OFFICER', 'immigration.read')).toBe(true);
    expect(can('IMMIGRATION_OFFICER', 'visa.process')).toBe(false);
    expect(can('IMMIGRATION_OFFICER', 'documents.read')).toBe(false);
  });

  it('only SUPERADMIN/PLATFORM_ADMIN hold admin.all (DR-019: gates assignOfficerCountry)', () => {
    expect(can('SUPERADMIN', 'admin.all')).toBe(true);
    expect(can('PLATFORM_ADMIN', 'admin.all')).toBe(true);
    expect(can('TOUR_OPERATOR', 'admin.all')).toBe(false);
    expect(can('VISA_FACILITATOR', 'admin.all')).toBe(false);
  });

  it('TOUR_OPERATOR and TOUR_GUIDE can read documents (needed for the visa-status line, DR-019) but not process visas', () => {
    expect(can('TOUR_OPERATOR', 'documents.read')).toBe(true);
    expect(can('TOUR_OPERATOR', 'visa.process')).toBe(false);
    expect(can('TOUR_GUIDE', 'documents.read')).toBe(true);
    expect(can('TOUR_GUIDE', 'visa.process')).toBe(false);
  });

  it('isStaffRole: every role except TOURIST reaches the staff dashboard baseline gate (DR-020)', () => {
    expect(isStaffRole('SUPERADMIN')).toBe(true);
    expect(isStaffRole('PLATFORM_ADMIN')).toBe(true);
    expect(isStaffRole('TOUR_OPERATOR')).toBe(true);
    expect(isStaffRole('TOUR_GUIDE')).toBe(true);
    expect(isStaffRole('DRIVER')).toBe(true);
    expect(isStaffRole('VEHICLE_OWNER')).toBe(true);
    expect(isStaffRole('VISA_FACILITATOR')).toBe(true);
    expect(isStaffRole('IMMIGRATION_OFFICER')).toBe(true);
    expect(isStaffRole('TOURIST')).toBe(false);
  });
});
