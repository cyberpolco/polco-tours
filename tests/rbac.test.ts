import { describe, it, expect } from 'vitest';
import { can } from '../src/lib/rbac';

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
});
