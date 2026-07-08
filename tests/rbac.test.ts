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

  it('IMMIGRATION_OFFICER is strictly read-only', () => {
    expect(can('IMMIGRATION_OFFICER', 'immigration.read')).toBe(true);
    expect(can('IMMIGRATION_OFFICER', 'documents.write')).toBe(false);
    expect(can('IMMIGRATION_OFFICER', 'booking.create')).toBe(false);
  });
});
