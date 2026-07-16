import { describe, it, expect } from 'vitest';
import { canTransition } from '../src/modules/itinerary/domain';

describe('itinerary domain', () => {
  describe('canTransition', () => {
    it('DRAFT can go to IN_REVIEW or straight to APPROVED', () => {
      expect(canTransition('DRAFT', 'IN_REVIEW')).toBe(true);
      expect(canTransition('DRAFT', 'APPROVED')).toBe(true);
    });

    it('IN_REVIEW can go to APPROVED or back to DRAFT', () => {
      expect(canTransition('IN_REVIEW', 'APPROVED')).toBe(true);
      expect(canTransition('IN_REVIEW', 'DRAFT')).toBe(true);
    });

    it('APPROVED is terminal -- no path out', () => {
      expect(canTransition('APPROVED', 'DRAFT')).toBe(false);
      expect(canTransition('APPROVED', 'IN_REVIEW')).toBe(false);
    });

    it('cannot transition to the same status', () => {
      expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
      expect(canTransition('IN_REVIEW', 'IN_REVIEW')).toBe(false);
      expect(canTransition('APPROVED', 'APPROVED')).toBe(false);
    });
  });
});
