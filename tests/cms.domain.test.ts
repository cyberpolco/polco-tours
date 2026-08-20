import { describe, it, expect } from 'vitest';
import {
  CreateCmsFaqEntryInput,
  isValidCmsImageUpload,
  UpdateCmsFaqEntryInput,
  UpdateCmsTextBlockInput,
} from '../src/modules/cms/domain';

describe('cms domain', () => {
  describe('UpdateCmsTextBlockInput', () => {
    it('accepts a valid input', () => {
      const result = UpdateCmsTextBlockInput.parse({ key: 'about', locale: 'en', title: 'About', body: 'Body text' });
      expect(result.key).toBe('about');
      expect(result.locale).toBe('en');
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
});
