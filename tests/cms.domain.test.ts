import { describe, it, expect } from 'vitest';
import {
  CreateCmsFaqEntryInput,
  CreateCmsMediaItemInput,
  CreateCmsOperatingCountryInput,
  isValidCmsImageUpload,
  isValidCmsVideoContentType,
  UpdateCmsFaqEntryInput,
  UpdateCmsMediaItemInput,
  UpdateCmsOperatingCountryInput,
  UpdateCmsTextBlockInput,
} from '../src/modules/cms/domain';

describe('cms domain', () => {
  describe('UpdateCmsTextBlockInput', () => {
    it('accepts a valid input', () => {
      const result = UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'en', title: 'About', body: 'Body text' });
      expect(result.key).toBe('about');
      expect(result.locale).toBe('en');
    });

    it('accepts an optional eyebrow, defaulting to undefined when omitted', () => {
      const withEyebrow = UpdateCmsTextBlockInput.parse({ key: 'home-hero.slide-1', locale: 'en', title: 'H', body: 'L', eyebrow: 'Namibia' });
      expect(withEyebrow.eyebrow).toBe('Namibia');
      const without = UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'en', title: 'About', body: 'Body' });
      expect(without.eyebrow).toBeUndefined();
    });

    it('rejects a locale outside the supported set', () => {
      expect(() => UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'de', title: 'About', body: 'Body' })).toThrow();
    });

    it('rejects a missing title or body', () => {
      expect(() => UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'en', title: '', body: 'Body' })).toThrow();
      expect(() => UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'en', title: 'About', body: '' })).toThrow();
    });
  });

  describe('CreateCmsFaqEntryInput', () => {
    it('accepts a valid input, defaulting locale to en and sortOrder to 0', () => {
      const result = CreateCmsFaqEntryInput.parse({ question: 'Q?', answer: 'A.' });
      expect(result.locale).toBe('en');
      expect(result.sortOrder).toBe(0);
    });

    it('rejects a missing question or answer', () => {
      expect(() => CreateCmsFaqEntryInput.parse({ question: '', answer: 'A.' })).toThrow();
      expect(() => CreateCmsFaqEntryInput.parse({ question: 'Q?', answer: '' })).toThrow();
    });

    it('rejects a negative sortOrder', () => {
      expect(() => CreateCmsFaqEntryInput.parse({ question: 'Q?', answer: 'A.', sortOrder: -1 })).toThrow();
    });
  });

  describe('UpdateCmsFaqEntryInput', () => {
    it('accepts a partial update', () => {
      const result = UpdateCmsFaqEntryInput.parse({ sortOrder: 3 });
      expect(result.sortOrder).toBe(3);
      expect(result.question).toBeUndefined();
    });
  });

  describe('isValidCmsImageUpload', () => {
    it('accepts a jpeg/png/webp under the size cap', () => {
      expect(isValidCmsImageUpload('image/jpeg', 1024)).toBe(true);
      expect(isValidCmsImageUpload('image/png', 1024)).toBe(true);
      expect(isValidCmsImageUpload('image/webp', 1024)).toBe(true);
    });

    it('rejects an unsupported content type', () => {
      expect(isValidCmsImageUpload('application/pdf', 1024)).toBe(false);
    });

    it('rejects a zero or over-cap size', () => {
      expect(isValidCmsImageUpload('image/jpeg', 0)).toBe(false);
      expect(isValidCmsImageUpload('image/jpeg', 6 * 1024 * 1024)).toBe(false);
    });
  });

  describe('isValidCmsVideoContentType', () => {
    it('accepts mp4/webm', () => {
      expect(isValidCmsVideoContentType('video/mp4')).toBe(true);
      expect(isValidCmsVideoContentType('video/webm')).toBe(true);
    });

    it('rejects anything else', () => {
      expect(isValidCmsVideoContentType('video/quicktime')).toBe(false);
      expect(isValidCmsVideoContentType('image/jpeg')).toBe(false);
    });
  });

  describe('CreateCmsMediaItemInput', () => {
    it('accepts a bare create with no media chosen yet (dynamic add-a-slide)', () => {
      const result = CreateCmsMediaItemInput.parse({});
      expect(result.mediaType).toBeUndefined();
      expect(result.url).toBeUndefined();
      expect(result.sortOrder).toBe(0);
    });

    it('accepts a full create', () => {
      const result = CreateCmsMediaItemInput.parse({
        mediaType: 'video',
        url: 'https://example.com/a.mp4',
        overlayGradient: 'linear-gradient(to right, red, blue)',
        sortOrder: 2,
      });
      expect(result.mediaType).toBe('video');
      expect(result.url).toBe('https://example.com/a.mp4');
    });

    it('rejects an invalid mediaType or a non-URL url', () => {
      expect(() => CreateCmsMediaItemInput.parse({ mediaType: 'audio' })).toThrow();
      expect(() => CreateCmsMediaItemInput.parse({ url: 'not-a-url' })).toThrow();
    });

    it('accepts a gallery site with name + country (DR-167)', () => {
      const result = CreateCmsMediaItemInput.parse({ name: 'Etosha National Park', country: 'NA' });
      expect(result.name).toBe('Etosha National Park');
      expect(result.country).toBe('NA');
    });

    it('rejects a country outside the operating-country set', () => {
      expect(() => CreateCmsMediaItemInput.parse({ name: 'Somewhere', country: 'US' })).toThrow();
    });

    it('accepts a social link with a valid platform (DR-200)', () => {
      const result = CreateCmsMediaItemInput.parse({ platform: 'tiktok', url: 'https://tiktok.com/@mufasa' });
      expect(result.platform).toBe('tiktok');
      expect(result.url).toBe('https://tiktok.com/@mufasa');
    });

    it('rejects a platform outside CMS_SOCIAL_PLATFORMS', () => {
      expect(() => CreateCmsMediaItemInput.parse({ platform: 'linkedin' })).toThrow();
    });
  });

  describe('UpdateCmsMediaItemInput', () => {
    it('accepts a partial update', () => {
      const result = UpdateCmsMediaItemInput.parse({ sortOrder: 5 });
      expect(result.sortOrder).toBe(5);
      expect(result.url).toBeUndefined();
    });

    it('accepts explicitly clearing overlayGradient/description to null', () => {
      const result = UpdateCmsMediaItemInput.parse({ overlayGradient: null, description: null });
      expect(result.overlayGradient).toBeNull();
      expect(result.description).toBeNull();
    });

    it('accepts updating platform + url together (DR-200)', () => {
      const result = UpdateCmsMediaItemInput.parse({ platform: 'facebook', url: 'https://facebook.com/mufasasafaris' });
      expect(result.platform).toBe('facebook');
      expect(result.url).toBe('https://facebook.com/mufasasafaris');
    });
  });

  describe('CreateCmsOperatingCountryInput (DR-202)', () => {
    it('accepts a bare create with just a country code -- facts are left undefined for the repository to default', () => {
      const result = CreateCmsOperatingCountryInput.parse({ countryCode: 'KE' });
      expect(result.countryCode).toBe('KE');
      expect(result.capital).toBeUndefined();
      expect(result.sortOrder).toBe(0);
    });

    it('accepts any of the full 55-country African Union list, not just the 4 operating countries', () => {
      expect(() => CreateCmsOperatingCountryInput.parse({ countryCode: 'BW' })).not.toThrow();
    });

    it('rejects a country code outside the African Union list', () => {
      expect(() => CreateCmsOperatingCountryInput.parse({ countryCode: 'US' })).toThrow();
      expect(() => CreateCmsOperatingCountryInput.parse({ countryCode: 'not-a-code' })).toThrow();
    });
  });

  describe('UpdateCmsOperatingCountryInput (DR-202)', () => {
    it('accepts a partial update of the snapshot facts', () => {
      const result = UpdateCmsOperatingCountryInput.parse({ capital: 'Gaborone', population: '~2.6 million (est.)' });
      expect(result.capital).toBe('Gaborone');
      expect(result.languages).toBeUndefined();
    });

    it('has no countryCode field -- identity is fixed at create time', () => {
      const result = UpdateCmsOperatingCountryInput.parse({ capital: 'Gaborone' });
      expect('countryCode' in result).toBe(false);
    });
  });
});
