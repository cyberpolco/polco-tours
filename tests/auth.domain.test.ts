import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import { isDormant, findIncompatibleRolePair, CreateUserInput, UpdateUserInput } from '../src/modules/auth/domain';

// DR-221: the full, explicitly-reviewed 21-pair compatibility matrix across
// the 7 ASSIGNABLE_ROLES. Every pair is listed once so a future edit to
// ROLE_COMPATIBILITY that silently changes a verdict fails a specific,
// named assertion rather than a generic "some test somewhere broke."
const ALLOWED_PAIRS: [Role, Role][] = [
  ['PLATFORM_ADMIN', 'TOUR_OPERATOR'],
  ['TOUR_OPERATOR', 'TOUR_GUIDE'],
  ['TOUR_OPERATOR', 'DRIVER'],
  ['TOUR_OPERATOR', 'VEHICLE_OWNER'],
  ['TOUR_OPERATOR', 'VISA_FACILITATOR'],
  ['TOUR_GUIDE', 'DRIVER'],
  ['TOUR_GUIDE', 'VEHICLE_OWNER'],
  ['DRIVER', 'VEHICLE_OWNER'],
  ['SUPERADMIN', 'VISA_FACILITATOR'],
];
const BLOCKED_PAIRS: [Role, Role][] = [
  ['SUPERADMIN', 'PLATFORM_ADMIN'],
  ['SUPERADMIN', 'TOUR_OPERATOR'],
  ['SUPERADMIN', 'TOUR_GUIDE'],
  ['SUPERADMIN', 'DRIVER'],
  ['SUPERADMIN', 'VEHICLE_OWNER'],
  ['PLATFORM_ADMIN', 'TOUR_GUIDE'],
  ['PLATFORM_ADMIN', 'DRIVER'],
  ['PLATFORM_ADMIN', 'VEHICLE_OWNER'],
  ['PLATFORM_ADMIN', 'VISA_FACILITATOR'],
  ['TOUR_GUIDE', 'VISA_FACILITATOR'],
  ['DRIVER', 'VISA_FACILITATOR'],
  ['VEHICLE_OWNER', 'VISA_FACILITATOR'],
];

describe('auth domain', () => {
  describe('findIncompatibleRolePair (DR-221)', () => {
    it('is null for a single role', () => {
      expect(findIncompatibleRolePair(['SUPERADMIN'])).toBeNull();
    });

    it.each(ALLOWED_PAIRS)('allows %s + %s', (a, b) => {
      expect(findIncompatibleRolePair([a, b])).toBeNull();
      expect(findIncompatibleRolePair([b, a])).toBeNull(); // symmetric
    });

    it.each(BLOCKED_PAIRS)('blocks %s + %s', (a, b) => {
      expect(findIncompatibleRolePair([a, b])).not.toBeNull();
      expect(findIncompatibleRolePair([b, a])).not.toBeNull(); // symmetric
    });

    it('covers exactly the 21 possible pairs of the 7 assignable roles', () => {
      expect(ALLOWED_PAIRS.length + BLOCKED_PAIRS.length).toBe(21);
    });

    it('finds a conflict buried among otherwise-compatible roles', () => {
      const conflict = findIncompatibleRolePair(['TOUR_OPERATOR', 'DRIVER', 'VEHICLE_OWNER', 'VISA_FACILITATOR']);
      expect(conflict).toEqual(['DRIVER', 'VISA_FACILITATOR']);
    });

    it('allows a real 3-role combination (field roles + their common operator)', () => {
      expect(findIncompatibleRolePair(['TOUR_OPERATOR', 'TOUR_GUIDE', 'DRIVER', 'VEHICLE_OWNER'])).toBeNull();
    });
  });

  describe('CreateUserInput/UpdateUserInput role-compatibility gate (DR-221)', () => {
    it('rejects an incompatible pair on create', () => {
      const result = CreateUserInput.safeParse({
        name: 'X',
        email: 'x@example.test',
        roles: ['SUPERADMIN', 'DRIVER'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('cannot be combined with');
      }
    });

    it('accepts a compatible multi-role set on create', () => {
      const result = CreateUserInput.safeParse({
        name: 'X',
        email: 'x@example.test',
        roles: ['TOUR_OPERATOR', 'DRIVER', 'VEHICLE_OWNER'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an incompatible pair on update', () => {
      const result = UpdateUserInput.safeParse({ roles: ['PLATFORM_ADMIN', 'VISA_FACILITATOR'] });
      expect(result.success).toBe(false);
    });

    it('does not require roles on update, and skips the check when omitted', () => {
      const result = UpdateUserInput.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
    });
  });

  describe('isDormant (DR-084)', () => {
    const now = new Date('2026-08-07T00:00:00Z');

    it('is not dormant right at the reference date', () => {
      expect(isDormant(now, now)).toBe(false);
    });

    it('is not dormant within the 30-day window', () => {
      const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      expect(isDormant(twentyNineDaysAgo, now)).toBe(false);
    });

    it('is not dormant exactly at the 30-day boundary', () => {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(isDormant(thirtyDaysAgo, now)).toBe(false);
    });

    it('is dormant just past the 30-day boundary', () => {
      const justOver = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
      expect(isDormant(justOver, now)).toBe(true);
    });

    it('is dormant for a reference date a year ago', () => {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      expect(isDormant(yearAgo, now)).toBe(true);
    });
  });
});
