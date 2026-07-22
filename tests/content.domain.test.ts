import { describe, it, expect } from 'vitest';
import {
  CreateFaqEntryInput,
  isValidContentImageUpload,
  UpdateFaqEntryInput,
  UpdateSiteContentInput,
} from '../src/modules/content/domain';

describe('content domain', () => {
  describe('UpdateSiteContentInput', () => {
    it('accepts a valid input', () => {
      const result = UpdateSiteContentInput.parse({ key: 'about', locale: 'en', title: 'About', body: 'Body text' });
      expect(result.key).toBe('about');
      expect(result.locale).toBe('en');
    });

    it('rejects a locale outside the supported set', () => {
      expect(() => UpdateSiteContentInput.parse({ key: 'about', locale: 'de', title: 'About', body: 'Body' })).toThrow();
    });

    it('rejects a missing title or body', () => {
      expect(() => UpdateSiteContentInput.parse({ key: 'about', locale: 'en', title: '', body: 'Body' })).toThrow();
      expect(() => UpdateSiteContentInput.parse({ key: 'about', locale: 'en', title: 'About', body: '' })).toThrow();
    });
  });

  describe('CreateFaqEntryInput', () => {
    it('accepts a valid input, defaulting locale to en and sortOrder to 0', () => {
      const result = CreateFaqEntryInput.parse({ question: 'Q?', answer: 'A.' });
      expect(result.locale).toBe('en');
      expect(result.sortOrder).toBe(0);
    });

    it('rejects a missing question or answer', () => {
      expect(() => CreateFaqEntryInput.parse({ question: '', answer: 'A.' })).toThrow();
      expect(() => CreateFaqEntryInput.parse({ question: 'Q?', answer: '' })).toThrow();
    });

    it('rejects a negative sortOrder', () => {
      expect(() => CreateFaqEntryInput.parse({ question: 'Q?', answer: 'A.', sortOrder: -1 })).toThrow();
    });
  });

  describe('UpdateFaqEntryInput', () => {
    it('accepts a partial update', () => {
      const result = UpdateFaqEntryInput.parse({ sortOrder: 3 });
      expect(result.sortOrder).toBe(3);
      expect(result.question).toBeUndefined();
    });
  });

  describe('isValidContentImageUpload', () => {
    it('accepts a jpeg/png/webp under the size cap', () => {
      expect(isValidContentImageUpload('image/jpeg', 1024)).toBe(true);
      expect(isValidContentImageUpload('image/png', 1024)).toBe(true);
      expect(isValidContentImageUpload('image/webp', 1024)).toBe(true);
    });

    it('rejects an unsupported content type', () => {
      expect(isValidContentImageUpload('application/pdf', 1024)).toBe(false);
    });

    it('rejects a zero or over-cap size', () => {
      expect(isValidContentImageUpload('image/jpeg', 0)).toBe(false);
      expect(isValidContentImageUpload('image/jpeg', 6 * 1024 * 1024)).toBe(false);
    });
  });
});
