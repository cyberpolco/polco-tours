import { describe, it, expect } from 'vitest';
import { isCountryRegulationWriter } from '../src/modules/immigration/domain';

describe('immigration domain', () => {
  describe('isCountryRegulationWriter', () => {
    it('SUPERADMIN can write country regulations', () => {
      expect(isCountryRegulationWriter(['SUPERADMIN'])).toBe(true);
    });

    it('PLATFORM_ADMIN cannot write country regulations -- the first real gap between the two admin roles', () => {
      expect(isCountryRegulationWriter(['PLATFORM_ADMIN'])).toBe(false);
    });

    it('TOUR_OPERATOR cannot write country regulations', () => {
      expect(isCountryRegulationWriter(['TOUR_OPERATOR'])).toBe(false);
    });

    it('VISA_FACILITATOR cannot write country regulations', () => {
      expect(isCountryRegulationWriter(['VISA_FACILITATOR'])).toBe(false);
    });

    it('a user holding SUPERADMIN alongside other roles still qualifies (union semantics, DR-026)', () => {
      expect(isCountryRegulationWriter(['TOUR_OPERATOR', 'SUPERADMIN'])).toBe(true);
    });
  });
});
