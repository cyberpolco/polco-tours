import { describe, it, expect } from 'vitest';
import { isCountryRegulationWriter, resolveLocalizedRegulationText } from '../src/modules/immigration/domain';

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

  describe('resolveLocalizedRegulationText (DR-270)', () => {
    it('returns the French text when the guest is browsing in French and one exists', () => {
      expect(resolveLocalizedRegulationText('EN text', 'Texte FR', 'fr')).toBe('Texte FR');
    });

    it('falls back to the English text when the guest is browsing in French but no French text is on file yet', () => {
      expect(resolveLocalizedRegulationText('EN text', null, 'fr')).toBe('EN text');
    });

    it('returns the English text for an English-browsing guest even when French text exists', () => {
      expect(resolveLocalizedRegulationText('EN text', 'Texte FR', 'en')).toBe('EN text');
    });
  });
});
