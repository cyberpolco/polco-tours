import { describe, it, expect } from 'vitest';
import { MAX_PASSPORT_SIZE_BYTES, PASSPORT_CONTENT_TYPE, isValidPassportUpload } from '../src/modules/documents/domain';

describe('documents domain', () => {
  describe('isValidPassportUpload', () => {
    it('accepts a PDF within the size cap', () => {
      expect(isValidPassportUpload(PASSPORT_CONTENT_TYPE, 1024)).toBe(true);
    });

    it('rejects a non-PDF content type', () => {
      expect(isValidPassportUpload('image/png', 1024)).toBe(false);
    });

    it('rejects a zero-byte file', () => {
      expect(isValidPassportUpload(PASSPORT_CONTENT_TYPE, 0)).toBe(false);
    });

    it('rejects a file over the size cap', () => {
      expect(isValidPassportUpload(PASSPORT_CONTENT_TYPE, MAX_PASSPORT_SIZE_BYTES + 1)).toBe(false);
    });

    it('accepts exactly at the size cap', () => {
      expect(isValidPassportUpload(PASSPORT_CONTENT_TYPE, MAX_PASSPORT_SIZE_BYTES)).toBe(true);
    });
  });
});
