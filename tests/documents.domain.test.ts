import { describe, it, expect } from 'vitest';
import {
  MAX_PASSPORT_SIZE_BYTES,
  MAX_COMPLIANCE_DOC_SIZE_BYTES,
  PASSPORT_CONTENT_TYPE,
  isValidDocumentUpload,
} from '../src/modules/documents/domain';

describe('documents domain', () => {
  describe('isValidDocumentUpload - PASSPORT', () => {
    it('accepts a PDF within the size cap', () => {
      expect(isValidDocumentUpload('PASSPORT', PASSPORT_CONTENT_TYPE, 1024)).toBe(true);
    });

    it('rejects a non-PDF content type', () => {
      expect(isValidDocumentUpload('PASSPORT', 'image/png', 1024)).toBe(false);
    });

    it('rejects a zero-byte file', () => {
      expect(isValidDocumentUpload('PASSPORT', PASSPORT_CONTENT_TYPE, 0)).toBe(false);
    });

    it('rejects a file over the size cap', () => {
      expect(isValidDocumentUpload('PASSPORT', PASSPORT_CONTENT_TYPE, MAX_PASSPORT_SIZE_BYTES + 1)).toBe(false);
    });

    it('accepts exactly at the size cap', () => {
      expect(isValidDocumentUpload('PASSPORT', PASSPORT_CONTENT_TYPE, MAX_PASSPORT_SIZE_BYTES)).toBe(true);
    });
  });

  describe('isValidDocumentUpload - fleet compliance kinds', () => {
    const complianceKinds = ['VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE', 'VEHICLE_INSPECTION', 'DRIVER_LICENSE'];

    it.each(complianceKinds)('%s accepts a PDF within the size cap', (kind) => {
      expect(isValidDocumentUpload(kind, 'application/pdf', 1024)).toBe(true);
    });

    it.each(complianceKinds)('%s accepts a JPEG phone photo', (kind) => {
      expect(isValidDocumentUpload(kind, 'image/jpeg', 1024)).toBe(true);
    });

    it.each(complianceKinds)('%s accepts a PNG', (kind) => {
      expect(isValidDocumentUpload(kind, 'image/png', 1024)).toBe(true);
    });

    it.each(complianceKinds)('%s rejects an unsupported content type', (kind) => {
      expect(isValidDocumentUpload(kind, 'application/zip', 1024)).toBe(false);
    });

    it.each(complianceKinds)('%s rejects a zero-byte file', (kind) => {
      expect(isValidDocumentUpload(kind, 'application/pdf', 0)).toBe(false);
    });

    it.each(complianceKinds)('%s rejects a file over the size cap', (kind) => {
      expect(isValidDocumentUpload(kind, 'application/pdf', MAX_COMPLIANCE_DOC_SIZE_BYTES + 1)).toBe(false);
    });
  });

  describe('isValidDocumentUpload - unknown kind', () => {
    it('rejects a kind with no validation rule', () => {
      expect(isValidDocumentUpload('SOMETHING_UNKNOWN', 'application/pdf', 1024)).toBe(false);
    });
  });
});
